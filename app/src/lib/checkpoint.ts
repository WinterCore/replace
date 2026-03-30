export const getCheckpointFilenames = (index: number) => ({
  checkpoint: `${index.toString().padStart(6, '0')}.bin`,
  delta: `${index.toString().padStart(6, '0')}-delta.bin`
});

export const findCheckpointForTimestamp = (checkpoints: ReadonlyArray<number>, timestamp: number) => {
  for (let i = checkpoints.length - 1; i >= 0; i -= 1) {
    const checkpoint = checkpoints[i];

    if (timestamp >= checkpoint) {
      return {
        index: i,
        offset: checkpoint,
      };
    }
  }

  return null;
}

export const fetchCheckpointData = async (index: number, abortController?: AbortController) => {
  const filenames = getCheckpointFilenames(index);
  const [checkpointBuffer, deltaBuffer] = await Promise.all([
    fetch(`/data/${filenames.checkpoint}`, { signal: abortController?.signal })
      .then((resp) => resp.blob())
      .then((resp) => resp.arrayBuffer()),
    fetch(`/data/${filenames.delta}`, { signal: abortController?.signal })
      .then((resp) => resp.blob())
      .then((resp) => resp.arrayBuffer()),
  ]);

  return {
    deltaBuffer,
    checkpointBuffer,
  };
};

interface ApplyDeltaOpts {
  readonly width: number;
  readonly height: number;
  readonly currentOffset: number;
  readonly checkpointData: Uint8Array;
  readonly checkpointOffset: number;
  readonly deltaData: Uint8Array;
}

export const applyDeltaToCheckpoint = (opts: ApplyDeltaOpts): Uint8Array => {
  const {
    width,
    checkpointData,
    checkpointOffset,
    currentOffset,
    deltaData,
  } = opts;

  const diff = currentOffset - checkpointOffset;

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

    data[y * width + x] = colorIndex;

    i += 9;
  }

  return data;
};
