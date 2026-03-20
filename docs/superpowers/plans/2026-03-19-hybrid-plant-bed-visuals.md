# Hybrid Plant & Bed Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace procedural geometric plant tops with sprite frames from `objects.png` and restyle garden beds with bordered soil appearance.

**Architecture:** Two files change. `ThemeManager.ts` gets soil color fields added to the `GardenTheme` interface and all 5 theme definitions. `GardenScene.ts` gets a `preload()` method to load the spritesheet, updated plant rendering to use sprite `Image` objects instead of `Graphics` shapes, and restyled bed rendering using `Graphics` with borders/texture.

**Tech Stack:** Phaser 3 (Canvas renderer), TypeScript strict mode

**Spec:** `docs/superpowers/specs/2026-03-19-hybrid-plant-bed-visuals-design.md`

---

### Task 1: Add soil palette to ThemeManager

**Files:**
- Modify: `src/renderer/game/systems/ThemeManager.ts:1-13` (interface)
- Modify: `src/renderer/game/systems/ThemeManager.ts:15-81` (theme definitions)

- [ ] **Step 1: Add soil fields to GardenTheme interface**

In `src/renderer/game/systems/ThemeManager.ts`, add four new fields to the `GardenTheme` interface (after `dividerColor`):

```typescript
export interface GardenTheme {
  id: string;
  name: string;
  groundLight: number;
  groundDark: number;
  pathColor: number;
  backgroundColor: string;
  signColors: Record<string, number>;
  plantStemColor: number;
  labelColor: string;
  titleColor: string;
  dividerColor: number;
  soilFill: number;
  soilBorder: number;
  soilDots: number;
  soilShadow: number;
}
```

- [ ] **Step 2: Add soil values to all 5 theme definitions**

Add the four soil fields to each theme object in the `THEMES` record:

**Garden** (after `dividerColor: 0x4a7c59`):
```typescript
    soilFill: 0x5a3a1a,
    soilBorder: 0x8b6914,
    soilDots: 0x7a5a2a,
    soilShadow: 0x3a2510,
```

**Desert** (after `dividerColor: 0x9e8c6c`):
```typescript
    soilFill: 0xb89b3e,
    soilBorder: 0xd4b84a,
    soilDots: 0xc8ab4e,
    soilShadow: 0x8a7530,
```

**Zen** (after `dividerColor: 0xb0a898`):
```typescript
    soilFill: 0x8a8278,
    soilBorder: 0xb0a898,
    soilDots: 0x9a9288,
    soilShadow: 0x6a6258,
```

**Underwater** (after `dividerColor: 0x2a8a9a`):
```typescript
    soilFill: 0x1a3a4e,
    soilBorder: 0x2a5a6e,
    soilDots: 0x2a4a5e,
    soilShadow: 0x0a2a3e,
```

**Space** (after `dividerColor: 0x3a3a5e`):
```typescript
    soilFill: 0x2a2a3e,
    soilBorder: 0x4a4a6e,
    soilDots: 0x3a3a4e,
    soilShadow: 0x1a1a2e,
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/game/systems/ThemeManager.ts
git commit -m "feat: add soil color palette to garden themes"
```

---

### Task 2: Load spritesheet in GardenScene

**Files:**
- Modify: `src/renderer/game/scenes/GardenScene.ts:44-46` (add preload before create)

- [ ] **Step 1: Add preload() method**

Add a `preload()` method to `GardenScene` before the existing `create()` method (after the constructor at line 46):

```typescript
  preload() {
    this.load.spritesheet('objects', 'assets/sprites/objects.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
  }
```

Note: Assets are copied by webpack from `src/renderer/assets/` to `dist/renderer/assets/`. The HTML is at `dist/renderer/index.html`, so the relative path is `assets/sprites/objects.png`.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

- [ ] **Step 3: Build and verify spritesheet loads**

Run: `npm run build`
Expected: Builds without error.

