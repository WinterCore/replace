import { LitElement, css, html, nothing, type PropertyValues } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type {Manifest} from './types';
import './index.css'

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
  playheadOffset: number = 0;

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

  findCheckpointForTimestamp(timestamp: number): { index: number, offset: number } | null {
    for (let i = this.manifest.checkpoints.length - 1; i >= 0; i -= 1) {
      const checkpoint = this.manifest.checkpoints[i];

      if (timestamp >= checkpoint) {
        return { index: i, offset: checkpoint };
      }
    }

    return null;
  }

  private applyDeltas(
    absoluteOffset: number,
    checkpointData: Uint8Array,
    checkpointOffset: number,
    deltaData: Uint8Array
  ): Uint8Array {
    const diff = absoluteOffset - checkpointOffset;

    if (diff < 0) {
      return new Uint8Array(checkpointData.buffer);
    }

    const deltaView = new DataView(deltaData.buffer);
    const data = new Uint8Array(checkpointData.buffer);

    let i = 0;

    while (i < deltaView.byteLength) {
      const relativeOffset = deltaView.getUint16(i + 0, true);

      if (relativeOffset >= diff) {
        break;
      }

      const x = deltaView.getUint16(i + 2, true);
      const y = deltaView.getUint16(i + 4, true);
      const colorIndex = deltaView.getUint8(i + 6);

      data[y * 2000 + x] = colorIndex;

      i += 7;
    }

    return data;
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has('playheadOffset') && ! this.isInitializing) {
      this.fetchPlayheadCheckpoint();
    }

    if (changedProperties.has('currentOffset')) {
      // Apply deltas
      const checkpoint = this.findCheckpointForTimestamp(this.playheadOffset);

      if (checkpoint) {
        this.data = this.applyDeltas(
          this.playheadOffset,
          this.checkpointData.pixelData,
          checkpoint.offset,
          this.checkpointData.deltaData
        );
      }
    }
  }

  async fetchPlayheadCheckpoint() {
    this.abortController.abort();

    this.abortController = new AbortController();

    const checkpoint = this.findCheckpointForTimestamp(this.playheadOffset);

    if (checkpoint === null) {
      console.error('fetchPlayheadCheckpoint: Invalid offset', this.playheadOffset);
      return;
    }

    const fileIndex = checkpoint.index.toString().padStart(6, '0');

    // We're still in the same checkpoint range
    if (this.checkpointData.index === fileIndex) {
      this.currentOffset = this.playheadOffset;
      return;
    }

    const checkpointFile = `${fileIndex}.bin`;
    const deltaFile = `${fileIndex}-delta.bin`;

    this.isLoading = true;

    const [checkpointBuffer, deltaBuffer] = await Promise.all([
      fetch(`/data/${checkpointFile}`, { signal: this.abortController.signal })
        .then((resp) => resp.blob())
        .then((resp) => resp.arrayBuffer()),
      fetch(`/data/${deltaFile}`, { signal: this.abortController.signal })
        .then((resp) => resp.blob())
        .then((resp) => resp.arrayBuffer()),
    ]);

    if (this.abortController.signal.aborted) {
      return;
    }

    const checkpointBytes = new Uint8Array(checkpointBuffer);
    const deltaBytes = new Uint8Array(deltaBuffer);

    this.checkpointData = {
      index: fileIndex,
      pixelData: checkpointBytes,
      deltaData: deltaBytes,
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

    // Start playback

    /*
    setInterval(() => {
      this.playheadOffset += 5_000;
    }, 500);
    */
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
