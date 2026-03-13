# Agent Garden — Current Stage

> Comprehensive reference for understanding the project's architecture, current implementation, and how all pieces fit together. Intended for LLM context.

## What This App Does

Agent Garden is an Electron desktop app that acts as a visual orchestrator for Claude Code CLI agents. Each running Claude Code session appears as a pixel-art gardener in a 2D garden that represents your codebase. The app is the **Head Gardener** — it detects running Claude Code sessions, spawns new ones, assigns them roles, delegates tasks, and coordinates their work.

Plants = files. Garden = codebase. Gardeners = Claude Code sessions. Head Gardener = the orchestrator (the app itself).

**Agent roles** (user-assigned to each Claude Code session):
- **Planter** (green hat) — creates new files, works in the Frontend zone
- **Weeder** (orange hat) — refactors/fixes existing code, works in the Backend zone
- **Tester** (blue hat) — writes tests, works in the Tests zone
- **Unassigned** (purple hat) — newly detected sessions awaiting role assignment

## Tech Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| Desktop shell | Electron | Window, native OS access, IPC |
| UI | React 19 | Task input, agent management, output panel |
| Game engine | Phaser 3 | 2D rendering, sprites, tweens, animations |
| AI agents | Claude Code CLI | Real coding agents (detected or spawned) |
| Hook integration | HTTP server (port 7890) | Receives Claude Code hook events |
| Build | Webpack 5 | Multi-target bundling (main + preload + renderer) |
| Language | TypeScript (strict) | All layers |

## Architecture

Two-process Electron model:

```
┌──────────────────────────────────┐  IPC Bridge  ┌──────────────────────────────────┐
│         Main Process             │◄────────────►│       Renderer Process            │
│                                  │  (preload.ts) │                                  │
│  main.ts (entry, IPC handlers)   │               │  React UI (App.tsx + components) │
│  services/                       │               │  Phaser Game (GardenScene)        │
│    head-gardener.ts (orchestrator)│              │  sprites/ (Agent pixel art)       │
│    claude-code-manager.ts        │               │  systems/ (DayNight, Themes,      │
│    hook-server.ts (HTTP :7890)   │               │           TimeLapse)              │
│    claude-code-tracker.ts        │               │                                  │
│    task-router.ts (routing)      │               │                                  │
│    watcher.ts     (fs.watch)     │               │                                  │
│    persistence.ts (save/load)    │               │                                  │
└────────────┬─────────────────────┘               └──────────────────────────────────┘
             │
     ┌───────┼───────┐
     ▼       ▼       ▼
  Claude   Claude   Local File System
  Code #1  Code #N  (watched directory)
```

Communication: renderer sends commands (`head-gardener:submit-goal`, `cc-agent:spawn`, `cc-agent:stop`), main manages Claude Code sessions and streams results back via IPC events.

## File Structure

```
src/
  main/
    main.ts                    # App entry, window, all IPC handlers, auto-save timer
    preload.ts                 # Context bridge — typed API between processes
    services/
      head-gardener.ts         # Orchestrator: decomposes goals, delegates to agents
      claude-code-manager.ts   # Spawns/stops Claude Code child processes
      claude-code-tracker.ts   # Tracks active sessions (hook, process, spawned sources)
      hook-server.ts           # HTTP server on :7890, receives Claude Code hook POSTs
      process-scanner.ts       # ps scan every 5s to detect claude CLI processes
      task-router.ts           # Routes subtasks to roles by keyword/intent
      claude.ts                # (legacy) Direct Claude API service, used only by tests
      agent-pool.ts            # (legacy) API-based agent pool, used only by tests
      watcher.ts               # fs.watch with 200ms debounce, creates dir if missing
      persistence.ts           # Save/load garden state (plants, stats, theme) to JSON
  renderer/
    index.html                 # HTML shell with CSP (includes 'unsafe-eval' for Phaser)
    index.tsx                  # React DOM entry
    App.tsx                    # Root component — CC agent events, goal input, game bridge
    assets/sprites/            # Pixel art spritesheets (Overworld, character, objects, etc.)
    components/
      DirectoryPicker.tsx      # Shows/changes watched directory
      StatsPanel.tsx           # Bottom bar: plants, tasks, agents, hook status
      ThemePicker.tsx          # Theme dropdown (5 themes)
      SetupBanner.tsx          # Warning banner when hooks not configured
      HookSetupModal.tsx       # 3-step wizard to configure Claude Code hooks
      OutputPanel.tsx          # (legacy) Collapsible code output + history
      TaskInput.tsx            # (legacy) Text input for old API mode
      ApiKeyModal.tsx          # (legacy) API key entry modal
    game/
      GardenGame.ts            # Phaser game wrapper (React <-> Phaser bridge)
      scenes/
        GardenScene.ts         # Main scene: colored rect ground/path, zones, agents, plants
      sprites/
        Agent.ts               # Pixel-art agent: body, hat, legs, arms, backpack, speech bubble
      systems/
        DayNightCycle.ts       # 2-min cycle (dawn/day/dusk/night), weather (rain/sunshine)
        ThemeManager.ts        # 5 themes with listener pattern for live switching
        TimeLapse.ts           # Snapshots every 10s, max 200, export/import JSON
  shared/
    types.ts                   # All shared interfaces (includes CC agent + orchestration types)
```

