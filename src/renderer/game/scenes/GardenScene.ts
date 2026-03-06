import Phaser from 'phaser';
import { Agent } from '../sprites/Agent';

export class GardenScene extends Phaser.Scene {
  private agent!: Agent;
  private speechBubble!: Phaser.GameObjects.Container;
  private speechText!: Phaser.GameObjects.Text;
  private plantMap = new Map<string, Phaser.GameObjects.Container>();
  private nextPlantSlot = 0;

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

    // Agent returns to idle position
    this.agent.walkTo(100, this.scale.height / 2);
  }

  onFileCreated(filename: string) {
    if (this.plantMap.has(filename)) return;

    const { width, height } = this.scale;
    const x = this.getPlantX(width);
    // Place plants above or below the path
    const above = this.nextPlantSlot % 2 === 0;
    const y = above
      ? height / 2 - 60 - Math.random() * 40
      : height / 2 + 60 + Math.random() * 40;
    this.nextPlantSlot++;

    const plant = this.growPlant(x, y, filename);
    this.plantMap.set(filename, plant);
  }

  onFileModified(filename: string) {
    const plant = this.plantMap.get(filename);
    if (!plant) return;

    // Pulse effect on modification
    this.tweens.add({
      targets: plant,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 200,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }

  private getPlantX(width: number): number {
    // Spread plants across the garden, avoiding edges
    const margin = 80;
    const usable = width - margin * 2;
    const slot = this.nextPlantSlot;
    // Use golden ratio spacing for natural-looking distribution
    const golden = 0.618033988749895;
    const normalized = ((slot * golden) % 1);
    return margin + normalized * usable;
  }

  private growPlant(x: number, y: number, filename: string): Phaser.GameObjects.Container {
    const ext = filename.split('.').pop() || '';
    const { stemColor, topColor, topShape } = this.getPlantStyle(ext);

    const stem = this.add.rectangle(0, 0, 6, 0, stemColor).setOrigin(0.5, 1);
    const container = this.add.container(x, y, [stem]);

    const targetHeight = 20 + Math.random() * 20;

    // Animate stem growing
    this.tweens.add({
      targets: stem,
      height: { from: 0, to: targetHeight },
      duration: 800,
      ease: 'Back.easeOut',
    });

    // Add top (flower/leaf) after stem grows
    this.time.delayedCall(800, () => {
      let top: Phaser.GameObjects.Shape;
      if (topShape === 'circle') {
        top = this.add.circle(0, -targetHeight, 6, topColor);
      } else if (topShape === 'triangle') {
        top = this.add.triangle(0, -targetHeight - 4, -8, 8, 8, 8, 0, -4, topColor);
      } else {
        top = this.add.rectangle(0, -targetHeight, 12, 8, topColor);
      }
      container.add(top);

      // Pop-in effect
      top.setScale(0);
      this.tweens.add({
        targets: top,
        scaleX: 1,
        scaleY: 1,
        duration: 300,
        ease: 'Back.easeOut',
      });
    });

    // Small label
    const label = this.add.text(0, 8, filename.length > 12 ? filename.slice(0, 12) + '..' : filename, {
      fontSize: '7px',
      color: '#a0c8a0',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    container.add(label);

    return container;
  }

  private getPlantStyle(ext: string): { stemColor: number; topColor: number; topShape: string } {
    switch (ext) {
      case 'tsx': return { stemColor: 0x4caf50, topColor: 0xef5350, topShape: 'circle' };   // red flower
      case 'ts':  return { stemColor: 0x6d4c41, topColor: 0x43a047, topShape: 'triangle' }; // green tree
      case 'css': return { stemColor: 0x4caf50, topColor: 0x42a5f5, topShape: 'rectangle' };// blue bush
      case 'json':return { stemColor: 0x8d6e63, topColor: 0xffee58, topShape: 'circle' };   // yellow dot
      default:    return { stemColor: 0x4caf50, topColor: 0xab47bc, topShape: 'circle' };    // purple flower
    }
  }
}
