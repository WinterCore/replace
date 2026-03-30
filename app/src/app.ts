import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { PlaybackController, type PlaybackSpeed } from './controllers/playback-controller'
import './index.css'

import './components/canvas'
import './components/help-popup'
import './components/seekbar'
import {AsyncData} from './lib/async-data'

@customElement('re-place')
export class App extends LitElement {
  playbackController = new PlaybackController(this);

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
  `

  handleSeek(evt: CustomEvent<number>) {
    const manifest = this.playbackController.manifest.unwrap();

    this.playbackController.playheadOffset = evt.detail * manifest.length;
  }

  handleSetPlaybackSpeed(evt: CustomEvent<PlaybackSpeed>) {
    this.playbackController.playbackSpeed = evt.detail;
  }

  render() {
    return html`
      ${
        AsyncData.combine(this.playbackController.pixelData, this.playbackController.manifest).render({
          renderLoading: 'no-data',
          data: ([pixels, manifest]) => html`
            <replace-canvas
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
              @change=${this.handleSeek}
              @togglePlaybackSpeed=${this.handleSetPlaybackSpeed}
            >
            </replace-seekbar>
          `,
        })
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    're-place': App
  }
}
