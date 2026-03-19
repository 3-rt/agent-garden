# Garden Bed Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered per-zone plant placement with explicit garden beds that organize initial generation, live file insertion, persistence, and subtle scene rendering.

**Architecture:** Introduce a shared garden-bed layout module that owns zone bed geometry, directory-group assignment, and in-bed plant placement. Promote beds to persisted state so the main-process generator, renderer restore flow, and live insertion path all consume the same layout contract instead of maintaining separate placement systems.

**Tech Stack:** TypeScript, Electron main/renderer split, Phaser 3, React, plain `assert()` tests in `test-all.js`

---

## File Map

- Create: `src/shared/garden-bed-layout.ts`
  - Pure layout helpers for bed count, bed ranking, directory-group scoring, bounded scatter, live insertion target selection, and zone expansion.
- Modify: `src/shared/types.ts`
  - Add persisted bed state and plant-to-bed membership types; update `GardenState` and IPC method signatures if the saved payload changes shape.
- Modify: `src/main/services/initial-garden-generator.ts`
  - Replace direct per-zone scatter with bed-driven generation using the shared layout module.
- Modify: `src/main/services/persistence.ts`
  - Save and load full garden layout state, including beds.
- Modify: `src/main/main.ts`
  - Update garden IPC handlers so generated and persisted state include beds.
- Modify: `src/main/preload.ts`
  - Reflect IPC contract changes in the renderer bridge.
- Modify: `src/renderer/App.tsx`
  - Restore and save the full garden layout state instead of only plant arrays.
- Modify: `src/renderer/game/GardenGame.ts`
  - Expose scene methods for restoring and serializing beds alongside plants.
- Modify: `src/renderer/game/scenes/GardenScene.ts`
  - Track bed state, render subtle bed visuals, route new files into beds, and preserve bed membership through restore/resize.
- Modify: `test-all.js`
  - Add focused tests for bed layout helpers, persistence compatibility, and generator output.

## Chunk 1: Data Contract And Persistence

### Task 1: Add failing tests for persisted bed state

**Files:**
- Modify: `test-all.js`
- Reference: `src/shared/types.ts`
- Reference: `src/main/services/persistence.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions covering:
- `PlantState` accepts an optional `bedId`
- persisted garden state accepts a `beds` collection
- `PersistenceService.saveState()` round-trips beds together with plants
- `PersistenceService.loadState()` remains tolerant of older saved states that have plants but no beds

- [ ] **Step 2: Run the suite to verify the new assertions fail for the right reason**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

Expected:
- TypeScript build succeeds or surfaces the missing type additions
- new bed-state assertions fail because `PlantState` / `GardenState` / `PersistenceService` do not yet model beds

### Task 2: Add bed types and persistence support

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/persistence.ts`
- Test: `test-all.js`

- [ ] **Step 1: Extend shared types**

Add focused types such as:
- `GardenBedState`
- optional `bedId` on `PlantState`
- optional `beds` on `GardenState` or an equivalent saved layout shape that remains backward-compatible

Keep the new types narrow. Do not add speculative fields for future pathfinding.

- [ ] **Step 2: Update persistence round-trip**

Teach `PersistenceService` to:
- save beds with the garden state
- load them when present
- gracefully default older saves that do not contain beds

- [ ] **Step 3: Run tests to verify green**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

Expected:
- persistence tests pass
- older save compatibility remains intact

- [ ] **Step 4: Commit**

Run:
```bash
git add test-all.js src/shared/types.ts src/main/services/persistence.ts
git commit -m "feat: add persisted garden bed state"
```

## Chunk 2: Shared Layout Engine

### Task 3: Add failing layout tests

**Files:**
- Modify: `test-all.js`
- Create: `src/shared/garden-bed-layout.ts`

- [ ] **Step 1: Write the failing tests**

Add pure helper tests for:
- per-zone bed count from file count
- center-priority bed ranking in a compact grid
- directory-group assignment favoring higher-signal groups in middle beds
- directory groups staying together when capacity allows
- overflow spilling into outer beds
- in-bed placement staying within bed bounds and respecting minimum spacing

Use deterministic fixtures and seeded or repeatable placement inputs where needed.

- [ ] **Step 2: Run the suite to verify the new assertions fail**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

Expected:
- tests fail because the shared bed layout module does not exist yet

### Task 4: Implement the shared bed layout module

**Files:**
- Create: `src/shared/garden-bed-layout.ts`
- Modify: `src/main/services/initial-garden-generator.ts`
- Test: `test-all.js`

- [ ] **Step 1: Implement pure layout helpers**

Add deterministic helpers for:
- deriving zone bed counts
- building a compact grid of bed footprints
- ranking beds by center priority
- scoring directory groups
- assigning groups into beds
- scattering plant positions within bed bounds

- [ ] **Step 2: Refactor initial generation to use the bed layout module**

Update `generateInitialGarden()` so it:
- still scans, filters, and scores files in the main process
- groups zone files by directory
- emits plant positions assigned to beds instead of free zone scatter
- populates `bedId` for generated plants
- returns or prepares bed state needed by persistence and restore flows

- [ ] **Step 3: Run tests to verify green**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

Expected:
- layout-helper assertions pass
- AG-10 initial generation tests still pass after being updated for bed-backed positions

- [ ] **Step 4: Commit**

Run:
```bash
git add test-all.js src/shared/garden-bed-layout.ts src/main/services/initial-garden-generator.ts
git commit -m "feat: add garden bed layout engine"
```

## Chunk 3: IPC And Restore Flow

