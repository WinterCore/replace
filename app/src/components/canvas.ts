// Import Lit APIs for defining a Web Component and reacting to property changes.
import {css, html, LitElement, type PropertyValues} from "lit";
// Import decorators for custom element registration, reactive properties, and querying DOM nodes.
import {customElement, property, query} from "lit/decorators.js";

// Vertex shader source code (runs once per vertex).
const VERTEX_SHADER = `#version 300 es
// Input attribute: clip-space vertex position for our fullscreen quad.
in vec2 a_position;
// Input attribute: texture coordinate matching each vertex.
in vec2 a_texcoord;
// Output varying passed to the fragment shader (interpolated per pixel).
out vec2 v_texcoord;

void main() {
  // Set final clip-space position for this vertex.
  gl_Position = vec4(a_position, 0.0, 1.0);
  // Pass through texture coordinates unchanged.
  v_texcoord = a_texcoord;
}
`;

// Fragment shader source code (runs once per rendered pixel).
const FRAGMENT_SHADER = `#version 300 es
// Use high precision to avoid subtle coordinate/sampling drift on large textures.
precision highp float;
// Explicitly request high precision for texture samplers.
precision highp sampler2D;
// Interpolated texture coordinate from the vertex shader.
in vec2 v_texcoord;
// Final RGBA color output of this fragment.
out vec4 fragColor;
// Texture 0: single-channel index texture (palette index per pixel).
uniform sampler2D u_index;
// Texture 1: 1D-like palette texture storing RGB colors.
uniform sampler2D u_palette;
// Number of colors currently in the palette texture.
uniform float u_paletteSize;
// Current canvas pixel size in screen space.
uniform vec2 u_screenSize;
// Current camera center in image pixel coordinates.
uniform vec2 u_center;
// Current camera zoom factor.
uniform float u_zoom;
// Source image size in pixels (width, height).
uniform vec2 u_imageSize;

void main() {
  // Convert normalized screen UV into actual screen pixel coordinates.
  vec2 screenPos = v_texcoord * u_screenSize;
  // Convert screen-space pixel to image-space pixel using pan/zoom camera math.
  vec2 imagePos = (screenPos - u_screenSize * 0.5) / u_zoom + u_center;

  // If outside source image bounds, render background color.
  if (imagePos.x < 0.0 || imagePos.x >= u_imageSize.x || imagePos.y < 0.0 || imagePos.y >= u_imageSize.y) {
    fragColor = vec4(0.1, 0.1, 0.1, 1.0);
    return;
  }

  // Snap to exact source pixel centers to prevent cross-pixel sampling artifacts.
  vec2 uv = (floor(imagePos) + vec2(0.5, 0.5)) / u_imageSize;

  // Read palette index from index texture and convert from [0,1] to [0,255].
  float index = texture(u_index, uv).r * 255.0;
  // Convert palette entry index to palette texture U coordinate (sample center of texel).
  float u = (index + 0.5) / u_paletteSize;
  // Read final RGB(A) color from palette and output it.
  fragColor = texture(u_palette, vec2(u, 0.5));
}
`;

// Register custom element so <replace-canvas> works in templates.
@customElement('replace-canvas')
// Canvas component handling WebGL initialization, camera controls, and drawing.
export class Canvas extends LitElement {
  // Query the <canvas> element after render and store reference here.
  @query('canvas')
  canvas!: HTMLCanvasElement;

  // WebGL2 rendering context, initialized in firstUpdated.
  gl!: WebGL2RenderingContext;
  // Texture storing palette indices (one byte per source pixel).
  indexTexture!: WebGLTexture;
  // Texture storing actual RGB palette entries.
  paletteTexture!: WebGLTexture;
  // Cached uniform location for palette size.
  paletteSizeLocation!: WebGLUniformLocation;
  // Cached uniform location for screen size.
  screenSizeLocation!: WebGLUniformLocation;
  // Cached uniform location for camera center.
  centerLocation!: WebGLUniformLocation;
  // Cached uniform location for camera zoom.
  zoomLocation!: WebGLUniformLocation;
  // Cached uniform location for image size.
  imageSizeLocation!: WebGLUniformLocation;

  // Camera X center in image coordinates.
  cx = 1000;
  // Camera Y center in image coordinates.
  cy = 1000;
  // Camera zoom scale factor.
  zoom = 1;

