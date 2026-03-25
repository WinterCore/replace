---
name: Design decisions - checkpoints and timestamps
description: Key architecture decisions about checkpoint intervals, manifest removal, and timestamp normalization
type: project
---

Fixed checkpoint intervals instead of adaptive (delta-count-based) ones. Even at 50k deltas (~343 KB), delta files are still smaller than a checkpoint PNG, so adaptive thresholds don't help. Interval will be 5-10 seconds.

**Why:** Simpler implementation, and the math doesn't justify adaptive checkpoints. Frequent fixed checkpoints also improve seek performance.

**How to apply:** No manifest file needed — browser calculates checkpoint/delta filenames from `Math.floor(time / interval)`. All timestamps are normalized relative to the first checkpoint (time 0), not UTC. The `offset` field on the pixel placement struct stores this relative time.
