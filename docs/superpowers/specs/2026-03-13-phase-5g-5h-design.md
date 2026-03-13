# Phase 5g & 5h Design Spec

## Overview

Complete the Agent Garden implementation by wiring real Claude Code activity into the garden visualization (5g) and adding setup/connection UX (5h).

## Phase 5g: Garden Integration

### Plant-Agent Attribution

**Problem:** FileWatcher triggers plant creation independently of agent tracking. There's no link between which agent created a file and the resulting plant.

**Solution:** Correlate agent PostToolUse hook events with FileWatcher events to attribute plants to agents.

1. When a `PostToolUse` hook arrives with a `file` field and a write-type tool, main process records the `agentId`, `role`, and `file` in a short-lived buffer (2-second TTL). Tool name matching uses substring/contains checks against known write patterns (`write`, `edit`, `create`, `bash`, `execute`) to handle varying Claude Code tool name formats (e.g., `write_to_file`, `Write`, `edit_file`, `Edit`).
2. When FileWatcher emits a file event, main process checks the buffer for a matching filename. If found, enriches the `file:event` IPC payload with `agentId` and `role`.
3. `FileEvent` in `types.ts` gains optional fields: `agentId?: string` and `creatorRole?: AgentRole`.
4. `PlantState` gains an optional `creatorRole?: AgentRole` field. Old persisted plants without this field gracefully render without the role dot (no migration needed).
5. `GardenScene.onFileCreated()` accepts an optional `creatorRole` parameter. A small colored dot (role color: green=planter, orange=weeder, blue=tester) renders at the plant base. Only rendered when `creatorRole` is present.
6. No changes to FileWatcher itself — correlation happens in main.ts.

### Stats Driven by Agent Activity

**Problem:** `tasksCompleted`, `tasksFailed`, `tokensUsed` are never updated. Stats panel shows stale data.

**Type consolidation:** `persistence.ts` defines its own `GardenStats`, `PlantState`, and `GardenState` interfaces that duplicate `shared/types.ts`. As part of this phase, `persistence.ts` must import these types from `shared/types.ts` instead of maintaining parallel definitions. Similarly, `StatsPanel.tsx` defines `GardenStatsData` locally — it should import `GardenStats` from `shared/types.ts`.

**Changes to GardenStats:**
- Remove: `tokensUsed`
- Add: `activeAgents: number` (count of non-disconnected sessions)
- Wire: `tasksCompleted` increments on spawned agent exit code 0 only (NOT on `Stop` hook events, since a single session produces many `Stop` events per turn — `Stop` means the turn ended, not that a task completed)
- Wire: `tasksFailed` increments on spawned agent non-zero exit code
- Stats updates emitted from main.ts whenever agent state changes (connect, disconnect, exit)

**StatsPanel updates:**
- Replace "Tokens" display with "Agents" display showing `activeAgents`
- Health score formula updated: remove token component, weight agents component instead

**Snapshot update:** `GardenScene.ts` snapshot code (around line 500) references `tokensUsed: 0` — update to use `activeAgents` instead.

### Weather Driven by Agent Activity

**Problem:** Weather (rain/sunshine) animations exist but aren't triggered by real Claude Code events.

**Current state:** `GardenScene.showActivity()` already handles the `Stop` case with sunshine. This existing code path is sufficient for hook-detected agents.

**Additions needed (App.tsx only):**
- Spawned agent exit code 0 → call `gameRef.current?.completeTask(agentId)` (triggers sunshine)
- Spawned agent exit code non-zero → call `gameRef.current?.showError(agentId)` (triggers rain)
- No duplicate triggering: spawned agents that also emit hook `Stop` events are handled by the existing `showActivity` path — the `onCCAgentExited` handler should only trigger weather for spawned agents whose exit we wouldn't otherwise see via hooks

## Phase 5h: Setup & Connection UX

### Hook Detection

On app launch, check two conditions:
1. Is Claude CLI installed? (existing `cc-agent:detect-claude` IPC)
2. Are hooks configured? New IPC handler `hooks:check-config` reads `~/.claude/settings.json` (the standard Claude Code config location) and checks for `localhost:7890` in hook URLs

Returns: `{ cliInstalled: boolean, hooksConfigured: boolean }`

### Non-Blocking Setup Banner

New React component: `SetupBanner.tsx`

- Shown at top of app when hooks are not configured
- Dismissible — dismissal persisted via `bannerDismissed` field in `AppConfig` (in main.ts), with new IPC handler `setup:dismiss-banner`
- Message: "Claude Code hooks not detected. The garden works with limited visibility (process scanning only). [Configure Hooks]"
- If CLI is also missing: "Claude Code CLI not found. Install it first, then configure hooks. [Learn More]"

