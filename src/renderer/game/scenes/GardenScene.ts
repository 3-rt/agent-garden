import Phaser from 'phaser';
import { Agent } from '../sprites/Agent';

export class GardenScene extends Phaser.Scene {
  private agent!: Agent;
  private speechBubble!: Phaser.GameObjects.Container;
  private speechText!: Phaser.GameObjects.Text;
  private plants: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super({ key: 'GardenScene' });
  }

  create() {
    const { width, height } = this.scale;

    // Draw ground grid pattern
    for (let x = 0; x < width; x += 32) {
      for (let y = 0; y < height; y += 32) {
        const shade = ((x / 32 + y / 32) % 2 === 0) ? 0x2d5a27 : 0x306b2b;
        this.add.rectangle(x + 16, y + 16, 32, 32, shade);
      }
    }

    // Garden path
    for (let x = 0; x < width; x += 32) {
      this.add.rectangle(x + 16, height / 2, 32, 32, 0x8b7355);
    }

    // Create agent
    this.agent = new Agent(this, 100, height / 2);

    // Speech bubble (hidden by default)
    const bg = this.add.rectangle(0, -40, 200, 30, 0xffffff, 0.9).setOrigin(0.5);
    this.speechText = this.add.text(0, -40, '', {
      fontSize: '10px',
      color: '#333',
      fontFamily: 'monospace',
      wordWrap: { width: 180 },
    }).setOrigin(0.5);
    this.speechBubble = this.add.container(100, height / 2, [bg, this.speechText]);
    this.speechBubble.setVisible(false);

    // Title
    this.add.text(width / 2, 20, 'Agent Garden', {
      fontSize: '20px',
      color: '#c8e6c9',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  startTask() {
    const { width, height } = this.scale;
    const targetX = 200 + Math.random() * (width - 400);

    this.agent.walkTo(targetX, height / 2);
    this.speechBubble.setVisible(true);
    this.speechText.setText('Thinking...');
  }

  showThought(text: string) {
    const truncated = text.length > 40 ? text.slice(-40) : text;
    this.speechText.setText(truncated);
    this.speechBubble.setPosition(this.agent.x, this.agent.y);
  }

  completeTask() {
    this.speechText.setText('Done!');
    this.time.delayedCall(1500, () => {
      this.speechBubble.setVisible(false);
    });

    // Grow a plant where the agent is
    this.growPlant(this.agent.x, this.agent.y - 40);

    // Agent returns to idle position
    this.agent.walkTo(100, this.scale.height / 2);
  }

  private growPlant(x: number, y: number) {
    const plant = this.add.rectangle(x, y, 8, 0, 0x4caf50);
    this.plants.push(plant);

    // Animate plant growing upward
    this.tweens.add({
      targets: plant,
      height: { from: 0, to: 24 + Math.random() * 16 },
      y: y - 12,
      duration: 800,
      ease: 'Back.easeOut',
    });

    // Add a leaf/flower on top after growth
    this.time.delayedCall(800, () => {
      const colors = [0x66bb6a, 0x43a047, 0xef5350, 0xffee58, 0xab47bc];
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.add.circle(x, y - 28, 5, color);
    });
  }
}
