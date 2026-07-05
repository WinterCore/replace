<p align="center">
  <img src="logo-full.png" alt="Re/place" height="80" />
</p>

# Re/place

![Re/place screenshot](screenshot.jpg)

A viewer for r/place that lets you scroll through the entire history and see pixel changes in realtime. Supports both r/place 2022 (2000x2000) and 2023 (3000x2000) datasets.

**Live version: [replace.wintercore.xyz](https://replace.wintercore.xyz)**

## Features

- WebGL-rendered canvas with pan, zoom, and pinch-to-zoom support
- Smooth inertia panning on mouse and touch
- Playback controls with forward/backward at variable speeds (1x–1000x)
- Seekbar with drag scrubbing and hover timestamp tooltips
- YouTube-style keyboard shortcuts (j/k/l, f for speed, 0-9 for position jumps, h to hide the UI)
- Checkpoint prefetching and caching for smooth playback
- Adaptive checkpoint intervals for efficient seeking
- Amongi detector — scans the entire canvas at the current playback position in a Web Worker, highlights every detected crewmate, and counts them up live

## Running locally

The repo does not ship the datasets — you generate them once from Reddit's raw CSV dumps, then run the viewer as a plain Vite app.

### Prerequisites

- Rust (stable) — for the preprocessor
- Node.js 22+ — for the viewer
- Disk space: the raw dumps are tens of GB per year, and the processed output is ~9 GB for 2022 and ~18 GB for 2023

### 1. Download the raw data

Grab the official r/place canvas-history dumps from Reddit:

- 2022: https://placedata.reddit.com/data/canvas-history/index.html
- 2023: https://placedata.reddit.com/data/canvas-history/2023/index.html

Put all the `*.csv.gzip` files for one year into a single folder (don't decompress them — the preprocessor reads the gzip files directly).

### 2. Preprocess

From the repo root:

```sh
./process.sh 2022 /path/to/raw/2022
```

This wipes and regenerates `app/public/2022-data/` (checkpoints, deltas, manifest), then gzips the `.bin` files alongside the originals (the `.gz` twins are only used by the production nginx setup — local dev serves the plain `.bin`). The year is auto-detected from the data itself; the year argument only selects which output folder gets cleared, so make sure it matches the dataset you're pointing at.

Repeat for 2023 if you want both years. You only need the year(s) you plan to view — but note the viewer defaults to 2023, so use the in-app year toggle if you only processed 2022.

### 3. Run the viewer

```sh
cd app
npm install
npm run dev
```

Open http://localhost:5173.

## Data pipeline

The raw r/place CSVs (gzipped) are preprocessed into a format optimized for browser playback. The raw data is unsorted both within files and across files (file numbering is arbitrary, not chronological). A two-phase external sort handles this:

1. **Sort phase**: Each gzip file is decompressed, parsed, sorted by timestamp, and written to a sorted intermediate file.
2. **Merge phase**: All sorted intermediates are k-way merged (via a min-heap) to produce a single globally-sorted stream of pixel placements.

### Checkpoints

Raw binary snapshots of the full canvas at adaptive intervals. Each checkpoint is a flat file of palette indices (1 byte per pixel). A new checkpoint is created when either 3 minutes have elapsed or 200,000 pixel updates have accumulated since the last checkpoint, whichever comes first. All timestamps are normalized relative to the first placement (time 0). Used as keyframes for seeking — the browser loads the nearest checkpoint and replays deltas forward. (An indexed PNG of each checkpoint is also written for debugging — the viewer never touches it.)

> **Why `.bin` instead of PNG?** Indexed PNGs seemed like a natural fit since the data is palette-indexed, but PNG decoding in the browser (even with JS libraries like upng-js) takes 50-200ms per checkpoint depending on hardware. That's too slow for smooth seeking. Raw `.bin` files require zero decode time — just fetch and upload directly to a WebGL R8 texture. HTTP-level gzip compression provides similar transfer sizes to PNG without any client-side cost.

### Deltas

Binary files containing individual pixel changes between checkpoints. Each pixel change is packed into 9 bytes:

| Field            | Size    | Type                         |
|------------------|---------|------------------------------|
| timestamp offset | 4 bytes | uint32 (ms from chunk start) |
| x                | 2 bytes | uint16                       |
| y                | 2 bytes | uint16                       |
| color index      | 1 byte  | uint8                        |

Delta files are pre-sorted by timestamp. The timestamp offset is relative to the chunk's start time. Delta files are named alongside their checkpoint (e.g., `000001.bin` and `000001-delta.bin`).

### Manifest

A JSON file listing all checkpoints with their timestamps, color palette, canvas dimensions, and total event length. Required because checkpoint intervals are adaptive — the browser uses the manifest to find the nearest checkpoint when seeking.

## Deployment

Pushes to `main` trigger a GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) that builds the frontend and rsyncs the repo to a server over SSH (secrets: `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, `SSH_PORT`, `DEPLOY_PATH`). The dataset folders are excluded from the sync — upload them to the server once manually; they survive subsequent deploys.

The origin is nginx behind Cloudflare, serving pre-compressed `.bin.gz` files via `gzip_static` with immutable year-long cache headers on the dataset, so Cloudflare's edge absorbs nearly all traffic.

## Tasks

### Preprocessing (Rust)
- [x] Sort raw CSV data (external merge sort: sort each file, then k-way merge)
- [x] Parse CSV rows from gzip files
- [x] Map hex colors to palette indices
- [x] Build in-memory canvas state
- [x] Generate checkpoint .bin files at adaptive intervals
- [x] Pack deltas into binary files between checkpoints
- [x] Write manifest JSON
- [x] r/place 2022 parsing support
- [x] r/place 2023 parsing support
- [x] Parse moderation records

### Viewer (Web)
- [x] Load manifest and set up data fetching
- [x] WebGL rendering with indexed palette textures
- [x] Delta playback engine
- [x] Playback controls (play/pause/reverse, variable speed)
- [x] Seek to any point (load nearest checkpoint + replay deltas)
- [x] Seekbar with drag scrubbing and hover tooltips
- [x] Keyboard shortcuts (j/k/l, f, 0-9, arrow keys, +/-)
- [x] Mouse and touch pan/zoom with inertia
- [x] Checkpoint caching
- [x] Loading state indicators
- [x] Prefetch checkpoints ahead of playback position
- [x] Amongi detector (Web Worker scan + highlight overlay + live counter)
- [ ] YouTube-style seekbar drag-up-to-zoom

## Special Thanks

- [Woutervdvelde/AmongiAnalyser](https://github.com/Woutervdvelde/AmongiAnalyser) — amongi detection algorithm
