import type {ReactiveController, ReactiveControllerHost} from "lit";
import type {CheckpointData, Manifest, PlaybackState} from "../types";
import {AsyncData} from "../lib/async-data";
import {applyDeltaToCheckpoint, fetchCheckpointData, findCheckpointForTimestamp} from "../lib/checkpoint";
import {clamp} from "../lib/math";

export const SPEEDS = [1, 2, 5, 10, 30, 50, 100, 200, 500, 1000] as const;
export type PlaybackSpeed = typeof SPEEDS[number];

export const YEARS = ['2022', '2023'] as const;
export type Year = typeof YEARS[number];

export class PlaybackController implements ReactiveController {
  private host: ReactiveControllerHost;

  public manifest: AsyncData<Manifest> = new AsyncData();

  #checkpointMap: Map<number, AsyncData<CheckpointData>> = new Map();

  #playheadOffset: number = 0;
  #playbackSpeed: PlaybackSpeed = 1;
  #playbackState: PlaybackState = 'paused';
  #year: Year = '2023';

  public pixelData: AsyncData<Uint8Array> = new AsyncData();

  constructor(host: ReactiveControllerHost) {
    // Store a reference to the host
    this.host = host;
    // Register for lifecycle updates
    host.addController(this);
  }

  get year() {
    return this.#year;
  }

  get basePath() {
    return `/${this.#year}-data`;
  }

