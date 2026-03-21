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
      // Pass false for enableCapture so Phaser doesn't preventDefault —
      // this lets WASD/Space propagate to HTML input fields when focused
      this.wasd = {
        W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
        A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
        S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
        D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
      };
      this.spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
    }

    // Camera follows player
    cameraController.startFollow(this.container);
  }

  update(delta: number) {
    if (!this.scene.input.keyboard?.enabled) return;

    // Don't capture movement keys while user is typing in a UI input
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;

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
