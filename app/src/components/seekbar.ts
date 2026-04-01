import {css, html, LitElement, type PropertyValues} from "lit";
import {customElement, property, query, state} from "lit/decorators.js";
import {clamp} from "../lib/math";
import type {PlaybackState} from "../types";
import {SPEEDS, type PlaybackSpeed} from "../controllers/playback-controller";
import './loader';

interface ElementMeta {
  readonly x: number;
  readonly y: number;
  readonly left: number;
  readonly width: number;
}

@customElement('replace-seekbar')
export class Seekbar extends LitElement {
  @property({ type: Number })
  playbackSpeed!: PlaybackSpeed;

  @property({ type: Number })
  playbackState!: PlaybackState;

  @property({ type: Number })
  length!: number;

  // Real position (source of truth)
  @property({ type: Number })
  current!: number;

  @property({ type: Boolean })
  isLoading: boolean = false;

  @property({ type: Boolean })
  disabled: boolean = false;

  // playhead position (while dragging) which is applied with a debounce
  @state()
  dragPosition: number = 0;

  @query('.track')
  track!: HTMLDivElement;

  @query('.tooltip')
  tooltip!: HTMLDivElement;


  static styles = css`
    :host {
      height: 100%;
      display: block;
      font-family: sans-serif;
    }

    .container {
      position: absolute;
      z-index: 10;
      left: 0;
      bottom: 0;
      right: 0;
    }

    .container .playback-speed {
      cursor: pointer;
      font-weight: bold;
      margin-left: 12px;
    }

    .controls {
      padding: 0px 16px;
      // mix-blend-mode: difference;
      user-select: none;
      display: flex;
    }

    .controls-inner {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgb(60 60 60 / 70%);
      border-radius: 999px;
      padding: 6px 10px;
      opacity: 0.75;
      transition: opacity 200ms ease-out;
    }

    .controls-inner:hover {
      opacity: 1;
    }

    .controls svg {
      cursor: pointer;
    }

    .controls svg.active {
      fill: #50C878;
      stroke: #50C878;
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
      font-size: 14px;
      text-wrap: nowrap;
      position: absolute;
      background: rgb(64 64 64);
      bottom: 36px;
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

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('mouseup', this.handleMouseUp);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private seekDebounceTimeout = 0;

  protected willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('current') && !this.mouseDownMeta) {
      this.dragPosition = this.current;
    }
  }

  private mouseDownMeta: ElementMeta | null = null;

  handleMouseMove = (evt: MouseEvent) => {
    if (this.disabled || !this.mouseDownMeta) {
      return;
    }

    evt.stopPropagation();

    const { clientX } = evt;

    const pct = (clientX - this.mouseDownMeta.left) / this.mouseDownMeta.width;

    this.dragPosition = clamp(pct * this.length, 0, this.length);

    clearTimeout(this.seekDebounceTimeout);
    this.seekDebounceTimeout = window.setTimeout(() => {
      this.dispatchEvent(new CustomEvent('playheadChange', { detail: this.dragPosition / this.length }));
    }, 100);
  };

  handleMouseUp = (evt: MouseEvent) => {
    evt.preventDefault();
    this.mouseDownMeta = null;
    window.removeEventListener('mousemove', this.handleMouseMove);
  }

  handleTrackMouseDown(evt: MouseEvent) {
    if (this.disabled) return;
    evt.stopPropagation();
    const { left, width } = this.track.getBoundingClientRect();
    this.mouseDownMeta = { x: evt.clientX, y: evt.clientY, left, width };

    const { clientX } = evt;

    const pct = (clientX - left) / width;
    this.dispatchEvent(new CustomEvent('playheadChange', { detail: pct }));
    this.dragPosition = pct * this.length;

    window.addEventListener('mousemove', this.handleMouseMove);
  }

  private hoverMeta: ElementMeta | null = null;

  private timestampToReadableTime(timestamp: number): string {
    const days = Math.floor(timestamp / 1000 / 60 / 60 / 24) + 1;
    const hours = Math.floor(timestamp / 1000 / 60 / 60) % 24;
    const minutes = Math.floor(timestamp / 1000 / 60) % 60;
    const seconds = Math.floor(timestamp / 1000 % 60);

    return `Day ${days} · ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  handleHoverMouseMove = (evt: MouseEvent) => {
    if (!this.hoverMeta) {
      return;
    }

    const { left, width } = this.hoverMeta;

    const padding = 8;
    const tooltipHalf = this.tooltip.offsetWidth / 2;
    const minLeft = tooltipHalf + padding;
    const maxLeft = window.innerWidth - tooltipHalf - padding;
    const tooltipLeft = clamp(evt.clientX, minLeft, maxLeft);

    this.tooltip.style.left = `${tooltipLeft}px`;

    const offset = clamp(evt.clientX - left, 0, width);
    const pct = offset / width;
    const timestamp = pct * this.length;

    this.tooltip.textContent = this.timestampToReadableTime(timestamp);
  };

