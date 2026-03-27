import {css, html, LitElement, type PropertyValues} from "lit";
import {customElement, property, state} from "lit/decorators.js";
import {clamp} from "./lib/math";

@customElement('replace-seekbar')
export class Seekbar extends LitElement {

  @property({ type: Number })
  length!: number;

  // Real position (source of truth)
  @property({ type: Number })
  current!: number;

  // Local UI thumb position (for rendering purposes)
  @state()
  uiPosition: number = 0;

  static styles = css`
    :host {
      height: 100%;
      display: block;
    }

    .container {
      position: absolute;
      left: 16px;
      bottom: 16px;
      right: 16px;
    }

    .track {
      position: relative;
      width: 100%;
      height: 10px;
      background: rgb(113 113 113);
      box-shadow: rgba(0, 0, 0, 0.35) 0px 5px 15px;
      border-radius: 10px;
    }

    .progress {
      background: rgb(200 0 0 / 70%);
      height: 100%;
      border-radius: 10px;
    }

    .thumb {
      position: absolute;
      top: 50%;
      width: 20px;
      height: 20px;
      background: rgba(255 0 0);
      border-radius: 100%;
      transform: translateX(-50%) translateY(-50%);
      pointer-events: none;
    }
  `

  disconnectedCallback(): void {
    super.disconnectedCallback();

    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
  }

  private seekDebounceTimeout = 0;

  protected willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('current')) {
      this.uiPosition = this.current;
    }

    if (changedProperties.has('uiPosition')) {
      clearTimeout(this.seekDebounceTimeout);
      this.seekDebounceTimeout = window.setTimeout(() => {
        this.dispatchEvent(new CustomEvent('change', { detail: this.uiPosition / this.length }));
      }, 100);
    }
  }

  private mouseDownMeta: {
    x: number,
    y: number,
    left: number,
    width: number,
  } | null = null;

  handleMouseMove = (evt: MouseEvent) => {
    if (! this.mouseDownMeta) {
      return;
    }

    evt.stopPropagation();

    const { clientX } = evt;

    const pct = (clientX - this.mouseDownMeta.left) / this.mouseDownMeta.width;

    this.uiPosition = clamp(pct * this.length, 0, this.length);
  };

  handleMouseUp = (evt: MouseEvent) => {
    evt.preventDefault();
    this.mouseDownMeta = null;
    window.removeEventListener('mousemove', this.handleMouseMove);
  }

  handleTrackMouseDown(evt: MouseEvent) {
    evt.stopPropagation();
    const { left, width } = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
    this.mouseDownMeta = { x: evt.clientX, y: evt.clientY, left, width };

    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp, { once: true });
  }

  protected render() {
    return html`
      <div class="container">
        <div class="track" @mousedown=${this.handleTrackMouseDown}>
          <div class="progress" style="width: ${(this.uiPosition / this.length) * 100}%"></div>
          <div class="thumb" style="left: ${(this.uiPosition / this.length) * 100}%"></div>
        </div>
      </div>
    `;
  }
}
