# Agent Garden — Implementation Plan

Phases 1–4 built the visual garden foundation. Phase 5 transforms the app from an API wrapper into a full Claude Code orchestrator (the Head Gardener). Phase 5 is the current focus.

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
- Stats panel: files, tasks, tokens, uptime, health score

## Phase 5: Head Gardener — Claude Code Orchestration 🔲

Replace the built-in API agents with real Claude Code CLI sessions. The app becomes the **Head Gardener**: an orchestrator that detects, spawns, assigns roles to, coordinates, and monitors Claude Code agents. Every gardener in the garden is a real Claude Code session.

### 5a: Hook Listener Server
- Run a lightweight HTTP server (port 7890) inside the Electron main process
- Accept POST requests from Claude Code hooks: `SessionStart`, `SessionEnd`, `Stop`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Notification`
- Parse hook payloads to extract session ID, working directory, tool names, and timestamps
- Track active sessions in a `ClaudeCodeTracker` service (map of sessionId → session state)
- Auto-expire stale sessions after configurable timeout (default 5 min no activity)

### 5b: Process Scanning (Supplemental)
- Periodic `ps` scan (every 10s) to detect `claude` processes
- Cross-reference with hook data — if a process exists but no hooks received, show as "detected (no hooks)"
- Extract working directory from process args if possible

### 5c: Agent Sprites & Role Assignment
- Each detected/spawned Claude Code session gets its own pixel-art gardener sprite
- User can designate each agent a role: planter (green hat), weeder (orange hat), tester (blue hat)
- Unassigned agents get a default purple hat until a role is set
- Agents appear in the garden zone matching their role (Frontend/Backend/Tests)
- Speech bubble shows real-time activity from hooks (e.g., "Editing src/App.tsx", "Running tests")
- Walking animation on `PreToolUse`, working animation during tool execution, idle when waiting
- Agent label shows session directory basename + role (e.g., "my-app / planter")
- Dynamic agent count — sprites appear/disappear as sessions start and end

### 5d: Spawning & Lifecycle
- App can spawn new Claude Code sessions as headless child processes
- User clicks "Spawn Agent" → picks role + optional prompt + optional directory
- Output captured internally, streamed to garden UI via speech bubbles + output panel
- "Open in terminal" button on any spawned agent to attach for direct CLI interaction
- Graceful shutdown: app sends stop signal to spawned agents, cleans up on quit
- Track spawned vs. detected (externally started) agents separately
- Spawned agents auto-assigned to the role chosen at spawn time

### 5e: Head Gardener (Orchestrator)
- The Head Gardener is the app's orchestration brain — a special non-visible agent
- User submits a high-level goal (e.g., "Add authentication with tests")
- Head Gardener breaks it into subtasks using smart routing:
  - New files / scaffolding → assigns to a planter agent
  - Refactoring / fixes → assigns to a weeder agent
  - Tests → assigns to a tester agent
- Delegates subtasks to idle agents, or spawns new agents if none available
- Tracks subtask progress, shows orchestration status in UI
- Keyword/intent matching extends the existing TaskRouter logic
- Future: could use Claude API call to do smarter task decomposition

### 5f: Directory Management
- Default: all agents share the watched project directory
- Per-agent override: individual Claude Code agents can target different directories
- Garden visually groups plants by directory when multiple directories are active
- Directory selector shows "primary" + "additional" directories

### 5g: Garden Integration
- Plants grow when Claude Code agents create/modify files (detected via hooks + FileWatcher)
- Stats panel shows: active agent count, tasks delegated, files changed, per-agent status
- IPC events: `cc-agent:connected`, `cc-agent:activity`, `cc-agent:disconnected`, `cc-agent:spawned`
- Existing Phase 1–4 visual features (day/night, weather, themes, particles) all apply to Claude Code agents

### 5h: Setup & Connection UX
- First-run wizard:
  1. Auto-detect if `claude` CLI is installed
  2. Generate hooks JSON config snippet for `~/.claude/settings.json`
  3. Offer to auto-configure hooks (write to settings.json with user permission)
- Connection status indicator (green = receiving hooks, gray = no hooks, red = error)
- "Spawn Agent" button to start new Claude Code sessions from the UI
- Agent management panel: list all active agents, their roles, status, stop/restart controls
- Role assignment dropdown on each agent (planter/weeder/tester)
