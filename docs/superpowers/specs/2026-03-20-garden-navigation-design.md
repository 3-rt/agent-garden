# Garden Navigation Design

**Date:** 2026-03-20
**Status:** Approved

## Overview

Add camera controls and a player character to the garden, transforming it from a fixed-viewport display into an explorable world. The garden world grows dynamically based on files/beds, and the user navigates via a hybrid model: a player character for immersive exploration, plus free camera pan/zoom for quick navigation.

## Scope

1. Larger dynamic world — garden extends beyond the viewport, sized by file/bed count
2. Player character — pixel-art gardener moved with WASD/arrows, camera follows
3. Free camera mode — click-drag to pan, scroll wheel to zoom, Space to snap back
4. Minimap — corner overlay showing full garden with viewport and character position

Out of scope (deferred): plant/bed interaction on click or proximity.

## Design

### 1. World & Camera

The garden world size is calculated dynamically from total beds/zones. The existing `garden-bed-layout.ts` computes zone widths and bed positions — this is extended to produce a **world bounds rectangle** that the Phaser camera uses.

**World size formula:** World width = sum of all zone widths (each zone: `bedColumns * (bedWidth + gap) + zonePadding`), with a minimum of the viewport width. World height = max zone height across all zones (tallest zone's `bedRows * (bedHeight + gap) + zonePadding`), with a minimum of the viewport height. Add 64px padding on all edges.

- Camera viewport = the Electron window (unchanged from current `Scale.RESIZE`)
- Camera is bounded within world bounds via `camera.setBounds()`
- Zoom range: 0.5x (overview) to 2.0x (detail), default 1.0x
- Camera smoothly lerps to follow the character (not rigidly locked)
- On window resize: update camera viewport via `camera.setViewport()` (not `cameras.resize()` which affects all cameras). Zoom level is preserved. World bounds are NOT recalculated on resize — only when beds change.

**Key change:** `GardenScene.layoutScene()` currently sizes everything to the window. It must instead compute world-space positions independent of the viewport, and set camera bounds to match. The existing zone layout uses vertical columns (frontend 0-33%, backend 33-67%, tests 67-100%) — this stays the same but uses absolute world-space widths instead of viewport percentages.

### 2. Player Character

A simple pixel-art gardener sprite. Can start as a colored rectangle placeholder, upgraded to a spritesheet later.

- Movement via WASD / arrow keys at constant speed (~120px/s)
- Diagonal movement: normalize the input vector so diagonal speed equals cardinal speed (120px/s)
- Camera follows character by default using `camera.startFollow(character, true, 0.1, 0.1)`
- Character spawns at center of the garden world on load
- Rendered at depth 10 (always above beds at depth 1 and plants at depth 2)
- No collision with beds — walks freely over everything
- **Input focus:** WASD/Space input is only captured when the Phaser canvas has focus. When a React UI element has focus (e.g. modals with text inputs), Phaser input is ignored. Use `scene.input.keyboard.enabled` to toggle based on focus events from the canvas element.

### 3. Free Camera Mode

Allows looking around without walking the character:

- **Scroll wheel** — zoom in/out, centered on mouse pointer position
- **Click-drag** (middle mouse button or right-click drag) — pan the camera freely
- **Space** — snap camera back to character position, re-enable camera follow
- When the user pans or zooms manually, camera follow is detached (`camera.stopFollow()`)
- When a movement key (WASD/arrows) is pressed, camera follow re-attaches to the character
- Zoom changes are smooth (tweened over ~200ms)

### 4. Minimap

Fixed-position HUD overlay in the bottom-right corner showing the full garden at miniature scale.

**Implementation:** Use a `Phaser.GameObjects.RenderTexture` that snapshots a simplified view of the garden, updated every ~500ms or on camera move. This avoids the performance cost of a second Phaser camera rendering all game objects again (expensive in Canvas mode).

- Size: ~200x150px, semi-transparent background
- Renders simplified representation: colored rectangles for zone backgrounds and beds (drawn directly to the RenderTexture, not using scene game objects)
- White rectangle outline shows the current camera viewport position/size
- Small colored dot shows the player character position
- **Click handling:** Check if pointer-down falls within the minimap's screen-space bounds before propagating to the main scene. If within minimap, convert the click position to world coordinates and teleport the camera there.
- Fixed to the camera viewport (uses `setScrollFactor(0)`) so it stays in place

### 5. Integration with Existing Systems

- **Ground tiles:** Currently creates a 32x32px Rectangle per tile to fill the viewport. For world-space rendering, switch to one large Rectangle per zone (3 total) instead of hundreds of small tiles. This is simpler and avoids a performance explosion for large worlds.
- **Zone layout:** Zones are vertical columns (frontend/backend/tests left-to-right). They become world-space regions with absolute pixel positions. `garden-bed-layout.ts` returns absolute world positions instead of viewport-relative ones.
- **Bed/plant rendering:** No changes to how individual beds/plants are drawn — they just exist at world-space coordinates instead of viewport-relative ones.
- **Agent sprites:** Existing agent gardener sprites currently use viewport-relative coordinates. They must be repositioned to world-space coordinates, assigned to their target bed/zone positions in world space.
- **Directory labels:** Positioned in world space, visible when scrolled into view.
- **Day/night cycle overlay:** Must cover the full viewport (use `setScrollFactor(0)` so it stays fixed to the camera), not world space.
- **Resize handling:** Window resize updates camera viewport via `camera.setViewport()`. Does NOT rebuild the world layout. Minimap repositioned to new bottom-right corner.
- **GardenGame bridge:** Expose methods for character position, camera state. React doesn't need to know about navigation internals.
- **Persistence migration:** Current plant positions are viewport-relative. On first load after this change, detect old-format positions (values < viewport size with percentage-like distribution) and convert to world-space coordinates. Store a version flag in persisted state to skip migration on subsequent loads.

### 6. Input Summary

| Input | Action |
|---|---|
| WASD / Arrow keys | Move character, re-attach camera follow |
| Scroll wheel | Zoom in/out centered on mouse |
| Middle-click drag / Right-click drag | Pan camera freely |
| Space | Snap camera to character, re-attach follow |
| Click on minimap | Teleport camera to clicked world position |

**Input focus:** All keyboard input is disabled when React UI elements have focus. Canvas `blur`/`focus` events toggle `scene.input.keyboard.enabled`.

### 7. New Files (Expected)

- `src/renderer/game/systems/PlayerCharacter.ts` — character sprite, movement, input handling
- `src/renderer/game/systems/CameraController.ts` — zoom, pan, follow logic, mode switching
- `src/renderer/game/systems/Minimap.ts` — minimap RenderTexture, viewport indicator, click handling

### 8. Modified Files (Expected)

- `src/renderer/game/scenes/GardenScene.ts` — world bounds, integrate character/camera/minimap systems, ground tile simplification
- `src/shared/garden-bed-layout.ts` — return world-space positions, compute world bounds
- `src/renderer/game/GardenGame.ts` — expose new systems if needed