  // Last known mouse X in canvas-local coordinates.
  mouseX = 0;
  // Last known mouse Y in canvas-local coordinates.
  mouseY = 0;

  // Whether the user is currently dragging to pan.
  dragging = false;
  // Screen-space drag start X.
  dragStartX = 0;
  // Screen-space drag start Y.
  dragStartY = 0;
  // Camera center X when drag started.
  dragStartCx = 0;
  // Camera center Y when drag started.
  dragStartCy = 0;

  // Source image width (reactive input from parent).
  @property({ type: Number })
  imageWidth!: number;

  // Source image height (reactive input from parent).
  @property({ type: Number })
  imageHeight!: number;

  // Source image index buffer (reactive input from parent).
  @property({ type: Object })
  data!: Uint8Array;

  // Source palette colors (reactive input from parent).
  @property({ type: Array })
  colorIndex!: ReadonlyArray<string>;

  // Component-scoped CSS styles.
  static styles = css`
    :host {
      /* Make host take full available height. */
      height: 100%;
      /* Host behaves like block element. */
      display: block;
    }

    canvas {
      /* Remove default inline-canvas whitespace behavior. */
      display: block;
    }
  `

  // Lifecycle hook: component attached to DOM.
  connectedCallback(): void {
    // Always call base implementation first.
    super.connectedCallback();
    // Handle window resize to resize GL viewport and camera fit.
    window.addEventListener('resize', this.onResize);
    // Track mouse globally so dragging continues if cursor leaves canvas.
    window.addEventListener('mousemove', this.onMouseMove);
    // Track mouseup globally to end drag reliably.
    window.addEventListener('mouseup', this.onMouseUp);
    // Listen for keyboard pan/zoom controls.
    window.addEventListener('keydown', this.onKeyDown);
  }

  // Lifecycle hook: component detached from DOM.
  disconnectedCallback(): void {
    // Always call base implementation first.
    super.disconnectedCallback();
    // Remove resize listener to prevent leaks.
    window.removeEventListener('resize', this.onResize);
    // Remove mousemove listener to prevent leaks.
    window.removeEventListener('mousemove', this.onMouseMove);
    // Remove mouseup listener to prevent leaks.
    window.removeEventListener('mouseup', this.onMouseUp);
    // Remove keyboard listener to prevent leaks.
    window.removeEventListener('keydown', this.onKeyDown);
  }

  // Resize handler updates backing resolution and viewport.
  onResize = () => {
    // Match canvas backing width to current viewport width.
    this.canvas.width = window.innerWidth;
    // Match canvas backing height to current viewport height.
    this.canvas.height = window.innerHeight;
    // Update WebGL viewport to match new canvas dimensions.
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
    // Recompute camera so full image fits on screen.
    this.fitToScreen();
    // Redraw with updated geometry/state.
    this.draw();
  };

  // Reset camera so full image is visible and centered.
  fitToScreen() {
    // Choose zoom that fits both width and height constraints.
    this.zoom = Math.min(this.canvas.width / this.imageWidth, this.canvas.height / this.imageHeight);
    // Center camera on image midpoint (X).
    this.cx = this.imageWidth / 2;
    // Center camera on image midpoint (Y).
    this.cy = this.imageHeight / 2;
  }

  // Clamp camera X so center stays inside image bounds.
  clampCx(cx: number): number {
    // Limit cx to [0, imageWidth].
    return Math.max(0, Math.min(this.imageWidth, cx));
  }

  // Clamp camera Y so center stays inside image bounds.
  clampCy(cy: number): number {
    // Limit cy to [0, imageHeight].
    return Math.max(0, Math.min(this.imageHeight, cy));
  }

