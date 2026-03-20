# Garden Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add camera pan/zoom, a player character, and minimap to make the garden explorable beyond the viewport.

**Architecture:** Introduce three new systems (PlayerCharacter, CameraController, Minimap) that plug into GardenScene. Convert the existing viewport-relative coordinate system to world-space coordinates. The garden world grows dynamically based on bed count.

**Tech Stack:** Phaser 3 (Canvas mode), TypeScript, existing test-all.js framework

---

### Task 1: Compute World Bounds from Beds

Convert `garden-bed-layout.ts` to return absolute world-space positions and add a world bounds calculation function.

**Files:**
- Modify: `src/shared/garden-bed-layout.ts`
- Modify: `src/shared/types.ts`
- Test: `test-all.js`

- [ ] **Step 1: Write failing tests for `computeWorldBounds`**

Add to `test-all.js`:

```javascript
section('World Bounds');

const { computeWorldBounds } = require('./test-build/shared/garden-bed-layout');

// Empty garden should return minimum bounds
const emptyBounds = computeWorldBounds({ beds: [], minWidth: 800, minHeight: 600 });
assert(emptyBounds.width >= 800, 'Empty world has minimum width');
assert(emptyBounds.height >= 600, 'Empty world has minimum height');
assert(emptyBounds.x === 0, 'World starts at x=0');
assert(emptyBounds.y === 0, 'World starts at y=0');

// World with beds should encompass all beds + padding
const testBeds = [
  { id: 'b1', zone: 'frontend', x: 100, y: 200, width: 120, height: 80, rank: 0, capacity: 5, directoryGroups: [], plantKeys: [] },
  { id: 'b2', zone: 'backend', x: 500, y: 300, width: 120, height: 80, rank: 0, capacity: 5, directoryGroups: [], plantKeys: [] },
];
const bedBounds = computeWorldBounds({ beds: testBeds, minWidth: 800, minHeight: 600 });
// bed.x is center, so right edge = 500 + 60 = 560, plus 2*64 padding = 688, but min is 800
assert(bedBounds.width >= 800, 'World width at least minWidth');
assert(bedBounds.width >= 560 + 128, 'World width encompasses rightmost bed edge + padding');
// bed.y is center, so bottom edge = 300 + 40 = 340, plus 2*64 padding = 468, but min is 600
assert(bedBounds.height >= 600, 'World height at least minHeight');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: FAIL — `computeWorldBounds` is not defined

- [ ] **Step 3: Add `WorldBounds` type and implement `computeWorldBounds`**

Add to `src/shared/types.ts`:

```typescript
export interface WorldBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Add to `src/shared/garden-bed-layout.ts`:

```typescript
import type { GardenBedState, WorldBounds } from './types';

export interface ComputeWorldBoundsOptions {
  beds: GardenBedState[];
  minWidth: number;
  minHeight: number;
  padding?: number;
}

export function computeWorldBounds({
  beds,
  minWidth,
  minHeight,
  padding = 64,
}: ComputeWorldBoundsOptions): WorldBounds {
  if (beds.length === 0) {
    return { x: 0, y: 0, width: minWidth, height: minHeight };
  }

  let maxRight = 0;
  let maxBottom = 0;

  for (const bed of beds) {
    const right = bed.x + bed.width / 2;
    const bottom = bed.y + bed.height / 2;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  }

  return {
    x: 0,
    y: 0,
    width: Math.max(minWidth, maxRight + padding * 2),
    height: Math.max(minHeight, maxBottom + padding * 2),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/garden-bed-layout.ts src/shared/types.ts test-all.js
git commit -m "feat: add computeWorldBounds for dynamic garden world sizing"
```

---

### Task 2: Convert GardenScene to World-Space Coordinates

Change `GardenScene` to compute layout in world-space instead of viewport-relative coordinates. Replace the tiled ground with zone-sized rectangles. Update `layoutScene` to set camera bounds.

