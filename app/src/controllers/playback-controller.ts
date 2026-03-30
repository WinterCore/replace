import type {ReactiveController, ReactiveControllerHost} from "lit";
import type {CheckpointData, Manifest, PlaybackState} from "../types";
import {AsyncData} from "../lib/async-data";
import {applyDeltaToCheckpoint, fetchCheckpointData, findCheckpointForTimestamp} from "../lib/checkpoint";
import {clamp} from "../lib/math";

export const SPEEDS = [1, 2, 5, 10, 30, 50, 100, 200, 500, 1000] as const;
export type PlaybackSpeed = typeof SPEEDS[number];

export class PlaybackController implements ReactiveController {
  private host: ReactiveControllerHost;

  public manifest: AsyncData<Manifest> = new AsyncData();

  #checkpointMap: Map<number, AsyncData<CheckpointData>> = new Map();

  #playheadOffset: number = 0;
  #playbackSpeed: PlaybackSpeed = 1;
  #playbackState: PlaybackState = 'paused';

  public pixelData: AsyncData<Uint8Array> = new AsyncData();

  constructor(host: ReactiveControllerHost) {
    // Store a reference to the host
    this.host = host;
    // Register for lifecycle updates
    host.addController(this);
  }

  private async fetchManifest() {
    const abortController = new AbortController();
    this.manifest = this.manifest.setLoading(abortController);

    const resp = await fetch('/data/manifest.json', { signal: abortController.signal });
    const manifest = await resp.json() as Manifest;

    this.manifest = this.manifest.setData(manifest);

    const length = manifest.width * manifest.height;
    this.pixelData = this.pixelData.setData(new Uint8Array(length).fill(0));
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

    const existingCheckpointData = this.#checkpointMap.get(checkpoint.index);

    if (
      existingCheckpointData &&
      (
        // Is being loaded
        existingCheckpointData.isLoading ||
        // Is already loaded
        existingCheckpointData.get()
      )
    ) {
      // Skip
      return;
    }

    const abortController = new AbortController();

    try {
      // TODO: Purge/cancel ONLY the no longer needed checkpoints
      Array.from(this.#checkpointMap.values())
        .forEach((asyncData) => asyncData.abortController?.abort())
      this.#checkpointMap = new Map();

      // Fetch primary checkpoint
      this.#checkpointMap.set(
        checkpoint.index,
        new AsyncData<CheckpointData>().setLoading(abortController),
      );

      const {
        checkpointBuffer,
        deltaBuffer,
      } = await fetchCheckpointData(checkpoint.index, abortController);

      const checkpointData = new Uint8Array(checkpointBuffer);
      const deltaData = new Uint8Array(deltaBuffer);

      this.#checkpointMap.set(
        checkpoint.index,
        new AsyncData<CheckpointData>().setData({
          index: checkpoint.index,
          checkpointData,
          deltaData,
        }),
      );

      this.syncPixelDataWithPlayhead();
    } catch (err) {
      if (abortController.signal.aborted) {
        return;
      }

      console.error('syncCheckpointData failed!', err);

      this.#checkpointMap.set(
        checkpoint.index,
        new AsyncData<CheckpointData>().setError('Failed'),
      );
    }
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

  hostConnected(): void {
    const init = async () => {
      await this.fetchManifest();
      await this.syncCheckpointData()
      this.syncPixelDataWithPlayhead()
    };

    init().catch(console.error);
  }
}
