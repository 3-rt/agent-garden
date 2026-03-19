# AG-9 Grouping Tuning Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tune merged-plant grouping so crowded projects keep 2-3 meaningful visible plants per zone and suppress low-signal labels like `README.md`, lockfiles, and caches.

**Architecture:** Keep raw plant persistence unchanged, but improve the display-layer clustering in `plant-clusters.ts`. The clustering pass will rank candidate groups per zone, preserve a small visible quota of high-signal groups, merge the rest, and emit cleaned labels that `GardenScene` can render without further structural changes.

**Tech Stack:** TypeScript, React/Electron renderer, Phaser 3, plain `assert()` tests in `test-all.js`

---

## Chunk 1: Red Tests For Tuned Grouping

### Task 1: Add failing AG-9 tuning tests

**Files:**
- Modify: `test-all.js`
- Reference: `src/renderer/game/plant-clusters.ts`

- [ ] **Step 1: Write the failing tests**

Add AG-9 assertions covering:
- per-zone minimum visible count for meaningful groups
- suppression of `README.md` / low-signal roots as the dominant visible label
- preference for source directories (`src/`, `app/`, `services/`, `components/`, tests) over junk groups
- cleaned merged labels such as `app/models` instead of low-signal names

- [ ] **Step 2: Run the suite to verify the new assertions fail for the right reason**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

Expected:
- existing suite compiles
- AG-9 assertions fail because current grouping is too aggressive or promotes low-signal labels

## Chunk 2: Ranking And Labeling Logic

### Task 2: Implement signal scoring and zone quotas

**Files:**
- Modify: `src/renderer/game/plant-clusters.ts`
- Test: `test-all.js`

- [ ] **Step 1: Add a deterministic scoring model**

Implement helpers that:
- strongly reward source-like paths and subsystem directories
- reward larger groups and stronger growth scales
- strongly penalize low-signal files and directories such as `README.md`, `__pycache__`, lockfiles, caches, coverage, build output

- [ ] **Step 2: Add per-zone visible quotas**

Update grouping so that when the merge threshold is exceeded:
- each populated zone keeps up to 3 high-signal visible plants when available
- sparse zones can fall back to 2 or 1
- remaining groups collapse into merged plants

- [ ] **Step 3: Clean up labels**

Emit labels that:
- prefer meaningful directory paths like `web/src/app/about` or `src/services`
- avoid using low-signal filenames as the primary visible label
- fall back to short safe zone labels if needed

- [ ] **Step 4: Run tests to verify green**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

Expected:
- AG-9 tests pass
- no regressions elsewhere

## Chunk 3: Scene Integration Safety

### Task 3: Confirm `GardenScene` still renders tuned layouts correctly

**Files:**
- Modify: `src/renderer/game/scenes/GardenScene.ts` only if needed
- Reference: `src/renderer/game/plant-clusters.ts`

- [ ] **Step 1: Verify scene consumption matches tuned clustering output**

Check that:
- merged plants still render count badges
- singletons remain visible when intentionally preserved
- no extra changes are made if the current scene integration already works

- [ ] **Step 2: Make minimal scene adjustments only if required**

If tuning changes require it, patch the scene minimally so display rebuilds remain deterministic and stable.

- [ ] **Step 3: Re-run build and tests**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
npm run build
```

Expected:
- `277 passed, 0 failed` or higher if new tests are added
- webpack build succeeds

## Chunk 4: Manual Spot Check

### Task 4: Validate behavior on `/Users/basilliu/solpredict`

**Files:**
- No code changes required unless a targeted fix is discovered

- [ ] **Step 1: Launch the app**

Run:
```bash
npm start
```

- [ ] **Step 2: Open `/Users/basilliu/solpredict` and inspect the garden**

Confirm:
- more than one visible plant appears in populated zones
- high-signal source directories outrank `README.md` and caches
- merged labels are meaningful and not junk-derived

- [ ] **Step 3: If a specific issue appears, make the smallest targeted follow-up fix**

Only patch what the manual check proves is still wrong.

- [ ] **Step 4: Re-run verification after any follow-up fix**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
npm run build
```
