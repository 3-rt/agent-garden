# Agent Garden - Phase Outline

## Phase 1: Complete the MVP Loop

Close the core cycle: user task -> Claude generates code -> file saved to disk -> plant grows in garden.

### 1.1 Wire FileWatcher into Main Process
- Import `FileWatcher` in `main.ts` and start it on `app.whenReady()`
- Default watched directory: `~/agent-garden-output/` (create if missing)
- Forward file events to renderer: `mainWindow.webContents.send('file:event', event)`
- Add `watcher:set-directory` IPC handler to change watched path at runtime
- Debounce events (200ms) to prevent duplicate triggers on rapid writes
- Call `watcher.stop()` on `window-all-closed`

### 1.2 Save Generated Code to Files
- Add system prompt to `ClaudeService` instructing Claude to output code with a filename header
- Define filename convention: first line of response as `// @file: <filename>`
- Accumulate full streamed response in `streamTask`, parse filename + content on completion
- Write parsed file to watched directory via `fs.writeFile`
- In demo mode (no API key), generate a sample file with the same convention
- Send `file:saved` IPC event to renderer with `{ path, filename }` on successful write

### 1.3 Connect File Events to Plant Growth
- In `App.tsx`, add `window.electronAPI.onFileEvent()` listener inside existing `useEffect`
- Add `onFileCreated(filename)` method to `GardenGame` -> forwards to `GardenScene`
- Add `onFileModified(filename)` method to `GardenGame` -> forwards to `GardenScene`
- In `GardenScene`, maintain a `Map<string, Phaser.GameObjects.Container>` mapping filenames to plants
- On `created`: call `growPlant()` at a deterministic x position (hash filename to grid column)
- On `modified`: pulse/shimmer the existing plant (brief scale tween)
- Remove the current `growPlant()` call from `completeTask()` (plants now grow from file events, not task completion)

### 1.4 Directory Picker UI
- Add IPC handler in `main.ts` using `dialog.showOpenDialog({ properties: ['openDirectory'] })`
- Expose `selectDirectory(): Promise<string | null>` in preload bridge (use `ipcRenderer.invoke`)
- Add `onDirectoryChanged` callback in preload for main process to notify renderer
- Create `DirectoryPicker.tsx` component: shows current path + "Change" button
- Place it in the bottom bar next to `TaskInput`
- Store selected directory in a JSON config file at `app.getPath('userData')/config.json`
- Load persisted directory on startup; fall back to default if missing

### 1.5 Task Queue
- Add `taskQueue: string[]` and `isProcessing: boolean` in `main.ts`
- On `task:submit`: if processing, push to queue; otherwise start immediately
- On stream completion: shift next task from queue and process, or set `isProcessing = false`
- Send `task:status` IPC events (`{ taskId, status: 'queued' | 'in-progress' | 'complete' | 'error' }`)
- In `TaskInput.tsx`, accept `disabled` prop; `App.tsx` passes `disabled={isProcessing}`
- Show queued task count in the UI (small badge or text)

---

## Phase 2: Polish the Single-Agent Experience

Make the MVP feel complete, handle errors, and improve visuals.

### 2.1 Improve Agent Visuals
- Add left/right leg rectangles to `Agent` constructor
- Animate legs alternating up/down during `walkTo` (tween on leg y-offset)
- Add "working" state: tool-swinging motion (small rectangle arm tween) while streaming
- Add state enum to Agent: `idle | walking | working | returning`
- Tint agent slightly based on state (green idle, yellow working, blue returning)
- Stop idle bob during walk, restart on arrival