**Files:**
- Modify: `src/renderer/game/scenes/GardenScene.ts`

- [ ] **Step 1: Replace ZONE_LAYOUT percentages with absolute world-space calculation**

Replace the `ZONE_LAYOUT` constant and add a method to compute world-space zone positions:

```typescript
// Remove the old ZONE_LAYOUT constant
// Replace with:

interface WorldZoneLayout {
  frontend: { x: number; width: number };
  backend: { x: number; width: number };
  tests: { x: number; width: number };
}

// Add to GardenScene class:
private worldWidth = 800;
private worldHeight = 600;

private computeWorldLayout(): WorldZoneLayout {
  // Each zone gets 1/3 of world width
  const zoneWidth = this.worldWidth / 3;
  return {
    frontend: { x: 0, width: zoneWidth },
    backend: { x: zoneWidth, width: zoneWidth },
    tests: { x: zoneWidth * 2, width: zoneWidth },
  };
}
```

- [ ] **Step 2: Replace `rebuildGround` with zone-sized rectangles**

Replace the existing `rebuildGround` method:

```typescript
private rebuildGround() {
  for (const tile of this.groundTiles) {
    tile.destroy();
  }
  this.groundTiles = [];

  const theme = this.themeManager.current;
  const zones = this.computeWorldLayout();

  for (const zone of Object.values(zones)) {
    const tile = this.add.rectangle(
      zone.x + zone.width / 2,
      this.worldHeight / 2,
      zone.width,
      this.worldHeight,
      theme.groundLight,
    ).setDepth(0);
    this.groundTiles.push(tile);
  }
}
```

- [ ] **Step 3: Add `computeWorldBounds` import and update `layoutScene`**

Add `computeWorldBounds` to the existing import from `garden-bed-layout`:

```typescript
import { buildZoneBeds, scatterPlantsInBed, computeWorldBounds } from '../../../shared/garden-bed-layout';
```

Replace `layoutScene` (note: this removes the `this.cameras.resize()` call that previously affected all cameras):

```typescript
private layoutScene(viewportWidth: number, viewportHeight: number) {
  // Compute world size from beds
  const bounds = computeWorldBounds({
    beds: this.gardenBeds,
    minWidth: viewportWidth,
    minHeight: viewportHeight,
  });
  this.worldWidth = bounds.width;
  this.worldHeight = bounds.height;

  const cam = this.cameras.main;
  cam.setViewport(0, 0, viewportWidth, viewportHeight);
  cam.setBounds(0, 0, this.worldWidth, this.worldHeight);
  cam.setBackgroundColor(this.themeManager.current.backgroundColor);

  this.rebuildGround();
  this.titleText.setPosition(this.worldWidth / 2, this.worldHeight - 12);
  this.renderBedVisuals();

  if (this.plantPositions.size > 0) {
    this.rebuildPlantDisplay();
  }

  if (this.activeDirectories.size > 1) {
    this.refreshDirectoryLabels();
  }
}
```

- [ ] **Step 4: Update `handleResize` to only update viewport, not rebuild world**

```typescript
private handleResize(gameSize: Phaser.Structs.Size) {
  const width = gameSize.width || this.scale.width || this.cameras.main.width || 800;
  const height = gameSize.height || this.scale.height || this.cameras.main.height || 600;
  const cam = this.cameras.main;
  cam.setViewport(0, 0, width, height);
  // World layout stays the same — only viewport changes
  // Ground tiles already cover the full world, no rebuild needed
  // Minimap repositions itself in its update() call
}
```

- [ ] **Step 5: Update all `this.scale` references to use world dimensions**

