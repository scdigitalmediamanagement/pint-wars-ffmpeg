---
name: Pint War Memories photo selection
description: Empirical guidance for balancing end-of-war weighting, full-span coverage, and player/pub variety.
---

For a randomized photo subset, validate the outcome of the combined end-of-war weighting, temporal coverage, and player/pub diversity rules. A nominal recency multiplier alone does not guarantee strong representation of the final portion.

**Why:** In a synthetic multi-day selection, the first combination of temporal coverage and diversity balancing sampled a 10%-of-duration ending window only 16.6% of the time. A stronger end weighting increased the share to 22.4% while retaining coverage across all five time bins and keeping adjacent player/pub repeats low.

**How to apply:** When tuning photo selection, run many seeded trials over multi-day and short-war fixtures. Check unique IDs, coverage across populated time bins, late-window share above baseline, sequence variation, and adjacent player/pub repeats.