### Hook Configuration Wizard

New React component: `HookSetupModal.tsx`

Modal with three steps:

**Step 1 — Show required config:**
Display the JSON snippet for `~/.claude/settings.json` hooks configuration. All 7 event types with URLs pointing to `http://localhost:7890/hooks/{EventType}`.

**Step 2 — Apply config:**
- "Copy to Clipboard" button — copies the JSON snippet
- "Auto-Configure" button — new IPC handler `hooks:auto-configure` that:
  1. Reads existing `~/.claude/settings.json` (or creates if missing)
  2. If file exists but is malformed JSON, show error and suggest manual configuration
  3. If file has existing hook URLs that differ, show warning and ask to overwrite
  4. Merges hook configuration into existing settings (preserves other settings)
  5. Writes back — if write fails (permissions), show error with manual instructions
  6. Returns `{ success: boolean, error?: string }`

**Step 3 — Verify configuration:**
- "Verify Setup" button — re-runs `hooks:check-config` to confirm the settings file now contains the correct hook URLs
- Shows success (checkmark + "Hooks configured!") or failure (what's still missing)
- Note: This verifies the config file was written correctly, not end-to-end hook delivery. Full hook testing happens naturally when a Claude Code session starts.

### Connection Status in Stats Panel

Add to existing `StatsPanel.tsx`:

- Green dot + "Hooks: Connected" — at least one hook event received in last 60 seconds
- Yellow dot + "Hooks: Waiting" — hook server is running but no events received yet
- Gray dot + "Hooks: Not configured" — hooks not detected in settings

**Implementation:** Main process tracks `lastHookEventTime` (updated on each hook event in hook-server.ts). Emits `hooks:status-changed` IPC event when status transitions occur. StatsPanel listens to this event — no polling needed.

## Files Modified

### Phase 5g
- `src/shared/types.ts` — Update `GardenStats` (remove `tokensUsed`, add `activeAgents`), add `creatorRole` to `PlantState`, add `agentId`/`creatorRole` to `FileEvent`
- `src/main/main.ts` — Add file-agent correlation buffer, enrich file events, wire stats updates to agent lifecycle
- `src/main/services/persistence.ts` — Remove duplicate type definitions, import from `shared/types.ts`
- `src/renderer/App.tsx` — Pass `creatorRole` through to game on file events, trigger weather on spawned agent exit
- `src/renderer/game/scenes/GardenScene.ts` — Accept `creatorRole` in `onFileCreated()`, render role-colored dot at plant base, update snapshot stats
- `src/renderer/components/StatsPanel.tsx` — Import `GardenStats` from types, replace tokens with agents, update health formula

### Phase 5h
- `src/renderer/components/SetupBanner.tsx` — New: dismissible banner component
- `src/renderer/components/HookSetupModal.tsx` — New: 3-step wizard modal
- `src/renderer/App.tsx` — Integrate SetupBanner and HookSetupModal, check hook status on mount
- `src/main/main.ts` — New IPC handlers: `hooks:check-config`, `hooks:auto-configure`, `setup:dismiss-banner`, `hooks:status-changed` event
- `src/main/preload.ts` — Expose new hook IPC methods
- `src/main/services/hook-server.ts` — Track `lastHookEventTime`, emit status changes
- `src/renderer/components/StatsPanel.tsx` — Add connection status indicator
- `src/shared/types.ts` — Add hook status types

### Cleanup (both phases)
- `src/renderer/components/StatsPanel.tsx` — Remove local `GardenStatsData` interface, import from `shared/types.ts`
- `src/main/services/persistence.ts` — Remove local type definitions, import from `shared/types.ts`

## Testing

- Unit tests for file-agent correlation buffer (TTL, matching, expiry)
- Unit tests for stats update logic (increment on exit, active count, no increment on Stop)
- Unit tests for hook config detection (parse settings.json, check URLs, missing file, malformed JSON)
- Unit tests for hook auto-configure (merge settings, preserve existing, handle malformed, handle permissions error)
- Unit tests for weather triggering on spawned agent exit (code 0 = sunshine, non-zero = rain)
- Tests for SetupBanner visibility logic (show/hide/dismiss persistence via AppConfig)
- Tests for connection status state machine (connected/waiting/not configured, transitions on hook events)
- Tests for type consolidation (persistence and StatsPanel use shared types correctly)
