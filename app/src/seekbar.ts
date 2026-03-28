import {css, html, LitElement, type PropertyValues} from "lit";
import {customElement, property, query, state} from "lit/decorators.js";
import {clamp} from "./lib/math";

interface ElementMeta {
  readonly x: number;
  readonly y: number;
  readonly left: number;
  readonly width: number;
}

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

  @query('.track')
  track!: HTMLDivElement;

  @query('.tooltip')
  tooltip!: HTMLDivElement;

  static styles = css`
    :host {
      height: 100%;
      display: block;
    }

    .container {
      position: absolute;
      left: 0;
      bottom: 0;
      right: 0;
    }

    .track-draggable {
      width: 100%;
      height: 20px;
      display: flex;
      align-items: center;
      padding: 16px 24px;
      box-sizing: border-box;
      margin-bottom: 5px;
    }

    .track {
      position: relative;
      flex: 1;
      height: 10px;
      background: rgb(113 113 113);
      box-shadow: rgba(0, 0, 0, 0.16) 0px 1px 4px;
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

    .tooltip {
      font-family: sans-serif;
      font-size: 14px;
      text-wrap: nowrap;
      position: absolute;
      background: rgb(64 64 64);
      bottom: 100%;
      padding: 6px 6px;
      transform: translateX(-50%);
      border-radius: 6px;
      left: 0;
      z-index: 10;
      opacity: 0;
      transition: opacity 200ms ease-in-out;
      pointer-events: none;
      user-select: none;
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

  private mouseDownMeta: ElementMeta | null = null;

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
    const { left, width } = this.track.getBoundingClientRect();
    this.mouseDownMeta = { x: evt.clientX, y: evt.clientY, left, width };

    const { clientX } = evt;

    const pct = (clientX - left) / width;
    this.uiPosition = clamp(pct * this.length, 0, this.length);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp, { once: true });
  }

  private hoverMeta: ElementMeta | null = null;

  handleHoverMouseMove = (evt: MouseEvent) => {
    if (!this.hoverMeta) {
      return;
    }

    const { left, width } = this.hoverMeta;

    const tooltipLeft = clamp(evt.clientX, left, left + width);

    this.tooltip.style.left = `${tooltipLeft}px`;

    const offset = clamp(evt.clientX - left, 0, width);
    const pct = offset / width;
    const timestamp = pct * this.length;

    const days = Math.floor(timestamp / 1000 / 60 / 60 / 24) + 1;
    const hours = Math.floor(timestamp / 1000 / 60 / 60) % 24;
    const minutes = Math.floor(timestamp / 1000 / 60) % 60;
    const seconds = Math.floor(timestamp / 1000 % 60);

    this.tooltip.textContent = `Day ${days} · ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  handleTrackMouseEnter = (evt: MouseEvent) => {
    const { left, width } = this.track.getBoundingClientRect();

    this.hoverMeta = { x: 0, y: 0, left, width };

    window.addEventListener('mousemove', this.handleHoverMouseMove);
    (evt.currentTarget as HTMLDivElement).addEventListener('mouseleave', this.handleTrackMouseLeave, { once: true });
    this.tooltip.style.opacity = '1';
  };

  handleTrackMouseLeave = () => {
    this.tooltip.style.opacity = '0';
    window.removeEventListener('mousemove', this.handleHoverMouseMove);
  };

  protected render() {
    return html`
      <div class="container">
        <div class="tooltip"></div>
        <div class="track-draggable" @mouseenter=${this.handleTrackMouseEnter} @mousedown=${this.handleTrackMouseDown}>
          <div class="track">
            <div class="progress" style="width: ${(this.uiPosition / this.length) * 100}%"></div>
            <div class="thumb" style="left: ${(this.uiPosition / this.length) * 100}%"></div>
          </div>
        </div>
      </div>
    `;
  }
}
