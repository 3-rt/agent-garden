import Phaser from 'phaser';

export class Agent {
  public x: number;
  public y: number;
  private container: Phaser.GameObjects.Container;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    // Simple pixel art gardener made of shapes
    const body = scene.add.rectangle(0, 4, 16, 20, 0x5d4037);
    const head = scene.add.rectangle(0, -12, 12, 12, 0xffcc80);
    const hat = scene.add.triangle(0, -22, -10, 4, 10, 4, 0, -6, 0x388e3c);

    this.container = scene.add.container(x, y, [body, head, hat]);

    // Idle bob animation
    scene.tweens.add({
      targets: this.container,
      y: y - 2,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  walkTo(targetX: number, targetY: number) {
    this.x = targetX;
    this.y = targetY;
    this.scene.tweens.add({
      targets: this.container,
      x: targetX,
      y: targetY,
      duration: 1000,
      ease: 'Quad.easeInOut',
    });
  }
}
