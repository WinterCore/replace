import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { PlaybackController, type PlaybackSpeed, type Year, YEARS } from './controllers/playback-controller'
import './index.css'

import './components/canvas'
import './components/help-popup'
import './components/seekbar'
import './components/loader'
import {AsyncData} from './lib/async-data'
import type {PlaybackState} from './types'

@customElement('re-place')
export class App extends LitElement {
  playbackController = new PlaybackController(this);

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

    .github-link {
      position: absolute;
      top: 16px;
      right: 52px;
      z-index: 20;
      opacity: 0.5;
      transition: opacity 200ms ease-out;
    }

    .github-link:hover {
      opacity: 1;
    }

    .github-link svg {
      fill: white;
      width: 24px;
      height: 24px;
    }

    .year-toggle {
      position: absolute;
      top: 70px;
      right: 16px;
      z-index: 20;
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
  `

  handleSeek(evt: CustomEvent<number>) {
    const manifest = this.playbackController.manifest.unwrap();

    this.playbackController.playheadOffset = evt.detail * manifest.length;
  }

  handleSetPlaybackSpeed(evt: CustomEvent<PlaybackSpeed>) {
    this.playbackController.playbackSpeed = evt.detail;
  }

  handleSetPlaybackState(evt: CustomEvent<PlaybackState>) {
    this.playbackController.playbackState = evt.detail;
  }

  handleSetYear(year: Year) {
    this.playbackController.year = year;
  }

  render() {
    return html`
      ${
        AsyncData.combine(this.playbackController.pixelData, this.playbackController.manifest).render({
          renderLoading: 'no-data',
          data: ([pixels, manifest]) => html`
            <replace-canvas
              class=${this.playbackController.pixelData.isLoading ? 'dimmed' : ''}
              .imageWidth=${manifest.width}
              .imageHeight=${manifest.height}
              .data=${pixels}
              .colorIndex=${manifest.color_index}>
            </replace-canvas>
            <replace-seekbar
              .length=${manifest.length}
              .current=${this.playbackController.playheadOffset}
              .playbackSpeed=${this.playbackController.playbackSpeed}
              .playbackState=${this.playbackController.playbackState}
              .isLoading=${this.playbackController.pixelData.isLoading}
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
      <a class="github-link" href="https://github.com/WinterCore/replace" target="_blank" rel="noopener noreferrer">
        <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>GitHub</title><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
      </a>
      <replace-help-popup></replace-help-popup>
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