  // Mouse wheel zoom handler (zooms around cursor position).
  onWheel = (e: WheelEvent) => {
    // Prevent page scroll while zooming canvas.
    e.preventDefault();
    // Read canvas position/size in viewport coordinates.
    const rect = this.canvas.getBoundingClientRect();
    // Convert mouse X from viewport to canvas-local coords.
    const mouseX = e.clientX - rect.left;
    // Convert mouse Y from viewport to canvas-local coords.
    const mouseY = e.clientY - rect.top;

    // Compute image X under cursor before applying zoom.
    const imgX = (mouseX - this.canvas.width / 2) / this.zoom + this.cx;
    // Compute image Y under cursor before applying zoom.
    const imgY = (mouseY - this.canvas.height / 2) / this.zoom + this.cy;

    // Minimum zoom that still fits full image on screen.
    const minZoom = Math.min(this.canvas.width / this.imageWidth, this.canvas.height / this.imageHeight);
    // Maximum zoom to avoid absurdly deep zoom levels.
    const maxZoom = Math.min(this.canvas.width, this.canvas.height) / 30;
    // Scroll down zooms out, scroll up zooms in.
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    // Apply zoom factor and clamp to legal range.
    this.zoom = Math.max(minZoom, Math.min(maxZoom, this.zoom * factor));

    // Recompute camera so same image point remains beneath cursor after zoom.
    this.cx = this.clampCx(imgX - (mouseX - this.canvas.width / 2) / this.zoom);
    // Recompute camera so same image point remains beneath cursor after zoom.
    this.cy = this.clampCy(imgY - (mouseY - this.canvas.height / 2) / this.zoom);

    // Render updated camera view.
    this.draw();
  };

  // Begin drag panning on mouse down.
  onMouseDown = (e: MouseEvent) => {
    // Enter dragging mode.
    this.dragging = true;
    // Store drag start pointer X.
    this.dragStartX = e.clientX;
    // Store drag start pointer Y.
    this.dragStartY = e.clientY;
    // Store camera X at drag start.
    this.dragStartCx = this.cx;
    // Store camera Y at drag start.
    this.dragStartCy = this.cy;
  };

  // Update cursor position and pan camera while dragging.
  onMouseMove = (e: MouseEvent) => {
    // Read canvas bounds for local coordinate conversion.
    const rect = this.canvas.getBoundingClientRect();
    // Cache mouse X relative to canvas.
    this.mouseX = e.clientX - rect.left;
    // Cache mouse Y relative to canvas.
    this.mouseY = e.clientY - rect.top;

    // If not dragging, no pan update needed.
    if (!this.dragging) return;
    // Horizontal pointer delta since drag start.
    const dx = e.clientX - this.dragStartX;
    // Vertical pointer delta since drag start.
    const dy = e.clientY - this.dragStartY;
    // Pan camera opposite pointer movement, scaled by zoom.
    this.cx = this.clampCx(this.dragStartCx - dx / this.zoom);
    // Pan camera opposite pointer movement, scaled by zoom.
    this.cy = this.clampCy(this.dragStartCy - dy / this.zoom);
    // Draw camera update.
    this.draw();
  };

  // End drag panning when mouse is released.
  onMouseUp = () => {
    // Leave dragging mode.
    this.dragging = false;
  };

  // Keyboard shortcuts for zoom/pan controls.
  onKeyDown = (e: KeyboardEvent) => {
    // Pan step is smaller at high zoom for better control.
    const panStep = 50 / this.zoom;
    // Handle key-specific actions.
    switch (e.key) {
      // Zoom out.
      case '-':
        this.zoomBy(0.9);
        break;
      // Zoom in (main keyboard).
      case '=':
      // Zoom in (some keyboard layouts).
      case '+':
        this.zoomBy(1.1);
        break;
      // Pan left.
      case 'ArrowLeft':
        this.cx = this.clampCx(this.cx - panStep);
        this.draw();
        break;
      // Pan right.
      case 'ArrowRight':
        this.cx = this.clampCx(this.cx + panStep);
        this.draw();
        break;
      // Pan up.
      case 'ArrowUp':
        this.cy = this.clampCy(this.cy - panStep);
        this.draw();
        break;
      // Pan down.
      case 'ArrowDown':
        this.cy = this.clampCy(this.cy + panStep);
        this.draw();
        break;
      // Ignore unrelated keys.
      default:
        return;
    }
    // Stop browser defaults (scroll/page behavior on arrows, etc.).
    e.preventDefault();
  };

