# Agent Garden - Architecture

## System Architecture

```
+-------------------------------------------------------------------+
|                        Electron Application                        |
|                                                                    |
|  +-----------------------------+  +-----------------------------+  |
|  |       Main Process          |  |     Renderer Process        |  |
|  |                             |  |                             |  |
|  |  +-------+   +-----------+ |  |  +--------+   +-----------+ |  |
|  |  | main  |   | IPC       | |  |  | React  |   | Phaser.js | |  |
|  |  | .ts   |<->| Bridge    |<-->|  | UI     |<->| Game      | |  |
|  |  +-------+   +-----------+ |  |  +--------+   +-----------+ |  |
|  |      |                     |  |  | TaskInput|  | GardenScene||  |
|  |      v                     |  |  | StreamLog|  | Agent      ||  |
|  |  +----------+              |  |  +--------+   | Plants     ||  |
|  |  | Services |              |  |                +-----------+ |  |
|  |  +----------+              |  |                             |  |
|  |  | Claude   |              |  +-----------------------------+  |
|  |  | Service  |              |                                    |
|  |  +----------+              |                                    |
|  |  | File     |              |                                    |
|  |  | Watcher  |              |                                    |
|  |  +----------+              |                                    |
|  +-----------------------------+                                   |
|                                                                    |
+----+-------------------------------------------+-------------------+
     |                                           |
     v                                           v
+----------+                              +-------------+
| Claude   |                              | Local File  |
| API      |                              | System      |
| (stream) |                              | (watched    |
+----------+                              |  directory) |
                                          +-------------+
```

## Data Flow

```
User types task
      |
      v
TaskInput (React) --submitTask()--> IPC send('task:submit')
      |
      v
Main Process receives IPC
      |
      v
ClaudeService.streamTask(prompt, onChunk)
      |
      |--- Demo mode (no API key): simulated word-by-word stream
      |--- Live mode: Claude Messages API with streaming
      |
      v (each chunk)
IPC send('agent:stream', { taskId, text, done })
      |
      v
App.tsx receives chunk
      |
      +---> setStreamText() -- updates stream log panel
      +---> GardenGame.onAgentThought(text)
                  |
                  v
            GardenScene.showThought(text) -- updates speech bubble
      |
      v (when done=true)
GardenGame.onTaskComplete()
      |
      v
GardenScene.completeTask()
      +---> growPlant() -- animated plant at agent's position
      +---> agent.walkTo(idle position)
```

### File System Events (parallel channel)

```
FileWatcher.start(directory)
      |
      v (on file change)
IPC send('file:event', { type, path })
      |
      v
App.tsx receives event via onFileEvent callback
      (currently wired in preload but not connected in main.ts)
```

## State Management

State is distributed across three layers with no shared store:

| Layer | State | Location | Mechanism |
|-------|-------|----------|-----------|
| **Main Process** | API key, active task streams | `ClaudeService` instance | Class instance fields |
| **React** | `streamText` (accumulated response) | `App.tsx` | `useState` hook |
| **Phaser** | Agent position, speech bubble visibility, plants | `GardenScene` | Phaser game objects + tweens |

Communication is **unidirectional**: Main -> Renderer via IPC events. The renderer sends commands back via `ipcRenderer.send()` (fire-and-forget).

There is no centralized state store (no Redux/Zustand). The `GardenGame` class acts as a facade, forwarding method calls from React into the Phaser scene. React and Phaser do not share state directly.

## Agent Orchestration

### Current (MVP - Single Agent)

```
                    +------------------+
                    |   Main Process   |
                    |                  |
User task --------> | ipcMain handler  |
                    |       |          |
                    |       v          |
                    | ClaudeService    |  (one instance, sequential tasks)
                    |   .streamTask()  |
                    +--------|---------+
                             |
                    IPC stream events
                             |
                             v
                    +------------------+
                    | Renderer         |
                    | One Agent sprite |
                    | walks + thinks   |
                    +------------------+
```

Tasks are processed **sequentially** -- a new `task:submit` IPC message triggers `streamTask()` which `await`s until the stream completes. No task queue exists; concurrent submissions would interleave stream chunks.

