# Agent Garden

Electron desktop app that visualizes and orchestrates Claude Code CLI agents as pixel-art gardeners in a 2D garden. Plants = files, gardeners = Claude Code sessions.

## Build & Run

```bash
npm install
npm start              # Build + launch Electron app
npm run dev            # Webpack watch mode (then: npx electron . separately)
```

## Testing

```bash
npx tsc --outDir test-build --skipLibCheck && node test-all.js
```

All tests are in `test-all.js` (single file, no framework). Currently 334 tests.

## Architecture

Two-process Electron model:
- **Main process** (`src/main/`): IPC handlers, services (hook-server, tracker, process-scanner, initial-garden-generator, claude-code-manager, head-gardener, persistence, watcher)
- **Renderer process** (`src/renderer/`): React UI (App.tsx, ActivityLogPanel, activity-log helpers) + Phaser 3 game (GardenScene, plant-clusters)
- **Shared types** (`src/shared/types.ts`): All interfaces shared between processes
- **Shared layout** (`src/shared/garden-bed-layout.ts`): zone bed counts, ranking, assignment, and scatter placement
- **Bridge**: `preload.ts` exposes typed `window.electronAPI`, `GardenGame.ts` bridges React to Phaser

## Key Conventions

- TypeScript strict mode, all layers
- No test framework — plain `assert()` in `test-all.js`
- Phaser 3 requires `'unsafe-eval'` in CSP (`index.html`)
- Phaser runs in Canvas mode with HiDPI support (`Scale.NONE` + `dpr` camera zoom); `GardenScene` rebuilds static chrome and rendered plants on resize/restore for Electron stability
- Garden layout persists both per-file plant state and per-zone bed state
- Ground rendering uses colored rectangles (not sprite tiles)
- State is distributed: main process (services), React (useState), Phaser (game objects)
- No centralized store — IPC events flow main→renderer
- Persistence: auto-save every 30s + on quit (plants, beds, stats, theme)

## Code Style

- 2-space indentation
- Single quotes for strings
- No semicolons omitted (use them)
- Prefer `const` over `let`
- Inline styles in React components (no CSS modules)

## Git

- Do not add Co-Authored-By lines to commits
- Commit messages: `feat(phase):`, `fix:`, `docs:` prefixes
- Don't commit `test-build/` directory

## Project Structure Reference

See `CURRENT-STAGE.md` for full architecture, file structure, and implementation status.
See `PLAN.md` for the phased implementation plan.
