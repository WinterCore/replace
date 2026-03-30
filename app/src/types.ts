export interface Manifest {
  readonly checkpoints: ReadonlyArray<number>;
  readonly color_index: ReadonlyArray<string>;
  readonly width: number;
  readonly height: number;
}
