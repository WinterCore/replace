---
name: Design decisions - checkpoints and timestamps
description: Key architecture decisions about adaptive checkpoint intervals, manifest, timestamp normalization, and data sorting
type: project
---

Adaptive checkpoint intervals: frequent during high activity (5-10s), stretched out during low activity to avoid near-identical PNGs. Manifest JSON is required so the browser can find the nearest checkpoint when seeking.

**Why:** The r/place CSV data has wildly varying activity rates. Fixed intervals create wasteful near-duplicate checkpoints during sparse periods. Discovered after the unsorted CSV data caused the checkpoint logic to produce hundreds of 1-record checkpoints.

**How to apply:** Manifest maps timestamps to checkpoint/delta filenames. All timestamps are normalized relative to the first placement (time 0), not UTC. The `offset` field on the pixel placement struct stores this relative time. CSV data must be sorted by timestamp before processing — the r/place dataset files are NOT pre-sorted.
