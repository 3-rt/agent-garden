# Agent Garden — Implementation Plan

Phases 1–5 are complete on `main`, and the current baseline also includes post-Phase-5 renderer polish, activity logging, initial garden generation, and garden bed layout. This file now serves as a reference roadmap for what shipped.

## Phase 1: MVP Loop ✅
- FileWatcher wired into main process with 200ms debounce
- Claude generates code with `// @file:` convention, saved to watched directory
- File events trigger plant growth (file→plant mapping)
- Directory picker with native dialog, persisted config
- Task queue prevents stream interleaving

## Phase 2: Polish ✅
- Agent walk/work animations, state machine (idle/walking/working/error)
- Plant variety by file extension (.tsx=flower, .ts=tree, .css=rect, .json=circle, .test=mushroom)
- Particle effects on plant creation/modification
- Speech bubbles with smart snippet extraction
- Collapsible output panel with 50-entry history
- API key modal (first-run + re-openable), stored via `safeStorage`
- Error handling with retry, typed errors (auth/rate-limit/network)

## Phase 3: Multi-Agent ✅
- AgentPool: 3 agents (planter/weeder/tester) with role-specific system prompts
- TaskRouter: `@agent` prefix or keyword matching
- Garden zones (Frontend/Backend/Tests) with signs and dividers
- Unique hat colors per role, name labels, independent speech bubbles
- Context window visualization (backpack fill + color gradient)
- Token tracking per agent

## Phase 4: Delight ✅
- Day/night cycle (2-min: dawn→day→dusk→night), sun/moon arc, stars
- Weather: rain on errors, sunshine on success
- 5 themes (Garden, Desert, Zen, Underwater, Space) with live switching
- Time-lapse snapshots (10s interval, max 200)
- Persistence: auto-save every 30s + on quit (plants, theme, stats)
- Stats panel: files, tasks, uptime, health score (later expanded in Phase 5 to active agents and hook status)

## Phase 5: Head Gardener — Claude Code Orchestration

Replace the built-in API agents with real Claude Code CLI sessions. The app becomes the **Head Gardener**: an orchestrator that detects, spawns, assigns roles to, coordinates, and monitors Claude Code agents. Every gardener in the garden is a real Claude Code session.

### 5a: Hook Listener Server ✅
- HTTP server (port 7890) in Electron main process receives Claude Code hook events
- Handles all 7 event types: `SessionStart`, `SessionEnd`, `Stop`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Notification`
- Parses payloads with flexible field naming (session_id/sessionId, cwd/directory, etc.)
- `ClaudeCodeTracker` maintains map of sessionId → session state
- Auto-expires stale sessions after 5 min of inactivity (checked every 30s)
- 1MB max payload guard, binds to 127.0.0.1 only

### 5b: Process Scanning (Supplemental) ✅
- `ps -eo pid,args` every 5 seconds to detect running `claude` CLI processes
- Excludes VS Code extension processes, shell wrappers, and agent-garden's own processes
- Extracts working directory from `--cwd`/`--directory`/`-C` flags or path-like arguments
- Emits `detected` / `exited` events, cross-referenced with hook data in tracker
- Deduplicates against hook sessions by matching directory

### 5c: Agent Sprites & Role Assignment ✅
- Each detected/spawned session gets a dynamic gardener sprite via `addAgent()`
- Roles: planter (green hat), weeder (orange hat), tester (blue hat), unassigned (purple hat)
- Agents positioned in zone matching role (Frontend/Backend/Tests)
- `showActivity()` maps hook events to animations: walking, working, speech bubbles
- Agent labels show directory basename; sprites appear/disappear dynamically
- Status bar shows all agents with role color, status dot, source label (hook/ps/spawned)

### 5d: Spawning & Lifecycle ✅
- `ClaudeCodeManager` spawns headless `claude --print <prompt>` child processes
- "+" Agent button prompts for task, spawns with unassigned role
- stdout/stderr captured and streamed to garden as speech bubbles
- "term" button opens native terminal at agent's cwd (macOS: `open -a Terminal`)
- "stop" button sends SIGTERM with 5s SIGKILL fallback
- `stopAll()` called on app shutdown to clean up spawned agents
- Spawned sessions tracked separately (`source: 'spawned'`) from detected ones

### 5e: Head Gardener (Orchestrator) ✅
- `HeadGardener` service decomposes goals into subtasks using keyword splitting ("and", "with", "then", commas)
- Each subtask routed to a role via `TaskRouter` (keyword/intent matching)
- Delegates to idle agents with matching role, or spawns new agents
- Tracks plans (`Map<planId, OrchestrationPlan>`) with subtask status
- Agent exits update subtask status (exit code 0 = complete, else error)
- UI: goal input bar + "Delegate" button, live plan status with subtask chips
- IPC: `head-gardener:submit-goal`, `head-gardener:get-plans`, plan/subtask events forwarded to renderer

### 5f: Directory Management ✅
- Default: all agents share the watched primary project directory
- Per-agent override: individual Claude Code agents can target different directories
- `FileWatcher` supports multiple directories simultaneously (primary + additional)
- `additionalDirectories` persisted in config, restored on startup
- Garden visually groups plants by directory when multiple directories are active (vertical offset + directory labels)
- Plants include `directory` in state for persistence
- Directory selector shows "primary" + "additional" directories with add/remove buttons
- Spawning agents prompts for directory choice when multiple are available
- `OrchestrationSubtask` supports per-subtask `directory` override

### 5g: Garden Integration ✅
- Plants grow when Claude Code agents create/modify files (detected via hooks + FileWatcher)
- File-agent correlation buffer attributes plants to the agent that created them (role-colored dot)
- Stats panel shows: active agent count, tasks delegated, files changed, per-agent status
- Agent exits trigger weather (sunshine on success, rain on failure)
- TimeLapse snapshots use activeAgents instead of tokensUsed
- Existing Phase 1–4 visual features (day/night, weather, themes, particles) all apply to Claude Code agents

### 5h: Setup & Connection UX ✅
- First-run wizard:
  1. Auto-detect if `claude` CLI is installed
  2. Generate hooks JSON config snippet for `~/.claude/settings.json`
  3. Offer to auto-configure hooks (write to settings.json with user permission)
- Connection status indicator (green = receiving hooks, yellow = waiting, gray = not configured)
- SetupBanner warns when hooks aren't configured, with dismiss and configure options
- HookSetupModal: 3-step wizard (view config → auto-configure/manual → verify)

## Post-Phase 5 Shipped Work ✅

- **AG-9: Merged plant grouping** — prioritize high-signal directories in dense gardens while keeping singleton files legible
- **AG-10: Initial garden generation** — scan an existing repo and seed the garden before live file events start
- **AG-13: Activity log** — track lifecycle, tool, file, and plan events in a filterable renderer panel
- **Garden beds** — persist explicit beds per zone, place plants into walkable plots, and keep live insertions bed-aware
- **AG-14: Renderer stability** — use Canvas mode plus resize/restore rebuilds and bed-aware anchoring for stable Electron visuals
