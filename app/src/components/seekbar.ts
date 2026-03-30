import {css, html, LitElement, type PropertyValues} from "lit";
import {customElement, property, query, state} from "lit/decorators.js";
import {clamp} from "../lib/math";

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
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private seekDebounceTimeout = 0;

  private playbackIntervalId = 0;

  protected willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('current') && !this.mouseDownMeta) {
      this.dragPosition = this.current;
    }

    if (changedProperties.has('dragPosition')) {
      clearTimeout(this.seekDebounceTimeout);
      this.seekDebounceTimeout = window.setTimeout(() => {
        this.dispatchEvent(new CustomEvent('change', { detail: this.dragPosition / this.length }));
      }, 100);
    }

    if (changedProperties.has('playbackState') || changedProperties.has('playbackSpeed')) {
      clearInterval(this.playbackIntervalId);
      if (this.playbackState === 'paused') {
        return;
      }

      const fps = 30;
      const normalPlaybackRate = 1000 / fps;
      const delta = this.playbackState === 'forward'
        ? normalPlaybackRate * this.playbackSpeed
        : -normalPlaybackRate * this.playbackSpeed;

      this.playbackIntervalId = setInterval(() => {
        // Will be off by 100 because of the debounce above. not a big deal but it can be fixed by only using debounce in the drag code since that's where it's needed
        const updatedPosition = clamp(this.current + delta, 0, this.length);
        this.dispatchEvent(new CustomEvent('change', { detail: updatedPosition / this.length }));
      }, 1000 / fps);
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

    this.dragPosition = clamp(pct * this.length, 0, this.length);
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
    this.dragPosition = clamp(pct * this.length, 0, this.length);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp, { once: true });
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

    const tooltipLeft = clamp(evt.clientX, left, left + width);

    this.tooltip.style.left = `${tooltipLeft}px`;

    const offset = clamp(evt.clientX - left, 0, width);
    const pct = offset / width;
    const timestamp = pct * this.length;

    this.tooltip.textContent = this.timestampToReadableTime(timestamp);
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

  handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'j':
        this.playbackState = this.playbackState === 'backward' ? 'paused' : 'backward';
        break;
      case 'k':
        this.playbackState = 'paused';
        break;
      case 'l':
        this.playbackState = this.playbackState === 'forward' ? 'paused' : 'forward';
        break;
      case 'f':
        this.handleTogglePlaybackSpeed();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  handleSetPlaybackState = (state: PlaybackState) => () => {
    this.playbackState = state;
  };

  handleTogglePlaybackSpeed = () => {
    const currentSpeedIndex = SPEEDS.findIndex((x) => x === this.playbackSpeed);

    if (currentSpeedIndex === -1) {
      this.playbackSpeed = SPEEDS[0];
      return;
    }


      this.playbackSpeed = SPEEDS[(currentSpeedIndex + 1) % SPEEDS.length];
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
