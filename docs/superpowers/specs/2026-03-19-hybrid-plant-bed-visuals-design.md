# Hybrid Plant & Bed Visuals

**Date:** 2026-03-19
**Status:** Approved

## Summary

Replace procedural geometric plant tops with sprite frames from `objects.png` and restyle garden beds with bordered soil appearance. Keep existing layout logic, stems, labels, animations, and theme system unchanged.

## Plant Sprites

### Spritesheet Setup

Add a `preload()` method to `GardenScene` (it does not currently have one). Load `objects.png` as a Phaser spritesheet with 16x16 pixel tile size. The spritesheet is 528x320 pixels = 33 columns x 20 rows.

Asset path for `this.load.spritesheet()`: use the path relative to the HTML file's location, matching how other assets would be resolved from `dist/renderer/index.html`. Verify the correct runtime path during implementation by checking webpack's asset output.

### Sprite Frame Coordinates

The plant sprites in `objects.png` are located in rows 8-11 (y: 128-192px). Exact frame indices (column + row * 33):

| Sprite | Grid Position (col, row) | Frame Index | Notes |
|---|---|---|---|
| Red flower | (1, 8) | 265 | Red-petaled flower on soil base |
| Green bush (large) | (10, 9) | 307 | Round green bush |
| Green bush (small) | (8, 9) | 305 | Smaller bush variant |
| Yellow flower | (14, 8) | 278 | Yellow-petaled flower |
| Mushroom | Identify during impl | TBD | If no mushroom frame exists, use yellow flower with brown tint |

**Note:** These frame indices are approximate based on visual inspection. The implementer must verify exact coordinates by loading the spritesheet and inspecting frames. If the sprites are 32x32 (2x2 tiles), load a second copy as a 32x32 spritesheet or use `Phaser.Textures.Texture.add()` to define custom frames.

### File Type to Sprite Mapping

| File Type | Sprite | Tint |
|---|---|---|
| `.tsx` / `.jsx` | Red flower frame | None (natural red) |
| `.ts` / `.js` | Green bush (large) | None (natural green) |
| `.css` / `.scss` | Red flower frame | `setTint(0x42a5f5)` for blue |
| `.json` / `.yaml` | Yellow flower frame | None (natural yellow) |
| `.test.*` / `.spec.*` | Red flower frame | `setTint(0xce93d8)` for pink/purple |
| `.md` / `.txt` | Green bush (small) | `setTint(0xa5d6a7)` for light green |
| **All other extensions** | Green bush (small) | None (default fallback) |

All file extensions not listed above use the default green bush sprite. This includes `.html`, `.svg`, `.py`, `.go`, `.rs`, `.sh`, etc.

### Rendering Changes

Plant tops render as Phaser `Image` (static frame) instead of `Graphics` shapes:
- Replace the circle/triangle/rectangle/ellipse drawing in `growPlant()` with `this.add.image(x, y, 'objects', frameIndex)`
- Apply tint via `image.setTint(color)` where specified
- Sprite is positioned above the procedural stem, same as current shape placement
- Sprite uses `pixelArt: true` scaling (already set in game config)
- Growth animation: sprite scales from 0 to 1 (same `Back.easeOut` easing, same 300ms timing after 800ms stem grow)
- File modification pulse: same scale tween (1.3x over 200ms with yoyo)

### Merged Plants

For merged/clustered plants (>24 files threshold):
- Use the large green bush sprite frame
- Scale to match the current ellipse dimensions: `setScale(targetWidth / 16, targetHeight / 16)` where `targetWidth` and `targetHeight` come from the existing growthScale calculation (currently 34x22 for the ellipse)
- Badge overlay (yellow circle with file count) stays the same
- Label and role dot unchanged

### Unchanged

- Procedural stems (brown/green rectangles below sprite)
- Filename labels (7px monospace below stem)
- Role attribution dots (colored circles)
- Particle effects on file creation
- Growth animations (timing and easing)
- Plant clustering logic and thresholds

