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

  @state()
  showHelp = false;

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .help-toggle {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 20;
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 200ms ease-out;
    }

    .help-toggle:hover {
      opacity: 1;
    }

    .help-toggle svg {
      stroke: white;
    }

    .help-card {
      position: absolute;
      top: 52px;
      right: 16px;
      z-index: 20;
      background: rgb(40 40 40 / 92%);
      border-radius: 10px;
      padding: 16px 20px;
      color: white;
      font-family: sans-serif;
      font-size: 14px;
      min-width: 220px;
      box-shadow: rgba(0, 0, 0, 0.3) 0px 4px 12px;
    }

    .help-card h3 {
      margin: 0 0 12px 0;
      font-size: 15px;
    }

    .help-card table {
      width: 100%;
      border-collapse: collapse;
    }

    .help-card td {
      padding: 3px 0;
    }

    .help-card td:first-child {
      font-weight: bold;
      padding-right: 16px;
      white-space: nowrap;
    }

    .help-card .section {
      color: #888;
      font-size: 12px;
      text-transform: uppercase;
      padding-top: 10px;
      padding-bottom: 4px;
    }

    kbd {
      background: rgb(80 80 80);
      border-radius: 4px;
      padding: 1px 6px;
      font-family: monospace;
      font-size: 13px;
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
      return new Uint8Array(checkpointData);
    }

    const deltaView = new DataView(deltaData.buffer);
    const data = new Uint8Array(checkpointData);

    let i = 0;

    while (i < deltaView.byteLength) {
      const relativeOffset = deltaView.getUint32(i + 0, true);

      if (relativeOffset >= diff) {
        break;
      }

      const x = deltaView.getUint16(i + 4, true);
      const y = deltaView.getUint16(i + 6, true);
      const colorIndex = deltaView.getUint8(i + 8);

      data[y * 2000 + x] = colorIndex;

      i += 9;
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
      <div class="help-toggle"
        @mouseenter=${() => this.showHelp = true}
        @mouseleave=${() => this.showHelp = false}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
      </div>
      ${this.showHelp ? html`
        <div class="help-card"
          @mouseenter=${() => this.showHelp = true}
          @mouseleave=${() => this.showHelp = false}>
          <h3>Keyboard Shortcuts</h3>
          <table>
            <tr><td class="section" colspan="2">Playback</td></tr>
            <tr><td><kbd>j</kbd></td><td>Play backward</td></tr>
            <tr><td><kbd>k</kbd></td><td>Pause</td></tr>
            <tr><td><kbd>l</kbd></td><td>Play forward</td></tr>
            <tr><td><kbd>f</kbd></td><td>Cycle speed</td></tr>
            <tr><td class="section" colspan="2">Canvas</td></tr>
            <tr><td><kbd>=</kbd> / <kbd>-</kbd></td><td>Zoom in / out</td></tr>
            <tr><td><kbd>Arrow keys</kbd></td><td>Pan</td></tr>
            <tr><td>Scroll wheel</td><td>Zoom to cursor</td></tr>
            <tr><td>Click + drag</td><td>Pan</td></tr>
          </table>
        </div>
      ` : nothing}
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
