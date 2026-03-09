import Phaser from 'phaser';
import type { AgentRole } from '../../../shared/types';

export type AgentState = 'idle' | 'walking' | 'working' | 'error';

const HAT_COLORS: Record<AgentRole, number> = {
  planter: 0x388e3c,  // green
  weeder: 0xf57c00,   // orange
  tester: 0x1565c0,   // blue
};

const MAX_CONTEXT_TOKENS = 200000;

export class Agent {
  public readonly id: string;
  public readonly role: AgentRole;
  public x: number;
  public y: number;
  public homeX: number;
  public homeY: number;
  private container: Phaser.GameObjects.Container;
  private scene: Phaser.Scene;
  private body: Phaser.GameObjects.Rectangle;
  private head: Phaser.GameObjects.Rectangle;
  private hat: Phaser.GameObjects.Triangle;
  private leftLeg: Phaser.GameObjects.Rectangle;
  private rightLeg: Phaser.GameObjects.Rectangle;
  private tool: Phaser.GameObjects.Rectangle;
  private stateIndicator: Phaser.GameObjects.Arc;
  private nameLabel: Phaser.GameObjects.Text;
  private backpack: Phaser.GameObjects.Rectangle;
  private backpackFill: Phaser.GameObjects.Rectangle;
  private idleTween: Phaser.Tweens.Tween | null = null;
  private legTween: Phaser.Tweens.Tween | null = null;
  private toolTween: Phaser.Tweens.Tween | null = null;
  private _state: AgentState = 'idle';
  private _totalTokens = 0;

