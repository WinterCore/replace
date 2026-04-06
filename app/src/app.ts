import { LitElement, css, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { PlaybackController, type PlaybackSpeed, type Year, YEARS } from './controllers/playback-controller'
import DetectorWorker from './amongi-detector/worker?worker';

import './index.css'

import './components/canvas'
import './components/help-popup'
import './components/credits-popup'
import './components/seekbar'
import './components/loader'
import {AsyncData} from './lib/async-data'
import type {PlaybackState} from './types'
import type {DetectionResult, DetectRequest} from './amongi-detector/types';

@customElement('re-place')
export class App extends LitElement {
  playbackController = new PlaybackController(this);

  @state()
  amongiData: AsyncData<DetectionResult> = new AsyncData();

  @state()
  highlights: Uint16Array | null = null;

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .logo {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 20;
      height: 46px;
      opacity: 1;
      pointer-events: none;
      filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.6));
    }

    replace-loader {
      position: absolute;
      z-index: 10;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    replace-canvas {
      transition: opacity 200ms ease-out;
    }

    replace-canvas.dimmed {
      opacity: 0.7;
    }

    .top-right-icons {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .top-right-icons a,
    .top-right-icons button {
      opacity: 0.5;
      transition: opacity 200ms ease-out;
    }

    .top-right-icons a:hover,
    .top-right-icons button:hover {
      opacity: 1;
    }

    .github-link svg {
      fill: white;
      width: 24px;
      height: 24px;
    }

    .amongi-detect {
      background: transparent;
      border: none;
      padding: 0;
      display: block;
      cursor: pointer;
    }

    .amongi-detect svg {
      width: 28px;
      height: 28px;
    }

    .year-toggle {
      position: absolute;
      top: 70px;
      right: 16px;
      z-index: 15;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .year-toggle button {
      background: none;
      border: none;
      color: rgb(255 255 255 / 35%);
      font-family: sans-serif;
      font-size: 18px;
      font-weight: 700;
      padding: 4px 0;
      cursor: pointer;
      transition: color 200ms ease-out;
    }

    .year-toggle button:hover {
      color: rgb(255 255 255 / 70%);
    }

    .year-toggle button.active {
      color: white;
    }

    .amongi-detect-overlay {
      position: absolute;
      z-index: 11;
      inset: 0;
      width: 100%;
      height: 100%;
      background: rgb(0 0 0 / 70%);
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      font-family: sans-serif;
    }

    .amongi-detect-overlay button {
      font-size: 24px;
    }
  `

  handleSeek(evt: CustomEvent<number>) {
    const manifest = this.playbackController.manifest.unwrap();

    this.playbackController.playheadOffset = evt.detail * manifest.length;
    this.resetAmongiDetection();
  }

  handleSetPlaybackSpeed(evt: CustomEvent<PlaybackSpeed>) {
    this.playbackController.playbackSpeed = evt.detail;
  }

  handleSetPlaybackState(evt: CustomEvent<PlaybackState>) {
    this.playbackController.playbackState = evt.detail;
    this.resetAmongiDetection();
  }

  handleSetYear(year: Year) {
    this.playbackController.year = year;
    this.resetAmongiDetection();
  }

  resetAmongiDetection() {
    this.amongiData = new AsyncData();
    this.highlights = null;
  }

  handleDetectAmongi() {
    const abortController = new AbortController();
    this.amongiData = this.amongiData.setLoading(abortController);

    const worker = new DetectorWorker();

    if (abortController.signal.aborted) {
      this.amongiData = this.amongiData.setLoading(abortController);
      return;
    }

    this.playbackController.playbackState = 'paused';
    const pixelData = this.playbackController.getRGBPixelData();
    const manifest = this.playbackController.manifest.get();

    if (!pixelData || !manifest) {
      this.amongiData = this.amongiData.setError('Couldn\'t load canvas pixel data!');
      return;
    }

    const { width, height } = manifest;

    worker.postMessage({ data: pixelData, width, height } as DetectRequest, [pixelData.buffer]);

    worker.onmessage = (event: MessageEvent<DetectionResult>) => {
      this.amongiData = this.amongiData.setData(event.data);

      const pixelCoords = Object.values(event.data.amongi)
        .flatMap((x) => x)
        .filter((x) => x.certainty > 0.5 && x.completeness > 0.85)
        .flatMap((x) => x.pixels);

      const highlightedPixels = new Uint16Array(
        pixelCoords.flatMap((coord) => [coord.x, coord.y])
      );


      this.highlights = highlightedPixels;
    };

    abortController.signal.addEventListener('abort', () => {
      worker.terminate();
    });
  }

  cancelAmongiDetection() {
    this.amongiData.abortController?.abort();
    this.amongiData = new AsyncData();
  }

  render() {
    return html`
      ${
        AsyncData.combine(this.playbackController.pixelData, this.playbackController.manifest).render({
          renderLoading: 'no-data',
          data: ([pixels, manifest], isLoading) => html`
            <replace-canvas
              class=${isLoading ? 'dimmed' : ''}
              .imageWidth=${manifest.width}
              .imageHeight=${manifest.height}
              .highlights=${this.highlights}
              .data=${pixels}
              .colorIndex=${manifest.color_index}>
            </replace-canvas>
            <replace-seekbar
              .length=${manifest.length}
              .current=${this.playbackController.playheadOffset}
              .playbackSpeed=${this.playbackController.playbackSpeed}
              .playbackState=${this.playbackController.playbackState}
              .isLoading=${isLoading}
              .disabled=${this.amongiData.isLoading}
              @playbackStateChange=${this.handleSetPlaybackState}
              @playheadChange=${this.handleSeek}
              @togglePlaybackSpeed=${this.handleSetPlaybackSpeed}
            >
            </replace-seekbar>
          `,
          loading: () => html`
            <replace-loader style="--loader-size: 80px"></replace-loader>
          `,
        })
      }
      <img class="logo" src="/logo-full.png" alt="re/place" />
      <div class="top-right-icons">
        <button @click=${this.handleDetectAmongi} title="Detect amongi" class="amongi-detect">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" fill="none"><path fill="#ffffff" fill-rule="evenodd" d="M55.087 40H83c13.807 0 25 11.193 25 25S96.807 90 83 90H52c-.335 0-.668-.007-1-.02V158a6 6 0 0 0 6 6h9a6 6 0 0 0 6-6v-18a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v18a6 6 0 0 0 6 6h9a6 6 0 0 0 6-6V54c0-14.36-11.641-26-26-26H77c-9.205 0-17.292 4.783-21.913 12ZM39 86.358C31.804 81.97 27 74.046 27 65c0-9.746 5.576-18.189 13.712-22.313C45.528 27.225 59.952 16 77 16h26c16.043 0 29.764 9.942 35.338 24H147c9.941 0 18 8.059 18 18v65c0 9.941-8.059 18-18 18h-6v17c0 9.941-8.059 18-18 18h-9c-9.941 0-18-8.059-18-18v-12H84v12c0 9.941-8.059 18-18 18h-9c-9.941 0-18-8.059-18-18V86.358ZM141 129h6a6 6 0 0 0 6-6V58a6 6 0 0 0-6-6h-6.052c.035.662.052 1.33.052 2v75ZM52 52c-7.18 0-13 5.82-13 13s5.82 13 13 13h31c7.18 0 13-5.82 13-13s-5.82-13-13-13H52Z" clip-rule="evenodd"/></svg>
        </button>
        <a class="github-link" href="https://github.com/WinterCore/replace" target="_blank" rel="noopener noreferrer">
          <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>GitHub</title><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
        </a>
        <replace-credits-popup></replace-credits-popup>
        <replace-help-popup></replace-help-popup>
      </div>
      ${this.amongiData.render({
        data: () => html``,
        loading: () => html`
          <div class="amongi-detect-overlay">
            <img src="/amongus-shake.gif" width="248" height="248" />
            <p>Detecting Amongi...</p>
            <button @click=${this.cancelAmongiDetection}>Cancel</button>
          </div>
        `
      })}
      <div class="year-toggle">
        ${YEARS.map(year => html`
          <button
            class=${year === this.playbackController.year ? 'active' : ''}
            @click=${() => this.handleSetYear(year)}
          >${year}</button>
        `)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    're-place': App
  }
}