### 2.2 Better Plant Variety
- Define plant type mapping: `{ '.tsx': 'flower', '.ts': 'tree', '.css': 'bush', '.json': 'cactus', '.test.*': 'mushroom' }`
- Each type gets distinct shape: flower (stem + circle top), tree (rectangle trunk + triangle crown), bush (wide ellipse), mushroom (stem + dome)
- Scale plant height by file line count (pass line count in `FileEvent` or estimate from content length)
- Add particle burst on plant creation: 3-5 small circles that fly out and fade
- Store plant registry in `garden-state.json` at userData path
- On app start, recreate plants from stored registry (skip growth animation, show fully grown)

### 2.3 Richer Speech Bubbles
- Replace fixed-width rectangle with dynamically-sized nine-slice or auto-width rectangle
- Measure text width with `Phaser.GameObjects.Text.width` and resize background to fit + padding
- Add triangle pointer at bottom of bubble pointing to agent
- Extract meaningful snippet from stream: show first function/class name found, or first comment line
- On `completeTask`: fade out bubble over 500ms (alpha tween) instead of instant hide after delay
- Cap bubble text at 60 chars with ellipsis

### 2.4 Stream Output Panel
- Create `OutputPanel.tsx`: collapsible panel between game canvas and task input bar
- Toggle open/close with a "Code" button or chevron
- Display accumulated `streamText` with monospace font and dark background
- After task completes, show filename header (from `file:saved` event) above the code
- Add "Copy" button that writes `streamText` to clipboard via `navigator.clipboard.writeText`
- Keep history array of past outputs: `{ taskId, prompt, code, filename, timestamp }[]`
- Show history as a scrollable list of collapsible entries
- Limit history to 50 entries in memory

### 2.5 Error Handling & API Key Setup
- On first launch (no API key in env or config), show modal overlay in React
- Modal has a text input for API key, "Save" button, and "Use Demo Mode" link
- Save API key using Electron's `safeStorage.encryptString()`, store encrypted value in config
- On app start, read and decrypt key; pass to `ClaudeService`
- Add `setApiKey(key)` IPC handler so renderer can update key at runtime
- In `ClaudeService.streamTask`, catch specific errors:
  - `401`: invalid key -> send `agent:error` with message, show key setup modal
  - `429`: rate limited -> send `agent:error`, auto-retry after `retry-after` header seconds
  - Network error: send `agent:error` with "No connection" message
- Agent plays error animation on failure: turns red briefly, droops (y-offset tween down)
- Show error text in speech bubble with red tint
- Add "Retry" button in output panel for failed tasks

---

## Phase 3: Multi-Agent & Garden Zones

Multiple agents working simultaneously with specialized roles and garden areas.

### 3.1 Agent Pool & Task Router
- Create `AgentPool` class in `src/main/services/agent-pool.ts`
- Pool holds array of `{ id, role, claude: ClaudeService, busy: boolean }`
- Each agent's `ClaudeService` gets a role-specific system prompt:
  - Planter: "You create new code files. Output clean, well-structured code."
  - Weeder: "You refactor and improve existing code. Read the file first, then output improved version."
  - Tester: "You write test files for existing code."
- Configurable pool size (default 3, max 5)
- Create `TaskRouter` class in `src/main/services/task-router.ts`
- Router picks agent by keyword matching: "test" -> tester, "refactor"/"clean" -> weeder, default -> planter
- User can also prefix task with agent name: `@weeder clean up utils.ts`
- If chosen agent is busy, queue task for that specific agent
- All IPC events now include `agentId` field
- Update `AgentStreamChunk` and `Task` types with `agentId`

### 3.2 Multiple Agent Sprites
- Modify `GardenScene` to hold `Map<string, Agent>` instead of single agent
- Spawn agents at different home positions along the path (evenly spaced)
- Give each agent a unique hat color based on role:
  - Planter: green hat (current)
  - Weeder: orange hat
  - Tester: blue hat
- Add name label below each agent (small text showing role)
- Each agent has independent speech bubble (move bubble into `Agent` class)
- Walk targets offset by agent index to prevent overlapping
- Simple collision avoidance: if target x is within 40px of another agent, offset by 50px