  // Speech bubble
  private speechBubble: Phaser.GameObjects.Container;
  private speechBg: Phaser.GameObjects.Rectangle;
  private speechText: Phaser.GameObjects.Text;
  private speechTail: Phaser.GameObjects.Triangle;
  private speechFadeTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, id: string, role: AgentRole) {
    this.scene = scene;
    this.id = id;
    this.role = role;
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;

    const hatColor = HAT_COLORS[role];

    // Legs
    this.leftLeg = scene.add.rectangle(-4, 16, 5, 10, 0x4e342e);
    this.rightLeg = scene.add.rectangle(4, 16, 5, 10, 0x4e342e);

    // Body
    this.body = scene.add.rectangle(0, 4, 16, 20, 0x5d4037);

    // Head
    this.head = scene.add.rectangle(0, -12, 12, 12, 0xffcc80);

    // Hat
    this.hat = scene.add.triangle(0, -22, -10, 4, 10, 4, 0, -6, hatColor);

    // Tool
    this.tool = scene.add.rectangle(12, 0, 3, 14, 0x8d6e63);
    this.tool.setVisible(false);

    // State indicator
    this.stateIndicator = scene.add.circle(8, -22, 3, 0x66bb6a);

    // Backpack (context window viz) - on the back
    this.backpack = scene.add.rectangle(-10, 2, 6, 14, 0x795548).setOrigin(0.5);
    this.backpackFill = scene.add.rectangle(-10, 9, 4, 0, 0x66bb6a).setOrigin(0.5, 1);

    // Name label
    this.nameLabel = scene.add.text(0, 24, role, {
      fontSize: '7px',
      color: '#c8e6c9',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);

    this.container = scene.add.container(x, y, [
      this.leftLeg, this.rightLeg,
      this.body, this.head, this.hat,
      this.tool, this.stateIndicator,
      this.backpack, this.backpackFill,
      this.nameLabel,
    ]);

    // Speech bubble
    this.speechBg = scene.add.rectangle(0, 0, 200, 30, 0xffffff, 0.92)
      .setOrigin(0.5, 1);
    this.speechText = scene.add.text(0, -6, '', {
      fontSize: '10px',
      color: '#333',
      fontFamily: 'monospace',
      wordWrap: { width: 180 },
    }).setOrigin(0.5, 1);
    this.speechTail = scene.add.triangle(0, 2, -6, 0, 6, 0, 0, 8, 0xffffff)
      .setAlpha(0.92);
    this.speechBubble = scene.add.container(x, y - 40, [
      this.speechBg, this.speechText, this.speechTail,
    ]);
    this.speechBubble.setVisible(false);
    this.speechBubble.setDepth(100);

    this.startIdleAnimation();
  }

  get state(): AgentState {
    return this._state;
  }

  get totalTokens(): number {
    return this._totalTokens;
  }

  setTokens(tokens: number) {
    this._totalTokens = tokens;
    this.updateBackpack();
  }

  setState(state: AgentState) {
    if (this._state === state) return;
    this._state = state;

    const colors: Record<AgentState, number> = {
      idle: 0x66bb6a,
      walking: 0x42a5f5,
      working: 0xffca28,
      error: 0xef5350,
    };
    this.stateIndicator.setFillStyle(colors[state]);

    switch (state) {
      case 'idle':
        this.stopLegAnimation();
        this.stopToolAnimation();
        this.tool.setVisible(false);
        this.startIdleAnimation();
        break;
      case 'walking':
        this.stopIdleAnimation();
        this.stopToolAnimation();
        this.tool.setVisible(false);
        this.startLegAnimation();
        break;
      case 'working':
        this.stopIdleAnimation();
        this.stopLegAnimation();
        this.tool.setVisible(true);
        this.startToolAnimation();
        break;
      case 'error':
        this.stopIdleAnimation();
        this.stopLegAnimation();
        this.stopToolAnimation();
        this.tool.setVisible(false);
        this.playErrorAnimation();
        break;
    }
  }

  walkTo(targetX: number, targetY: number, onComplete?: () => void) {
    this.setState('walking');
    this.x = targetX;
    this.y = targetY;

    const distance = Math.abs(targetX - this.container.x);
    const duration = Math.max(500, Math.min(distance * 3, 2000));

    this.scene.tweens.add({
      targets: this.container,
      x: targetX,
      duration,
      ease: 'Quad.easeInOut',
      onComplete: () => onComplete?.(),
    });
  }

  walkHome(onComplete?: () => void) {
    this.walkTo(this.homeX, this.homeY, () => {
      this.setState('idle');
      onComplete?.();
    });
  }

  getContainerX(): number {
    return this.container.x;
  }

  // Speech bubble
  showSpeech(text: string) {
    if (this.speechFadeTween) {
      this.speechFadeTween.stop();
      this.speechFadeTween = null;
    }
    this.speechBubble.setAlpha(1);
    this.speechBubble.setVisible(true);

    const display = text.length > 50 ? text.slice(-50) : text;
    this.speechText.setText(display);

    const textWidth = Math.min(Math.max(this.speechText.width + 20, 60), 220);
    const textHeight = Math.max(this.speechText.height + 12, 24);
    this.speechBg.setSize(textWidth, textHeight);

    this.speechBubble.setPosition(this.container.x, this.container.y - 40);
  }

  showSpeechStatic(text: string) {
    this.showSpeech(text);
  }

  hideSpeech(fade = true) {
    if (fade) {
      this.speechFadeTween = this.scene.tweens.add({
        targets: this.speechBubble,
        alpha: 0,
        duration: 500,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.speechBubble.setVisible(false);
          this.speechFadeTween = null;
        },
      });
    } else {
      this.speechBubble.setVisible(false);
    }
  }

  // Backpack context visualization
  private updateBackpack() {
    const ratio = Math.min(this._totalTokens / MAX_CONTEXT_TOKENS, 1);
    const maxHeight = 12;
    const fillHeight = ratio * maxHeight;

    // Color: green -> yellow -> red
    let color: number;
    if (ratio < 0.25) color = 0x66bb6a;
    else if (ratio < 0.5) color = 0xffca28;
    else if (ratio < 0.75) color = 0xffa726;
    else color = 0xef5350;

    this.scene.tweens.add({
      targets: this.backpackFill,
      height: fillHeight,
      duration: 300,
      ease: 'Sine.easeOut',
    });
    this.backpackFill.setFillStyle(color);
  }

  playPruneAnimation() {
    this._totalTokens = 0;
    // Particles flying off backpack
    for (let i = 0; i < 5; i++) {
      const leaf = this.scene.add.circle(
        this.container.x - 10,
        this.container.y + 2,
        2, 0x66bb6a,
      );
      leaf.setDepth(50);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      this.scene.tweens.add({
        targets: leaf,
        x: leaf.x + Math.cos(angle) * 20,
        y: leaf.y + Math.sin(angle) * 20,
        alpha: 0,
        duration: 600,
        ease: 'Quad.easeOut',
        onComplete: () => leaf.destroy(),
      });
    }
    this.updateBackpack();
  }

  // Animations
  private startIdleAnimation() {
    this.stopIdleAnimation();
    this.idleTween = this.scene.tweens.add({
      targets: this.container,
      y: this.y - 2,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopIdleAnimation() {
    if (this.idleTween) {
      this.idleTween.stop();
      this.idleTween = null;
    }
  }

  private startLegAnimation() {
    this.stopLegAnimation();
    this.scene.tweens.add({
      targets: this.leftLeg,
      y: { from: 16, to: 12 },
      duration: 200,
      yoyo: true,
      repeat: -1,
    });
    this.legTween = this.scene.tweens.add({
      targets: this.rightLeg,
      y: { from: 12, to: 16 },
      duration: 200,
      yoyo: true,
      repeat: -1,
    });
  }

  private stopLegAnimation() {
    if (this.legTween) {
      this.scene.tweens.killTweensOf(this.leftLeg);
      this.scene.tweens.killTweensOf(this.rightLeg);
      this.leftLeg.y = 16;
      this.rightLeg.y = 16;
      this.legTween = null;
    }
  }

  private startToolAnimation() {
    this.stopToolAnimation();
    this.toolTween = this.scene.tweens.add({
      targets: this.tool,
      angle: { from: -20, to: 20 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopToolAnimation() {
    if (this.toolTween) {
      this.toolTween.stop();
      this.tool.setAngle(0);
      this.toolTween = null;
    }
  }

  private playErrorAnimation() {
    this.scene.tweens.add({
      targets: this.body,
      fillColor: { from: 0x5d4037, to: 0xb71c1c },
      duration: 300,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.body.setFillStyle(0x5d4037);
        this.startIdleAnimation();
        this._state = 'idle';
        this.stateIndicator.setFillStyle(0x66bb6a);
      },
    });
    this.scene.tweens.add({
      targets: this.container,
      y: this.y + 4,
      duration: 300,
      yoyo: true,
    });
  }
}