  // Zoom helper used by keyboard controls.
  zoomBy(factor: number) {
    // Image X under current mouse before zoom change.
    const imgX = (this.mouseX - this.canvas.width / 2) / this.zoom + this.cx;
    // Image Y under current mouse before zoom change.
    const imgY = (this.mouseY - this.canvas.height / 2) / this.zoom + this.cy;

    // Minimum fit-to-screen zoom.
    const minZoom = Math.min(this.canvas.width / this.imageWidth, this.canvas.height / this.imageHeight);
    // Maximum zoom cap.
    const maxZoom = Math.min(this.canvas.width, this.canvas.height) / 30;
    // Apply requested factor and clamp.
    this.zoom = Math.max(minZoom, Math.min(maxZoom, this.zoom * factor));

    // Keep cursor-focused point stable by adjusting camera center.
    this.cx = this.clampCx(imgX - (this.mouseX - this.canvas.width / 2) / this.zoom);
    // Keep cursor-focused point stable by adjusting camera center.
    this.cy = this.clampCy(imgY - (this.mouseY - this.canvas.height / 2) / this.zoom);
    // Draw new zoomed view.
    this.draw();
  }

  // Lifecycle hook after initial render; good place for GL setup.
  protected firstUpdated(_changedProperties: PropertyValues): void {
    // Acquire WebGL2 context from canvas.
    const gl = this.canvas.getContext('webgl2')!;
    // Store context for later use.
    this.gl = gl;

    // Compile vertex shader source.
    const vs = this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    // Compile fragment shader source.
    const fs = this.createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    // Create shader program object.
    const program = gl.createProgram()!;
    // Attach vertex shader.
    gl.attachShader(program, vs);
    // Attach fragment shader.
    gl.attachShader(program, fs);
    // Link shaders into executable program.
    gl.linkProgram(program);
    // Activate program for subsequent draw calls.
    gl.useProgram(program);

    // Vertex data for fullscreen quad rendered as triangle strip.
    const vertices = new Float32Array([
      // x, y position   u, v texcoord
      -1, -1,      0, 1,
       1, -1,      1, 1,
      -1,  1,      0, 0,
       1,  1,      1, 0,
    ]);

    // Create and bind a vertex array object to store attribute state.
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    // Create and bind GPU buffer for vertex data.
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Upload static vertex data to GPU.
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Resolve location of a_position attribute in shader.
    const aPosition = gl.getAttribLocation(program, 'a_position');
    // Enable attribute array at that location.
    gl.enableVertexAttribArray(aPosition);
    // Describe position layout: 2 floats, stride 16 bytes, offset 0.
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);

    // Resolve location of a_texcoord attribute in shader.
    const aTexcoord = gl.getAttribLocation(program, 'a_texcoord');
    // Enable attribute array for texcoords.
    gl.enableVertexAttribArray(aTexcoord);
    // Describe texcoord layout: 2 floats, stride 16 bytes, offset 8.
    gl.vertexAttribPointer(aTexcoord, 2, gl.FLOAT, false, 16, 8);

    // Create texture for per-pixel color indices.
    this.indexTexture = gl.createTexture()!;
    // Select texture unit 0 (matches shader uniform binding below).
    gl.activeTexture(gl.TEXTURE0);
    // Bind index texture to TEXTURE_2D target.
    gl.bindTexture(gl.TEXTURE_2D, this.indexTexture);
    // Ensure 1-byte rows are accepted without 4-byte row padding assumptions.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // Use nearest filtering so indices are sampled exactly (no interpolation).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    // Use nearest filtering on magnification too.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // Clamp horizontal sampling to edge.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    // Clamp vertical sampling to edge.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create texture for palette color entries.
    this.paletteTexture = gl.createTexture()!;
    // Select texture unit 1 for palette texture.
    gl.activeTexture(gl.TEXTURE1);
    // Bind palette texture to TEXTURE_2D target.
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    // Use nearest filtering so each palette slot is discrete.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    // Use nearest filtering for magnification.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // Clamp horizontal sampling.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    // Clamp vertical sampling.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Tell shader that u_index samples from texture unit 0.
    gl.uniform1i(gl.getUniformLocation(program, 'u_index'), 0);
    // Tell shader that u_palette samples from texture unit 1.
    gl.uniform1i(gl.getUniformLocation(program, 'u_palette'), 1);
    // Cache uniform location for palette size updates.
    this.paletteSizeLocation = gl.getUniformLocation(program, 'u_paletteSize')!;
    // Cache uniform location for screen size updates.
    this.screenSizeLocation = gl.getUniformLocation(program, 'u_screenSize')!;
    // Cache uniform location for camera center updates.
    this.centerLocation = gl.getUniformLocation(program, 'u_center')!;
    // Cache uniform location for zoom updates.
    this.zoomLocation = gl.getUniformLocation(program, 'u_zoom')!;
    // Cache uniform location for image size updates.
    this.imageSizeLocation = gl.getUniformLocation(program, 'u_imageSize')!;

