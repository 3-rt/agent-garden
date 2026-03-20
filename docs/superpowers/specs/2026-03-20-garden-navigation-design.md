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

- World has padding (~64px) around all edges so the character can walk to borders
- Camera viewport = the Electron window (unchanged from current `Scale.RESIZE`)
- Camera is bounded within world bounds via `camera.setBounds()`
- Zoom range: 0.5x (overview) to 2.0x (detail), default 1.0x
- Camera smoothly lerps to follow the character (not rigidly locked)
- On window resize, camera viewport updates but world bounds stay the same (recalculated only when beds change)

**Key change:** `GardenScene.layoutScene()` currently sizes everything to the window. It must instead compute world-space positions independent of the viewport, and set camera bounds to match.

### 2. Player Character

A simple pixel-art gardener sprite. Can start as a colored rectangle placeholder, upgraded to a spritesheet later.

- Movement via WASD / arrow keys at constant speed (~120px/s)
- Camera follows character by default using `camera.startFollow(character, true, 0.1, 0.1)`
- Character spawns at center of the garden world on load
- Rendered at depth above beds/plants (e.g. depth 10) so always visible
- No collision with beds — walks freely over everything
- Diagonal movement supported (both keys pressed = diagonal at same speed, normalized)

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

- Size: ~200x150px, semi-transparent background
- Renders simplified representation: colored rectangles for zone backgrounds and beds
- White rectangle outline shows the current camera viewport position/size
- Small colored dot shows the player character position
- Clicking on the minimap teleports the camera to that world position
- Minimap is a separate Phaser camera with its own viewport, ignoring zoom of the main camera
- Rendered at highest depth so it's always on top

### 5. Integration with Existing Systems

- **Ground tiles:** Currently regenerated on resize to fill the window. Must instead fill the world bounds. Ground tile generation moves from viewport-based to world-based.
- **Zone layout:** Zone strips (frontend/backend/tests) become world-space regions, not viewport-percentage-based. `garden-bed-layout.ts` returns absolute world positions.
- **Bed/plant rendering:** No changes to how individual beds/plants are drawn — they just exist at world-space coordinates instead of viewport-relative ones.
- **Directory labels:** Positioned in world space, visible when scrolled into view.
- **Day/night cycle overlay:** Must cover the full viewport (use camera ignore or a fixed overlay), not world space.
- **Resize handling:** Window resize updates camera viewport size and minimap position. Does NOT rebuild the world layout (only camera viewport changes).
- **GardenGame bridge:** Expose methods for character position, camera state. React doesn't need to know about navigation internals.

### 6. Input Summary

| Input | Action |
|---|---|
| WASD / Arrow keys | Move character, re-attach camera follow |
| Scroll wheel | Zoom in/out centered on mouse |
| Middle-click drag / Right-click drag | Pan camera freely |
| Space | Snap camera to character, re-attach follow |
| Click on minimap | Teleport camera to clicked world position |

### 7. New Files (Expected)

- `src/renderer/game/systems/PlayerCharacter.ts` — character sprite, movement, input handling
- `src/renderer/game/systems/CameraController.ts` — zoom, pan, follow logic, mode switching
- `src/renderer/game/systems/Minimap.ts` — minimap camera, rendering, click handling

### 8. Modified Files (Expected)

- `src/renderer/game/scenes/GardenScene.ts` — world bounds, integrate character/camera/minimap systems
- `src/shared/garden-bed-layout.ts` — return world-space positions, compute world bounds
- `src/renderer/game/GardenGame.ts` — expose new systems if needed