  set year(year: Year) {
    if (year === this.#year) return;

    // Abort all in-flight requests
    this.manifest.abortController?.abort();
    Array.from(this.#checkpointMap.values())
      .forEach((asyncData) => asyncData.abortController?.abort());

    // Reset state
    this.#year = year;
    this.#playheadOffset = 0;
    this.#playbackState = 'paused';
    this.#checkpointMap = new Map();
    this.manifest = new AsyncData();
    this.pixelData = new AsyncData();

    clearInterval(this.#playbackIntervalId);

    this.host.requestUpdate();

    this.init().catch(console.error);
  }

  private async fetchManifest() {
    const abortController = new AbortController();

    try {
      this.manifest = this.manifest.setLoading(abortController);

      const resp = await fetch(`${this.basePath}/manifest.json`, { signal: abortController.signal });
      const manifest = await resp.json() as Manifest;

      const length = manifest.width * manifest.height;

      this.manifest = this.manifest.setData(manifest);
      this.pixelData = this.pixelData.setData(new Uint8Array(length).fill(0));
      this.host.requestUpdate();
    } catch (err) {
      if (abortController.signal.aborted) {
        return;
      }

      this.pixelData = this.pixelData.setError("Failed to load manifest!");
      this.host.requestUpdate();
      throw err;
    }
  }

  private isPlayheadCheckpointDataAvailable(): boolean {
    const manifest = this.manifest.unwrap();

    const checkpoint = findCheckpointForTimestamp(manifest.checkpoints, this.playheadOffset);

    if (checkpoint === null) {
      return false;
    }

    const entry = this.#checkpointMap.get(checkpoint.index);

    if (! entry) {
      return false;
    }

    return !!entry.get();
  }

  private syncPixelDataWithPlayhead() {
    const manifest = this.manifest.unwrap();
    const checkpoint = findCheckpointForTimestamp(manifest.checkpoints, this.#playheadOffset);

    if (! checkpoint) {
      return;
    }

    const checkpointData = this.#checkpointMap.get(checkpoint.index);

    // Entry doesn't exist, this means that for some reason
    // syncCheckpointData didn't start loading the checkpoint.
    // This should never happen in practice
    if (! checkpointData) {
      return;
    }

    if (checkpointData.isLoading) {
      if (! this.pixelData.isLoading) {
        this.pixelData = this.pixelData.setLoading();
        this.host.requestUpdate();
      }
      return;
    }

    this.pixelData = checkpointData.map((data) =>
      applyDeltaToCheckpoint({
        currentOffset: this.#playheadOffset,
        height: manifest.height,
        width: manifest.width,
        checkpointData: data.checkpointData,
        checkpointOffset: checkpoint.offset,
        deltaData: data.deltaData,
      })
    );

    this.host.requestUpdate();
  }

  private async syncCheckpointData() {
    const manifest = this.manifest.unwrap();
    const checkpoint = findCheckpointForTimestamp(manifest.checkpoints, this.playheadOffset);

    if (checkpoint === null) {
      return;
    }

    const numCheckpointsToLoad = Math.ceil(Math.log10(this.#playbackSpeed + 1)) * 3;

    const getRange = () => {
      if (this.#playbackState === 'forward') {
        return Array
          .from({ length: numCheckpointsToLoad })
          .map((_, i) => checkpoint.index + i)
          .filter((index) => index < manifest.checkpoints.length);
      } else if (this.#playbackState === 'backward') {
        return Array
          .from({ length: numCheckpointsToLoad })
          .map((_, i) => checkpoint.index - i)
          .filter((index) => index >= 0);
      } else {
        return [checkpoint.index];
      }
    };


    const range = getRange();

    // Clean up checkpoints that are no longer in range.
    Array.from(this.#checkpointMap).forEach(([index, checkpointData]) => {
      if (range.includes(index) && ! checkpointData.error) {
        return;
      }

      checkpointData.abortController?.abort();
      this.#checkpointMap.delete(index);
    });

    // Start loading checkpoints that are in range
    for (let i = 0; i < range.length; i += 1) {
      const index = range[i];
      const existingEntry = this.#checkpointMap.get(index);

      // Skip loading checkpoints that are already being loaded.
      if (existingEntry && (existingEntry.isLoading || existingEntry.get())) {
        continue;
      }

      const abortController = new AbortController();

      // Start loading checkpoints that are in range but not yet loaded or being loaded.
      this.#checkpointMap.set(
        index,
        new AsyncData<CheckpointData>().setLoading(abortController),
      );

      fetchCheckpointData(index, this.basePath, abortController)
        .then(({ checkpointBuffer, deltaBuffer }) => {
          const checkpointData = new Uint8Array(checkpointBuffer);
          const deltaData = new Uint8Array(deltaBuffer);

          this.#checkpointMap.set(
            index,
            new AsyncData<CheckpointData>().setData({
              index,
              checkpointData,
              deltaData,
            }),
          );

          if (index === checkpoint.index) {
            this.syncPixelDataWithPlayhead();
          }
        }).catch((err) => {
          if (abortController.signal.aborted) {
            return;
          }

          console.error('syncCheckpointData failed!', err);

          this.#checkpointMap.set(
            index,
            new AsyncData<CheckpointData>().setError('Failed'),
          );
        });
    }

    this.syncPixelDataWithPlayhead();
  }

  get playheadOffset() {
    return this.#playheadOffset;
  }

  get playbackSpeed() {
    return this.#playbackSpeed;
  }

  get playbackState() {
    return this.#playbackState;
  }

  set playbackState(state: PlaybackState) {
    this.#playbackState = state;

    this.handlePlayback();
    this.host.requestUpdate();
  }

  set playbackSpeed(speed: PlaybackSpeed) {
    this.#playbackSpeed = speed;

    this.handlePlayback();
    this.host.requestUpdate();
  }

  set playheadOffset(offset: number) {
    this.#playheadOffset = offset;

    this.syncCheckpointData();
    this.handlePlayback();
    this.host.requestUpdate();
  }

  #playbackIntervalId = 0;

  private handlePlayback() {
    clearInterval(this.#playbackIntervalId)

    if (this.#playbackState === 'paused') {
      return;
    }

    const fps = 30;
    const normalPlaybackRate = 1000 / fps;
    const delta = this.#playbackState === 'forward'
      ? normalPlaybackRate * this.#playbackSpeed
      : -normalPlaybackRate * this.#playbackSpeed;

    const manifest = this.manifest.unwrap();

    this.#playbackIntervalId = setInterval(() => {
      // Pause if required checkpoint isn't loaded yet

      // Sync on every frame
      this.syncCheckpointData();

      // Pause playback if data is not available
      if (! this.isPlayheadCheckpointDataAvailable()) {
        return;
      }

      this.#playheadOffset = clamp(this.#playheadOffset + delta, 0, manifest.length);
      this.syncPixelDataWithPlayhead();
    }, 1000 / fps);
  }

  public getRGBPixelData(): Uint8Array | null {
    const pixels = this.pixelData.get();
    const manifest = this.manifest.get();

    if (!pixels || !manifest) return null;

    const rgb = new Uint8Array(pixels.length * 3);

    // Pre-parse palette to avoid parsing hex strings per pixel
    const palette = new Uint8Array(manifest.color_index.length * 3);
    for (let i = 0; i < manifest.color_index.length; i++) {
      const hex = manifest.color_index[i];
      palette[i * 3]     = parseInt(hex.slice(1, 3), 16);
      palette[i * 3 + 1] = parseInt(hex.slice(3, 5), 16);
      palette[i * 3 + 2] = parseInt(hex.slice(5, 7), 16);
    }

    for (let i = 0; i < pixels.length; i++) {
      const ci = pixels[i] * 3;
      const ri = i * 3;
      rgb[ri]     = palette[ci];
      rgb[ri + 1] = palette[ci + 1];
      rgb[ri + 2] = palette[ci + 2];
    }

    return rgb;
  }

  private async init() {
    await this.fetchManifest();
    await this.syncCheckpointData();
    this.syncPixelDataWithPlayhead();
  }

  hostConnected(): void {
    this.init().catch(console.error);
  }
}
