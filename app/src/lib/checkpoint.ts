// PNG-checkpoint experiment: load checkpoints as palette-indexed PNGs and
// decode them with the browser's native decoder instead of fetching the raw
// .bin index data. Toggle by adding ?png to the URL. Deltas stay .bin.
export const usePngCheckpoints = new URLSearchParams(window.location.search).has('png');

export const getCheckpointFilenames = (index: number) => ({
  checkpoint: `${index.toString().padStart(6, '0')}.${usePngCheckpoints ? 'png' : 'bin'}`,
  delta: `${index.toString().padStart(6, '0')}-delta.bin`
});

// The browser only hands decoded pixels back as RGBA — a PNG's palette
// indices are never exposed — so we need the PLTE chunk to map colors back
// to indices for the R8 pipeline.
const parsePngPalette = (buffer: ArrayBuffer): Map<number, number> => {
  const view = new DataView(buffer);
  let offset = 8; // skip PNG signature

  while (offset < view.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4), view.getUint8(offset + 5),
      view.getUint8(offset + 6), view.getUint8(offset + 7),
    );

    if (type === 'PLTE') {
      const rgbToIndex = new Map<number, number>();

      for (let i = 0; i < length / 3; i += 1) {
        const p = offset + 8 + i * 3;
        const rgb = (view.getUint8(p) << 16) | (view.getUint8(p + 1) << 8) | view.getUint8(p + 2);
        rgbToIndex.set(rgb, i);
      }

      return rgbToIndex;
    }

    offset += 12 + length; // length + type + data + crc
  }

  throw new Error('No PLTE chunk found — not a palette-indexed PNG');
};

const decodeCheckpointPng = async (buffer: ArrayBuffer, index: number): Promise<ArrayBuffer> => {
  const start = performance.now();

  const rgbToIndex = parsePngPalette(buffer);
  const bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/png' }));
  const decodeMs = performance.now() - start;

  // Rasterize to get the pixels back out, then map RGBA → palette index
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close();

  const indices = new Uint8Array(rgba.length / 4);

  for (let i = 0; i < indices.length; i += 1) {
    const rgb = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    const paletteIndex = rgbToIndex.get(rgb);

    if (paletteIndex === undefined) {
      throw new Error(`Pixel ${i} color #${rgb.toString(16).padStart(6, '0')} not in palette`);
    }

    indices[i] = paletteIndex;
  }

  const totalMs = performance.now() - start;
  console.log(
    `[png] checkpoint ${index}: ${totalMs.toFixed(0)}ms`
    + ` (decode ${decodeMs.toFixed(0)}ms + rasterize/remap ${(totalMs - decodeMs).toFixed(0)}ms)`,
  );

  return indices.buffer;
};

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

export const fetchCheckpointData = async (index: number, basePath: string, abortController?: AbortController) => {
  const filenames = getCheckpointFilenames(index);
  const [checkpointBuffer, deltaBuffer] = await Promise.all([
    fetch(`${basePath}/${filenames.checkpoint}`, { signal: abortController?.signal })
      .then((resp) => resp.blob())
      .then((resp) => resp.arrayBuffer())
      .then((buffer) => usePngCheckpoints ? decodeCheckpointPng(buffer, index) : buffer),
    fetch(`${basePath}/${filenames.delta}`, { signal: abortController?.signal })
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