Search for `this.scale.width`, `this.scale.height`, `const { width, height } = this.scale` and replace with `this.worldWidth`/`this.worldHeight` for world-space calculations. Key methods to update:
- `addAgent` — use `this.worldWidth`/`this.worldHeight` for zone positions
- `startTask` — use `this.worldWidth`/`this.worldHeight`
- `showActivity` (PreToolUse case) — use `this.worldWidth`/`this.worldHeight`
- `setAgentRole` — use `this.worldWidth`/`this.worldHeight`
- `onFileCreated` — use `this.worldWidth`/`this.worldHeight`
- `refreshDirectoryLabels` — use `this.worldHeight`
- `addOverflowBed` — use `this.worldWidth`/`this.worldHeight`

In each, replace patterns like:
```typescript
// Before:
const { width, height } = this.scale;
const layout = ZONE_LAYOUT[zone];
const zoneStart = layout.x * width;
const zoneW = layout.width * width;

// After:
const zones = this.computeWorldLayout();
const layout = zones[zone as keyof WorldZoneLayout];
const zoneStart = layout.x;
const zoneW = layout.width;
```

- [ ] **Step 6: Verify the app starts and renders correctly**

Run: `npm start`
Expected: Garden renders as before. No visual regressions. Beds, plants, agents all positioned correctly.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/game/scenes/GardenScene.ts
git commit -m "feat: convert GardenScene to world-space coordinates"
```

---

### Task 3: Camera Controller System

Implement zoom (scroll wheel centered on mouse), pan (middle/right-click drag), and follow logic.

**Files:**
- Create: `src/renderer/game/systems/CameraController.ts`
- Modify: `src/renderer/game/scenes/GardenScene.ts`

- [ ] **Step 1: Write CameraController class**

```typescript
import Phaser from 'phaser';

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private followTarget: Phaser.GameObjects.GameObject | null = null;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private cameraStartX = 0;
  private cameraStartY = 0;

  private readonly minZoom = 0.5;
  private readonly maxZoom = 2.0;
  private readonly zoomStep = 0.1;
  private readonly followLerp = 0.1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.setupInput();
  }

  private setupInput() {
    // Scroll wheel zoom — centered on mouse pointer position
    this.scene.input.on('wheel', (pointer: Phaser.Input.Pointer, _gameObjects: any[], _deltaX: number, deltaY: number) => {
      const oldZoom = this.camera.zoom;
      const newZoom = Phaser.Math.Clamp(
        oldZoom + (deltaY > 0 ? -this.zoomStep : this.zoomStep),
        this.minZoom,
        this.maxZoom,
      );

      // Zoom toward mouse pointer: adjust scroll so the world point under the
      // pointer stays in the same screen position after the zoom change.
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const newScrollX = worldX - (pointer.x / newZoom);
      const newScrollY = worldY - (pointer.y / newZoom);

      this.camera.zoom = newZoom;
      this.camera.scrollX = newScrollX;
      this.camera.scrollY = newScrollY;
    });

    // Right-click / middle-click drag to pan
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.isDragging = true;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        this.cameraStartX = this.camera.scrollX;
        this.cameraStartY = this.camera.scrollY;
        this.detachFollow();
      }
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      const dx = (this.dragStartX - pointer.x) / this.camera.zoom;
      const dy = (this.dragStartY - pointer.y) / this.camera.zoom;
      this.camera.scrollX = this.cameraStartX + dx;
      this.camera.scrollY = this.cameraStartY + dy;
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonReleased() || pointer.middleButtonReleased()) {
        this.isDragging = false;
      }
    });

    // Disable right-click context menu on the canvas
    this.scene.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  startFollow(target: Phaser.GameObjects.GameObject) {
    this.followTarget = target;
    this.camera.startFollow(target, true, this.followLerp, this.followLerp);
  }

  detachFollow() {
    if (this.followTarget) {
      this.camera.stopFollow();
    }
  }

  reattachFollow() {
    if (this.followTarget) {
      this.camera.startFollow(this.followTarget, true, this.followLerp, this.followLerp);
    }
  }

  snapToTarget() {
    if (this.followTarget) {
      const target = this.followTarget as any;
      this.camera.scrollX = target.x - this.camera.width / 2;
      this.camera.scrollY = target.y - this.camera.height / 2;
      this.reattachFollow();
    }
  }

  destroy() {
    this.scene.input.off('wheel');
    this.scene.input.off('pointerdown');
    this.scene.input.off('pointermove');
    this.scene.input.off('pointerup');
  }
}
```

- [ ] **Step 2: Integrate CameraController into GardenScene**

In `GardenScene.ts`, add:

```typescript
import { CameraController } from '../systems/CameraController';

