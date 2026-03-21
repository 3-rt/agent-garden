import Phaser from 'phaser';
import type { GardenBedState } from '../../../shared/types';
import { GAME_DPR } from '../dpr';

// Place minimap objects far off in world-space where nothing else exists.
// The UI camera viewport is scrolled to this position; the main camera never sees it.
const UI_OFFSET_X = 100000;
const UI_OFFSET_Y = 100000;

export class Minimap {
  private scene: Phaser.Scene;
  private uiCamera: Phaser.Cameras.Scene2D.Camera;
  private container: Phaser.GameObjects.Container;
  private background: Phaser.GameObjects.Rectangle;
  private viewportIndicator: Phaser.GameObjects.Rectangle;
  private playerDot: Phaser.GameObjects.Arc;
  private bedGraphics: Phaser.GameObjects.Graphics;

  private readonly margin = 10;
  // Content bounds — computed from beds, used for mapping
  private contentX = 0;
  private contentY = 0;
  private contentWidth: number;
  private contentHeight: number;
  // Actual minimap pixel dimensions (recomputed to match content aspect ratio)
  private mapWidth = 200;
  private mapHeight = 150;
  private readonly maxMapWidth = 200;
  private readonly maxMapHeight = 150;

  constructor(scene: Phaser.Scene, worldWidth: number, worldHeight: number) {
    this.scene = scene;
    this.contentWidth = worldWidth;
    this.contentHeight = worldHeight;

    const cam = scene.cameras.main;
    const dpr = GAME_DPR;
    const vpW = this.mapWidth * dpr;
    const vpH = this.mapHeight * dpr;
    const vpMargin = this.margin * dpr;

    // Create a small UI camera whose viewport sits at the bottom-right of the screen.
    // It is scrolled to the far-off UI_OFFSET so it only renders the minimap objects.
    this.uiCamera = scene.cameras.add(
      cam.width - vpW - vpMargin,
      cam.height - vpH - vpMargin,
      vpW,
      vpH,
    );
    this.uiCamera.setScroll(UI_OFFSET_X, UI_OFFSET_Y);
    this.uiCamera.setZoom(dpr);
    this.uiCamera.setBackgroundColor('rgba(0,0,0,0)');
    this.uiCamera.transparent = true;

    // Background (positioned at 0,0 relative to container)
    this.background = scene.add.rectangle(
      0, 0,
      this.mapWidth, this.mapHeight, 0x000000, 0.25,
    ).setOrigin(0, 0);

    // Bed markers
    this.bedGraphics = scene.add.graphics();

    // Viewport indicator
    this.viewportIndicator = scene.add.rectangle(0, 0, 10, 10)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 1)
      .setFillStyle(0xffffff, 0.1);

    // Player dot
    this.playerDot = scene.add.circle(0, 0, 3, 0x42a5f5);

    this.container = scene.add.container(UI_OFFSET_X, UI_OFFSET_Y, [
      this.background,
      this.bedGraphics,
      this.viewportIndicator,
      this.playerDot,
    ]);
    this.container.setDepth(300);

    // Main camera ignores minimap objects (they're far off-screen anyway, but be explicit)
    cam.ignore(this.container);
    cam.ignore(this.background);
    cam.ignore(this.bedGraphics);
    cam.ignore(this.viewportIndicator);
    cam.ignore(this.playerDot);

    // Click on minimap to teleport camera
    this.background.setInteractive();
    this.background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // pointer.x/y are canvas coords; subtract the UI camera viewport position
      const vpX = this.uiCamera.x;
      const vpY = this.uiCamera.y;
      const localX = (pointer.x - vpX) / GAME_DPR;
      const localY = (pointer.y - vpY) / GAME_DPR;
      if (localX < 0 || localY < 0 || localX > this.mapWidth || localY > this.mapHeight) return;
      const worldX = this.contentX + (localX / this.mapWidth) * this.contentWidth;
      const worldY = this.contentY + (localY / this.mapHeight) * this.contentHeight;
      cam.scrollX = worldX - cam.width * 0.5;
      cam.scrollY = worldY - cam.height * 0.5;
    });
  }

  updateBeds(beds: GardenBedState[], zoneColors: Record<string, number>) {
    // Compute tight content bounds from beds
    if (beds.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const bed of beds) {
        const left = bed.x - bed.width / 2;
        const right = bed.x + bed.width / 2;
        const top = bed.y - bed.height / 2;
        const bottom = bed.y + bed.height / 2;
        if (left < minX) minX = left;
        if (right > maxX) maxX = right;
        if (top < minY) minY = top;
        if (bottom > maxY) maxY = bottom;
      }
      const pad = 20; // small padding around beds
      this.contentX = minX - pad;
      this.contentY = minY - pad;
      this.contentWidth = maxX - minX + pad * 2;
      this.contentHeight = maxY - minY + pad * 2;
    }

    // Resize minimap to match content aspect ratio
    const aspect = this.contentWidth / this.contentHeight;
    if (aspect > this.maxMapWidth / this.maxMapHeight) {
      this.mapWidth = this.maxMapWidth;
      this.mapHeight = Math.round(this.maxMapWidth / aspect);
    } else {
      this.mapHeight = this.maxMapHeight;
      this.mapWidth = Math.round(this.maxMapHeight * aspect);
    }
    this.background.setSize(this.mapWidth, this.mapHeight);

    // Draw bed markers
    this.bedGraphics.clear();
    for (const bed of beds) {
      const mx = ((bed.x - this.contentX) / this.contentWidth) * this.mapWidth;
      const my = ((bed.y - this.contentY) / this.contentHeight) * this.mapHeight;
      const mw = (bed.width / this.contentWidth) * this.mapWidth;
      const mh = (bed.height / this.contentHeight) * this.mapHeight;
      const color = zoneColors[bed.zone] || 0x8d6e63;
      this.bedGraphics.fillStyle(color, 0.8);
      this.bedGraphics.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
    }
  }

  update(playerX: number, playerY: number) {
    const cam = this.scene.cameras.main;

    // Keep UI camera viewport at bottom-right corner (handles window resize)
    const dpr = GAME_DPR;
    const vpW = this.mapWidth * dpr;
    const vpH = this.mapHeight * dpr;
    const vpMargin = this.margin * dpr;
    this.uiCamera.setViewport(
      cam.width - vpW - vpMargin,
      cam.height - vpH - vpMargin,
      vpW,
      vpH,
    );

    // Update viewport indicator using worldView (accounts for zoom correctly)
    const wv = cam.worldView;
    const vx = ((wv.x - this.contentX) / this.contentWidth) * this.mapWidth;
    const vy = ((wv.y - this.contentY) / this.contentHeight) * this.mapHeight;
    const vw = (wv.width / this.contentWidth) * this.mapWidth;
    const vh = (wv.height / this.contentHeight) * this.mapHeight;
    this.viewportIndicator.setPosition(vx, vy);
    this.viewportIndicator.setSize(vw, vh);

    // Update player dot
    const px = ((playerX - this.contentX) / this.contentWidth) * this.mapWidth;
    const py = ((playerY - this.contentY) / this.contentHeight) * this.mapHeight;
    this.playerDot.setPosition(px, py);
  }

  setWorldSize(_width: number, _height: number) {
    // Content bounds are now computed from beds in updateBeds(),
    // so world size is no longer needed here.
  }

  destroy() {
    this.scene.cameras.remove(this.uiCamera);
    this.container.destroy();
  }
}