### 3.3 Garden Sections
- Divide garden width into zones: left = frontend, center = backend, right = tests
- Draw zone labels at top of each section
- Add visual dividers: different ground color or fence sprites between zones
- Map file paths to zones:
  - `**/components/**`, `**/*.tsx`, `**/*.css` -> frontend zone
  - `**/services/**`, `**/api/**`, `**/*.ts` (non-test) -> backend zone
  - `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**` -> tests zone
- Plants grow in their zone's x-range
- Agents walk to the matching zone for their task
- Add small sign sprites at zone boundaries with zone names

### 3.4 Context Window Visualization
- Track token usage from Claude API response metadata (`usage.input_tokens`, `usage.output_tokens`)
- Add cumulative token count per agent in `AgentPool`
- In `Agent` sprite, add backpack shape (small rectangle on back)
- Backpack fill level = `totalTokens / maxContextTokens` (use model's max as denominator)
- Color gradient: green (< 25%) -> yellow (25-50%) -> orange (50-75%) -> red (> 75%)
- Animate fill change smoothly (tween on fill height)
- Add "Prune" button per agent: resets conversation history and token count
- Pruning animation: backpack empties, small leaf particles fly off
- Show token count tooltip on hover/click of agent

---

## Phase 4: Delight & Advanced Features

### 4.1 Day/Night Cycle & Weather
- Track elapsed real time or use system clock hour
- Gradually shift background color: dawn (warm orange), day (green), dusk (purple), night (dark blue)
- Add star particles at night, sun circle during day
- Weather tied to events:
  - Rain particles when a task errors (gray overlay + falling blue dots)
  - Sunshine burst when task completes successfully (yellow rays from top)
  - Wind (leaves blowing) when files are deleted
- Weather particles using Phaser's built-in particle emitter
- Add weather toggle in settings to disable if distracting

### 4.2 Time-Lapse Recording
- Capture garden state snapshot every N seconds (configurable, default 30s)
- Snapshot = serialized plant positions, agent positions, zone layout
- Store snapshots in `garden-history.json` (cap at 1000 entries, ~24hrs at 30s interval)
- Playback mode: overlay timeline slider, replay snapshots as animation
- Speed controls: 1x, 5x, 10x, 50x
- Export: render snapshots to offscreen canvas, compile frames to GIF using `gif.js` library
- Export button in settings panel
- Show timestamp and task count in playback overlay

### 4.3 Custom Themes
- Define theme interface: `{ name, groundColors, pathColor, plantPalette, agentColors, backgroundColor, particleColors }`
- Built-in themes:
  - Classic Garden (current green, default)
  - Desert (sand tones, cacti instead of plants, brown path)
  - Zen Garden (gray gravel, bonsai plants, stone path, minimal palette)
  - Underwater (blue tones, coral/seaweed as plants, bubble particles)
  - Space (dark background, crystal plants, asteroid path, star particles)
- Theme selector dropdown in settings panel
- Apply theme by swapping color values in `GardenScene.create()` and plant factory
- Store selected theme in config
- Allow custom theme JSON import (user provides their own color scheme)

### 4.4 Garden Persistence & Stats
- Save complete garden state on app quit and every 60 seconds:
  - Plant registry (filename, type, position, size, zone)
  - Agent states (role, token count, task history)
  - Watched directory path
  - Selected theme
- Load and restore on startup (plants appear instantly, agents at home positions)
- Stats dashboard panel (toggleable overlay):
  - Total files created / modified
  - Total tasks completed / failed
  - Total tokens consumed (input + output, with cost estimate)
  - Most active zone
  - Largest plant (biggest file)
  - Garden age (time since first task)
- "Garden health" composite score:
  - +points for test files created
  - +points for small, focused files
  - -points for error rate
  - -points for very large files
  - Display as a flower/tree health meter (green = healthy, brown = unhealthy)
- Export stats as JSON or markdown report