### Task 5: Add failing app-state tests or assertions for the new contract

**Files:**
- Modify: `test-all.js`
- Reference: `src/main/main.ts`
- Reference: `src/main/preload.ts`
- Reference: `src/renderer/App.tsx`
- Reference: `src/renderer/game/GardenGame.ts`

- [ ] **Step 1: Add focused assertions for the garden payload shape**

Cover:
- initial garden IPC now returns the full garden layout payload needed for restore
- renderer save path can pass beds back to persistence
- older saved states without beds still restore without crashing

If direct IPC testing is awkward in `test-all.js`, extract small pure helpers and test those instead of trying to stand up Electron.

- [ ] **Step 2: Run the suite to verify the assertions fail**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

Expected:
- tests fail because the IPC bridge and restore/save contract still only handle plant arrays

### Task 6: Thread bed state through main, preload, app, and game wrappers

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/game/GardenGame.ts`
- Test: `test-all.js`

- [ ] **Step 1: Update the main-process IPC contract**

Change the garden IPC handlers so:
- `garden:generate-initial` returns the generated layout payload, not only plants
- `garden:save` accepts beds together with plants
- `garden:load` preserves backward compatibility with older save files

- [ ] **Step 2: Update the preload bridge and renderer consumers**

Adjust `window.electronAPI` and the app bootstrap flow so:
- restore uses plants plus beds
- auto-save persists plants plus beds
- initial generation saves the same full layout shape it restores

- [ ] **Step 3: Update `GardenGame` wrapper methods**

Expose scene-level helpers such as:
- `getGardenState()` or equivalent layout serialization
- `restoreGardenState()` or equivalent layout restore

Avoid keeping separate plant-only and bed-aware restore paths if they would drift.

- [ ] **Step 4: Run tests to verify green**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

Expected:
- new payload-contract assertions pass
- no regressions in existing persistence or initial-generation behavior

- [ ] **Step 5: Commit**

Run:
```bash
git add test-all.js src/main/main.ts src/main/preload.ts src/renderer/App.tsx src/renderer/game/GardenGame.ts
git commit -m "feat: thread garden beds through app state"
```

## Chunk 4: Scene Integration And Live Insertion

### Task 7: Add failing tests for live insertion and bed rendering helpers

**Files:**
- Modify: `test-all.js`
- Reference: `src/renderer/game/scenes/GardenScene.ts`
- Reference: `src/shared/garden-bed-layout.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions covering:
- a new file prefers a bed already holding the same directory group
- a new file falls back to another bed in the same zone only when necessary
- a new outer bed is added only after the zone crosses its capacity threshold
- restored plants keep their bed membership through scene serialization

Keep Phaser-specific tests narrow; prefer extracting pure helper logic from `GardenScene` and testing that directly.

- [ ] **Step 2: Run the suite to verify the new assertions fail**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

Expected:
- tests fail because live insertion still uses zone-slot placement and scene state does not track beds

### Task 8: Implement scene bed state, rendering, and live insertion

**Files:**
- Modify: `src/renderer/game/scenes/GardenScene.ts`
- Modify: `src/shared/garden-bed-layout.ts`
- Test: `test-all.js`

- [ ] **Step 1: Track bed state in the scene**

Add scene structures for:
- stored beds by id and/or zone
- bed background display objects
- plant-to-bed lookup needed for save, restore, delete, and display rebuilds

- [ ] **Step 2: Render subtle bed visuals**

Draw bed backgrounds before plants using simple Phaser primitives:
- muted soil plot fill
- optional faint border or shadow
- empty gaps preserved between plots

- [ ] **Step 3: Replace live file insertion with bed-aware placement**

Update `onFileCreated()` so it:
- determines the zone
- selects the best existing bed using shared helpers
- creates a new outer bed only when the zone is crowded
- assigns `bedId` and in-bed coordinates before rebuilding display

- [ ] **Step 4: Update restore, clear, resize, and delete flows**

Ensure:
- restore rebuilds beds and plants together
- resize recomputes bed geometry or re-renders bed visuals without losing grouping
- clear resets bed state
- delete removes plant membership cleanly

- [ ] **Step 5: Run verification**

Run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
npm run build
```

Expected:
- full test suite passes
- webpack build succeeds

- [ ] **Step 6: Commit**

Run:
```bash
git add test-all.js src/shared/garden-bed-layout.ts src/renderer/game/scenes/GardenScene.ts
git commit -m "feat: render and maintain garden beds in scene"
```

## Chunk 5: Manual Verification

### Task 9: Manually verify bed behavior in the app

**Files:**
- No code changes required unless the manual check reveals a concrete bug

- [ ] **Step 1: Launch the app**

Run:
```bash
npm start
```

- [ ] **Step 2: Verify initial generation on a representative project**

Confirm:
- each populated zone renders as a compact group of beds
- center beds hold the most important visible source areas
- bed gaps remain visually open
- beds are visible but subtle

- [ ] **Step 3: Verify live growth**

Create or simulate new files and confirm:
- new files join the expected existing bed when the directory already has a bed
- outer beds are added only as zones become crowded
- central beds do not reshuffle unexpectedly

- [ ] **Step 4: Verify restore and resize**

Confirm:
- reopening the app preserves bed grouping
- resizing the window keeps the section structure readable
- no bed visuals or plants become detached after restore

- [ ] **Step 5: Apply the smallest targeted follow-up fix if manual testing proves one is needed**

Re-run:
```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
npm run build
```

Expected:
- tests remain green after any follow-up fix
- build still succeeds
