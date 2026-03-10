import Phaser from 'phaser';
import { Agent } from '../sprites/Agent';
import { DayNightCycle } from '../systems/DayNightCycle';
import { TimeLapse, GardenSnapshot } from '../systems/TimeLapse';
import { ThemeManager, GardenTheme } from '../systems/ThemeManager';
import type { AgentRole, PlantState } from '../../../shared/types';

interface ZoneConfig {
  label: string;
  x: number;
  width: number;
}

const ZONE_LAYOUT: Record<string, { x: number; width: number }> = {
  frontend: { x: 0,    width: 0.33 },
  backend:  { x: 0.33, width: 0.34 },
  tests:    { x: 0.67, width: 0.33 },
};

export class GardenScene extends Phaser.Scene {
  private agents = new Map<string, Agent>();
  private plantMap = new Map<string, Phaser.GameObjects.Container>();
  private plantPositions = new Map<string, { x: number; y: number; zone: string }>();
  private zonePlantSlots = new Map<string, number>();
  private accumulatedText = new Map<string, string>();

  // Phase 4 systems
  private dayNight!: DayNightCycle;
  private timeLapse = new TimeLapse();
  private themeManager = new ThemeManager();
  private groundTiles: Phaser.GameObjects.Rectangle[] = [];
  private pathTiles: Phaser.GameObjects.Rectangle[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private snapshotInterval = 10_000; // snapshot every 10s
  private lastSnapshotTime = 0;

  constructor() {
    super({ key: 'GardenScene' });
  }

  create() {
    try {
      // Use cameras.main for reliable dimensions with Scale.RESIZE
      const cam = this.cameras.main;
      const width = cam.width || this.scale.width || 800;
      const height = cam.height || this.scale.height || 600;
      const theme = this.themeManager.current;

      // Draw ground grid
      for (let x = 0; x < width; x += 32) {
        for (let y = 0; y < height; y += 32) {
          const isEven = ((x / 32 + y / 32) % 2 === 0);
          const tile = this.add.rectangle(
            x + 16, y + 16, 32, 32,
            isEven ? theme.groundLight : theme.groundDark,
          );
          this.groundTiles.push(tile);
        }
      }

      // Garden path
      for (let x = 0; x < width; x += 32) {
        const tile = this.add.rectangle(x + 16, height / 2, 32, 32, theme.pathColor);
        this.pathTiles.push(tile);
      }

      // Initialize zone plant slot counters
      for (const key of Object.keys(ZONE_LAYOUT)) {
        this.zonePlantSlots.set(key, 0);
      }

      // Title
      this.titleText = this.add.text(width / 2, height - 12, 'Agent Garden', {
        fontSize: '10px',
        color: theme.titleColor,
        fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(20);

      // No default agents — they appear dynamically from Claude Code sessions

      // Day/Night cycle
      this.dayNight = new DayNightCycle(this);

      // Theme change listener
      this.themeManager.onChange((t) => this.applyTheme(t));

    } catch (err) {
      console.error('[GardenScene] create() error:', err);
    }
  }

  update(_time: number, delta: number) {
    // Update day/night cycle
    this.dayNight.update(delta);

    // Time-lapse snapshots
    this.lastSnapshotTime += delta;
    if (this.lastSnapshotTime >= this.snapshotInterval) {
      this.lastSnapshotTime = 0;
      this.captureSnapshot();
    }
  }

  // --- Public API ---

  startTask(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const { width, height } = this.scale;
    const zone = this.roleToZone(agent.role);
    const layout = ZONE_LAYOUT[zone];
    const zoneStart = layout.x * width;
    const zoneEnd = (layout.x + layout.width) * width;
    const targetX = zoneStart + 40 + Math.random() * (zoneEnd - zoneStart - 80);

    this.accumulatedText.set(agentId, '');
    agent.walkTo(targetX, height / 2, () => {
      agent.setState('working');
    });
    agent.showSpeechStatic('Thinking...');
  }

  showThought(agentId: string, text: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const accumulated = (this.accumulatedText.get(agentId) || '') + text;
    this.accumulatedText.set(agentId, accumulated);
    agent.showSpeech(this.extractSnippet(accumulated));
  }

  completeTask(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.showSpeechStatic('Done!');
    this.time.delayedCall(1500, () => agent.hideSpeech(true));
    agent.walkHome(() => agent.setState('idle'));

    // Sunshine weather on completion
    this.dayNight.setWeather('sunshine');
    this.time.delayedCall(5000, () => {
      if (this.dayNight.weather === 'sunshine') {
        this.dayNight.setWeather('clear');
      }
    });
  }

  showError(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.setState('error');
    agent.showSpeechStatic('Error!');
    this.time.delayedCall(3000, () => {
      agent.hideSpeech(true);
      agent.walkHome();
    });

    // Rain on error
    this.dayNight.setWeather('rain');
    this.time.delayedCall(8000, () => {
      if (this.dayNight.weather === 'rain') {
        this.dayNight.setWeather('clear');
      }
    });
  }

  updateAgentTokens(agentId: string, tokens: number) {
    this.agents.get(agentId)?.setTokens(tokens);
  }

  // --- Dynamic Claude Code agent management ---

  addAgent(agentId: string, role: AgentRole, label?: string) {
    if (this.agents.has(agentId)) return;

    const { width, height } = this.scale;
    const zone = this.roleToZone(role);
    const layout = ZONE_LAYOUT[zone];

    // Position within the role's zone, offset by existing agent count in that zone
    const agentsInZone = Array.from(this.agents.values()).filter(a => this.roleToZone(a.role) === zone).length;
    const zoneStart = layout.x * width;
    const zoneW = layout.width * width;
    const homeX = zoneStart + zoneW * 0.3 + agentsInZone * 40;

    const agent = new Agent(this, homeX, height / 2, agentId, role);
    if (label) agent.setLabel(label);
    this.agents.set(agentId, agent);
    this.accumulatedText.set(agentId, '');

    // Fade-in entrance
    agent.setState('idle');
  }

  removeAgent(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.hideSpeech(false);
    agent.destroy();
    this.agents.delete(agentId);
    this.accumulatedText.delete(agentId);
  }

  setAgentRole(agentId: string, role: AgentRole) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const oldZone = this.roleToZone(agent.role);
    agent.setRole(role);
    const newZone = this.roleToZone(role);

    // If zone changed, walk agent to new zone
    if (oldZone !== newZone) {
      const { width, height } = this.scale;
      const layout = ZONE_LAYOUT[newZone];
      const zoneStart = layout.x * width;
      const zoneW = layout.width * width;
      const newHomeX = zoneStart + zoneW * 0.5;
      agent.homeX = newHomeX;
      agent.homeY = height / 2;
      agent.walkTo(newHomeX, height / 2, () => agent.setState('idle'));
    }
  }

  /** Show activity from a Claude Code hook event */
  showActivity(agentId: string, eventType: string, detail?: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    switch (eventType) {
      case 'UserPromptSubmit':
        agent.showSpeechStatic(detail ? detail.slice(0, 50) : 'Thinking...');
        agent.setState('working');
        break;

      case 'PreToolUse': {
        // Walk to a random spot in their zone and show tool name
        const { width, height } = this.scale;
        const zone = this.roleToZone(agent.role);
        const layout = ZONE_LAYOUT[zone];
        const zoneStart = layout.x * width;
        const zoneEnd = (layout.x + layout.width) * width;
        const targetX = zoneStart + 40 + Math.random() * (zoneEnd - zoneStart - 80);
        agent.walkTo(targetX, height / 2, () => agent.setState('working'));
        if (detail) agent.showSpeechStatic(detail.slice(0, 50));
        break;
      }

      case 'PostToolUse':
        agent.setState('working');
        if (detail) agent.showSpeechStatic(detail.slice(0, 50));
        break;

      case 'Stop':
        agent.showSpeechStatic('Done!');
        this.time.delayedCall(1500, () => agent.hideSpeech(true));
        agent.walkHome(() => agent.setState('idle'));
        this.dayNight.setWeather('sunshine');
        this.time.delayedCall(5000, () => {
          if (this.dayNight.weather === 'sunshine') {
            this.dayNight.setWeather('clear');
          }
        });
        break;

      case 'Notification':
        if (detail) agent.showSpeechStatic(detail.slice(0, 50));
        break;
    }
  }

  onFileCreated(filename: string) {
    if (this.plantMap.has(filename)) return;

    const zone = this.fileToZone(filename);
    const { width, height } = this.scale;
    const layout = ZONE_LAYOUT[zone];
    const zoneStart = layout.x * width;
    const zoneW = layout.width * width;

    const slot = this.zonePlantSlots.get(zone) || 0;
    this.zonePlantSlots.set(zone, slot + 1);

    const x = this.getPlantX(zoneStart + 30, zoneW - 60, slot);
    const above = slot % 2 === 0;
    const y = above
      ? height / 2 - 60 - Math.random() * 40
      : height / 2 + 60 + Math.random() * 40;

    const plant = this.growPlant(x, y, filename);
    this.plantMap.set(filename, plant);
    this.plantPositions.set(filename, { x, y, zone });
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
    this.emitParticles(plant.x, plant.y, 3);
  }

  // --- Theme ---

  setTheme(themeId: string) {
    this.themeManager.setTheme(themeId);
  }

  getThemeId(): string {
    return this.themeManager.themeId;
  }

  private applyTheme(theme: GardenTheme) {
    // Update ground tiles
    let i = 0;
    const { width, height } = this.scale;
    for (let x = 0; x < width; x += 32) {
      for (let y = 0; y < height; y += 32) {
        if (i < this.groundTiles.length) {
          const isEven = ((x / 32 + y / 32) % 2 === 0);
          this.groundTiles[i].setFillStyle(isEven ? theme.groundLight : theme.groundDark);
          i++;
        }
      }
    }

    // Path
    for (const tile of this.pathTiles) {
      tile.setFillStyle(theme.pathColor);
    }

    // Title
    this.titleText.setColor(theme.titleColor);

    // Update game background
    this.cameras.main.setBackgroundColor(theme.backgroundColor);
  }

  // --- Persistence ---

  getPlantStates(): PlantState[] {
    const plants: PlantState[] = [];
    for (const [filename, pos] of this.plantPositions) {
      plants.push({
        filename,
        x: pos.x,
        y: pos.y,
        zone: pos.zone,
        createdAt: Date.now(),
      });
    }
    return plants;
  }

  restorePlants(plants: PlantState[]) {
    for (const p of plants) {
      if (this.plantMap.has(p.filename)) continue;
      const container = this.growPlant(p.x, p.y, p.filename);
      this.plantMap.set(p.filename, container);
      this.plantPositions.set(p.filename, { x: p.x, y: p.y, zone: p.zone });

      // Update zone slot count
      const current = this.zonePlantSlots.get(p.zone) || 0;
      this.zonePlantSlots.set(p.zone, current + 1);
    }
  }

  getPlantCount(): number {
    return this.plantMap.size;
  }

  // --- Time-Lapse ---

  getTimeLapse(): TimeLapse {
    return this.timeLapse;
  }

  private captureSnapshot() {
    const plants: GardenSnapshot['plants'] = [];
    for (const [filename, pos] of this.plantPositions) {
      plants.push({ filename, x: pos.x, y: pos.y, zone: pos.zone });
    }

    const agents: GardenSnapshot['agents'] = [];
    for (const [id, agent] of this.agents) {
      agents.push({
        id,
        role: agent.role,
        state: agent.state,
        x: agent.getContainerX(),
        totalTokens: agent.totalTokens,
      });
    }

    this.timeLapse.addSnapshot({
      timestamp: Date.now(),
      plants,
      agents,
      stats: {
        filesCreated: this.plantMap.size,
        tasksCompleted: 0,
        tokensUsed: 0,
      },
    });
  }

  // --- Private helpers ---

  private roleToZone(role: AgentRole): string {
    switch (role) {
      case 'planter': return 'frontend';
      case 'weeder':  return 'backend';
      case 'tester':  return 'tests';
      case 'unassigned': return 'frontend';
    }
  }

  private fileToZone(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('test')) return 'tests';
    if (lower.includes('.tsx') || lower.includes('.css') || lower.includes('component')) return 'frontend';
    return 'backend';
  }

  private extractSnippet(text: string): string {
    const funcMatch = text.match(/(?:function|const|class|export)\s+(\w+)/);
    if (funcMatch) return funcMatch[0].slice(0, 50);

    const commentMatch = text.match(/\/\/\s*(.+)/);
    if (commentMatch && !commentMatch[1].startsWith('@file')) {
      return commentMatch[1].slice(0, 50);
    }

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

  private getPlantX(zoneStart: number, zoneWidth: number, slot: number): number {
    const golden = 0.618033988749895;
    const normalized = ((slot * golden) % 1);
    return zoneStart + normalized * zoneWidth;
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