## Implementation Status

### Phases 1–4 — Garden Foundation ✅
Built the visual garden, sprite system, animations, and rendering pipeline:
- FileWatcher detects file changes → plants grow in garden (file→plant mapping)
- Agent sprites with walk/work animations, state machine, speech bubbles
- Plant variety by file extension, particle effects
- Garden zones (Frontend/Backend/Tests)
- Day/night cycle, weather (rain on errors, sunshine on success)
- 5 themes (Garden, Desert, Zen, Underwater, Space)
- Time-lapse snapshots, persistence, stats panel
- Ground rendering uses theme-colored rectangles (alternating light/dark) with dirt path

*Note: Phases 1–4 originally used built-in API agents. Phase 5 replaced them with real Claude Code sessions. The legacy API services (`claude.ts`, `agent-pool.ts`) are no longer wired into the app but remain for test coverage.*

### Phase 5 — Head Gardener (Claude Code Orchestration)

- **5a: Hook Listener Server** ✅ — HTTP server on :7890 receives all 7 Claude Code hook event types
- **5b: Process Scanning** ✅ — `ps` scan every 5s detects claude processes, excludes VS Code/shell wrappers
- **5c: Agent Sprites & Roles** ✅ — Dynamic sprites per session, role-based colors/zones, hook-driven animations
- **5d: Spawning & Lifecycle** ✅ — Spawn headless agents, term/stop buttons, SIGTERM+SIGKILL cleanup
- **5e: Head Gardener (Orchestrator)** ✅ — Goal decomposition, task routing, plan tracking, UI with subtask chips
- **5f: Directory Management** ✅ — Multi-directory support (primary + additional), per-agent overrides, visual grouping
- **5g: Garden Integration** ✅ — File-agent correlation, plant role attribution, stats wiring, weather triggers
- **5h: Setup UX** ✅ — SetupBanner, HookSetupModal wizard, auto-configure hooks, connection status indicator

## Key Technical Details

### CSP Requirement
Phaser 3 uses `new Function()` internally. The CSP in `index.html` must include `'unsafe-eval'` in `script-src`, otherwise the scene's `create()` fails silently and the garden is blank.

### Claude Code Hook Integration
The app runs an HTTP server on port 7890. Claude Code hooks are configured in `~/.claude/settings.json` to POST events to this server. Each hook event maps to a garden action:
- `SessionStart` → new agent sprite appears
- `UserPromptSubmit` → speech bubble shows task
- `PreToolUse` → agent walks to work area
- `PostToolUse` → working animation, file activity
- `Stop` → agent completes, walks home
- `SessionEnd` → agent sprite removed

### Agent Sources
- **Spawned** (`source: 'spawned'`): launched by the app as child processes, full control (stop, open terminal, role pre-assigned)
- **Hooks** (`source: 'hooks'`): externally-started sessions discovered via hook events, real-time activity tracking
- **Process** (`source: 'process'`): detected via `ps` scanning, limited visibility (no hook data), deduplicates against hook sessions

### State Management
No centralized store. State is distributed:
- **Main process**: Head Gardener state, Claude Code sessions, task queues, stats, persisted config
- **React**: Agent activity, processing state, history, agent infos (via useState)
- **Phaser**: Agent positions, plants, day/night state, theme (game objects + tweens)

`GardenGame` class is the facade bridging React→Phaser. All Phaser mutations go through it.

### Garden Output
Plants grow when Claude Code agents create/modify files in the watched directory. The FileWatcher detects changes and triggers plant growth. Multiple directories can be active if agents target different paths.

File-agent correlation: When a Claude Code agent writes a file (detected via PostToolUse hook), the app records the agent ID and role in a 2-second TTL buffer. When the FileWatcher detects the new file, it enriches the event with the correlated agent info. Plants display a role-colored dot showing which agent created them.

### Hook Connection Status
The app tracks hook event timestamps to determine connection status:
- **Connected** (green): received a hook event within the last 60 seconds
- **Waiting** (yellow): hook server running but no recent events
- **Not configured** (gray): `~/.claude/settings.json` doesn't reference the hook server

### Setup UX
On first launch, the app checks if Claude Code hooks are configured. If not, a banner appears offering to auto-configure them. The HookSetupModal provides a 3-step wizard: view config snippet → auto-configure or manual setup → verify configuration.

## How to Run

```bash
npm install
npm start          # Build + launch
npm run dev        # Watch mode (then: npx electron . in another terminal)
```

Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed. On first launch, the app guides you through hook configuration.

## Tests

```bash
node test-all.js    # 231 tests (all passing)
```
