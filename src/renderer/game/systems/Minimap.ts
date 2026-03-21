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

  private readonly mapWidth = 200;
  private readonly mapHeight = 150;
  private readonly margin = 10;
  private worldWidth: number;
  private worldHeight: number;

  constructor(scene: Phaser.Scene, worldWidth: number, worldHeight: number) {
    this.scene = scene;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

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
      const worldX = (localX / this.mapWidth) * this.worldWidth;
      const worldY = (localY / this.mapHeight) * this.worldHeight;
      cam.scrollX = worldX - cam.width * 0.5;
      cam.scrollY = worldY - cam.height * 0.5;
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
    // Clamp to minimap bounds so it doesn't overflow outside the background
    const wv = cam.worldView;
    const rawX = (wv.x / this.worldWidth) * this.mapWidth;
    const rawY = (wv.y / this.worldHeight) * this.mapHeight;
    const rawW = (wv.width / this.worldWidth) * this.mapWidth;
    const rawH = (wv.height / this.worldHeight) * this.mapHeight;

    const vx = Math.max(0, rawX);
    const vy = Math.max(0, rawY);
    const vw = Math.min(this.mapWidth - vx, rawW - (vx - rawX));
    const vh = Math.min(this.mapHeight - vy, rawH - (vy - rawY));

    this.viewportIndicator.setPosition(vx, vy);
    this.viewportIndicator.setSize(Math.max(0, vw), Math.max(0, vh));

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
    this.scene.cameras.remove(this.uiCamera);
    this.container.destroy();
  }
}
