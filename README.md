# replace

A local viewer for r/place that lets you scroll through the entire history and see pixel changes in realtime. Features a YouTube-style seekbar with drag-to-zoom and thumbnail previews on hover.

## Data pipeline

The raw r/place CSVs (gzipped, multi-stream) are preprocessed into a format optimized for browser playback.

### Checkpoints

Indexed PNG snapshots of the full 2000x2000 canvas at regular intervals. Checkpoints are generated every 30 seconds by default, with additional checkpoints inserted during high-activity periods when the delta count exceeds 50,000. Used as keyframes for seeking — the browser loads the nearest checkpoint and replays deltas forward.

### Deltas

Binary files containing individual pixel changes between checkpoints. Each pixel change is packed into 7 bytes:

| Field            | Size    | Type   |
|------------------|---------|--------|
| timestamp offset | 2 bytes | uint16 (ms from chunk start) |
| x                | 2 bytes | uint16 |
| y                | 2 bytes | uint16 |
| color index      | 1 byte  | uint8  |

Delta files are pre-sorted by timestamp. The timestamp offset is relative to the chunk's start time, giving up to 65 seconds of range per chunk.

### Thumbnails

Low-resolution sprite sheets (200px wide) generated every 5 seconds for seekbar hover previews, packed into strips of 100 thumbnails each.

### Manifest

A JSON file listing all checkpoints with their timestamps and associated delta files, used by the browser for seeking.

## Encoding PNGs

Checkpoint PNGs use indexed color mode with a 32-color palette matching r/place's colorset. Each pixel is stored as a 1-byte palette index (0-31) rather than full RGB, which significantly reduces file size.

When encoding with the `png` crate in Rust:

```rust
encoder.set_color(png::ColorType::Indexed);
encoder.set_depth(png::BitDepth::Eight);
encoder.set_palette(palette_bytes); // flat [R,G,B,R,G,B,...] for each color
```

The image data passed to the encoder is a flat buffer of palette indices, not RGB values. The preprocessing step maps each hex color from the CSV to its palette index and stores that in the canvas buffer.

## Tasks

### Preprocessing (Rust)
- [ ] Parse CSV rows from multi-stream gzip files (timestamp, user_id, pixel_color, coordinate)
- [ ] Map hex colors to palette indices
- [ ] Build in-memory canvas state (2000x2000 buffer of palette indices)
- [ ] Generate checkpoint PNGs at adaptive intervals
- [ ] Pack deltas into binary files between checkpoints
- [ ] Generate thumbnail sprite sheets for seekbar
- [ ] Write manifest JSON

### Viewer (Web)
- [ ] Load manifest and set up data fetching
- [ ] Render canvas with WebGL texture
- [ ] Implement delta playback engine (apply deltas per frame)
- [ ] Prefetch delta chunks ahead of playback position
- [ ] Seek to any point (load nearest checkpoint + replay deltas)
- [ ] YouTube-style seekbar with drag-to-zoom
- [ ] Thumbnail hover previews on seekbar
- [ ] Playback controls (play/pause, speed)