    // Attach wheel listener to canvas with passive:false so preventDefault works.
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // Initialize canvas size/viewport and draw first frame.
    this.onResize();
  }

  // Convert hex palette strings into RGBA bytes and upload palette texture.
  uploadPalette() {
    // Alias context for concise code.
    const gl = this.gl;
    // Allocate RGBA buffer (4 bytes per palette entry).
    const rgba = new Uint8Array(this.colorIndex.length * 4);
    // Fill RGBA array by parsing each #RRGGBB string.
    for (let i = 0; i < this.colorIndex.length; i++) {
      // Current color hex string.
      const hex = this.colorIndex[i];
      // Parse red channel from hex and write into RGBA buffer.
      rgba[i * 4] = parseInt(hex.slice(1, 3), 16);
      // Parse green channel from hex and write into RGBA buffer.
      rgba[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
      // Parse blue channel from hex and write into RGBA buffer.
      rgba[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
      // Set alpha channel to fully opaque.
      rgba[i * 4 + 3] = 255;
    }
    // Select palette texture unit.
    gl.activeTexture(gl.TEXTURE1);
    // Upload palette as width=N, height=1 RGBA texture.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.colorIndex.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    // Update palette size uniform for index->u conversion in shader.
    gl.uniform1f(this.paletteSizeLocation, this.colorIndex.length);
  }

  // Upload latest index buffer into R8 texture.
  uploadIndex() {
    // Alias context for concise code.
    const gl = this.gl;
    // Select index texture unit.
    gl.activeTexture(gl.TEXTURE0);
    // Upload index texture as single-channel unsigned bytes.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.imageWidth, this.imageHeight, 0, gl.RED, gl.UNSIGNED_BYTE, this.data);
  }

  // Lifecycle hook called on reactive updates.
  protected updated(changedProperties: PropertyValues): void {
    // Guard until GL and reactive inputs are initialized.
    if (!this.gl || !this.data || !this.colorIndex) return;

    // If image dimensions changed, refit camera.
    if (changedProperties.has('imageWidth') || changedProperties.has('imageHeight')) {
      this.fitToScreen();
    }

    // If palette changed, upload palette texture.
    if (changedProperties.has('colorIndex')) {
      this.uploadPalette();
    }

    // If pixel indices changed, upload texture and redraw.
    if (changedProperties.has('data')) {
      this.uploadIndex();
      this.draw();
    }
  }

  // Draw current frame with latest camera and texture state.
  draw() {
    // If GL is not ready yet, skip draw.
    if (!this.gl) return;
    // Alias context for concise code.
    const gl = this.gl;

    // Push current canvas dimensions to shader.
    gl.uniform2f(this.screenSizeLocation, this.canvas.width, this.canvas.height);
    // Push current camera center to shader.
    gl.uniform2f(this.centerLocation, this.cx, this.cy);
    // Push current zoom value to shader.
    gl.uniform1f(this.zoomLocation, this.zoom);
    // Push image dimensions to shader.
    gl.uniform2f(this.imageSizeLocation, this.imageWidth, this.imageHeight);

    // Clear color buffer to dark gray background.
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    // Execute clear command.
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Draw fullscreen quad (4 vertices as triangle strip).
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Lit render function returns component template.
  render() {
    // Render one canvas and attach mousedown pan handler.
    return html`
      <canvas @mousedown=${this.onMouseDown}></canvas>
    `
  }

  // Utility to compile shader and surface compiler errors clearly.
  private createShader(type: number, source: string): WebGLShader {
    // Alias context for concise code.
    const gl = this.gl;
    // Allocate shader object.
    const shader = gl.createShader(type)!;
    // Provide GLSL source code.
    gl.shaderSource(shader, source);
    // Compile shader source into GPU program representation.
    gl.compileShader(shader);
    // If compilation failed, throw detailed compiler log.
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader)!);
    }
    // Return compiled shader object.
    return shader;
  }
}
