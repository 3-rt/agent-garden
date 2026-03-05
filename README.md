# Agent Garden

A visual desktop app where AI agents (powered by Claude API) are pixel art gardeners working in a garden that represents your codebase. Watch them work in real-time on actual development tasks.

![Electron](https://img.shields.io/badge/Electron-40-blue)
![React](https://img.shields.io/badge/React-19-blue)
![Phaser](https://img.shields.io/badge/Phaser-3-green)
![Claude API](https://img.shields.io/badge/Claude_API-streaming-purple)

## How It Works

1. You type a task like "Create a React login component"
2. A pixel art gardener agent walks to a work area in the garden
3. The agent calls Claude API — you see its thoughts in a speech bubble
4. As code streams in, a plant grows in real-time
5. The generated file is saved to your watched directory
6. The agent returns to idle, and the garden has a new plant

**Plants = files. Garden = your codebase. Agents = Claude instances.**

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- An [Anthropic API key](https://console.anthropic.com/) (optional — runs in demo mode without one)

## Setup

```bash
git clone https://github.com/3-rt/agent-garden.git
cd agent-garden
npm install
```

## Running

```bash
# Build and launch
npm start

# Development (watch mode for rebuilds)
npm run dev
# Then in another terminal:
npx electron .
```

To enable Claude API integration, set your API key:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Without an API key, the app runs in **demo mode** with simulated streaming responses.

## Project Structure

```
src/
  main/                          # Electron main process
    main.ts                      # App entry, window creation, IPC handlers
    preload.ts                   # Context bridge (main <-> renderer)
    services/
      claude.ts                  # Claude API streaming integration
      watcher.ts                 # File system watcher
  renderer/                      # Electron renderer process
    index.html                   # HTML shell
    index.tsx                    # React entry point
    App.tsx                      # Root component, IPC listeners, game bridge
    components/
      TaskInput.tsx              # Task input form
    game/
      GardenGame.ts              # Phaser game wrapper (React <-> Phaser bridge)
      scenes/
        GardenScene.ts           # Main game scene (ground, plants, speech bubbles)
      sprites/
        Agent.ts                 # Pixel art gardener sprite with walk animation
  shared/
    types.ts                     # Shared TypeScript interfaces
```

## Architecture

The app is split across Electron's two-process model:

- **Main process** — Node.js backend handling Claude API calls and file system access
- **Renderer process** — React UI + Phaser.js game engine for the garden visualization
- **IPC bridge** — Preload script exposes a typed API between the two processes

Communication is unidirectional: the renderer sends task commands, the main process streams results back as IPC events.

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed diagrams and data flow.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop shell | Electron | Window management, native OS access |
| UI components | React 19 | Task input, output panel, controls |
| Game engine | Phaser 3 | 2D rendering, sprite animation, tweens |
| AI backend | Claude API | Code generation via streaming |
| Build | Webpack 5 | Multi-target bundling (main + preload + renderer) |
| Language | TypeScript | Type safety across all layers |

## Roadmap

See [PHASES.md](PHASES.md) for the full implementation plan.

- **Phase 1** — Complete the MVP loop (file saving, file watcher wiring, plant-file mapping)
- **Phase 2** — Polish (better visuals, error handling, API key setup UI)
- **Phase 3** — Multi-agent with roles (planter, weeder, tester) and garden zones
- **Phase 4** — Delight (day/night cycle, time-lapse recording, custom themes)

## Docs

- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — Vision, metaphor, and feature list
- [ARCHITECTURE.md](ARCHITECTURE.md) — System diagrams, data flow, state management
- [PLAN.md](PLAN.md) — Implementation plan with current state assessment
- [PHASES.md](PHASES.md) — Detailed task breakdown for all phases
- [VISUAL_STYLE.md](VISUAL_STYLE.md) — Pixel art style guide
- [AGENT_BEHAVIORS.md](AGENT_BEHAVIORS.md) — Agent states and movement specs

## License

MIT
