import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { PlaybackController, type PlaybackSpeed } from './controllers/playback-controller'
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
      <replace-help-popup></replace-help-popup>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    're-place': App
  }
}
