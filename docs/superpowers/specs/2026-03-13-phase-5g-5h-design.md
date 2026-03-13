# Phase 5g & 5h Design Spec

## Overview

Complete the Agent Garden implementation by wiring real Claude Code activity into the garden visualization (5g) and adding setup/connection UX (5h).

## Phase 5g: Garden Integration

### Plant-Agent Attribution

**Problem:** FileWatcher triggers plant creation independently of agent tracking. There's no link between which agent created a file and the resulting plant.

**Solution:** Correlate agent PostToolUse hook events with FileWatcher events to attribute plants to agents.

1. When a `PostToolUse` hook arrives with a `file` field and a write-type tool (`Write`, `Edit`, `Bash`), main process records the `agentId` and `file` in a short-lived buffer (2-second TTL).
2. When FileWatcher emits a file event, main process checks the buffer for a matching filename. If found, enriches the `file:event` IPC payload with `agentId` and `role`.
3. `PlantState` gains an optional `creatorRole: AgentRole` field.
4. `GardenScene.onFileCreated()` accepts an optional `creatorRole` parameter. A small colored dot (role color: green=planter, orange=weeder, blue=tester) renders at the plant base.
5. No changes to FileWatcher itself — correlation happens in main.ts.

### Stats Driven by Agent Activity

**Problem:** `tasksCompleted`, `tasksFailed`, `tokensUsed` are never updated. Stats panel shows stale data.

**Changes to GardenStats:**
- Remove: `tokensUsed`
- Add: `activeAgents: number` (count of non-disconnected sessions)
- Wire: `tasksCompleted` increments on spawned agent exit code 0 or `Stop` hook event
- Wire: `tasksFailed` increments on spawned agent non-zero exit code
- Stats updates emitted from main.ts whenever agent state changes (connect, disconnect, activity, exit)

**StatsPanel updates:**
- Replace "Tokens" display with "Agents" display showing `activeAgents`
- Health score formula updated: remove token component, weight agents component instead

### Weather Driven by Agent Activity

**Problem:** Weather (rain/sunshine) animations exist but aren't triggered by Claude Code events.

**Solution:** Wire agent lifecycle events to weather:
- `Stop` hook event → sunshine (5s duration)
- Spawned agent exit code 0 → sunshine (5s duration)
- Spawned agent exit code non-zero → rain (8s duration)
- Multiple simultaneous events don't stack — latest weather wins
- Weather triggers flow through existing `GardenScene.completeTask()` and `showError()` methods, called from `App.tsx` event handlers

## Phase 5h: Setup & Connection UX

### Hook Detection

On app launch, check two conditions:
1. Is Claude CLI installed? (existing `cc-agent:detect-claude` IPC)
2. Are hooks configured? New IPC handler `hooks:check-config` reads `~/.claude/settings.json` and checks for `localhost:7890` in hook URLs

Returns: `{ cliInstalled: boolean, hooksConfigured: boolean }`

### Non-Blocking Setup Banner

New React component: `SetupBanner.tsx`

- Shown at top of app when hooks are not configured
- Dismissible (persisted in config so it doesn't reappear after dismissal)
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
  2. Merges hook configuration into existing settings (preserves other settings)
  3. Writes back with confirmation dialog first
  4. Returns success/failure

**Step 3 — Test connection:**
- "Test Connection" button — new IPC handler `hooks:test` that:
  1. Sends a test POST to `http://localhost:7890/hooks/Notification` with a test payload
  2. Verifies the hook server received it
  3. Shows success/failure result

### Connection Status in Stats Panel

Add to existing `StatsPanel.tsx`:

- Green dot + "Hooks: Connected" — at least one hook event received in last 60 seconds
- Yellow dot + "Hooks: Waiting" — hook server is running but no events received yet
- Gray dot + "Hooks: Not configured" — hooks not detected in settings

**Implementation:** Main process tracks `lastHookEventTime`. New IPC `hooks:status` returns current status. StatsPanel polls every 10 seconds or listens to a `hooks:status-changed` event.

## Files Modified

### Phase 5g
- `src/shared/types.ts` — Update `GardenStats` (remove `tokensUsed`, add `activeAgents`), add `creatorRole` to `PlantState`
- `src/main/main.ts` — Add file-agent correlation buffer, enrich file events, wire stats updates to agent lifecycle
- `src/renderer/App.tsx` — Pass `creatorRole` through to game on file events, trigger weather on agent exit
- `src/renderer/game/scenes/GardenScene.ts` — Accept `creatorRole` in `onFileCreated()`, render role-colored dot at plant base
- `src/renderer/components/StatsPanel.tsx` — Replace tokens with agents, update health formula
- `src/main/services/persistence.ts` — Update stats schema (remove tokensUsed, add activeAgents)

### Phase 5h
- `src/renderer/components/SetupBanner.tsx` — New: dismissible banner component
- `src/renderer/components/HookSetupModal.tsx` — New: 3-step wizard modal
- `src/renderer/App.tsx` — Integrate SetupBanner and HookSetupModal, check hook status on mount
- `src/main/main.ts` — New IPC handlers: `hooks:check-config`, `hooks:auto-configure`, `hooks:test`, `hooks:status`
- `src/main/preload.ts` — Expose new hook IPC methods
- `src/renderer/components/StatsPanel.tsx` — Add connection status indicator
- `src/shared/types.ts` — Add hook status types

## Testing

- Unit tests for file-agent correlation buffer (TTL, matching logic)
- Unit tests for stats update logic (increment on exit, active count)
- Unit tests for hook config detection (parse settings.json, check URLs)
- Unit tests for hook auto-configure (merge settings, preserve existing)
- Integration tests for weather triggering on agent events
- Tests for SetupBanner visibility logic (show/hide/dismiss persistence)
- Tests for connection status state machine (connected/waiting/not configured)