// In class properties:
private cameraController!: CameraController;

// In create(), after layoutScene:
this.cameraController = new CameraController(this);
```

- [ ] **Step 3: Verify zoom and pan work**

Run: `npm start`
Expected: Scroll wheel zooms in/out (0.5x-2.0x). Right-click drag pans the camera. Camera stays within world bounds.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/game/systems/CameraController.ts src/renderer/game/scenes/GardenScene.ts
git commit -m "feat: add CameraController with zoom and pan"
```

---

### Task 4: Player Character

Create a player character sprite that moves with WASD/arrow keys and is followed by the camera.

**Files:**
- Create: `src/renderer/game/systems/PlayerCharacter.ts`
- Modify: `src/renderer/game/scenes/GardenScene.ts`

- [ ] **Step 1: Write PlayerCharacter class**

```typescript
import Phaser from 'phaser';
import type { CameraController } from './CameraController';

export class PlayerCharacter {
  private scene: Phaser.Scene;
  private cameraController: CameraController;
  public container: Phaser.GameObjects.Container;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private readonly speed = 120;
  private worldWidth: number;
  private worldHeight: number;

  constructor(scene: Phaser.Scene, x: number, y: number, worldWidth: number, worldHeight: number, cameraController: CameraController) {
    this.scene = scene;
    this.cameraController = cameraController;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    // Simple pixel-art character (colored rectangles)
    const body = scene.add.rectangle(0, 0, 12, 16, 0xffcc80);
    const shirt = scene.add.rectangle(0, 4, 14, 10, 0x42a5f5);
    const hat = scene.add.triangle(0, -12, -8, 4, 8, 4, 0, -5, 0x388e3c);
    const leftLeg = scene.add.rectangle(-3, 12, 4, 6, 0x5d4037);
    const rightLeg = scene.add.rectangle(3, 12, 4, 6, 0x5d4037);

    this.container = scene.add.container(x, y, [leftLeg, rightLeg, body, shirt, hat]);
    this.container.setDepth(10);

    // Input
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasd = {
        W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
      this.spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    // Camera follows player
    cameraController.startFollow(this.container);
  }

  update(delta: number) {
    if (!this.scene.input.keyboard?.enabled) return;

    let dx = 0;
    let dy = 0;

    if (this.cursors?.left.isDown || this.wasd?.A.isDown) dx -= 1;
    if (this.cursors?.right.isDown || this.wasd?.D.isDown) dx += 1;
    if (this.cursors?.up.isDown || this.wasd?.W.isDown) dy -= 1;
    if (this.cursors?.down.isDown || this.wasd?.S.isDown) dy += 1;

    // Space: snap camera back to character
    if (this.spaceKey?.isDown) {
      this.cameraController.snapToTarget();
    }

    if (dx === 0 && dy === 0) return;

    // Normalize diagonal movement
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    dx /= magnitude;
    dy /= magnitude;

    const moveX = dx * this.speed * (delta / 1000);
    const moveY = dy * this.speed * (delta / 1000);

    this.container.x = Phaser.Math.Clamp(this.container.x + moveX, 0, this.worldWidth);
    this.container.y = Phaser.Math.Clamp(this.container.y + moveY, 0, this.worldHeight);

    // Re-attach camera follow when moving
    this.cameraController.reattachFollow();
  }

  setWorldSize(width: number, height: number) {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y };
  }

  destroy() {
    this.container.destroy();
  }
}
```

