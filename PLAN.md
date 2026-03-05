# Agent Garden - Implementation Plan

## Current State Assessment

What exists and works:
- Electron app shell with main/renderer process split
- Phaser.js game with garden scene, ground grid, path
- Single agent sprite with idle bob + walk animation
- Speech bubble that shows streaming text
- TaskInput component wired through IPC to ClaudeService
- ClaudeService with demo mode (simulated stream) and real Claude API streaming
- FileWatcher class (exists but **not connected**)
- Plant growth animation (triggers on task complete, not on file creation)

**The app runs but doesn't produce real output.** Claude generates text that displays in speech bubbles, but nothing is saved to disk. Plants grow as a visual reward but aren't tied to actual files.

---

## Phase 1: Complete the MVP Loop

Goal: A single agent that takes a task, generates code via Claude, saves it to disk, and the garden reacts to the new file.

### 1.1 Wire FileWatcher into Main Process
**Files:** `src/main/main.ts`, `src/main/services/watcher.ts`
- Start FileWatcher on app ready with a default watched directory (e.g., `~/agent-garden-output/`)
- Forward file events to renderer via `mainWindow.webContents.send('file:event', event)`
- Add IPC handler for `watcher:set-directory` so renderer can change the watched path
- Add debouncing (200ms) to avoid duplicate events from rapid writes

### 1.2 Save Generated Code to Files
**Files:** `src/main/main.ts`, `src/main/services/claude.ts`
- Add a system prompt to ClaudeService that instructs Claude to output code with file paths
- Parse Claude's response to extract filename + content (convention: first line `// filename: component.tsx`)
- Write extracted code to the watched directory using `fs.writeFile`
- Send file-save confirmation back to renderer via IPC

### 1.3 Connect File Events to Plant Growth
**Files:** `src/renderer/App.tsx`, `src/renderer/game/GardenGame.ts`, `src/renderer/game/scenes/GardenScene.ts`
- Listen for `file:event` in App.tsx (already exposed in preload)
- On `created` event: grow a new plant at a deterministic position (hash filename to x-coordinate)
- On `modified` event: animate existing plant (pulse/shimmer effect)
- Track file-to-plant mapping so plants represent real files

### 1.4 Directory Picker UI
**Files:** `src/main/main.ts`, `src/main/preload.ts`, `src/shared/types.ts`, new: `src/renderer/components/DirectoryPicker.tsx`
- Add IPC handler that opens Electron's native `dialog.showOpenDialog` for folder selection
- Expose `selectDirectory()` in preload bridge
- Add a small UI element showing the current watched directory with a change button
- Persist selected directory in `electron-store` or a simple JSON config

### 1.5 Task Queue (prevent interleaving)
**Files:** `src/main/main.ts`
- Add a simple queue: if a task is in-progress, queue the next one
- Send task status (`pending` / `in-progress` / `complete` / `error`) to renderer
- Disable the submit button while a task is streaming

---

## Phase 2: Polish the Single-Agent Experience

Goal: Make the MVP feel complete and enjoyable to use.

### 2.1 Improve Agent Visuals
**Files:** `src/renderer/game/sprites/Agent.ts`
- Add walking animation (leg movement via tween)
- Add "working" animation (tool swinging or digging motion while streaming)
- Add idle animation variety (look around, stretch)
- Visual indicator for agent state (color tint or icon)

### 2.2 Better Plant Variety
**Files:** `src/renderer/game/scenes/GardenScene.ts`
- Map file types to plant types (`.tsx` = flower, `.ts` = tree, `.css` = bush, `.test.*` = mushroom)
- Plant size based on file size / line count
- Add simple particle effects (leaves, sparkles) on plant creation
- Plants should persist across app restarts (store garden state in JSON)

### 2.3 Richer Speech Bubbles
**Files:** `src/renderer/game/scenes/GardenScene.ts`
- Auto-size bubble to content
- Show summarized thought (first comment or function name) instead of raw stream tail
- Add a small tail/pointer from bubble to agent
- Fade out animation instead of abrupt hide