Launch app (`npx electron .`) and open DevTools (Cmd+Option+I). Check the console for any spritesheet loading errors. The garden should render the same as before (no visual change yet).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/game/scenes/GardenScene.ts
git commit -m "feat: load objects.png spritesheet in GardenScene preload"
```

---

### Task 3: Replace plant tops with sprites

**Files:**
- Modify: `src/renderer/game/scenes/GardenScene.ts:1080-1088` (getPlantStyle)
- Modify: `src/renderer/game/scenes/GardenScene.ts:899-971` (growPlant)
- Modify: `src/renderer/game/scenes/GardenScene.ts:973-1036` (growMergedPlant)

- [ ] **Step 1: Identify sprite frame indices**

Open the app, open DevTools console, and run:
```javascript
// List all frames in the objects spritesheet
const tex = Phaser.Display.Canvas.CanvasPool;
console.log('Total frames:', game.textures.get('objects').frameTotal);
```

Or visually inspect `objects.png` (528x320, 16x16 grid = 33 cols x 20 rows). The plant sprites are in approximately rows 8-11. Identify frame indices for:
- Red flower (petaled, in soil row)
- Green bush large (round, ~row 10)
- Green bush small (smaller variant)
- Yellow flower

Frame index formula: `col + (row * 33)`.

Record the exact frame indices as constants at the top of `GardenScene.ts` (after imports):

```typescript
// Sprite frame indices from objects.png (33 cols x 20 rows, 16x16 tiles)
// These must be verified against the actual spritesheet
const PLANT_FRAMES = {
  redFlower: 265,    // Verify: row 8, col ~1
  greenBushLarge: 307, // Verify: row 9, col ~10
  greenBushSmall: 305, // Verify: row 9, col ~8
  yellowFlower: 278,   // Verify: row 8, col ~14
};
```

**Important:** These indices are approximate. During implementation, load the spritesheet and visually verify which frames contain the correct sprites. Adjust indices as needed. If the plant sprites are 32x32 (spanning 2x2 tiles), consider loading a second spritesheet with `frameWidth: 32, frameHeight: 32` or picking the top-left frame of each 2x2 block.

- [ ] **Step 2: Replace getPlantStyle()**

Replace the current `getPlantStyle()` method (lines 1080-1088) with a version that returns frame indices and tints:

```typescript
private getPlantStyle(ext: string): { stemColor: number; frame: number; tint?: number } {
  switch (ext) {
    case 'tsx':
    case 'jsx':
      return { stemColor: 0x4caf50, frame: PLANT_FRAMES.redFlower };
    case 'ts':
    case 'js':
      return { stemColor: 0x6d4c41, frame: PLANT_FRAMES.greenBushLarge };
    case 'css':
    case 'scss':
      return { stemColor: 0x4caf50, frame: PLANT_FRAMES.redFlower, tint: 0x42a5f5 };
    case 'json':
    case 'yaml':
      return { stemColor: 0x8d6e63, frame: PLANT_FRAMES.yellowFlower };
    case 'md':
    case 'txt':
      return { stemColor: 0x4caf50, frame: PLANT_FRAMES.greenBushSmall, tint: 0xa5d6a7 };
    default:
      return { stemColor: 0x4caf50, frame: PLANT_FRAMES.greenBushSmall };
  }
}
```

- [ ] **Step 3: Update growPlant() to use sprites**

Replace the plant top rendering in `growPlant()` (lines 899-971). The key change is in `addTop()` — replace the shape drawing with a sprite `Image`:

```typescript
private growPlant(x: number, y: number, filename: string, creatorRole?: AgentRole, growthScale?: number, animate = true): Phaser.GameObjects.Container {
  const ext = filename.split('.').pop() || '';
  const isTest = filename.includes('.test.') || filename.includes('.spec.');
  const { stemColor, frame, tint } = isTest
    ? { stemColor: 0x8d6e63, frame: PLANT_FRAMES.redFlower, tint: 0xce93d8 }
    : this.getPlantStyle(ext);

  const stem = this.add.rectangle(0, 0, 6, 0, stemColor).setOrigin(0.5, 1);
  const container = this.add.container(x, y, [stem]);

  const targetHeight = Math.round((20 + Math.random() * 20) * (growthScale || 1));

  if (animate) {
    this.tweens.add({
      targets: stem,
      height: { from: 0, to: targetHeight },
      duration: 800,
      ease: 'Back.easeOut',
    });
  } else {
    stem.height = targetHeight;
  }

  const addTop = () => {
    const top = this.add.image(0, -targetHeight, 'objects', frame);
    if (tint) top.setTint(tint);
    container.add(top);

    if (animate) {
      top.setScale(0);
      this.tweens.add({
        targets: top,
        scaleX: 1,
        scaleY: 1,
        duration: 300,
        ease: 'Back.easeOut',
      });
    }
  };

  if (animate) {
    this.time.delayedCall(800, addTop);
  } else {
    addTop();
  }

  const label = this.add.text(
    0, 8,
    filename.length > 16 ? filename.slice(-16) : filename,
    { fontSize: '7px', color: '#a0c8a0', fontFamily: 'monospace' },
  ).setOrigin(0.5, 0);
  container.add(label);

  if (creatorRole && creatorRole !== 'unassigned') {
    const dotColor = creatorRole === 'planter' ? 0x66bb6a
      : creatorRole === 'weeder' ? 0xffa726
      : creatorRole === 'tester' ? 0x42a5f5
      : 0xce93d8;
    const dot = this.add.circle(0, 4, 3, dotColor).setDepth(15);
    container.add(dot);
  }

  return container;
}
```

- [ ] **Step 4: Update growMergedPlant() to use sprites**

Replace the canopy ellipse in `growMergedPlant()` (lines 973-1036) with a scaled bush sprite:

```typescript
private growMergedPlant(displayPlant: DisplayPlant, animate: boolean): Phaser.GameObjects.Container {
  const { x, y, targetHeight } = this.getMergedPlantPlacement(displayPlant);
  const stem = this.add.rectangle(0, 0, 10, 0, 0x6d4c41).setOrigin(0.5, 1);
  const container = this.add.container(x, y, [stem]);

  if (animate) {
    this.tweens.add({
      targets: stem,
      height: { from: 0, to: targetHeight },
      duration: 900,
      ease: 'Back.easeOut',
    });
  } else {
    stem.height = targetHeight;
  }

  const addCanopy = () => {
    const canopy = this.add.image(0, -targetHeight, 'objects', PLANT_FRAMES.greenBushLarge);
    canopy.setScale(34 / 16, 22 / 16);
    const badge = this.add.circle(12, -targetHeight - 4, 9, 0xffee58);
    const badgeText = this.add.text(12, -targetHeight - 4, `${displayPlant.fileCount}`, {
      fontSize: '9px',
      color: '#243b1a',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add([canopy, badge, badgeText]);

    if (animate) {
      canopy.setScale(0);
      badge.setScale(0);
      badgeText.setScale(0);
      this.tweens.add({
        targets: canopy,
        scaleX: { from: 0, to: 34 / 16 },
        scaleY: { from: 0, to: 22 / 16 },
        duration: 300,
        ease: 'Back.easeOut',
      });
      this.tweens.add({
        targets: [badge, badgeText],
        scaleX: { from: 0, to: 1 },
        scaleY: { from: 0, to: 1 },
        duration: 300,
        ease: 'Back.easeOut',
      });
    }
  };

  if (animate) {
    this.time.delayedCall(700, addCanopy);
  } else {
    addCanopy();
  }

  const label = this.add.text(0, 8, displayPlant.label, {
    fontSize: '7px',
    color: '#dcedc8',
    fontFamily: 'monospace',
  }).setOrigin(0.5, 0);
  container.add(label);

  if (displayPlant.creatorRole && displayPlant.creatorRole !== 'unassigned') {
    const dotColor = displayPlant.creatorRole === 'planter' ? 0x66bb6a
      : displayPlant.creatorRole === 'weeder' ? 0xffa726
      : displayPlant.creatorRole === 'tester' ? 0x42a5f5
      : 0xce93d8;
    const dot = this.add.circle(-14, 4, 4, dotColor).setDepth(15);
    container.add(dot);
  }

  return container;
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors (the return type of `getPlantStyle` changed — ensure all callers are updated)

- [ ] **Step 6: Build and visually verify**

Run: `npm run build && npx electron .`

Check that:
- Plants render with sprite tops instead of geometric shapes
- Different file extensions show different sprites/tints
- Growth animations still work (stem grows, then top pops in)
- Merged plants show a scaled bush sprite with badge
- File modification pulse still works

- [ ] **Step 7: Commit**

```bash
git add src/renderer/game/scenes/GardenScene.ts
git commit -m "feat: replace procedural plant tops with sprite frames"
```

---

### Task 4: Restyle garden beds

**Files:**
- Modify: `src/renderer/game/scenes/GardenScene.ts:31` (bedMap type)
- Modify: `src/renderer/game/scenes/GardenScene.ts:639-657` (renderBedVisuals)
- Modify: `src/renderer/game/scenes/GardenScene.ts:411-421` (applyTheme)

- [ ] **Step 1: Change bedMap type**

At line 31 of `GardenScene.ts`, change:

```typescript
private bedMap = new Map<string, Phaser.GameObjects.Rectangle>();
```

to:

```typescript
private bedMap = new Map<string, Phaser.GameObjects.Graphics>();
```

- [ ] **Step 2: Replace renderBedVisuals()**

Replace `renderBedVisuals()` (lines 639-657) with the new bordered/textured version:

```typescript
private renderBedVisuals() {
  for (const bed of this.bedMap.values()) {
    bed.destroy();
  }
  this.bedMap.clear();

  const theme = this.themeManager.current;

  for (const bed of this.gardenBeds) {
    const g = this.add.graphics();
    g.setDepth(1);

    // Shadow (offset 2px right and down)
    g.fillStyle(theme.soilShadow, 1);
    g.fillRect(bed.x - bed.width / 2 + 2, bed.y - bed.height / 2 + 2, bed.width, bed.height);

    // Soil fill
    g.fillStyle(theme.soilFill, 1);
    g.fillRect(bed.x - bed.width / 2, bed.y - bed.height / 2, bed.width, bed.height);

    // Border
    g.lineStyle(2, theme.soilBorder, 1);
    g.strokeRect(bed.x - bed.width / 2, bed.y - bed.height / 2, bed.width, bed.height);

    // Soil grain dots (deterministic positions from bed ID)
    g.fillStyle(theme.soilDots, 0.3);
    for (let i = 0; i < 8; i++) {
      const hash = bed.id.charCodeAt(i % bed.id.length) * (i + 1);
      const dotX = bed.x - bed.width / 2 + 8 + (hash * 7) % (bed.width - 16);
      const dotY = bed.y - bed.height / 2 + 8 + (hash * 13) % (bed.height - 16);
      const dotR = 1 + (hash % 2);
      g.fillCircle(dotX, dotY, dotR);
    }

    this.bedMap.set(bed.id, g);
  }
}
```

- [ ] **Step 3: Update applyTheme() to re-render beds**

In `applyTheme()` (lines 411-421), add a call to `renderBedVisuals()` after the existing updates:

```typescript
private applyTheme(theme: GardenTheme) {
  for (const tile of this.groundTiles) {
    tile.setFillStyle(theme.groundLight);
  }

  // Title
  this.titleText.setColor(theme.titleColor);

  // Update game background
  this.cameras.main.setBackgroundColor(theme.backgroundColor);

  // Re-render beds with new soil palette
  this.renderBedVisuals();
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors. The `clearPlants()` method calls `.destroy()` on bedMap values — both `Rectangle` and `Graphics` have `.destroy()`, so no change needed there.

- [ ] **Step 5: Run tests**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: 334 passed, 0 failed

- [ ] **Step 6: Build and visually verify**

Run: `npm run build && npx electron .`

Check that:
- Beds show dark soil fill with visible border (not transparent rectangles)
- Soil grain dots are visible inside beds
- Shadow is visible below/right of each bed
- Switching themes updates bed colors correctly
- Plants still render inside beds correctly

- [ ] **Step 7: Commit**

```bash
git add src/renderer/game/scenes/GardenScene.ts
git commit -m "feat: restyle garden beds with bordered soil appearance"
```

---

### Task 5: Final integration verification

- [ ] **Step 1: Full build and test**

Run: `npx tsc --outDir test-build --skipLibCheck && node test-all.js`
Expected: 334 passed, 0 failed

Run: `npm run build`
Expected: Builds without error

- [ ] **Step 2: Visual smoke test**

Launch: `npx electron .`

Verify across all 5 themes (use theme picker):
- [ ] Garden: Brown soil beds, sprite plants render
- [ ] Desert: Sandy soil beds, plants visible
- [ ] Zen: Gray stone beds, plants visible
- [ ] Underwater: Dark seafloor beds, plants visible
- [ ] Space: Dark rock beds, plants visible

Verify interactions:
- [ ] Resize window — beds and plants rebuild correctly
- [ ] Minimize and restore — no blank garden
- [ ] Plants grow with animation when files change
- [ ] Merged plants show badge with file count
- [ ] Day/night cycle still works
- [ ] Weather effects still work

- [ ] **Step 3: Commit any final adjustments**

If any visual tweaks were needed (frame index corrections, positioning), commit them:

```bash
git add -A
git commit -m "fix: adjust sprite frames and bed positioning"
```
