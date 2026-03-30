export interface Manifest {
  readonly checkpoints: ReadonlyArray<number>;
  readonly color_index: ReadonlyArray<string>;
  readonly length: number;
  readonly width: number;
  readonly height: number;
}

export type CheckpointIndex = string;

export interface CheckpointData {
  readonly index: number;
  readonly checkpointData: Uint8Array;
  readonly deltaData: Uint8Array;
}

export type PlaybackState = 'backward' | 'paused' | 'forward';
