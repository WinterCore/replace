import {css, html, LitElement, type PropertyValues} from "lit";
import {customElement, property, query} from "lit/decorators.js";

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texcoord;
out vec2 v_texcoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texcoord = a_texcoord;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texcoord;
out vec4 fragColor;
uniform sampler2D u_index;
uniform sampler2D u_palette;
uniform float u_paletteSize;
uniform vec2 u_screenSize;
uniform vec2 u_center;
uniform float u_zoom;

void main() {
  vec2 screenPos = v_texcoord * u_screenSize;
  vec2 imagePos = (screenPos - u_screenSize * 0.5) / u_zoom + u_center;
  vec2 uv = imagePos / 2000.0;

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.1, 0.1, 0.1, 1.0);
    return;
  }

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

  // Camera state
  cx = 1000;
  cy = 1000;
  zoom = 1;

  // Drag state
  dragging = false;
  dragStartX = 0;
  dragStartY = 0;
  dragStartCx = 0;
  dragStartCy = 0;

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
    this.zoom = Math.min(this.canvas.width / 2000, this.canvas.height / 2000);
    this.cx = 1000;
    this.cy = 1000;
  }

  clampCx(cx: number): number {
    return Math.max(0, Math.min(2000, cx));
  }

  clampCy(cy: number): number {
    return Math.max(0, Math.min(2000, cy));
  }

  onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Image position under cursor before zoom
    const imgX = (mouseX - this.canvas.width / 2) / this.zoom + this.cx;
    const imgY = (mouseY - this.canvas.height / 2) / this.zoom + this.cy;

    const minZoom = Math.min(this.canvas.width / 2000, this.canvas.height / 2000);
    const maxZoom = Math.min(this.canvas.width, this.canvas.height) / 30;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom = Math.max(minZoom, Math.min(maxZoom, this.zoom * factor));

    // Adjust pan so the same image point stays under cursor
    this.cx = this.clampCx(imgX - (mouseX - this.canvas.width / 2) / this.zoom);
    this.cy = this.clampCy(imgY - (mouseY - this.canvas.height / 2) / this.zoom);

    this.draw();
  };

  onMouseDown = (e: MouseEvent) => {
    this.dragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartCx = this.cx;
    this.dragStartCy = this.cy;
  };

  onMouseMove = (e: MouseEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    this.cx = this.clampCx(this.dragStartCx - dx / this.zoom);
    this.cy = this.clampCy(this.dragStartCy - dy / this.zoom);
    this.draw();
  };

  onMouseUp = () => {
    this.dragging = false;
  };

  onKeyDown = (e: KeyboardEvent) => {
    const panStep = 50 / this.zoom;
    switch (e.key) {
      case '-':
        this.zoomBy(0.9);
        break;
      case '=':
      case '+':
        this.zoomBy(1.1);
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

  zoomBy(factor: number) {
    const minZoom = Math.min(this.canvas.width / 2000, this.canvas.height / 2000);
    const maxZoom = Math.min(this.canvas.width, this.canvas.height) / 30;
    this.zoom = Math.max(minZoom, Math.min(maxZoom, this.zoom * factor));
    this.cx = this.clampCx(this.cx);
    this.cy = this.clampCy(this.cy);
    this.draw();
  }

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

    // Fullscreen quad as triangle strip
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

    const aPosition = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);

    const aTexcoord = gl.getAttribLocation(program, 'a_texcoord');
    gl.enableVertexAttribArray(aTexcoord);
    gl.vertexAttribPointer(aTexcoord, 2, gl.FLOAT, false, 16, 8);

    // Index texture: R8, 2000x2000, one byte per pixel
    this.indexTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.indexTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Palette texture: RGBA, Nx1
    this.paletteTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Bind texture units to uniforms
    gl.uniform1i(gl.getUniformLocation(program, 'u_index'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_palette'), 1);
    this.paletteSizeLocation = gl.getUniformLocation(program, 'u_paletteSize')!;
    this.screenSizeLocation = gl.getUniformLocation(program, 'u_screenSize')!;
    this.centerLocation = gl.getUniformLocation(program, 'u_center')!;
    this.zoomLocation = gl.getUniformLocation(program, 'u_zoom')!;

    // Wheel listener on the canvas with passive: false to allow preventDefault
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 2000, 2000, 0, gl.RED, gl.UNSIGNED_BYTE, this.data);
  }

  protected updated(changedProperties: PropertyValues): void {
    if (!this.gl || !this.data || !this.colorIndex) return;

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
