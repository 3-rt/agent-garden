# AG-9 Grouping Tuning Design

## Goal

Tune merged-plant grouping so large projects still show multiple meaningful plants per zone, while low-signal files and directories do not dominate the garden. The immediate target repo is `/Users/basilliu/solpredict`, but the rules should generalize across projects.

## User Decisions

- Preserve a minimum of 2-3 visible plants per zone when enough signal exists.
- Rank source structure first when choosing which plants stay visible.
- Prefer directory-style merged labels such as `app/models` or `src/services`.
- Suppress low-signal labels like `README.md`, lockfiles, caches, and bytecode/build output from becoming the main visible representation.

## Approach

Replace the current all-or-nothing grouping rule with a ranked per-zone display pass:

1. Score raw plants and directory groups by signal.
2. Keep the top few candidates visible in each zone.
3. Merge the remaining plants into composite plants.
4. Clean merged labels so they reflect meaningful source directories rather than junk roots.

This keeps the persistence model unchanged: raw file-level plant state still exists, while display-level clustering becomes smarter.

## Scoring Rules

High-signal candidates receive strong positive weight:

- Paths under `src/`, `app/`, `components/`, `services/`, `models/`, `lib/`, `tests/`
- Entry-like files such as `main`, `index`, route files, app roots
- Groups with more files
- Groups with larger aggregate growth or source importance

Low-signal candidates receive strong penalties:

- `README.md`
- lockfiles
- `__pycache__`
- `node_modules`
- build output
- coverage output
- cache/temp directories
- root-level junk that does not describe a real subsystem

The scoring should be deterministic so reopening the same project produces a stable layout.

## Display Rules

- Small projects remain mostly one-plant-per-file.
- Once the merge threshold is exceeded, each zone keeps a minimum visible quota, targeting 3 visible plants when possible.
- If a zone has fewer meaningful groups, it can fall back to 2 or 1.
- Remaining plants in the zone are merged into composite plants.
- Singleton low-signal files should usually be absorbed rather than promoted.

## Labeling Rules

- Prefer cleaned directory labels such as `app/models`, `src/services`, `web/src/app/about`.
- Avoid using low-signal file names like `README.md` or cache directory names as the primary visible label.
- If no meaningful directory label exists, fall back to a short safe label like `backend files` or `frontend files`.

## Files to Update

- `src/renderer/game/plant-clusters.ts`
  - Add richer scoring, zone quotas, and label cleanup.
- `src/renderer/game/scenes/GardenScene.ts`
  - Keep using clustering output, but consume the tuned layout data.
- `test-all.js`
  - Extend AG-9 tests to cover low-signal suppression, per-zone minimum visibility, and cleaned labels.

## Testing

- Red-green on focused AG-9 tests first.
- Verify the full suite still passes.
- Spot-check `/Users/basilliu/solpredict` manually in the app:
  - More than one visible plant per populated zone
  - Source directories win over `README.md`
  - Composite labels are meaningful

## Non-Goals

- No recency-based ranking for now.
- No interactive expand/collapse behavior yet.
- No persistence changes for clustered display state.
