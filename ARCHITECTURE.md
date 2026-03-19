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
│  │    ├ auto-save timer       │            │    ├ DirectoryPicker  │ │
│  │    └ stats tracking        │            │    ├ StatsPanel       │ │
│  │                            │            │    ├ ThemePicker      │ │
│  │                            │            │    ├ ActivityLogPanel │ │
│  │  services/                 │            │    └ Goal input bar   │ │
│  │    ├ HeadGardener          │            │                       │ │
│  │    │  (orchestrator)       │            │                       │ │
│  │    ├ ClaudeCodeManager     │            │                       │ │
│  │    │  └ spawn/stop agents  │            │  Phaser Game          │ │
│  │    ├ InitialGardenGenerator│            │    ├ plant-clusters   │ │
│  │    ├ ClaudeCodeTracker     │            │    ├ GardenGame       │ │
│  │    ├ HookServer (HTTP)     │            │    │  └ Canvas renderer│ │
│  │    ├ ProcessScanner        │            │    ├ GardenScene      │ │
│  │    ├ TaskRouter            │            │    │  └ resize rebuild │ │
│  │    ├ FileWatcher           │            │    ├ Agent sprites    │ │
│  │    └ PersistenceService    │            │    ├ DayNightCycle    │ │
│  │                            │            │    ├ ThemeManager     │ │
│  │                            │            │    └ TimeLapse        │ │
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
User submits goal → Goal input bar → IPC 'head-gardener:submit-goal'
  → HeadGardener: decomposes goal into subtasks (splits on "and"/"with"/"then")
  → TaskRouter: assigns each subtask to a role
  → ClaudeCodeManager: spawns `claude --print <prompt>` child process per subtask
  → Agent sprite appears in garden, walks to work zone
  → stdout streamed to speech bubbles in real-time
  → FileWatcher detects file changes → plants grow
  → On exit: subtask marked complete/error, agent walks home, sunshine weather
```

### Initial Garden Generation
```
User opens directory
  → initial-garden-generator scans repo files
  → score/filter important paths by zone + directory
  → shared/garden-bed-layout derives bed count and assigns groups to beds
  → persisted GardenLayoutState stores both plants and beds
  → renderer restores the layout and plant-clusters decides which visible plants to merge
```

### Activity Log
```
Hook events / file events / plan updates
  → renderer/activity-log.ts normalizes entries
  → ActivityLogPanel renders filterable history
  → agent/file/plan scopes stay correlated with live garden state
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
| React | Agent activity, plans, activity log filters/history, agent infos | `useState` hooks |
| Phaser | Canonical plant state, canonical bed state, rendered plant layer, agent positions, day/night, theme | Game objects + tweens |

`GardenGame` is the bridge: React calls its methods, which forward to `GardenScene`.

Important renderer detail:
- `GardenScene.plantPositions` stores the source-of-truth plant state
- `GardenScene.gardenBeds` stores persisted bed layout state
- `GardenScene.plantMap` stores disposable rendered containers
- `plant-clusters.ts` derives the visible plant layer from raw per-file state, including bed-aware merged plants
- Window resize / restore rebuilds the ground and plant layer from canonical state so Electron minimize/restore does not leave blank or horizontally squashed plants

## IPC Events

| Direction | Event | Payload |
|-----------|-------|---------|
| Renderer → Main | `head-gardener:submit-goal` | `goal: string` |
| Renderer → Main | `head-gardener:get-plans` | (returns `OrchestrationPlan[]`) |
| Renderer → Main | `cc-agent:spawn` | `role, prompt?, directory?` |
| Renderer → Main | `cc-agent:stop` | `sessionId` |
| Renderer → Main | `cc-agent:set-role` | `sessionId, role` |
| Renderer → Main | `cc-agent:open-terminal` | `sessionId` |
| Renderer → Main | `cc-agent:detect-claude` | (returns `boolean`) |
| Renderer → Main | `cc-agents:list` | (returns `CCAgentSession[]`) |
| Renderer → Main | `dialog:select-directory` | (opens native dialog) |
| Renderer → Main | `directory:add` | (opens dialog, returns `string \| null`) |
| Renderer → Main | `directory:remove` | `dir: string` |
| Renderer → Main | `directory:list` | (returns `{ primary, additional[] }`) |
| Renderer → Main | `garden:save` | `GardenLayoutState, theme` |
| Renderer → Main | `garden:set-theme` | `themeId` |
| Main → Renderer | `cc-agent:connected` | `CCAgentSession` |
| Main → Renderer | `cc-agent:activity` | `{ agentId, event, tool?, file?, prompt? }` |
| Main → Renderer | `cc-agent:disconnected` | `{ agentId, reason }` |
| Main → Renderer | `cc-agent:spawned` | `{ agentId, sessionId, role, directory, prompt? }` |
| Main → Renderer | `cc-agent:output` | `{ agentId, sessionId, text }` |
| Main → Renderer | `cc-agent:exited` | `{ agentId, sessionId, code }` |
| Main → Renderer | `head-gardener:plan-created` | `OrchestrationPlan` |
| Main → Renderer | `head-gardener:subtask-updated` | `{ planId, subtask }` |
| Main → Renderer | `head-gardener:plan-completed` | `OrchestrationPlan` |
| Main → Renderer | `file:event` | `{ type, path }` |
| Main → Renderer | `directory:changed` | `dir: string` |
| Main → Renderer | `directories:updated` | `{ primary: string, additional: string[] }` |
| Main → Renderer | `stats:updated` | `GardenStats` |
| Main → Renderer | `garden:request-save` | (trigger auto-save) |

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
- Periodic `ps` scan (every 5s) detects `claude` processes
- Cross-references with hook data
- Shows unhooked sessions as "detected (no hooks)" with limited visualization
