# Agent Garden — Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Electron Application                          │
│                                                                      │
│  ┌────────────────────────────┐ preload.ts ┌───────────────────────┐ │
│  │      Main Process          │◄──────────►│  Renderer Process     │ │
│  │                            │            │                       │ │
│  │  main.ts                   │            │  React UI             │ │
│  │    ├ IPC handlers          │            │    ├ App.tsx          │ │
│  │    ├ auto-save timer       │            │    ├ TaskInput        │ │
│  │    └ stats tracking        │            │    ├ OutputPanel      │ │
│  │                            │            │    ├ StatsPanel       │ │
│  │  services/                 │            │    ├ AgentPanel       │ │
│  │    ├ HeadGardener          │            │    ├ ThemePicker      │ │
│  │    │  (orchestrator)       │            │    └ SetupWizard      │ │
│  │    ├ ClaudeCodeManager     │            │                       │ │
│  │    │  ├ spawn agents       │            │  Phaser Game          │ │
│  │    │  ├ detect sessions    │            │    ├ GardenScene      │ │
│  │    │  └ lifecycle mgmt     │            │    ├ Agent sprites    │ │
│  │    ├ HookServer (HTTP)     │            │    ├ DayNightCycle    │ │
│  │    ├ TaskRouter            │            │    ├ ThemeManager     │ │
│  │    ├ FileWatcher           │            │    └ TimeLapse        │ │
│  │    └ PersistenceService    │            │                       │ │
│  └────────────┬───────────────┘            └───────────────────────┘ │
└───────────────┼──────────────────────────────────────────────────────┘
                │
     ┌──────────┼──────────┐
     ▼          ▼          ▼
Claude Code   Claude Code   Local File System
Session 1     Session N     (watched directory)
(child proc   (detected
 or detected)  via hooks)
```

## Core Concept

Every agent in the garden is a **real Claude Code CLI session**. The app itself is the **Head Gardener** — an orchestrator that:
- Detects externally-started Claude Code sessions via hooks
- Spawns new Claude Code sessions as headless child processes
- Assigns roles (planter/weeder/tester) to each agent
- Delegates subtasks from high-level goals to available agents
- Monitors all agent activity and visualizes it in the garden

## Data Flow

### Agent Detection (External Sessions)
```
Claude Code CLI (user's terminal)
  → Hook fires (SessionStart, PreToolUse, PostToolUse, Stop, etc.)
  → POST to HookServer (localhost:7890)
  → ClaudeCodeTracker registers/updates session
  → IPC 'cc-agent:connected' / 'cc-agent:activity'
  → Renderer: new Agent sprite appears / animates in garden
```

### Agent Spawning (Orchestrated Sessions)
```
User submits goal → TaskInput → IPC 'task:submit'
  → HeadGardener: breaks goal into subtasks
  → TaskRouter: assigns subtask to role
  → ClaudeCodeManager: spawns `claude` child process with task prompt
  → Agent sprite appears in garden, walks to work zone
  → Hook events stream back activity in real-time
  → FileWatcher detects file changes → plants grow
  → On complete: agent walks home, sunshine weather
```

### Head Gardener Orchestration
```
HeadGardener:
  "Add auth with tests" →
    Subtask 1: "Create auth components"    → planter agent (spawn or assign)
    Subtask 2: "Write auth unit tests"     → tester agent (spawn or assign)

  "Fix the checkout bug" →
    Subtask 1: "Debug and fix checkout"    → weeder agent (spawn or assign)
```

### Role Assignment
```
TaskRouter (role assignment for Claude Code agents):
  "@weeder fix utils.ts"     → assign weeder role
  "write a test for..."      → assign tester role  (keyword: test)
  "refactor the login..."    → assign weeder role  (keyword: refactor)
  "create a component..."    → assign planter role  (default)

  Detected sessions: user can manually assign role, or auto-assign by activity
```

## State Management

No centralized store. State distributed across three layers:

| Layer | State | Mechanism |
|-------|-------|-----------|
| Main Process | Head Gardener state, agent sessions, task queues, stats, config | Class instances, JSON persistence |
| React | Agent activity, processing flag, history, agent infos | `useState` hooks |
| Phaser | Agent positions, plants, day/night, theme | Game objects + tweens |

`GardenGame` is the bridge: React calls its methods, which forward to `GardenScene`.

## IPC Events

| Direction | Event | Payload |
|-----------|-------|---------|
| Renderer → Main | `task:submit` | `{ prompt }` |
| Renderer → Main | `agent:spawn` | `{ role, directory?, prompt? }` |
| Renderer → Main | `agent:stop` | `{ agentId }` |
| Renderer → Main | `agent:set-role` | `{ agentId, role }` |
| Renderer → Main | `agent:open-terminal` | `{ agentId }` |
| Renderer → Main | `watcher:set-directory` | `{ path }` |
| Renderer → Main | `garden:save` | `{ plants, theme }` |
| Renderer → Main | `hooks:configure` | (auto-configure Claude Code hooks) |
| Main → Renderer | `cc-agent:connected` | `{ agentId, sessionId, directory }` |
| Main → Renderer | `cc-agent:activity` | `{ agentId, event, tool?, file? }` |
| Main → Renderer | `cc-agent:disconnected` | `{ agentId, reason }` |
| Main → Renderer | `cc-agent:spawned` | `{ agentId, role, prompt }` |
| Main → Renderer | `task:status` | `{ agentId, status, subtasks? }` |
| Main → Renderer | `file:event` | `{ type, path }` |
| Main → Renderer | `agent:error` | `{ agentId, message, type }` |
| Main → Renderer | `agents:updated` | `AgentInfo[]` |
| Main → Renderer | `stats:updated` | `GardenStats` |
| Main → Renderer | `garden:save-request` | (trigger auto-save) |

## Claude Code Integration

Two modes of integration:

### 1. Hook-Based Detection (external sessions)
```
HookServer listens on localhost:7890
  ← SessionStart:     register new agent
  ← UserPromptSubmit: show task in speech bubble
  ← PreToolUse:       walking animation, show tool name
  ← PostToolUse:      working animation, show result
  ← Stop:             complete task, walk home
  ← SessionEnd:       remove agent from garden
  ← Notification:     flash attention indicator
```

### 2. Spawned Child Processes (orchestrated sessions)
```
ClaudeCodeManager.spawn(role, prompt, directory?):
  → child_process.spawn('claude', ['--print', prompt], { cwd: directory })
  → stdout captured → streamed to garden UI
  → Hooks also fire → same visualization pipeline
  → On exit: mark agent as idle or remove
```

### Process Scanning (supplemental)
- Periodic `ps` scan (every 10s) detects `claude` processes
- Cross-references with hook data
- Shows unhooked sessions as "detected (no hooks)" with limited visualization
