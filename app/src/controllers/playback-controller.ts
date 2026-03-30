import type {ReactiveController, ReactiveControllerHost} from "lit";
import type {CheckpointData, CheckpointIndex, Manifest, PlaybackState} from "../types";
import {AsyncData} from "../lib/async-data";
import {fetchCheckpointData, findCheckpointForTimestamp} from "../lib/checkpoint";

const SPEEDS = [1, 2, 5, 10, 30, 50, 100, 200, 500, 1000];

export class PlaybackController implements ReactiveController {
  private host: ReactiveControllerHost;

  public playbackState: PlaybackState = 'paused';

  public manifest: AsyncData<Manifest> = new AsyncData();

  #checkpointMap: Map<number, AsyncData<CheckpointData>> = new Map();

  #playheadOffset: number = 0;
  #playbackSpeed: number = 1;

  public data: AsyncData<Uint8Array> = new AsyncData();

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
    const json = await resp.json() as Manifest;

    this.manifest = this.manifest.setData(json);
  }

  private async syncCheckpointData() {
    const manifest = this.manifest.unwrap();

    const checkpoint = findCheckpointForTimestamp(manifest.checkpoints, this.playheadOffset);

    if (checkpoint === null) {
      return;
    }

    const abortController = new AbortController();

    // TODO: Purge/cancel ONLY the no longer needed checkpoints
    Array.from(this.#checkpointMap.values())
      .forEach((asyncData) => asyncData.abortController?.abort())
    this.#checkpointMap = new Map();

    // Fetch primary checkpoint
    this.#checkpointMap.set(
      checkpoint.index,
      new AsyncData<CheckpointData>().setLoading(),
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
  }

  set playheadOffset(offset: number) {
    this.#playheadOffset = offset;

    this.syncCheckpointData();
  }

  get playheadOffset() {
    return this.#playheadOffset;
  }

  hostConnected(): void {
    this.fetchManifest();
  }

}