- [ ] **Step 2: Integrate PlayerCharacter into GardenScene**

Add to `GardenScene`:

```typescript
import { PlayerCharacter } from '../systems/PlayerCharacter';

// Class property:
private playerCharacter!: PlayerCharacter;

// In create(), after cameraController is created:
this.playerCharacter = new PlayerCharacter(
  this,
  this.worldWidth / 2,
  this.worldHeight / 2,
  this.worldWidth,
  this.worldHeight,
  this.cameraController,
);

// In update(_time: number, delta: number), after the snapshot block (line ~98):
this.playerCharacter.update(delta);
```

- [ ] **Step 3: Add input focus management**

Add to `GardenScene.create()`:

```typescript
// Disable keyboard input when canvas loses focus (e.g. React modal open)
this.game.canvas.addEventListener('blur', () => {
  if (this.input.keyboard) this.input.keyboard.enabled = false;
});
this.game.canvas.addEventListener('focus', () => {
  if (this.input.keyboard) this.input.keyboard.enabled = true;
});
```

- [ ] **Step 4: Verify character movement and camera follow**

Run: `npm start`
Expected: Character visible at center. WASD/arrows move character. Camera follows smoothly. Space snaps camera back after panning. Keyboard input disabled when canvas loses focus.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/game/systems/PlayerCharacter.ts src/renderer/game/scenes/GardenScene.ts
git commit -m "feat: add player character with WASD movement and camera follow"
```

---

### Task 5: Minimap

Implement a minimap overlay using a RenderTexture showing a simplified garden overview.

**Files:**
- Create: `src/renderer/game/systems/Minimap.ts`
- Modify: `src/renderer/game/scenes/GardenScene.ts`

- [ ] **Step 1: Write Minimap class**

```typescript
import Phaser from 'phaser';
import type { GardenBedState } from '../../../shared/types';

export class Minimap {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private background: Phaser.GameObjects.Rectangle;
  private viewportIndicator: Phaser.GameObjects.Rectangle;
  private playerDot: Phaser.GameObjects.Arc;
  private bedGraphics: Phaser.GameObjects.Graphics;

  private readonly mapWidth = 200;
  private readonly mapHeight = 150;
  private worldWidth: number;
  private worldHeight: number;

  constructor(scene: Phaser.Scene, worldWidth: number, worldHeight: number) {
    this.scene = scene;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    const cam = scene.cameras.main;
    const mapX = cam.width - this.mapWidth - 10;
    const mapY = cam.height - this.mapHeight - 10;

    // Background
    this.background = scene.add.rectangle(0, 0, this.mapWidth, this.mapHeight, 0x000000, 0.6)
      .setOrigin(0, 0);

    // Bed markers (drawn as graphics)
    this.bedGraphics = scene.add.graphics();

    // Viewport indicator
    this.viewportIndicator = scene.add.rectangle(0, 0, 10, 10)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 1)
      .setFillStyle(0xffffff, 0.1);

    // Player dot
    this.playerDot = scene.add.circle(0, 0, 3, 0x42a5f5);

    this.container = scene.add.container(mapX, mapY, [
      this.background,
      this.bedGraphics,
      this.viewportIndicator,
      this.playerDot,
    ]);
    this.container.setDepth(300);
    this.container.setScrollFactor(0);

