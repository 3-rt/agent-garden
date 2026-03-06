import Phaser from 'phaser';

export type AgentState = 'idle' | 'walking' | 'working' | 'error';

export class Agent {
  public x: number;
  public y: number;
  private container: Phaser.GameObjects.Container;
  private scene: Phaser.Scene;
  private body: Phaser.GameObjects.Rectangle;
  private head: Phaser.GameObjects.Rectangle;
  private hat: Phaser.GameObjects.Triangle;
  private leftLeg: Phaser.GameObjects.Rectangle;
  private rightLeg: Phaser.GameObjects.Rectangle;
  private tool: Phaser.GameObjects.Rectangle;
  private stateIndicator: Phaser.GameObjects.Arc;
  private idleTween: Phaser.Tweens.Tween | null = null;
  private legTween: Phaser.Tweens.Tween | null = null;
  private toolTween: Phaser.Tweens.Tween | null = null;
  private _state: AgentState = 'idle';

  // Speech bubble (owned by agent now)
  private speechBubble: Phaser.GameObjects.Container;
  private speechBg: Phaser.GameObjects.Rectangle;
  private speechText: Phaser.GameObjects.Text;
  private speechTail: Phaser.GameObjects.Triangle;
  private speechFadeTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    // Legs
    this.leftLeg = scene.add.rectangle(-4, 16, 5, 10, 0x4e342e);
    this.rightLeg = scene.add.rectangle(4, 16, 5, 10, 0x4e342e);

    // Body
    this.body = scene.add.rectangle(0, 4, 16, 20, 0x5d4037);

    // Head
    this.head = scene.add.rectangle(0, -12, 12, 12, 0xffcc80);

    // Hat
    this.hat = scene.add.triangle(0, -22, -10, 4, 10, 4, 0, -6, 0x388e3c);

    // Tool (small shovel, hidden by default)
    this.tool = scene.add.rectangle(12, 0, 3, 14, 0x8d6e63);
    this.tool.setVisible(false);

    // State indicator dot
    this.stateIndicator = scene.add.circle(8, -22, 3, 0x66bb6a);

    this.container = scene.add.container(x, y, [
      this.leftLeg, this.rightLeg,
      this.body, this.head, this.hat,
      this.tool, this.stateIndicator,
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

  setState(state: AgentState) {
    if (this._state === state) return;
    this._state = state;

    // Update indicator color
    const colors: Record<AgentState, number> = {
      idle: 0x66bb6a,     // green
      walking: 0x42a5f5,  // blue
      working: 0xffca28,  // yellow
      error: 0xef5350,    // red
    };
    this.stateIndicator.setFillStyle(colors[state]);

    // Manage animations per state
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

    this.scene.tweens.add({
      targets: this.container,
      x: targetX,
      duration: 1000,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        onComplete?.();
      },
    });
  }

  // Speech bubble methods
  showSpeech(text: string) {
    if (this.speechFadeTween) {
      this.speechFadeTween.stop();
      this.speechFadeTween = null;
    }
    this.speechBubble.setAlpha(1);
    this.speechBubble.setVisible(true);

    // Truncate and clean up display text
    const display = text.length > 50 ? text.slice(-50) : text;
    this.speechText.setText(display);

    // Auto-size background to text
    const textWidth = Math.min(Math.max(this.speechText.width + 20, 60), 220);
    const textHeight = Math.max(this.speechText.height + 12, 24);
    this.speechBg.setSize(textWidth, textHeight);

    // Position bubble above agent
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
    // Alternate legs up/down
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
    // Swing tool
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
    // Flash red and droop
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
    // Droop down
    this.scene.tweens.add({
      targets: this.container,
      y: this.y + 4,
      duration: 300,
      yoyo: true,
    });
  }
}
