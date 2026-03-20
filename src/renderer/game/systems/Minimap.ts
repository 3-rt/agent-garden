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
      // Container uses scrollFactor(0), so use screen-space pointer coords
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

    // Position minimap at bottom-right of screen.
    // setScrollFactor(0) keeps it fixed to the camera; we just need screen-space coords.
    this.container.setPosition(
      cam.width - this.mapWidth - 10,
      cam.height - this.mapHeight - 10,
    );

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