    // Click on minimap to teleport camera
    this.background.setInteractive();
    this.background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const localX = pointer.x - this.container.x;
      const localY = pointer.y - this.container.y;
      const worldX = (localX / this.mapWidth) * this.worldWidth;
      const worldY = (localY / this.mapHeight) * this.worldHeight;
      cam.scrollX = worldX - cam.width / (2 * cam.zoom);
      cam.scrollY = worldY - cam.height / (2 * cam.zoom);
    });
  }

  updateBeds(beds: GardenBedState[], zoneColors: Record<string, number>) {
    this.bedGraphics.clear();
    for (const bed of beds) {
      const mx = (bed.x / this.worldWidth) * this.mapWidth;
      const my = (bed.y / this.worldHeight) * this.mapHeight;
      const mw = (bed.width / this.worldWidth) * this.mapWidth;
      const mh = (bed.height / this.worldHeight) * this.mapHeight;
      const color = zoneColors[bed.zone] || 0x8d6e63;
      this.bedGraphics.fillStyle(color, 0.8);
      this.bedGraphics.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
    }
  }

  update(playerX: number, playerY: number) {
    const cam = this.scene.cameras.main;

    // Reposition minimap to bottom-right of viewport
    this.container.x = cam.width - this.mapWidth - 10;
    this.container.y = cam.height - this.mapHeight - 10;

    // Update viewport indicator
    const vx = (cam.scrollX / this.worldWidth) * this.mapWidth;
    const vy = (cam.scrollY / this.worldHeight) * this.mapHeight;
    const vw = (cam.width / cam.zoom / this.worldWidth) * this.mapWidth;
    const vh = (cam.height / cam.zoom / this.worldHeight) * this.mapHeight;
    this.viewportIndicator.setPosition(vx, vy);
    this.viewportIndicator.setSize(vw, vh);

    // Update player dot
    const px = (playerX / this.worldWidth) * this.mapWidth;
    const py = (playerY / this.worldHeight) * this.mapHeight;
    this.playerDot.setPosition(px, py);
  }

  setWorldSize(width: number, height: number) {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  destroy() {
    this.container.destroy();
  }
}
```

- [ ] **Step 2: Integrate Minimap into GardenScene**

Add to `GardenScene`:

```typescript
import { Minimap } from '../systems/Minimap';

// Class property:
private minimap!: Minimap;

// Zone colors for minimap:
private readonly zoneColors: Record<string, number> = {
  frontend: 0x66bb6a,
  backend: 0x42a5f5,
  tests: 0xffa726,
};

// In create(), after playerCharacter:
this.minimap = new Minimap(this, this.worldWidth, this.worldHeight);
this.minimap.updateBeds(this.gardenBeds, this.zoneColors);

// In update():
const pos = this.playerCharacter.getPosition();
this.minimap.update(pos.x, pos.y);

// In renderBedVisuals(), at end:
if (this.minimap) {
  this.minimap.updateBeds(this.gardenBeds, this.zoneColors);
}

// In layoutScene(), after worldWidth/Height change:
if (this.minimap) {
  this.minimap.setWorldSize(this.worldWidth, this.worldHeight);
}
if (this.playerCharacter) {
  this.playerCharacter.setWorldSize(this.worldWidth, this.worldHeight);
}
```

- [ ] **Step 3: Verify minimap renders and responds to clicks**

Run: `npm start`
Expected: Minimap in bottom-right corner. Shows colored rectangles for beds. White rectangle shows viewport position. Blue dot tracks player. Clicking minimap moves camera.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/game/systems/Minimap.ts src/renderer/game/scenes/GardenScene.ts
git commit -m "feat: add minimap with viewport indicator and click-to-teleport"
```

---

### Task 6: Fix DayNightCycle for World-Space

The `DayNightCycle` class exists in `src/renderer/game/systems/DayNightCycle.ts` but is **not currently instantiated** in `GardenScene`. It already uses `setScrollFactor(0)` on its overlay/stars/sun, so it's mostly world-space safe. The only fix needed is the overlay size (currently `width * 2, height * 2` which may not cover the viewport at low zoom).

**Note:** This task only modifies DayNightCycle.ts. If/when DayNightCycle is integrated into GardenScene in the future, the overlay will correctly cover the viewport.

**Files:**
- Modify: `src/renderer/game/systems/DayNightCycle.ts`

