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

Communication: renderer sends commands (`task:submit`, `agent:spawn`, `agent:set-role`), main manages Claude Code sessions and streams results back via IPC events.

## File Structure

```
src/
  main/
    main.ts                    # App entry, window, all IPC handlers, auto-save timer
    preload.ts                 # Context bridge — typed API between processes
    services/
      head-gardener.ts         # Orchestrator: decomposes goals, delegates to agents
      claude-code-manager.ts   # Spawns/stops Claude Code child processes
      claude-code-tracker.ts   # Tracks active sessions (hook data + process scanning)
      hook-server.ts           # HTTP server on :7890, receives Claude Code hook POSTs
      task-router.ts           # Routes subtasks to roles by keyword/intent
      watcher.ts               # fs.watch with 200ms debounce, creates dir if missing
      persistence.ts           # Save/load garden state (plants, stats, theme) to JSON
  renderer/
    index.html                 # HTML shell with CSP (includes 'unsafe-eval' for Phaser)
    index.tsx                  # React DOM entry
    App.tsx                    # Root component — IPC listeners, game bridge, state
    components/
      TaskInput.tsx            # Text input for high-level goals
      AgentPanel.tsx           # Agent management: list, roles, spawn, stop
      DirectoryPicker.tsx      # Shows/changes watched directory
      OutputPanel.tsx          # Collapsible code output + history
      SetupWizard.tsx          # First-run Claude Code hook configuration
      StatsPanel.tsx           # Bottom bar: agents, plants, tasks, uptime
      ThemePicker.tsx          # Theme dropdown (5 themes)
    game/
      GardenGame.ts            # Phaser game wrapper (React <-> Phaser bridge)
      scenes/
        GardenScene.ts         # Main scene: ground grid, path, zones, agents, plants
      sprites/
        Agent.ts               # Pixel-art agent: body, hat, legs, arms, backpack, speech bubble
      systems/
        DayNightCycle.ts       # 2-min cycle (dawn/day/dusk/night), weather (rain/sunshine)
        ThemeManager.ts        # 5 themes with listener pattern for live switching
        TimeLapse.ts           # Snapshots every 10s, max 200, export/import JSON
  shared/
    types.ts                   # All shared interfaces
```

## Implementation Status

### Phases 1–4 — Garden Foundation ✅
Built the visual garden, sprite system, animations, and rendering pipeline:
- FileWatcher detects file changes → plants grow in garden (file→plant mapping)
- Agent sprites with walk/work animations, state machine, speech bubbles
- Plant variety by file extension, particle effects
- Garden zones (Frontend/Backend/Tests) with signs and dividers
- Day/night cycle, weather (rain on errors, sunshine on success)
- 5 themes (Garden, Desert, Zen, Underwater, Space)
- Time-lapse snapshots, persistence, stats panel

*Note: Phases 1–4 used built-in API agents as placeholders. Phase 5 replaces them with real Claude Code sessions.*

### Phase 5 — Head Gardener (Claude Code Orchestration) 🔲
Current focus. Transforms the app into a Claude Code orchestrator:

- **5a: Hook Listener Server** — HTTP server on :7890 receives Claude Code hook events (SessionStart, PreToolUse, PostToolUse, Stop, etc.)
- **5b: Process Scanning** — Supplemental `ps` scanning to detect Claude Code processes without hooks
- **5c: Agent Sprites & Roles** — Each Claude Code session gets a gardener sprite; user assigns roles (planter/weeder/tester)
- **5d: Spawning & Lifecycle** — Spawn headless Claude Code agents from the UI, "open in terminal" to attach
- **5e: Head Gardener (Orchestrator)** — Decomposes high-level goals into subtasks, delegates to available agents by role
- **5f: Directory Management** — Shared default directory with per-agent overrides
- **5g: Garden Integration** — Plants, stats, weather all driven by real Claude Code activity
- **5h: Setup UX** — Wizard to auto-configure Claude Code hooks, agent management panel

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

### Spawned vs. Detected Agents
- **Spawned**: launched by the app as child processes, full control (stop, restart, role pre-assigned)
- **Detected**: externally-started sessions discovered via hooks or `ps`, observe-only until hooks configured

### State Management
No centralized store. State is distributed:
- **Main process**: Head Gardener state, Claude Code sessions, task queues, stats, persisted config
- **React**: Agent activity, processing state, history, agent infos (via useState)
- **Phaser**: Agent positions, plants, day/night state, theme (game objects + tweens)

`GardenGame` class is the facade bridging React→Phaser. All Phaser mutations go through it.

### Garden Output
Plants grow when Claude Code agents create/modify files in the watched directory. The FileWatcher detects changes and triggers plant growth. Multiple directories can be active if agents target different paths.

## How to Run

```bash
npm install
npm start          # Build + launch
npm run dev        # Watch mode (then: npx electron . in another terminal)
```

Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed. On first launch, the app guides you through hook configuration.

## Tests

```bash
node test-all.js    # 172 tests covering phases 1–4
```