### Future (Multi-Agent)

Planned orchestration for multiple agents:

```
TaskQueue
  |
  +--> AgentPool
         |
         +--> Agent 1 (ClaudeService instance) --> "planter" role
         +--> Agent 2 (ClaudeService instance) --> "weeder" role (refactoring)
         +--> Agent 3 (ClaudeService instance) --> "tester" role
```

Each agent would get its own `ClaudeService` instance with a specialized system prompt. A `TaskRouter` would assign tasks to agents based on type. The renderer would track multiple `Agent` sprites, each bound to a backend agent ID.

## Claude API Integration Pattern

The integration lives in `src/main/services/claude.ts` and follows a **streaming callback** pattern:

```
ClaudeService
  |
  +--> constructor: reads ANTHROPIC_API_KEY from env
  |
  +--> streamTask(prompt, onChunk):
         |
         |-- No API key? --> Demo mode (simulated word stream)
         |
         |-- Has API key:
               |
               v
             new Anthropic({ apiKey })
               |
               v
             client.messages.stream({
               model: 'claude-sonnet-4-20250514',
               max_tokens: 4096,
               messages: [{ role: 'user', content: prompt }]
             })
               |
               v
             for await (event of stream):
               if content_block_delta + text_delta:
                 onChunk(event.delta.text, false)
               |
               v
             onChunk('', true)  // signal completion
```

Key design decisions:
- **Streaming over batch**: Uses `messages.stream()` for real-time speech bubble updates
- **Callback-based**: `onChunk(text, done)` rather than returning an async iterator, keeping the IPC forwarding simple
- **Lazy SDK import**: `require('@anthropic-ai/sdk')` only when API key is present
- **No conversation history**: Each task is a single-turn message (no memory between tasks)
- **No system prompt yet**: Raw user prompt is sent directly

## File System Watching Strategy

The watcher lives in `src/main/services/watcher.ts` and uses Node.js built-in `fs.watch`:

```
FileWatcher
  |
  +--> start(directory, onEvent):
  |      fs.watch(directory, { recursive: true })
  |        |
  |        +--> 'rename' event --> FileEvent { type: 'created', path }
  |        +--> 'change' event --> FileEvent { type: 'modified', path }
  |
  +--> stop():
         watcher.close()
```

### Current status

The `FileWatcher` class exists but is **not yet wired** into `main.ts`. The preload bridge exposes `onFileEvent` but no main process code sends `file:event` IPC messages.

### Planned integration

```
main.ts
  |
  +--> app.whenReady():
         |
         +--> FileWatcher.start(userSelectedDir, (event) => {
                mainWindow.webContents.send('file:event', event);
              })
         |
         v
Renderer receives file events --> GardenScene grows/updates plants
```

### Limitations of `fs.watch`

- Event types are coarse (`rename` vs `change` only) -- no native `deleted` detection
- On macOS with `recursive: true`, uses FSEvents (efficient)
- On Linux, `recursive: true` is not natively supported (needs `chokidar` for production)
- No debouncing -- rapid saves will fire multiple events
- No file content diffing -- watcher reports changes, not what changed

For production, replacing with `chokidar` would provide cross-platform recursive watching, `add`/`change`/`unlink` granularity, and built-in debouncing.

## Directory Structure

```
src/
  main/                     # Electron main process
    main.ts                 # App entry, window creation, IPC handlers
    preload.ts              # Context bridge (main <-> renderer)
    services/
      claude.ts             # Claude API streaming integration
      watcher.ts            # File system watcher
  renderer/                 # Electron renderer process
    index.html              # HTML shell
    index.tsx               # React entry point
    App.tsx                 # Root component, IPC listeners, game bridge
    components/
      TaskInput.tsx          # Task input form
    game/
      GardenGame.ts          # Phaser game wrapper (React <-> Phaser bridge)
      scenes/
        GardenScene.ts       # Main game scene (ground, plants, speech bubbles)
      sprites/
        Agent.ts             # Pixel art gardener sprite with walk animation
  shared/
    types.ts                 # Shared TypeScript interfaces (Task, AgentStreamChunk, FileEvent)
```
