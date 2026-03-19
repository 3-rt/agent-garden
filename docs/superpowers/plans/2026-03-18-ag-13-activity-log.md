# AG-13 Activity Log Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live-only activity log with project-wide and per-agent views, backed by normalized renderer-side events and a bounded in-memory history.

**Architecture:** Add shared log entry types plus pure normalization/filter helpers, then integrate them into `App.tsx` and a new `ActivityLogPanel` component. Keep all state in the renderer for the first pass and reuse existing IPC events instead of adding new main-process APIs.

**Tech Stack:** Electron IPC, React 19, TypeScript, plain `assert()` tests in `test-all.js`

---

## Chunk 1: Shared Log Model And Pure Helpers

### Task 1: Add log types and helper module

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/renderer/activity-log.ts`
- Test: `test-all.js`

- [ ] **Step 1: Write the failing test**

Add tests for:
- normalizing agent lifecycle and activity events into readable log entries
- trimming bounded history to the newest entries
- filtering by selected agent and search text

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: FAIL because the activity log helpers and types do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- `ActivityLogEntry`-related shared types
- pure helper functions in `src/renderer/activity-log.ts` for append/trim/filter/normalize behavior

- [ ] **Step 4: Run targeted test to verify it passes**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: New AG-13 assertions pass; unrelated existing failures may remain

## Chunk 2: Activity Log Panel

### Task 2: Add the log panel UI

**Files:**
- Create: `src/renderer/components/ActivityLogPanel.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `test-all.js`

- [ ] **Step 1: Write the failing test**

Add tests for:
- formatting filtered project log entries for display
- empty state when no entries match the current search/filter

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: FAIL because the panel wiring does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- `ActivityLogPanel` with header, search field, clear-filter control, and log list
- `App.tsx` state for `activityLogEntries`, `selectedAgentId`, and `activitySearch`
- project log rendering below the goal/plans area

- [ ] **Step 4: Run targeted test to verify it passes**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: AG-13 assertions pass

## Chunk 3: Wire Live Events Into The Log

### Task 3: Feed the panel from existing IPC events

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/main/preload.ts`
- Modify: `src/shared/types.ts`
- Test: `test-all.js`

- [ ] **Step 1: Write the failing test**

Add tests for:
- file events and orchestration events becoming normalized project log entries
- spawned/exited agent events carrying enough information to support readable entries

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: FAIL because the event normalization contract is incomplete

- [ ] **Step 3: Write minimal implementation**

Implement:
- event listener updates in `App.tsx` that append normalized entries
- any small typing changes needed in `preload.ts` / `types.ts`
- clickable agent chips that activate the per-agent filter without breaking existing buttons

- [ ] **Step 4: Run targeted test to verify it passes**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: AG-13 assertions pass

## Chunk 4: Verification

### Task 4: Run verification

**Files:**
- Test: `test-all.js`

- [ ] **Step 1: Run targeted AG-13 verification**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: All AG-13 assertions pass

- [ ] **Step 2: Run broader regression verification and record pre-existing failures**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: Existing unrelated multi-directory watcher failures may still remain; no new AG-13 failures
