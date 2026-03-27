import { LitElement, css, html, nothing, type PropertyValues } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type {Manifest} from './types';

import './canvas'
import './seekbar'

interface CheckpointData {
  readonly index: string;
  readonly pixelData: Uint8Array;
  readonly deltaData: Uint8Array;
}

@customElement('re-place')
export class App extends LitElement {
  @state()
  data: Uint8Array = new Uint8Array(2000 * 2000).fill(0);

  @state()
  manifest: Manifest = {
    checkpoints: [],
    color_index: ['#ffffff'],
  };

  // Is loading checkpoint data
  @state()
  isLoading: boolean = true;

  // Is initializing manifest
  @state()
  isInitializing: boolean = true;

  @state()
  playheadOffset: number = 10080_000;

  @state()
  length: number = 0;

  @state()
  currentOffset: number = 0;

  @state()
  checkpointData: CheckpointData = {
    index: '0'.padStart(6, '0'),
    pixelData: new Uint8Array(2000 * 2000).fill(0),
    deltaData: new Uint8Array(),
  };

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
  `

  abortController: AbortController = new AbortController();

  getCheckpointIndex(timestamp: number): number | null {
    let index = null;

    for (let i = this.manifest.checkpoints.length - 1; i >= 0; i -= 1) {
      const checkpointStart = this.manifest.checkpoints[i];

      if (timestamp >= checkpointStart) {
        return i;
      }
    }

    return index;
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has('playheadOffset') && ! this.isInitializing) {
      this.fetchPlayheadCheckpoint();
    }

    if (changedProperties.has('currentOffset')) {
      // Update data
      this.data = this.checkpointData.pixelData;
    }
  }

  async pixelDataFromPNG(pngBlob: Blob, colorIndex: ReadonlyArray<string>): Promise<Uint8Array> {
    const img = new Image();
    const objURL = URL.createObjectURL(pngBlob);
    img.src = objURL;
    await img.decode();
    const c = new OffscreenCanvas(2000, 2000);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, 2000, 2000).data;
    URL.revokeObjectURL(objURL);

    const indices = new Uint8Array(2000 * 2000);

    const colorToIndex = new Map<number, number>();

    for (let i = 0; i < colorIndex.length; i++) {
      colorToIndex.set(parseInt(colorIndex[i].slice(1), 16), i);
    }

    for (let i = 0; i < indices.length; i++) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];

      const color = (r << 16) | (g << 8) | b;

      const index = colorToIndex.get(color);
      indices[i] = index ?? 0;
    }

    return indices;
  }

  async fetchPlayheadCheckpoint() {
    this.abortController.abort();

    this.abortController = new AbortController();

    const index = this.getCheckpointIndex(this.playheadOffset);

    if (index === null) {
      console.error('fetchPlayheadCheckpoint: Invalid offset', this.playheadOffset);
      return;
    }

    const fileIndex = index.toString().padStart(6, '0');
    const checkpointFile = `${fileIndex}.png`;
    const deltaFile = `${fileIndex}-delta.bin`;

    this.isLoading = true;

    const [checkpointResp, deltaResp] = await Promise.all([
      fetch(`/data/${checkpointFile}`, { signal: this.abortController.signal }),
      fetch(`/data/${deltaFile}`, { signal: this.abortController.signal }),
    ]);

    const [checkpointBlob, deltaBlob] = await Promise.all([
      checkpointResp.blob(),
      deltaResp.blob(),
    ]);

    if (this.abortController.signal.aborted) {
      return;
    }

    const deltaBytes = new Uint8Array(await deltaBlob.arrayBuffer());

    this.checkpointData = {
      index: fileIndex,
      deltaData: deltaBytes,
      pixelData: await this.pixelDataFromPNG(checkpointBlob, this.manifest.color_index),
    };

    // Seek canvas to requested position after we've fetched the data
    this.currentOffset = this.playheadOffset;
    this.isLoading = false;
  }

  connectedCallback(): void {
    super.connectedCallback();

    const fetchManifest = async () => {
      this.isInitializing = true;
      const resp = await fetch('/data/manifest.json');
      const json = await resp.json() as Manifest;
      this.manifest = json;
      this.length = json.checkpoints.at(-1)!;

      this.isInitializing = false;
    };

    fetchManifest()
      .then(() => this.fetchPlayheadCheckpoint())
      .catch(console.error);
  }

  handleSeek(evt: CustomEvent<number>) {
    this.playheadOffset = evt.detail * this.length;
  }

  render() {
    return html`
      <replace-canvas
        .data=${this.data}
        .colorIndex=${this.manifest.color_index}>
      </replace-canvas>
      ${!this.isInitializing
        ? html`
          <replace-seekbar
            .length=${this.length}
            .current=${this.playheadOffset}
            @change=${this.handleSeek}
          >
          </replace-seekbar>
        `
        : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    're-place': App
  }
}
