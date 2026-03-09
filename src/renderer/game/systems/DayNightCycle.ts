import Phaser from 'phaser';

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'rain' | 'sunshine';

const CYCLE_DURATION = 120_000; // 2 minutes per full cycle

const SKY_COLORS: Record<TimeOfDay, number> = {
  dawn:  0x3d2b56,
  day:   0x2d5a27,
  dusk:  0x4a2c2a,
  night: 0x0d1117,
};

const OVERLAY_ALPHA: Record<TimeOfDay, number> = {
  dawn:  0.15,
  day:   0.0,
  dusk:  0.2,
  night: 0.35,
};

export class DayNightCycle {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle;
  private sunMoon: Phaser.GameObjects.Arc;
  private stars: Phaser.GameObjects.Arc[] = [];
  private rainDrops: Phaser.GameObjects.Rectangle[] = [];
  private sunRays: Phaser.GameObjects.Rectangle[] = [];
  private _timeOfDay: TimeOfDay = 'day';
  private _weather: Weather = 'clear';
  private elapsed = 0;
  private rainTimer: Phaser.Time.TimerEvent | null = null;
  private sunshineTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width, height } = scene.scale;

    // Full-screen tint overlay
    this.overlay = scene.add.rectangle(width / 2, height / 2, width, height, 0x000033, 0)
      .setDepth(200)
      .setScrollFactor(0);

    // Sun/Moon indicator
    this.sunMoon = scene.add.circle(width - 30, 30, 8, 0xffee58)
      .setDepth(201)
      .setScrollFactor(0);

    // Stars (hidden during day)
    for (let i = 0; i < 20; i++) {
      const star = scene.add.circle(
        Math.random() * width,
        Math.random() * (height * 0.4),
        1,
        0xffffff,
      ).setDepth(199).setAlpha(0).setScrollFactor(0);
      this.stars.push(star);
    }
  }

  get timeOfDay(): TimeOfDay {
    return this._timeOfDay;
  }

  get weather(): Weather {
    return this._weather;
  }

  update(delta: number) {
    this.elapsed += delta;
    const progress = (this.elapsed % CYCLE_DURATION) / CYCLE_DURATION;

    // Determine time of day
    let tod: TimeOfDay;
    if (progress < 0.05)       tod = 'dawn';
    else if (progress < 0.45)  tod = 'day';
    else if (progress < 0.55)  tod = 'dusk';
    else                       tod = 'night';

    if (tod !== this._timeOfDay) {
      this._timeOfDay = tod;
      this.transitionTo(tod);
    }

    // Animate sun/moon position
    const { width } = this.scene.scale;
    const angle = progress * Math.PI * 2 - Math.PI / 2;
    const cx = width / 2;
    const rx = width * 0.4;
    const ry = 80;
    this.sunMoon.x = cx + Math.cos(angle) * rx;
    this.sunMoon.y = 60 - Math.sin(angle) * ry;
  }

  private transitionTo(tod: TimeOfDay) {
    const alpha = OVERLAY_ALPHA[tod];
    const color = SKY_COLORS[tod];

    this.overlay.setFillStyle(
      tod === 'night' ? 0x0a0a2e : tod === 'dusk' ? 0x2a1515 : tod === 'dawn' ? 0x1a1040 : 0x000000,
      1,
    );

    this.scene.tweens.add({
      targets: this.overlay,
      alpha,
      duration: 2000,
      ease: 'Sine.easeInOut',
    });

    // Sun/Moon color
    const isSun = tod === 'day' || tod === 'dawn';
    this.scene.tweens.add({
      targets: this.sunMoon,
      fillColor: isSun ? 0xffee58 : 0xccccee,
      duration: 1000,
    });

    // Stars
    const showStars = tod === 'night' || tod === 'dusk';
    for (const star of this.stars) {
      this.scene.tweens.add({
        targets: star,
        alpha: showStars ? 0.3 + Math.random() * 0.7 : 0,
        duration: 1500,
        ease: 'Sine.easeInOut',
      });
    }
  }

  setWeather(weather: Weather) {
    if (this._weather === weather) return;
    this._weather = weather;

    // Clean up previous weather
    this.stopRain();
    this.stopSunshine();

    switch (weather) {
      case 'rain':
        this.startRain();
        break;
      case 'sunshine':
        this.startSunshine();
        break;
    }
  }

  private startRain() {
    const { width, height } = this.scene.scale;

    this.rainTimer = this.scene.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        if (this.rainDrops.length > 60) return;
        const drop = this.scene.add.rectangle(
          Math.random() * width,
          -5,
          1,
          6,
          0x6699cc,
          0.6,
        ).setDepth(210);
        this.rainDrops.push(drop);

        this.scene.tweens.add({
          targets: drop,
          y: height + 10,
          x: drop.x - 20,
          duration: 600 + Math.random() * 400,
          ease: 'Linear',
          onComplete: () => {
            drop.destroy();
            const idx = this.rainDrops.indexOf(drop);
            if (idx >= 0) this.rainDrops.splice(idx, 1);
          },
        });
      },
    });
  }

  private stopRain() {
    if (this.rainTimer) {
      this.rainTimer.destroy();
      this.rainTimer = null;
    }
    for (const drop of this.rainDrops) drop.destroy();
    this.rainDrops = [];
  }

  private startSunshine() {
    const { width } = this.scene.scale;

    // Create sun rays
    for (let i = 0; i < 5; i++) {
      const ray = this.scene.add.rectangle(
        width / 2 + (i - 2) * 60,
        0,
        3,
        200,
        0xffee58,
        0,
      ).setDepth(198).setOrigin(0.5, 0).setAngle(-10 + i * 5);
      this.sunRays.push(ray);

      this.scene.tweens.add({
        targets: ray,
        alpha: { from: 0, to: 0.15 },
        duration: 1500,
        yoyo: true,
        repeat: -1,
        delay: i * 200,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private stopSunshine() {
    for (const ray of this.sunRays) {
      this.scene.tweens.killTweensOf(ray);
      ray.destroy();
    }
    this.sunRays = [];
  }

  destroy() {
    this.stopRain();
    this.stopSunshine();
    this.overlay.destroy();
    this.sunMoon.destroy();
    for (const star of this.stars) star.destroy();
  }
}
