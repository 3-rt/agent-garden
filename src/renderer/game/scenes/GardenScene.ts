import Phaser from 'phaser';
import { Agent } from '../sprites/Agent';

export class GardenScene extends Phaser.Scene {
  private agent!: Agent;
  private plantMap = new Map<string, Phaser.GameObjects.Container>();
  private nextPlantSlot = 0;
  private accumulatedText = '';

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
    this.accumulatedText = '';

    this.agent.walkTo(targetX, height / 2, () => {
      this.agent.setState('working');
    });
    this.agent.showSpeechStatic('Thinking...');
  }

  showThought(text: string) {
    this.accumulatedText += text;
    // Extract meaningful snippet: look for function/class names or show tail
    const display = this.extractSnippet(this.accumulatedText);
    this.agent.showSpeech(display);
  }

  completeTask() {
    this.agent.showSpeechStatic('Done!');
    this.time.delayedCall(1500, () => {
      this.agent.hideSpeech(true);
    });
    this.agent.walkTo(100, this.scale.height / 2, () => {
      this.agent.setState('idle');
    });
  }

  showError() {
    this.agent.setState('error');
    this.agent.showSpeechStatic('Error!');
    this.time.delayedCall(3000, () => {
      this.agent.hideSpeech(true);
    });
  }

  onFileCreated(filename: string) {
    if (this.plantMap.has(filename)) return;

    const { width, height } = this.scale;
    const x = this.getPlantX(width);
    const above = this.nextPlantSlot % 2 === 0;
    const y = above
      ? height / 2 - 60 - Math.random() * 40
      : height / 2 + 60 + Math.random() * 40;
    this.nextPlantSlot++;

    const plant = this.growPlant(x, y, filename);
    this.plantMap.set(filename, plant);

    // Particle burst
    this.emitParticles(x, y);
  }

  onFileModified(filename: string) {
    const plant = this.plantMap.get(filename);
    if (!plant) return;

    this.tweens.add({
      targets: plant,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 200,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });

    // Small shimmer particles
    this.emitParticles(plant.x, plant.y, 3);
  }

  private extractSnippet(text: string): string {
    // Try to find a function or class name
    const funcMatch = text.match(/(?:function|const|class|export)\s+(\w+)/);
    if (funcMatch) return funcMatch[0].slice(0, 50);

    // Try to find a comment
    const commentMatch = text.match(/\/\/\s*(.+)/);
    if (commentMatch && !commentMatch[1].startsWith('@file')) {
      return commentMatch[1].slice(0, 50);
    }

    // Fall back to tail of text
    const clean = text.replace(/\n/g, ' ').trim();
    return clean.length > 50 ? clean.slice(-50) : clean;
  }

  private emitParticles(x: number, y: number, count = 6) {
    const colors = [0x66bb6a, 0x43a047, 0xffee58, 0x81c784];
    for (let i = 0; i < count; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const particle = this.add.circle(x, y, 2 + Math.random() * 2, color);
      particle.setDepth(50);
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 25;
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 10,
        alpha: 0,
        scale: 0,
        duration: 500 + Math.random() * 300,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private getPlantX(width: number): number {
    const margin = 80;
    const usable = width - margin * 2;
    const slot = this.nextPlantSlot;
    const golden = 0.618033988749895;
    const normalized = ((slot * golden) % 1);
    return margin + normalized * usable;
  }

  private growPlant(x: number, y: number, filename: string): Phaser.GameObjects.Container {
    const ext = filename.split('.').pop() || '';
    const isTest = filename.includes('.test.') || filename.includes('.spec.');
    const { stemColor, topColor, topShape } = isTest
      ? { stemColor: 0x8d6e63, topColor: 0xff8a65, topShape: 'dome' as const }
      : this.getPlantStyle(ext);

    const stem = this.add.rectangle(0, 0, 6, 0, stemColor).setOrigin(0.5, 1);
    const container = this.add.container(x, y, [stem]);

    const targetHeight = 20 + Math.random() * 20;

    this.tweens.add({
      targets: stem,
      height: { from: 0, to: targetHeight },
      duration: 800,
      ease: 'Back.easeOut',
    });

    this.time.delayedCall(800, () => {
      let top: Phaser.GameObjects.Shape;
      if (topShape === 'circle') {
        top = this.add.circle(0, -targetHeight, 6, topColor);
      } else if (topShape === 'triangle') {
        top = this.add.triangle(0, -targetHeight - 4, -8, 8, 8, 8, 0, -4, topColor);
      } else if (topShape === 'dome') {
        // Mushroom dome
        top = this.add.ellipse(0, -targetHeight, 14, 8, topColor);
      } else {
        top = this.add.rectangle(0, -targetHeight, 12, 8, topColor);
      }
      container.add(top);

      top.setScale(0);
      this.tweens.add({
        targets: top,
        scaleX: 1,
        scaleY: 1,
        duration: 300,
        ease: 'Back.easeOut',
      });
    });

    const label = this.add.text(
      0, 8,
      filename.length > 12 ? filename.slice(0, 12) + '..' : filename,
      { fontSize: '7px', color: '#a0c8a0', fontFamily: 'monospace' },
    ).setOrigin(0.5, 0);
    container.add(label);

    return container;
  }

  private getPlantStyle(ext: string): { stemColor: number; topColor: number; topShape: string } {
    switch (ext) {
      case 'tsx': return { stemColor: 0x4caf50, topColor: 0xef5350, topShape: 'circle' };
      case 'ts':  return { stemColor: 0x6d4c41, topColor: 0x43a047, topShape: 'triangle' };
      case 'css': return { stemColor: 0x4caf50, topColor: 0x42a5f5, topShape: 'rectangle' };
      case 'json':return { stemColor: 0x8d6e63, topColor: 0xffee58, topShape: 'circle' };
      default:    return { stemColor: 0x4caf50, topColor: 0xab47bc, topShape: 'circle' };
    }
  }
}