### 2.4 Stream Output Panel
**Files:** `src/renderer/App.tsx`, new: `src/renderer/components/OutputPanel.tsx`
- Collapsible panel showing full generated code with syntax highlighting
- Show which file was created and its path
- Copy-to-clipboard button
- History of past task outputs

### 2.5 Error Handling & API Key Setup
**Files:** `src/main/services/claude.ts`, `src/renderer/App.tsx`
- First-run modal to enter API key (store securely via `safeStorage`)
- Graceful handling of rate limits, network errors, invalid key
- Agent shows distress animation on error (wilted plant?)
- Retry button for failed tasks

---

## Phase 3: Multi-Agent & Garden Zones

Goal: Multiple agents working simultaneously on different parts of the codebase.

### 3.1 Agent Pool & Task Router
**Files:** new: `src/main/services/agent-pool.ts`, `src/main/services/task-router.ts`
- `AgentPool` manages multiple `ClaudeService` instances (configurable count, default 3)
- Each agent has a role/specialty defined by its system prompt
- `TaskRouter` assigns tasks based on keywords or explicit user choice
- Agents stream independently; IPC events include `agentId`

### 3.2 Multiple Agent Sprites
**Files:** `src/renderer/game/scenes/GardenScene.ts`, `src/renderer/game/sprites/Agent.ts`
- Spawn multiple agents at different home positions
- Each agent has a unique color/hat to distinguish them
- Agents walk to their own work zones
- Prevent agents from overlapping (simple collision avoidance)

### 3.3 Garden Sections
**Files:** `src/renderer/game/scenes/GardenScene.ts`
- Divide garden into zones: frontend, backend, tests, config
- Map file paths to zones (e.g., `src/components/*` -> frontend zone)
- Visual borders/signs between zones
- Agents walk to the correct zone for their task

### 3.4 Context Window Visualization
**Files:** `src/renderer/game/sprites/Agent.ts`, `src/shared/types.ts`
- Track token usage per agent from Claude API response
- Visual backpack on agent that fills up as context grows
- Color changes as context approaches limit (green -> yellow -> red)
- "Pruning" animation when context is cleared

---

## Phase 4: Delight & Advanced Features

### 4.1 Day/Night Cycle & Weather
- Time-based background changes
- Rain when tests fail, sunshine when they pass
- Seasonal themes

### 4.2 Time-Lapse Recording
- Record garden state snapshots over time
- Playback showing garden growing as codebase evolves
- Export as GIF or video

### 4.3 Custom Themes
- Theme configuration (desert, zen garden, underwater, space)
- Custom color palettes
- Theme-appropriate plant and agent sprites

### 4.4 Garden Persistence & Stats
- Save/load garden state
- Dashboard: files created, tokens used, tasks completed
- "Garden health" score based on test pass rate, lint results

---

## Task Priority & Dependencies

```
Phase 1 (MVP Loop)                     Phase 2 (Polish)
========================               ========================
1.1 Wire FileWatcher ----+             2.1 Agent Visuals
1.2 Save Code to Files --+--> 1.3      2.2 Plant Variety
                          |             2.3 Speech Bubbles
                          +--> 1.4      2.4 Output Panel
                          |             2.5 Error Handling
                          +--> 1.5
                                            |
                                            v
                                       Phase 3 (Multi-Agent)
                                       ========================
                                       3.1 Agent Pool ----+
                                       3.2 Multi Sprites --+--> 3.3
                                                           +--> 3.4
                                            |
                                            v
                                       Phase 4 (Delight)
```

## Immediate Next Steps

1. **1.1** - Wire FileWatcher in `main.ts` (15 lines of code, unblocks the whole loop)
2. **1.2** - Add system prompt + file saving to ClaudeService
3. **1.3** - Connect file events to plant growth in GardenScene
4. **1.5** - Add task queue to prevent stream interleaving

These four items close the core loop: task -> Claude -> file -> plant.
