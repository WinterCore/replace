import {css, html, LitElement, type PropertyValues} from "lit";
import {customElement, property, query} from "lit/decorators.js";

/**
 * Passthrough vertex shader for a fullscreen quad.
 * Maps clip-space positions directly and forwards texture coordinates
 * to the fragment shader for per-pixel sampling.
 */
const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texcoord;
out vec2 v_texcoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texcoord = a_texcoord;
}
`;

/**
 * Fragment shader that implements a pan/zoom camera over an indexed-color image.
 *
 * The image is stored as two textures:
 *   - u_index: R8 texture where each pixel holds a palette index (0-255)
 *   - u_palette: Nx1 RGBA texture mapping indices to actual colors
 *
 * For each screen pixel, the shader:
 *   1. Converts screen position to image-space using camera center + zoom
 *   2. Clamps to pixel centers (floor + 0.5) to avoid interpolation artifacts
 *   3. Reads the palette index from u_index
 *   4. Looks up the actual color from u_palette at (index + 0.5) / paletteSize
 *
 * Pixels outside the image bounds render as dark gray background.
 */
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D u_index;
uniform sampler2D u_palette;
uniform float u_paletteSize;
uniform vec2 u_screenSize;
uniform vec2 u_center;
uniform float u_zoom;
uniform vec2 u_imageSize;

void main() {
  vec2 screenPos = v_texcoord * u_screenSize;
  vec2 imagePos = (screenPos - u_screenSize * 0.5) / u_zoom + u_center;

  if (imagePos.x < 0.0 || imagePos.x >= u_imageSize.x || imagePos.y < 0.0 || imagePos.y >= u_imageSize.y) {
    fragColor = vec4(0.1, 0.1, 0.1, 1.0);
    return;
  }

  vec2 uv = (floor(imagePos) + vec2(0.5, 0.5)) / u_imageSize;
  float index = texture(u_index, uv).r * 255.0;
  float u = (index + 0.5) / u_paletteSize;
  fragColor = texture(u_palette, vec2(u, 0.5));
}
`;

@customElement('replace-canvas')
export class Canvas extends LitElement {
  @query('canvas')
  canvas!: HTMLCanvasElement;

  gl!: WebGL2RenderingContext;
  indexTexture!: WebGLTexture;
  paletteTexture!: WebGLTexture;
  paletteSizeLocation!: WebGLUniformLocation;
  screenSizeLocation!: WebGLUniformLocation;
  centerLocation!: WebGLUniformLocation;
  zoomLocation!: WebGLUniformLocation;
  imageSizeLocation!: WebGLUniformLocation;

  // Camera state
  cx = 1000;
  cy = 1000;
  zoom = 1;

  // Mouse position (canvas-relative), used as anchor point for keyboard zoom
  mouseX = 0;
  mouseY = 0;

  // Mouse drag state
  dragging = false;
  dragStartX = 0;
  dragStartY = 0;
  dragStartCx = 0;
  dragStartCy = 0;
  lastDragX = 0;
  lastDragY = 0;

  // Touch state for pan/pinch
  lastTouchX = 0;
  lastTouchY = 0;
  lastPinchDist = 0;

  // Inertia state: velocity in image-space pixels per millisecond
  velocityX = 0;
  velocityY = 0;
  lastMoveTime = 0;
  inertiaRaf = 0;

  @property({ type: Number })
  imageWidth!: number;

  @property({ type: Number })
  imageHeight!: number;

  @property({ type: Object })
  data!: Uint8Array;

  @property({ type: Array })
  colorIndex!: ReadonlyArray<string>;

  static styles = css`
    :host {
      height: 100%;
      display: block;
    }

    canvas {
      display: block;
    }
  `

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  onResize = () => {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.fitToScreen();
    this.draw();
  };

  fitToScreen() {
    this.zoom = Math.min(this.canvas.width / this.imageWidth, this.canvas.height / this.imageHeight);
    this.cx = this.imageWidth / 2;
    this.cy = this.imageHeight / 2;
  }

  clampCx(cx: number): number {
    return Math.max(0, Math.min(this.imageWidth, cx));
  }

  clampCy(cy: number): number {
    return Math.max(0, Math.min(this.imageHeight, cy));
  }

  /**
   * Zoom around a specific point in canvas-space, keeping that point
   * stationary on screen by adjusting the camera center after zoom.
   */
  zoomAroundPoint(canvasX: number, canvasY: number, factor: number) {
    const imgX = (canvasX - this.canvas.width / 2) / this.zoom + this.cx;
    const imgY = (canvasY - this.canvas.height / 2) / this.zoom + this.cy;

    const minZoom = Math.min(this.canvas.width / this.imageWidth, this.canvas.height / this.imageHeight);
    const maxZoom = Math.min(this.canvas.width, this.canvas.height) / 30;
    this.zoom = Math.max(minZoom, Math.min(maxZoom, this.zoom * factor));

    this.cx = this.clampCx(imgX - (canvasX - this.canvas.width / 2) / this.zoom);
    this.cy = this.clampCy(imgY - (canvasY - this.canvas.height / 2) / this.zoom);
  }

  onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.95 : 1.05;
    this.zoomAroundPoint(mouseX, mouseY, factor);
    this.draw();
  };

  stopInertia() {
    cancelAnimationFrame(this.inertiaRaf);
    this.velocityX = 0;
    this.velocityY = 0;
  }

  startInertia() {
    const speed = Math.hypot(this.velocityX, this.velocityY);
    if (speed < 0.01) return;

    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;

      const friction = Math.pow(0.88, dt / 16);
      this.velocityX *= friction;
      this.velocityY *= friction;

      this.cx = this.clampCx(this.cx - this.velocityX * dt);
      this.cy = this.clampCy(this.cy - this.velocityY * dt);
      this.draw();

      if (Math.hypot(this.velocityX, this.velocityY) < 0.001) return;
      this.inertiaRaf = requestAnimationFrame(tick);
    };

    this.inertiaRaf = requestAnimationFrame(tick);
  }

  /**
   * Track velocity in image-space pixels/ms. Uses exponential moving average
   * so the release velocity reflects recent movement, not the entire drag.
   */
  trackVelocity(screenDx: number, screenDy: number) {
    const now = performance.now();
    const dt = now - this.lastMoveTime;
    this.lastMoveTime = now;

    if (dt <= 0 || dt > 100) {
      this.velocityX = 0;
      this.velocityY = 0;
      return;
    }

    const vx = screenDx / this.zoom / dt;
    const vy = screenDy / this.zoom / dt;
    const smoothing = 0.3;
    this.velocityX = this.velocityX * (1 - smoothing) + vx * smoothing;
    this.velocityY = this.velocityY * (1 - smoothing) + vy * smoothing;
  }

  onMouseDown = (e: MouseEvent) => {
    this.stopInertia();
    this.dragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
    this.dragStartCx = this.cx;
    this.dragStartCy = this.cy;
    this.lastMoveTime = performance.now();
    this.velocityX = 0;
    this.velocityY = 0;
  };

  onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;

    if (!this.dragging) return;

    this.trackVelocity(e.clientX - this.lastDragX, e.clientY - this.lastDragY);
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;

    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    this.cx = this.clampCx(this.dragStartCx - dx / this.zoom);
    this.cy = this.clampCy(this.dragStartCy - dy / this.zoom);
    this.draw();
  };

  onMouseUp = () => {
    if (this.dragging) {
      this.dragging = false;
      this.startInertia();
    }
  };

  onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    this.stopInertia();
    this.lastMoveTime = performance.now();
    this.velocityX = 0;
    this.velocityY = 0;
    this.resetTouchState(e.touches);
  };

  onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    // All fingers lifted — coast with inertia from the last pan velocity
    if (e.touches.length === 0) {
      this.startInertia();
    } else {
      // Finger count changed (e.g. 2→1), re-anchor so the next move
      // doesn't compute a delta from the old midpoint
      this.resetTouchState(e.touches);
    }
  };

  /**
   * Re-anchor touch tracking when finger count changes (start, or lift one finger).
   * Stores the current touch position(s) so the next touchmove computes a
   * zero delta from this point rather than jumping from stale coordinates.
   */
  resetTouchState(touches: TouchList) {
    if (touches.length === 1) {
      this.lastTouchX = touches[0].clientX;
      this.lastTouchY = touches[0].clientY;
      this.lastPinchDist = 0;
    } else if (touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      this.lastPinchDist = Math.hypot(dx, dy);
      this.lastTouchX = (touches[0].clientX + touches[1].clientX) / 2;
      this.lastTouchY = (touches[0].clientY + touches[1].clientY) / 2;
    }
  }

  onTouchMove = (e: TouchEvent) => {
    e.preventDefault();

    // Single finger: pan the camera
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - this.lastTouchX;
      const dy = e.touches[0].clientY - this.lastTouchY;
      this.trackVelocity(dx, dy);
      this.cx = this.clampCx(this.cx - dx / this.zoom);
      this.cy = this.clampCy(this.cy - dy / this.zoom);
      this.lastTouchX = e.touches[0].clientX;
      this.lastTouchY = e.touches[0].clientY;
      this.draw();
      return;
    }

    // Two fingers: simultaneous pan + pinch zoom
    if (e.touches.length === 2) {
      // Use the midpoint between fingers as the reference for both pan and zoom
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = this.canvas.getBoundingClientRect();
      const canvasMidX = midX - rect.left;
      const canvasMidY = midY - rect.top;

      // Pan: shift camera by midpoint movement since last frame
      const dx = midX - this.lastTouchX;
      const dy = midY - this.lastTouchY;
      this.cx = this.clampCx(this.cx - dx / this.zoom);
      this.cy = this.clampCy(this.cy - dy / this.zoom);

      // Zoom: ratio of current finger distance to previous distance
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (this.lastPinchDist > 0) {
        this.zoomAroundPoint(canvasMidX, canvasMidY, dist / this.lastPinchDist);
      }

      this.lastPinchDist = dist;
      this.lastTouchX = midX;
      this.lastTouchY = midY;
      this.draw();
    }
  };

  onKeyDown = (e: KeyboardEvent) => {
    const panStep = 50 / this.zoom;
    switch (e.key) {
      case '-':
        this.zoomAroundPoint(this.mouseX, this.mouseY, 0.9);
        this.draw();
        break;
      case '=':
      case '+':
        this.zoomAroundPoint(this.mouseX, this.mouseY, 1.1);
        this.draw();
        break;
      case 'ArrowLeft':
        this.cx = this.clampCx(this.cx - panStep);
        this.draw();
        break;
      case 'ArrowRight':
        this.cx = this.clampCx(this.cx + panStep);
        this.draw();
        break;
      case 'ArrowUp':
        this.cy = this.clampCy(this.cy - panStep);
        this.draw();
        break;
      case 'ArrowDown':
        this.cy = this.clampCy(this.cy + panStep);
        this.draw();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  /**
   * WebGL setup: compile shaders, create fullscreen quad geometry,
   * configure two textures (index + palette), and cache uniform locations.
   *
   * The rendering pipeline works as follows:
   *   1. A fullscreen quad (two triangles as a triangle strip) covers the viewport
   *   2. The fragment shader runs for every screen pixel
   *   3. Each pixel is mapped to image coordinates via the camera transform
   *   4. The palette index is read from the R8 index texture
   *   5. The final color is looked up from the Nx1 palette texture
   *
   * Two textures are used instead of a direct RGBA image because the canvas
   * data changes frequently (playback) while the palette rarely changes,
   * and uploading a 1-byte-per-pixel R8 texture is much cheaper than RGBA.
   */
  protected firstUpdated(_changedProperties: PropertyValues): void {
    const gl = this.canvas.getContext('webgl2')!;
    this.gl = gl;

    const vs = this.createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Fullscreen quad: 4 vertices as triangle strip, each with position + texcoord
    const vertices = new Float32Array([
      // position  texcoord
      -1, -1,      0, 1,
       1, -1,      1, 1,
      -1,  1,      0, 0,
       1,  1,      1, 0,
    ]);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Interleaved layout: stride=16 bytes (2 floats pos + 2 floats texcoord)
    const aPosition = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);

    const aTexcoord = gl.getAttribLocation(program, 'a_texcoord');
    gl.enableVertexAttribArray(aTexcoord);
    gl.vertexAttribPointer(aTexcoord, 2, gl.FLOAT, false, 16, 8);

    // Index texture (R8): one byte per pixel, palette index values
    this.indexTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.indexTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // R8 rows aren't 4-byte aligned
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Palette texture (RGBA): Nx1, one texel per color
    this.paletteTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Bind texture units to sampler uniforms
    gl.uniform1i(gl.getUniformLocation(program, 'u_index'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_palette'), 1);
    this.paletteSizeLocation = gl.getUniformLocation(program, 'u_paletteSize')!;
    this.screenSizeLocation = gl.getUniformLocation(program, 'u_screenSize')!;
    this.centerLocation = gl.getUniformLocation(program, 'u_center')!;
    this.zoomLocation = gl.getUniformLocation(program, 'u_zoom')!;
    this.imageSizeLocation = gl.getUniformLocation(program, 'u_imageSize')!;

    // passive: false needed for preventDefault to stop browser scroll/bounce
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });

    this.onResize();
  }

  uploadPalette() {
    const gl = this.gl;
    const rgba = new Uint8Array(this.colorIndex.length * 4);
    for (let i = 0; i < this.colorIndex.length; i++) {
      const hex = this.colorIndex[i];
      rgba[i * 4] = parseInt(hex.slice(1, 3), 16);
      rgba[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
      rgba[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
      rgba[i * 4 + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.colorIndex.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.uniform1f(this.paletteSizeLocation, this.colorIndex.length);
  }

  uploadIndex() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.imageWidth, this.imageHeight, 0, gl.RED, gl.UNSIGNED_BYTE, this.data);
  }

  protected updated(changedProperties: PropertyValues): void {
    if (!this.gl || !this.data || !this.colorIndex) return;

    if (changedProperties.has('imageWidth') || changedProperties.has('imageHeight')) {
      this.fitToScreen();
    }

    if (changedProperties.has('colorIndex')) {
      this.uploadPalette();
    }

    if (changedProperties.has('data')) {
      this.uploadIndex();
      this.draw();
    }
  }

  draw() {
    if (!this.gl) return;
    const gl = this.gl;

    gl.uniform2f(this.screenSizeLocation, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.centerLocation, this.cx, this.cy);
    gl.uniform1f(this.zoomLocation, this.zoom);
    gl.uniform2f(this.imageSizeLocation, this.imageWidth, this.imageHeight);

    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  render() {
    return html`
      <canvas @mousedown=${this.onMouseDown}></canvas>
    `
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader)!);
    }
    return shader;
  }
}
