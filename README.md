# replace

A local viewer for r/place that lets you scroll through the entire history and see pixel changes in realtime. Features a YouTube-style seekbar with drag-to-zoom and thumbnail previews on hover.

## Data pipeline

The raw r/place CSVs (gzipped) are preprocessed into a format optimized for browser playback. The raw data is unsorted both within files and across files (file numbering is arbitrary, not chronological). A two-phase external sort handles this:

1. **Sort phase**: Each gzip file is decompressed, parsed, sorted by timestamp, and written to a sorted intermediate file.
2. **Merge phase**: All sorted intermediates are k-way merged (via a min-heap) to produce a single globally-sorted stream of pixel placements.

### Checkpoints

Raw binary snapshots of the full 2000x2000 canvas at adaptive intervals. Each checkpoint is a flat 4MB file of palette indices (1 byte per pixel). A new checkpoint is created when either 1 minute has elapsed or 50,000 pixel updates have accumulated since the last checkpoint, whichever comes first. All timestamps are normalized relative to the first placement (time 0). Used as keyframes for seeking — the browser loads the nearest checkpoint and replays deltas forward.

> **Why `.bin` instead of PNG?** Indexed PNGs seemed like a natural fit since the data is palette-indexed, but PNG decoding in the browser (even with JS libraries like upng-js) takes 50-200ms per checkpoint depending on hardware. That's too slow for smooth seeking. Raw `.bin` files require zero decode time — just fetch and upload directly to a WebGL R8 texture. HTTP-level gzip compression provides similar transfer sizes to PNG without any client-side cost.

### Deltas

Binary files containing individual pixel changes between checkpoints. Each pixel change is packed into 9 bytes:

| Field            | Size    | Type   |
|------------------|---------|--------|
| timestamp offset | 4 bytes | uint16 (ms from chunk start) |
| x                | 2 bytes | uint16 |
| y                | 2 bytes | uint16 |
| color index      | 1 byte  | uint8  |

Delta files are pre-sorted by timestamp. The timestamp offset is relative to the chunk's start time. Delta files are named alongside their checkpoint (e.g., `000001.bin` and `000001-delta.bin`).

### Thumbnails

Low-resolution sprite sheets (200px wide) generated every 5 seconds for seekbar hover previews, packed into strips of 100 thumbnails each.

### Manifest

A JSON file listing all checkpoints with their timestamps and associated delta files. Required because checkpoint intervals are adaptive — the browser uses the manifest to find the nearest checkpoint when seeking.

## Checkpoint format

Checkpoints are raw binary files — a flat buffer of 2000×2000 palette indices (1 byte per pixel, 4MB per file). No header, no encoding. The palette mapping is stored in the manifest. The browser uploads the buffer directly to a WebGL R8 texture with zero processing.

## Tasks

### Preprocessing (Rust)
- [x] Sort raw CSV data (external merge sort: sort each file, then k-way merge)
- [x] Parse CSV rows from gzip files (timestamp, user_id, pixel_color, coordinate)
- [x] Map hex colors to palette indices
- [x] Build in-memory canvas state (2000x2000 buffer of palette indices)
- [x] Generate checkpoint .bin files at adaptive intervals (1 min or 50k updates)
- [x] Pack deltas into binary files between checkpoints
- [x] Write manifest JSON
- [ ] Generate thumbnail sprite sheets for seekbar
- [x] r/place 2022 parsing support
- [ ] r/place 2023 parsing support, because the canvas is bigger and the raw data is different.

### Viewer (Web)
- [x] Load manifest and set up data fetching
- [x] Render canvas with WebGL texture
- [x] Implement delta playback engine (apply deltas per frame)
- [x] Playback controls (play/pause, speed)
- [ ] Seek to any point (load nearest checkpoint + replay deltas)
- [ ] YouTube-style seekbar with drag-to-zoom
- [ ] Thumbnail hover previews on seekbar
- [ ] Prefetch delta chunks ahead of playback position
