# Agent Garden

A visual desktop orchestrator for Claude Code agents. Pixel-art gardeners represent real Claude Code CLI sessions working on your codebase. The app is the **Head Gardener** — it detects, spawns, assigns, coordinates, and monitors Claude Code agents.

![Electron](https://img.shields.io/badge/Electron-40-blue)
![React](https://img.shields.io/badge/React-19-blue)
![Phaser](https://img.shields.io/badge/Phaser-3-green)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-purple)

## How It Works

1. You open a project directory in Agent Garden
2. The Head Gardener (orchestrator) detects running Claude Code sessions or spawns new ones
3. Each Claude Code agent appears as a pixel-art gardener with a designated role (planter, weeder, tester)
4. As agents work, you see their activity in real-time — speech bubbles, tool use, file edits
5. Plants grow as files are created/modified — the garden is a live visualization of your codebase
6. Submit high-level goals and the Head Gardener delegates subtasks to available agents

**Plants = files. Garden = codebase. Gardeners = Claude Code sessions. Head Gardener = orchestrator.**

## Setup

```bash
git clone https://github.com/3-rt/agent-garden.git
cd agent-garden
npm install
```

Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured.

## Running

```bash
npm start          # Build and launch
npm run dev        # Watch mode (then: npx electron . in another terminal)
```

The app auto-detects running Claude Code sessions via hooks and process scanning. To enable hook integration, configure your `~/.claude/settings.json` to POST events to `http://localhost:7890/hooks/<EventType>`.

## Testing

```bash
node test-all.js  # 172 tests
```

## Docs

- [CURRENT-STAGE.md](CURRENT-STAGE.md) — Comprehensive project reference (architecture, file structure, implementation details)
- [ARCHITECTURE.md](ARCHITECTURE.md) — System diagrams and data flow
- [PLAN.md](PLAN.md) — Phase implementation plan

## License

MIT