- [ ] **Step 1: Fix overlay sizing**

The overlay currently uses `width * 2, height * 2` which may not be enough at low zoom. Change to use a very large fixed size:

```typescript
// In constructor, change overlay size to very large:
this.overlay = scene.add.rectangle(0, 0, 4000, 4000, OVERLAY_COLORS.dawn)
  .setAlpha(OVERLAY_ALPHA.dawn)
  .setDepth(200)
  .setScrollFactor(0);
```

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: All tests pass (DayNightCycle is not tested directly but should compile)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/game/systems/DayNightCycle.ts
git commit -m "fix: day/night overlay covers viewport at all zoom levels"
```

---

### Task 7: Persistence Migration

Handle loading saved gardens that have viewport-relative coordinates by converting them to world-space.

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/game/scenes/GardenScene.ts`

- [ ] **Step 1: Add version field to GardenState**

In `src/shared/types.ts`, modify `GardenState`:

```typescript
export interface GardenState extends GardenLayoutState {
  stats: GardenStats;
  theme: string;
  savedAt: number;
  version?: number; // 2 = world-space coordinates
}
```

- [ ] **Step 2: Add migration logic in `restoreGardenLayout`**

In `GardenScene.restoreGardenLayout`, detect old-format positions and rebuild beds using world-space:

```typescript
restoreGardenLayout(layout: GardenLayoutState, version?: number) {
  this.clearPlants();

  if (!version || version < 2) {
    // Old viewport-relative positions — rebuild beds from scratch
    // Beds will be re-laid out in world-space by placePlantInExistingBeds
    // Just restore plants without positions and let them re-scatter
    for (const plant of (layout.plants || [])) {
      this.onFileCreated(plant.filename, plant.directory, plant.creatorRole, plant.growthScale);
    }
    return;
  }

  this.gardenBeds = (layout.beds || []).map((bed) => ({
    ...bed,
    directoryGroups: [...bed.directoryGroups],
    plantKeys: [...bed.plantKeys],
  }));
  this.renderBedVisuals();
  this.restorePlants(layout.plants || []);
}
```

- [ ] **Step 3: Update GardenGame to propagate version**

In `GardenGame.ts`, update `restoreGardenLayout` to accept and pass the version:

```typescript
restoreGardenLayout(layout: GardenLayoutState, version?: number) {
  this.scene?.restoreGardenLayout(layout, version);
}
```

Find the persistence service that loads `GardenState` and passes it to `restoreGardenLayout`. It will have the `version` field from the saved JSON — pass `state.version` through. When saving, include `version: 2` in the saved `GardenState` object.

- [ ] **Step 4: Verify old saves load correctly (plants re-scatter into world-space beds)**

Run: `npm start` with an existing saved garden
Expected: Plants are placed into correctly positioned world-space beds. No visual glitches.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/renderer/game/scenes/GardenScene.ts src/renderer/game/GardenGame.ts
git commit -m "feat: add persistence migration from viewport-relative to world-space coordinates"
```

---

### Task 8: Integration Testing and Polish

Run the full test suite, verify all features work together, fix any issues.

**Files:**
- Modify: `test-all.js`

- [ ] **Step 1: Run existing tests**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: All 334+ tests pass (plus new world bounds tests)

- [ ] **Step 2: Manual testing checklist**

Run: `npm start`

Verify:
- Character moves with WASD/arrows
- Camera follows character smoothly
- Scroll wheel zooms (0.5x to 2x)
- Right-click drag pans camera, detaches follow
- Space key snaps camera back to character
- Minimap shows beds, viewport rectangle, player dot
- Clicking minimap moves camera
- Day/night overlay covers viewport at all zoom levels
- Plants and beds render correctly in world space
- Agents spawn and walk in correct zones
- Window resize updates viewport without breaking layout

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add src/ test-all.js
git commit -m "feat: complete garden navigation - character, camera, minimap"
```
