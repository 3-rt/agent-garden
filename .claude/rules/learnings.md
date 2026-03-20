# Learnings

Hard-won lessons from building this project. Claude reads this every session.

## Phaser 3

- Phaser uses `new Function()` internally — CSP must include `'unsafe-eval'` or scene `create()` fails silently with a blank garden
- Use `this.cameras.main` for reliable dimensions with `Scale.RESIZE` mode, not `this.scale` directly
- Ground tiles are colored rectangles, not sprite-based — simpler and theme-friendly
- Plants are procedurally drawn with Phaser Graphics (bush, flower, tulip, fern, cactus) — no spritesheet needed
- Phaser Rectangle `setOrigin(0.5, 1)` with initial height 0 doesn't anchor correctly when height is later changed — use default origin (0.5, 0.5) and explicitly set y to `-height/2` instead
- Phaser containers don't auto-destroy children; destroy the container to clean up
- With an empty preload(), Phaser runs create() synchronously before the `'ready'` event fires — check `scene.isActive()` as a fallback
- GardenGame exposes `onSceneReady()` promise — use it instead of setTimeout to wait for scene initialization

## Electron IPC

- All renderer→main communication goes through `preload.ts` (contextBridge)
- Every new IPC channel needs: handler in `main.ts`, method in `preload.ts`, type in `ElectronAPI` interface in `types.ts`
- Use `ipcMain.handle` for request/response, `ipcMain.on` for fire-and-forget
- Use `webContents.send` for main→renderer pushes

## FileWatcher

- `fs.watch` is platform-dependent and flaky — tests for file creation sometimes fail due to timing
- The 200ms debounce is important; without it, save-and-rename patterns cause duplicate events
- FileWatcher creates the watched directory if it doesn't exist

## Process Scanner

- `ps -eo pid,args` picks up ALL claude processes system-wide
- Must filter to only processes whose `--cwd`/`--directory` matches a watched directory
- VS Code extension processes contain `--output-format stream-json` — use this to exclude them
- Bare `claude` processes without directory flags should be skipped

## Claude Code Hooks

- Hook server runs on port 7890, binds to 127.0.0.1 only
- Hooks are configured in `~/.claude/settings.json` (not settings.local.json)
- Hook format is array-of-matchers: `"EventName": [{"hooks": [{"type": "http", "url": "..."}]}]` — NOT simple string URLs
- PostToolUse events with file paths enable file-agent correlation (2s TTL buffer)
- Session payloads use inconsistent naming (session_id vs sessionId, cwd vs directory) — parser handles both

## Testing

- All tests in single `test-all.js` file, no framework
- Variable names must be unique across the entire file (no block scoping in the async IIFE)
- FileWatcher tests are timing-sensitive and occasionally flaky — re-run to confirm
- Build to `test-build/` with `npx tsc --outDir test-build --skipLibCheck` before running tests

## State Management

- No centralized store — state lives in three places (main services, React useState, Phaser game objects)
- GardenGame is the React→Phaser bridge; all Phaser mutations go through it
- Plants must be cleaned up when switching directories (clearPlants)
- Exited agents need a delay before removal so completion animations play