## Garden Beds

### Visual Treatment

Replace the current 35%-opacity `Phaser.GameObjects.Rectangle` with a `Phaser.GameObjects.Graphics` object per bed:

- **Shadow**: Draw a filled rectangle offset 2px right and 2px down in the shadow color
- **Fill**: Draw a filled rectangle in the soil fill color
- **Border**: Draw a 2px stroke rectangle in the soil border color
- **Inner texture**: Draw 8 small filled circles (2-3px radius) at deterministic positions inside the bed for soil grain effect, at 30% alpha in the soil dots color. Positions are derived from a simple hash of the bed ID (e.g., `bedId.charCodeAt(i) % width`) so they remain stable across re-renders and resizes.

### Type Change: `bedMap`

The `bedMap` type in `GardenScene` changes from `Map<string, Phaser.GameObjects.Rectangle>` to `Map<string, Phaser.GameObjects.Graphics>`. Update all references:
- `renderBedVisuals()` — creates `Graphics` instead of `Rectangle`
- `clearPlants()` — destroy calls remain the same (both have `.destroy()`)
- Any other access to `bedMap` values

### Theme Re-rendering

When `applyTheme()` is called (theme change), it must now also call `renderBedVisuals()` to re-render beds with the new soil palette colors. Add this call after the existing ground tile updates in `applyTheme()`.

### Dimensions

Same as current — no layout logic changes:
- Width: 96-140px depending on zone
- Height: 88px (single row) or 82px (multi-row)
- Spacing: 24px horizontal, 26px vertical
- Bed count derived from file count per zone (same `deriveBedCount` logic)

## Theme Soil Palettes

### Interface Change

Add four new fields to the `GardenTheme` interface in `ThemeManager.ts`:

```typescript
export interface GardenTheme {
  // ... existing fields ...
  soilFill: number;
  soilBorder: number;
  soilDots: number;
  soilShadow: number;
}
```

### Theme Values

| Theme | soilFill | soilBorder | soilDots | soilShadow |
|---|---|---|---|---|
| Garden | `0x5a3a1a` | `0x8B6914` | `0x7a5a2a` | `0x3a2510` |
| Desert | `0xb89b3e` | `0xd4b84a` | `0xc8ab4e` | `0x8a7530` |
| Zen | `0x8a8278` | `0xb0a898` | `0x9a9288` | `0x6a6258` |
| Underwater | `0x1a3a4e` | `0x2a5a6e` | `0x2a4a5e` | `0x0a2a3e` |
| Space | `0x2a2a3e` | `0x4a4a6e` | `0x3a3a4e` | `0x1a1a2e` |

Note: Values are hex numbers (Phaser color format), not CSS strings.

## Files Changed

| File | Change |
|---|---|
| `GardenScene.ts` | Add `preload()` to load `objects.png` spritesheet. Replace shape drawing in `growPlant()` with `Image` from sprite frame + optional tint. Replace ellipse in `growMergedPlant()` with scaled sprite. Replace `renderBedVisuals()` with `Graphics`-based bordered/textured bed. Change `bedMap` type from `Rectangle` to `Graphics`. Add `renderBedVisuals()` call in `applyTheme()`. |
| `ThemeManager.ts` | Add `soilFill`, `soilBorder`, `soilDots`, `soilShadow` fields to `GardenTheme` interface. Add values to all 5 theme definitions. |

No new files. No layout logic changes. No changes to `plant-clusters.ts`, `garden-bed-layout.ts`, or any main process code.

## Migration

No migration needed. Saved gardens persist plant state and bed geometry (positions, dimensions), not rendering details. The new rendering reads the same state and draws it differently. Theme IDs are persisted as strings; the updated theme objects just have additional fields.

## Testing

Existing test suite (334 tests) should continue to pass since no layout logic changes. Visual changes are renderer-only and not covered by the current test file.