  handleTrackMouseEnter = (evt: MouseEvent) => {
    if (this.disabled) return;
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

  handleSetPlaybackState = (state: PlaybackState) => () => {
    this.dispatchEvent(new CustomEvent('playbackStateChange', { detail: state }));
  };

  handleKeyDown = (e: KeyboardEvent) => {
    if (this.disabled) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'j':
        this.handleSetPlaybackState(this.playbackState === 'backward' ? 'paused' : 'backward')();
        break;
      case 'k':
        this.handleSetPlaybackState('paused')();
        break;
      case 'l':
        this.handleSetPlaybackState(this.playbackState === 'forward' ? 'paused' : 'forward')();
        break;
      case 'f':
        this.handleTogglePlaybackSpeed();
        break;
      case '0': case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9':
        this.dispatchEvent(new CustomEvent('playheadChange', { detail: parseInt(e.key) / 10 }));
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  handleTogglePlaybackSpeed = () => {
    const currentSpeedIndex = SPEEDS.findIndex((x) => x === this.playbackSpeed);

    if (currentSpeedIndex === -1) {
      this.dispatchEvent(new CustomEvent('togglePlaybackSpeed', { detail: SPEEDS[0] }));
      return;
    }

    const nextSpeed = currentSpeedIndex === -1
      ? SPEEDS[0]
      : SPEEDS[(currentSpeedIndex + 1) % SPEEDS.length];

    this.dispatchEvent(new CustomEvent('togglePlaybackSpeed', { detail: nextSpeed }));
  };

  protected render() {
    return html`
      <div class="container">
        <div class="controls">
          <div class="controls-inner">
            <svg xmlns="http://www.w3.org/2000/svg" @click=${this.handleSetPlaybackState('backward')} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="transform: rotate(180deg)" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play ${this.playbackState === 'backward' ? 'active' : ''}"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>
            <svg xmlns="http://www.w3.org/2000/svg" @click=${this.handleSetPlaybackState('paused')} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>
            <svg xmlns="http://www.w3.org/2000/svg" @click=${this.handleSetPlaybackState('forward')} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play ${this.playbackState === 'forward' ? 'active' : ''}"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>
            <div class="playback-speed" @click=${this.handleTogglePlaybackSpeed}>${this.playbackSpeed}x</div>
            <div style="margin-left: 10px">${this.timestampToReadableTime(this.current)}</div>
            ${this.isLoading ? html`<replace-loader style="margin-left: 6px; --loader-size: 18px;"></replace-loader>` : ''}
          </div>
        </div>
        <div class="tooltip"></div>
        <div class="track-draggable" @mouseenter=${this.handleTrackMouseEnter} @mousedown=${this.handleTrackMouseDown}>
          <div class="track">
            <div class="progress" style="width: ${(this.dragPosition / this.length) * 100}%"></div>
            <div class="thumb" style="left: ${(this.dragPosition / this.length) * 100}%"></div>
          </div>
        </div>
      </div>
    `;
  }
}
