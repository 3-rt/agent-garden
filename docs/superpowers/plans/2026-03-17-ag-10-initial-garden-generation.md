# AG-10 Initial Garden Generation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate an initial garden from an existing project file tree when no saved garden state exists, with placement informed by directory structure and file importance.

**Architecture:** Add a main-process project scan utility that filters, scores, and converts files into generated `PlantState[]`. Expose that generation path through Electron IPC, then update the renderer startup flow to use generated plants only when persisted garden state is absent.

**Tech Stack:** Electron main/preload IPC, TypeScript, React, Phaser, plain `assert()` tests in `test-all.js`

---

### Task 1: Add deterministic scan and scoring utility

**Files:**
- Create: `src/main/services/initial-garden-generator.ts`
- Test: `test-all.js`

- [ ] **Step 1: Write the failing tests**

Add tests for:
- ignored paths are excluded
- important code paths score higher than low-signal files
- generated output is deterministic

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc --outDir test-build --skipLibCheck && node -e "require('./test-build/main/services/initial-garden-generator')"`
Expected: fail because the module does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement a scan utility that:
- recursively walks a directory
- filters ignored paths
- computes a score from file size, extension, and path bonuses
- sorts results deterministically

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npx tsc --outDir test-build --skipLibCheck && node -e "<targeted generator assertions>"`
Expected: PASS

### Task 2: Convert scored files into initial plant states

**Files:**
- Modify: `src/main/services/initial-garden-generator.ts`
- Test: `test-all.js`

- [ ] **Step 1: Write the failing tests**

Add tests for:
- scanned files map into frontend/backend/tests zones
- plant coordinates are deterministic
- directory-aware placement keeps related files clustered

- [ ] **Step 2: Run targeted test to verify it fails**

Run: `npx tsc --outDir test-build --skipLibCheck && node -e "<targeted plant generation assertions>"`
Expected: FAIL with incorrect or missing generated plant states

- [ ] **Step 3: Write minimal implementation**

Extend the generator to return `PlantState[]` with:
- `filename`
- `directory`
- `zone`
- `x` / `y`
- `createdAt`

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npx tsc --outDir test-build --skipLibCheck && node -e "<targeted plant generation assertions>"`
Expected: PASS

### Task 3: Expose initial generation through main/preload IPC

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/shared/types.ts`
- Test: `test-all.js`

- [ ] **Step 1: Write the failing test**

Add a test for the IPC-facing decision logic:
- saved state present -> do not request generated plants
- no saved state -> generated plants path is used

- [ ] **Step 2: Run targeted test to verify it fails**

Run: `npx tsc --outDir test-build --skipLibCheck && node -e "<startup decision assertions>"`
Expected: FAIL because initial generation is not wired yet

- [ ] **Step 3: Write minimal implementation**

Add a main-process handler and preload bridge for fetching generated initial plants from the current watched directory.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npx tsc --outDir test-build --skipLibCheck && node -e "<startup decision assertions>"`
Expected: PASS

### Task 4: Use generated plants on first load in the renderer

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/game/GardenGame.ts`
- Modify: `src/renderer/game/scenes/GardenScene.ts`
- Test: `test-all.js`

- [ ] **Step 1: Write the failing test**

Add a test for the startup path:
- persisted state restores existing plants
- empty state restores generated initial plants instead

- [ ] **Step 2: Run targeted test to verify it fails**

Run: `npx tsc --outDir test-build --skipLibCheck && node -e "<renderer startup assertions>"`
Expected: FAIL because the renderer only restores persisted state today

- [ ] **Step 3: Write minimal implementation**

Update startup so the renderer:
- restores persisted plants when present
- otherwise requests generated plants and restores them
- keeps normal live file event handling unchanged

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `npx tsc --outDir test-build --skipLibCheck && node -e "<renderer startup assertions>"`
Expected: PASS

### Task 5: Run regression verification

**Files:**
- Test: `test-all.js`

- [ ] **Step 1: Run targeted AG-10 verification**

Run: `npx tsc --outDir test-build --skipLibCheck && node -e "<combined AG-10 assertions>"`
Expected: PASS

- [ ] **Step 2: Run full suite and record unrelated failures**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: AG-10 tests pass; existing unrelated failures may still remain in the suite
