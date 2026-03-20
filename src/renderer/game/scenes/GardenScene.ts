import Phaser from 'phaser';
import { Agent } from '../sprites/Agent';
import { TimeLapse, GardenSnapshot } from '../systems/TimeLapse';
import { ThemeManager, GardenTheme } from '../systems/ThemeManager';
import { groupPlantsForDisplay, type DisplayPlant } from '../plant-clusters';
import { buildZoneBeds, scatterPlantsInBed } from '../../../shared/garden-bed-layout';
import type { AgentRole, GardenBedState, GardenLayoutState, PlantState } from '../../../shared/types';

// Procedural plant styles — no spritesheet needed
type PlantShape = 'bush' | 'flower' | 'tulip' | 'fern' | 'cactus';

interface PlantStyle {
  shape: PlantShape;
  stemColor: number;
  primaryColor: number;
  accentColor?: number;
}

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
  private plantPositions = new Map<string, { x: number; y: number; zone: string; createdAt: number; bedId?: string; directory?: string; creatorRole?: AgentRole; growthScale?: number }>();
  private plantDisplayIndex = new Map<string, string>();
  private zonePlantSlots = new Map<string, number>();
  private accumulatedText = new Map<string, string>();
  private activeDirectories = new Set<string>();
  private directoryLabels = new Map<string, Phaser.GameObjects.Text>();
  private gardenBeds: GardenBedState[] = [];
  private bedMap = new Map<string, Phaser.GameObjects.Graphics>();

  // Phase 4 systems
  private timeLapse = new TimeLapse();
  private themeManager = new ThemeManager();
  private groundTiles: Phaser.GameObjects.Rectangle[] = [];
  private titleText!: Phaser.GameObjects.Text;

  private snapshotInterval = 10_000; // snapshot every 10s
  private lastSnapshotTime = 0;
  private readonly mergeThreshold = 24;
  private readonly mergeGroupSize = 3;

  constructor() {
    super({ key: 'GardenScene' });
  }

  preload() {
    // No external assets — all plants are procedurally drawn
  }

  create() {
    try {
      const { width, height } = this.getSceneSize();

      // Initialize zone plant slot counters
      for (const key of Object.keys(ZONE_LAYOUT)) {
        this.zonePlantSlots.set(key, 0);
      }

      // Title
      this.titleText = this.add.text(0, 0, 'Agent Garden', {
        fontSize: '10px',
        color: this.themeManager.current.titleColor,
        fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(20);

      this.layoutScene(width, height);

      // No default agents — they appear dynamically from Claude Code sessions

      this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);

      // Theme change listener
      this.themeManager.onChange((t) => this.applyTheme(t));

    } catch (err) {
      console.error('[GardenScene] create() error:', err);
    }
  }

  update(_time: number, delta: number) {
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
        break;

      case 'Notification':
        if (detail) agent.showSpeechStatic(detail.slice(0, 50));
        break;
    }
  }

  onFileCreated(filename: string, directory?: string, creatorRole?: AgentRole, growthScale?: number) {
    const key = this.getPlantKey(filename, directory);
    if (this.plantPositions.has(key)) return;

    // Track directory and show label if new
    if (directory) {
      this.trackDirectory(directory);
    }

    const zone = this.fileToZone(filename);
    if (this.gardenBeds.some((bed) => bed.zone === zone)) {
      this.placePlantInExistingBeds(filename, key, zone, directory, creatorRole, growthScale);
      return;
    }

    const { width, height } = this.scale;
    const layout = ZONE_LAYOUT[zone];
    const zoneStart = layout.x * width;
    const zoneW = layout.width * width;

    const slot = this.zonePlantSlots.get(zone) || 0;
    this.zonePlantSlots.set(zone, slot + 1);

    const x = this.getPlantX(zoneStart + 30, zoneW - 60, slot);

    // Offset plants vertically by directory index when multiple dirs active
    const dirIndex = directory ? this.getDirectoryIndex(directory) : 0;
    const dirCount = Math.max(1, this.activeDirectories.size);
    let above: boolean;
    let y: number;

    if (dirCount > 1) {
      // Spread directories across vertical space: even indices above path, odd below
      above = dirIndex % 2 === 0;
      const verticalOffset = Math.floor(dirIndex / 2) * 30;
      y = above
        ? height / 2 - 60 - verticalOffset - Math.random() * 30
        : height / 2 + 60 + verticalOffset + Math.random() * 30;
    } else {
      above = slot % 2 === 0;
      y = above
        ? height / 2 - 60 - Math.random() * 40
        : height / 2 + 60 + Math.random() * 40;
    }

    this.plantPositions.set(key, {
      x,
      y,
      zone,
      createdAt: Date.now(),
      bedId: undefined,
      directory,
      creatorRole,
      growthScale,
    });
    this.rebuildPlantDisplay(new Set([key]));
  }

  private trackDirectory(directory: string) {
    if (this.activeDirectories.has(directory)) return;
    this.activeDirectories.add(directory);

    // Only show directory labels when multiple directories are active
    if (this.activeDirectories.size > 1) {
      this.refreshDirectoryLabels();
    }
  }

  private getDirectoryIndex(directory: string): number {
    const dirs = Array.from(this.activeDirectories);
    return dirs.indexOf(directory);
  }

  private refreshDirectoryLabels() {
    // Remove old labels
    for (const label of this.directoryLabels.values()) {
      label.destroy();
    }
    this.directoryLabels.clear();

    const { width, height } = this.scale;
    const dirs = Array.from(this.activeDirectories);
    const colors = ['#66bb6a', '#42a5f5', '#ffa726', '#ce93d8', '#ef5350'];

    for (let i = 0; i < dirs.length; i++) {
      const dirName = dirs[i].split('/').pop() || dirs[i];
      const above = i % 2 === 0;
      const verticalOffset = Math.floor(i / 2) * 30;
      const y = above
        ? height / 2 - 100 - verticalOffset
        : height / 2 + 100 + verticalOffset;

      const label = this.add.text(10, y, dirName, {
        fontSize: '8px',
        color: colors[i % colors.length],
        fontFamily: 'monospace',
        backgroundColor: '#00000066',
        padding: { x: 3, y: 1 },
      }).setDepth(15);

      this.directoryLabels.set(dirs[i], label);
    }
  }

  clearPlants() {
    for (const bed of this.bedMap.values()) {
      bed.destroy();
    }
    this.bedMap.clear();
    for (const plant of this.plantMap.values()) {
      plant.destroy();
    }
    this.plantMap.clear();
    this.plantPositions.clear();
    this.plantDisplayIndex.clear();
    this.gardenBeds = [];
    for (const key of Object.keys(ZONE_LAYOUT)) {
      this.zonePlantSlots.set(key, 0);
    }
    // Clear directory tracking and labels
    this.activeDirectories.clear();
    for (const label of this.directoryLabels.values()) {
      label.destroy();
    }
    this.directoryLabels.clear();
  }

  onFileDeleted(filename: string, directory?: string) {
    const key = this.getPlantKey(filename, directory);
    if (!this.plantPositions.has(key)) return;
    const deletedPlant = this.plantPositions.get(key);
    this.plantPositions.delete(key);
    if (deletedPlant?.bedId) {
      const bed = this.gardenBeds.find((candidate) => candidate.id === deletedPlant.bedId);
      if (bed) {
        bed.plantKeys = bed.plantKeys.filter((plantKey) => plantKey !== filename);
      }
    }
    this.rebuildPlantDisplay();
  }

  onFileModified(filename: string) {
    const matchingDisplayKeys = new Set<string>();
    for (const [rawKey, displayKey] of this.plantDisplayIndex) {
      if (rawKey === filename || rawKey.endsWith(`\u0000${filename}`)) {
        matchingDisplayKeys.add(displayKey);
      }
    }

    for (const displayKey of matchingDisplayKeys) {
      const plant = this.plantMap.get(displayKey);
      if (!plant) continue;
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
  }

  // --- Theme ---

  setTheme(themeId: string) {
    this.themeManager.setTheme(themeId);
  }

  getThemeId(): string {
    return this.themeManager.themeId;
  }

  private applyTheme(theme: GardenTheme) {
    for (const tile of this.groundTiles) {
      tile.setFillStyle(theme.groundLight);
    }

    // Title
    this.titleText.setColor(theme.titleColor);

    // Update game background
    this.cameras.main.setBackgroundColor(theme.backgroundColor);

    // Re-render beds with new soil palette
    this.renderBedVisuals();
  }

  // --- Persistence ---

  getPlantStates(): PlantState[] {
    const plants: PlantState[] = [];
    for (const [key, pos] of this.plantPositions) {
      const { filename } = this.parsePlantKey(key);
      plants.push({
        filename,
        x: pos.x,
        y: pos.y,
        zone: pos.zone,
        createdAt: pos.createdAt,
        bedId: pos.bedId,
        directory: pos.directory,
        creatorRole: pos.creatorRole,
        growthScale: pos.growthScale,
      });
    }
    return plants;
  }

  restorePlants(plants: PlantState[]) {
    for (const p of plants) {
      const key = this.getPlantKey(p.filename, p.directory);
      if (this.plantPositions.has(key)) continue;

      if (p.directory) {
        this.activeDirectories.add(p.directory);
      }

      this.plantPositions.set(key, {
        x: p.x,
        y: p.y,
        zone: p.zone,
        createdAt: p.createdAt,
        bedId: p.bedId,
        directory: p.directory,
        creatorRole: p.creatorRole,
        growthScale: p.growthScale,
      });
      const current = this.zonePlantSlots.get(p.zone) || 0;
      this.zonePlantSlots.set(p.zone, current + 1);
    }

    this.rebuildPlantDisplay();

    // Show directory labels if multiple directories were restored
    if (this.activeDirectories.size > 1) {
      this.refreshDirectoryLabels();
    }
  }

  getPlantCount(): number {
    return this.plantPositions.size;
  }

  getGardenLayout(): GardenLayoutState {
    return {
      plants: this.getPlantStates(),
      beds: this.gardenBeds.map((bed) => ({
        ...bed,
        directoryGroups: [...bed.directoryGroups],
        plantKeys: [...bed.plantKeys],
      })),
    };
  }

  restoreGardenLayout(layout: GardenLayoutState) {
    this.clearPlants();
    this.gardenBeds = (layout.beds || []).map((bed) => ({
      ...bed,
      directoryGroups: [...bed.directoryGroups],
      plantKeys: [...bed.plantKeys],
    }));
    this.renderBedVisuals();
    this.restorePlants(layout.plants || []);
  }

  // --- Time-Lapse ---

  getTimeLapse(): TimeLapse {
    return this.timeLapse;
  }

  private captureSnapshot() {
    const plants: GardenSnapshot['plants'] = [];
    for (const [key, pos] of this.plantPositions) {
      const { filename } = this.parsePlantKey(key);
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
        filesCreated: this.plantPositions.size,
        tasksCompleted: 0,
        activeAgents: 0,
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

  private getPlantKey(filename: string, directory?: string): string {
    return directory ? `${directory}\u0000${filename}` : filename;
  }

  private parsePlantKey(key: string): { directory?: string; filename: string } {
    const separatorIndex = key.indexOf('\u0000');
    if (separatorIndex === -1) {
      return { filename: key };
    }

    return {
      directory: key.slice(0, separatorIndex),
      filename: key.slice(separatorIndex + 1),
    };
  }

  private getSceneSize(): { width: number; height: number } {
    const cam = this.cameras.main;
    return {
      width: cam.width || this.scale.width || 800,
      height: cam.height || this.scale.height || 600,
    };
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const width = gameSize.width || this.scale.width || this.cameras.main.width || 800;
    const height = gameSize.height || this.scale.height || this.cameras.main.height || 600;
    this.layoutScene(width, height);
  }

  private layoutScene(width: number, height: number) {
    this.cameras.resize(width, height);
    this.rebuildGround(width, height);
    this.titleText.setPosition(width / 2, height - 12);
    this.cameras.main.setBackgroundColor(this.themeManager.current.backgroundColor);
    this.renderBedVisuals();

    // Rebuild plants from source state after resize/restore so any distorted
    // display-object transforms from the renderer lifecycle are discarded.
    if (this.plantPositions.size > 0) {
      this.rebuildPlantDisplay();
    }

    if (this.activeDirectories.size > 1) {
      this.refreshDirectoryLabels();
    }
  }

  private rebuildGround(width: number, height: number) {
    for (const tile of this.groundTiles) {
      tile.destroy();
    }
    this.groundTiles = [];

    const theme = this.themeManager.current;
    const tileSize = 32;

    for (let x = 0; x < width; x += tileSize) {
      for (let y = 0; y < height; y += tileSize) {
        const tile = this.add.rectangle(
          x + tileSize / 2,
          y + tileSize / 2,
          tileSize,
          tileSize,
          theme.groundLight,
        ).setDepth(0);
        this.groundTiles.push(tile);
      }
    }
  }

  private renderBedVisuals() {
    for (const bed of this.bedMap.values()) {
      bed.destroy();
    }
    this.bedMap.clear();

    const theme = this.themeManager.current;

    for (const bed of this.gardenBeds) {
      const g = this.add.graphics();
      g.setDepth(1);

      // Shadow (offset 2px right and down)
      g.fillStyle(theme.soilShadow, 1);
      g.fillRect(bed.x - bed.width / 2 + 2, bed.y - bed.height / 2 + 2, bed.width, bed.height);

      // Soil fill
      g.fillStyle(theme.soilFill, 1);
      g.fillRect(bed.x - bed.width / 2, bed.y - bed.height / 2, bed.width, bed.height);

      // Border
      g.lineStyle(2, theme.soilBorder, 1);
      g.strokeRect(bed.x - bed.width / 2, bed.y - bed.height / 2, bed.width, bed.height);

      // Soil grain dots (deterministic positions from bed ID)
      g.fillStyle(theme.soilDots, 0.3);
      for (let i = 0; i < 8; i++) {
        const hash = bed.id.charCodeAt(i % bed.id.length) * (i + 1);
        const dotX = bed.x - bed.width / 2 + 8 + (hash * 7) % (bed.width - 16);
        const dotY = bed.y - bed.height / 2 + 8 + (hash * 13) % (bed.height - 16);
        const dotR = 1 + (hash % 2);
        g.fillCircle(dotX, dotY, dotR);
      }

      this.bedMap.set(bed.id, g);
    }
  }

  private rebuildPlantDisplay(animatedRawKeys: Set<string> = new Set()) {
    for (const plant of this.plantMap.values()) {
      plant.destroy();
    }
    this.plantMap.clear();
    this.plantDisplayIndex.clear();

    const plants = Array.from(this.plantPositions.entries()).map(([key, pos]) => {
      const { filename } = this.parsePlantKey(key);
      return {
        key,
        filename,
        x: pos.x,
        y: pos.y,
        zone: pos.zone,
        createdAt: pos.createdAt,
        bedId: pos.bedId,
        directory: pos.directory,
        creatorRole: pos.creatorRole,
        growthScale: pos.growthScale,
      };
    });

    const layout = groupPlantsForDisplay(plants, {
      mergeThreshold: this.mergeThreshold,
      minGroupSize: this.mergeGroupSize,
    });

    for (const displayPlant of layout.visiblePlants) {
      const shouldAnimate = displayPlant.kind === 'merged'
        ? displayPlant.filenames.some((filename) =>
            plants.some((plant) =>
              animatedRawKeys.has(plant.key) &&
              plant.filename === filename &&
              plant.zone === displayPlant.zone &&
              plant.directory === displayPlant.directory,
            ),
          )
        : plants.some((plant) =>
            animatedRawKeys.has(plant.key) &&
            plant.filename === displayPlant.filename &&
            plant.zone === displayPlant.zone &&
            plant.directory === displayPlant.directory,
          );

      const placement = this.getBedPlantPlacement(displayPlant);
      const container = displayPlant.kind === 'merged'
        ? this.growMergedPlant(displayPlant, shouldAnimate)
        : this.growPlant(placement.x, placement.y, displayPlant.filename || displayPlant.label, displayPlant.creatorRole, displayPlant.growthScale, shouldAnimate);

      this.plantMap.set(displayPlant.id, container);

      for (const filename of displayPlant.filenames) {
        const rawMatch = plants.find((plant) =>
          plant.filename === filename && plant.zone === displayPlant.zone && plant.directory === displayPlant.directory,
        );
        if (rawMatch) {
          this.plantDisplayIndex.set(rawMatch.key, displayPlant.id);
        }
      }

      if (shouldAnimate) {
        this.emitParticles(container.x, container.y);
      }
    }
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

  private getDirectoryGroup(filename: string): string {
    const parts = filename.split('/').filter(Boolean);
    if (parts.length <= 1) return 'root';
    return parts.slice(0, -1).join('/');
  }

  private getZoneBeds(zone: string): GardenBedState[] {
    return this.gardenBeds
      .filter((bed) => bed.zone === zone)
      .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  }

  private getBedOccupancy(bedId: string): number {
    let count = 0;
    for (const pos of this.plantPositions.values()) {
      if (pos.bedId === bedId) count++;
    }
    return count;
  }

  private addOverflowBed(zone: string): GardenBedState {
    const zoneBeds = this.getZoneBeds(zone);
    const { width, height } = this.scale;
    const layout = ZONE_LAYOUT[zone];
    const zoneStart = layout.x * width;
    const zoneWidth = layout.width * width;
    const seedBed = zoneBeds[zoneBeds.length - 1] || buildZoneBeds({
      zone: zone as 'frontend' | 'backend' | 'tests',
      fileCount: 1,
      zoneStart,
      zoneWidth,
      centerY: height / 2,
    })[0];
    const maxRank = zoneBeds.reduce((current, bed) => Math.max(current, bed.rank), -1);
    const zoneEnd = zoneStart + zoneWidth;
    let nextX = seedBed.x + seedBed.width + 24;
    let nextY = seedBed.y;

    if (nextX > zoneEnd - seedBed.width / 2) {
      nextX = zoneEnd - seedBed.width / 2;
      nextY = seedBed.y + seedBed.height + 26;
    }

    const overflowBed: GardenBedState = {
      ...seedBed,
      id: `${zone}-bed-${maxRank + 1}`,
      x: Math.round(nextX),
      y: Math.round(nextY),
      rank: maxRank + 1,
      directoryGroups: [],
      plantKeys: [],
    };
    this.gardenBeds.push(overflowBed);
    this.renderBedVisuals();
    return overflowBed;
  }

  private selectBedForNewPlant(zone: string, directoryGroup: string): GardenBedState {
    const zoneBeds = this.getZoneBeds(zone);
    const matchingBed = zoneBeds.find((bed) =>
      bed.directoryGroups.includes(directoryGroup) && this.getBedOccupancy(bed.id) < bed.capacity,
    );
    if (matchingBed) return matchingBed;

    const emptyBed = zoneBeds.find((bed) =>
      bed.directoryGroups.length === 0 && this.getBedOccupancy(bed.id) < bed.capacity,
    );
    if (emptyBed) return emptyBed;

    const availableBed = zoneBeds.find((bed) => this.getBedOccupancy(bed.id) < bed.capacity);
    if (availableBed) return availableBed;

    return this.addOverflowBed(zone);
  }

  private placePlantInExistingBeds(
    filename: string,
    key: string,
    zone: string,
    directory?: string,
    creatorRole?: AgentRole,
    growthScale?: number,
  ) {
    const createdAt = Date.now();
    const directoryGroup = this.getDirectoryGroup(filename);
    const targetBed = this.selectBedForNewPlant(zone, directoryGroup);
    const existingEntries = Array.from(this.plantPositions.entries())
      .filter(([, pos]) => pos.bedId === targetBed.id)
      .map(([existingKey, pos]) => ({
        key: existingKey,
        filename: this.parsePlantKey(existingKey).filename,
        pos,
      }));

    const positionedPlants = scatterPlantsInBed({
      bed: targetBed,
      files: [
        ...existingEntries.map((entry) => ({
          filename: entry.filename,
          zone: entry.pos.zone,
          growthScale: entry.pos.growthScale,
        })),
        {
          filename,
          zone,
          growthScale,
        },
      ],
      createdAt,
    });
    const positionedByFilename = new Map(positionedPlants.map((plant) => [plant.filename, plant]));

    for (const entry of existingEntries) {
      const nextPosition = positionedByFilename.get(entry.filename);
      if (!nextPosition) continue;
      this.plantPositions.set(entry.key, {
        ...entry.pos,
        x: nextPosition.x,
        y: nextPosition.y,
        bedId: targetBed.id,
      });
    }

    const newPlant = positionedByFilename.get(filename);
    if (!newPlant) return;

    if (!targetBed.directoryGroups.includes(directoryGroup)) {
      targetBed.directoryGroups.push(directoryGroup);
    }
    if (!targetBed.plantKeys.includes(filename)) {
      targetBed.plantKeys.push(filename);
    }

    this.plantPositions.set(key, {
      x: newPlant.x,
      y: newPlant.y,
      zone,
      createdAt,
      bedId: targetBed.id,
      directory,
      creatorRole,
      growthScale,
    });
    this.rebuildPlantDisplay(new Set([key]));
  }

  private drawPlantTop(style: PlantStyle): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const { shape, primaryColor, accentColor } = style;

    switch (shape) {
      case 'bush': {
        // Round leafy bush
        g.fillStyle(primaryColor, 1);
        g.fillCircle(0, 0, 14);
        g.fillCircle(-8, 4, 10);
        g.fillCircle(8, 4, 10);
        // Highlight
        g.fillStyle(0xffffff, 0.15);
        g.fillCircle(-3, -5, 6);
        break;
      }
      case 'flower': {
        // Petals around center
        const petalColor = accentColor || 0xff6b6b;
        g.fillStyle(petalColor, 1);
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
          g.fillCircle(Math.cos(angle) * 9, Math.sin(angle) * 9, 7);
        }
        // Center
        g.fillStyle(0xffee58, 1);
        g.fillCircle(0, 0, 5);
        break;
      }
      case 'tulip': {
        // Tulip-shaped bloom
        const tulipColor = accentColor || 0xe040fb;
        g.fillStyle(tulipColor, 1);
        g.fillEllipse(0, -2, 16, 22);
        // Inner petal lines
        g.fillStyle(0xffffff, 0.2);
        g.fillEllipse(-3, 0, 5, 14);
        g.fillEllipse(3, 0, 5, 14);
        break;
      }
      case 'fern': {
        // Layered leaf fronds
        g.fillStyle(primaryColor, 1);
        for (let i = 0; i < 4; i++) {
          const yOff = i * 5 - 8;
          const spread = 12 - i * 2;
          g.fillEllipse(-spread, yOff, 10, 5);
          g.fillEllipse(spread, yOff, 10, 5);
        }
        // Center spine
        g.fillStyle(0x2e7d32, 1);
        g.fillRect(-1, -12, 2, 24);
        break;
      }
      case 'cactus': {
        // Barrel cactus body
        g.fillStyle(primaryColor, 1);
        g.fillEllipse(0, 0, 18, 22);
        // Ribs
        g.lineStyle(1, 0x2e7d32, 0.4);
        g.lineBetween(-4, -10, -4, 10);
        g.lineBetween(0, -11, 0, 11);
        g.lineBetween(4, -10, 4, 10);
        // Small flower on top
        if (accentColor) {
          g.fillStyle(accentColor, 1);
          g.fillCircle(0, -10, 4);
          g.fillStyle(0xffee58, 1);
          g.fillCircle(0, -10, 2);
        }
        break;
      }
    }

    return g;
  }

  private growPlant(x: number, y: number, filename: string, creatorRole?: AgentRole, growthScale?: number, animate = true): Phaser.GameObjects.Container {
    const ext = filename.split('.').pop() || '';
    const isTest = filename.includes('.test.') || filename.includes('.spec.');
    const style: PlantStyle = isTest
      ? { shape: 'tulip', stemColor: 0x8d6e63, primaryColor: 0xce93d8, accentColor: 0xce93d8 }
      : this.getPlantStyle(ext);

    const stem = this.add.rectangle(0, 0, 4, 0, style.stemColor).setOrigin(0.5, 1);
    const container = this.add.container(x, y, [stem]).setDepth(2);

    const targetHeight = Math.round((20 + Math.random() * 20) * (growthScale || 1));

    if (animate) {
      this.tweens.add({
        targets: stem,
        height: { from: 0, to: targetHeight },
        duration: 800,
        ease: 'Back.easeOut',
      });
    } else {
      stem.height = targetHeight;
    }

    const addTop = () => {
      const top = this.drawPlantTop(style);
      top.setPosition(0, -targetHeight);
      container.add(top);

      if (animate) {
        top.setScale(0);
        this.tweens.add({
          targets: top,
          scaleX: 1,
          scaleY: 1,
          duration: 300,
          ease: 'Back.easeOut',
        });
      }
    };

    if (animate) {
      this.time.delayedCall(800, addTop);
    } else {
      addTop();
    }

    const label = this.add.text(
      0, 8,
      filename.length > 16 ? filename.slice(-16) : filename,
      { fontSize: '7px', color: '#a0c8a0', fontFamily: 'monospace' },
    ).setOrigin(0.5, 0);
    container.add(label);

    if (creatorRole && creatorRole !== 'unassigned') {
      const dotColor = creatorRole === 'planter' ? 0x66bb6a
        : creatorRole === 'weeder' ? 0xffa726
        : creatorRole === 'tester' ? 0x42a5f5
        : 0xce93d8;
      const dot = this.add.circle(0, 4, 3, dotColor).setDepth(15);
      container.add(dot);
    }

    return container;
  }

  private growMergedPlant(displayPlant: DisplayPlant, animate: boolean): Phaser.GameObjects.Container {
    const { x, y, targetHeight } = this.getMergedPlantPlacement(displayPlant);
    const stem = this.add.rectangle(0, 0, 8, 0, 0x6d4c41).setOrigin(0.5, 1);
    const container = this.add.container(x, y, [stem]).setDepth(2);

    if (animate) {
      this.tweens.add({
        targets: stem,
        height: { from: 0, to: targetHeight },
        duration: 900,
        ease: 'Back.easeOut',
      });
    } else {
      stem.height = targetHeight;
    }

    const addCanopy = () => {
      // Large merged bush canopy — drawn procedurally
      const canopy = this.add.graphics();
      canopy.setPosition(0, -targetHeight);
      canopy.fillStyle(0x4caf50, 1);
      canopy.fillCircle(0, 0, 20);
      canopy.fillCircle(-12, 6, 14);
      canopy.fillCircle(12, 6, 14);
      canopy.fillCircle(-6, -8, 12);
      canopy.fillCircle(6, -8, 12);
      // Highlight
      canopy.fillStyle(0xffffff, 0.12);
      canopy.fillCircle(-4, -8, 8);

      const badge = this.add.circle(22, -targetHeight - 12, 9, 0xffee58);
      const badgeText = this.add.text(22, -targetHeight - 12, `${displayPlant.fileCount}`, {
        fontSize: '9px',
        color: '#243b1a',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
      container.add([canopy, badge, badgeText]);

      if (animate) {
        canopy.setScale(0);
        badge.setScale(0);
        badgeText.setScale(0);
        this.tweens.add({
          targets: canopy,
          scaleX: { from: 0, to: 1 },
          scaleY: { from: 0, to: 1 },
          duration: 300,
          ease: 'Back.easeOut',
        });
        this.tweens.add({
          targets: [badge, badgeText],
          scaleX: { from: 0, to: 1 },
          scaleY: { from: 0, to: 1 },
          duration: 300,
          ease: 'Back.easeOut',
        });
      }
    };

    if (animate) {
      this.time.delayedCall(700, addCanopy);
    } else {
      addCanopy();
    }

    const label = this.add.text(0, 8, displayPlant.label, {
      fontSize: '7px',
      color: '#dcedc8',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    container.add(label);

    if (displayPlant.creatorRole && displayPlant.creatorRole !== 'unassigned') {
      const dotColor = displayPlant.creatorRole === 'planter' ? 0x66bb6a
        : displayPlant.creatorRole === 'weeder' ? 0xffa726
        : displayPlant.creatorRole === 'tester' ? 0x42a5f5
        : 0xce93d8;
      const dot = this.add.circle(-14, 4, 4, dotColor).setDepth(15);
      container.add(dot);
    }

    return container;
  }

  private getBedPlantPlacement(displayPlant: Pick<DisplayPlant, 'x' | 'y' | 'bedId'>): { bed?: GardenBedState; x: number; y: number } {
    const bed = displayPlant.bedId
      ? this.gardenBeds.find((candidate) => candidate.id === displayPlant.bedId)
      : undefined;

    if (!bed) {
      return {
        x: displayPlant.x,
        y: displayPlant.y,
      };
    }

    const innerLeft = bed.x - bed.width / 2 + 14;
    const innerRight = bed.x + bed.width / 2 - 14;
    const soilInset = Math.max(12, Math.round(bed.height * 0.18));
    return {
      bed,
      x: Math.round(Math.min(innerRight, Math.max(innerLeft, displayPlant.x))),
      y: Math.round(bed.y + bed.height / 2 - soilInset),
    };
  }

  private getMergedPlantPlacement(displayPlant: DisplayPlant): { x: number; y: number; targetHeight: number } {
    const baseHeight = Math.round((34 + Math.min(26, displayPlant.fileCount * 4)) * (displayPlant.growthScale || 1));
    const placement = this.getBedPlantPlacement(displayPlant);
    const bed = placement.bed;

    if (!bed) {
      return {
        x: placement.x,
        y: placement.y,
        targetHeight: baseHeight,
      };
    }

    return {
      x: placement.x,
      y: placement.y,
      targetHeight: Math.min(baseHeight, Math.max(28, Math.round(bed.height * 0.58))),
    };
  }

  private getPlantStyle(ext: string): PlantStyle {
    switch (ext) {
      case 'tsx':
      case 'jsx':
        return { shape: 'flower', stemColor: 0x4caf50, primaryColor: 0x4caf50, accentColor: 0x42a5f5 };
      case 'ts':
      case 'js':
        return { shape: 'bush', stemColor: 0x6d4c41, primaryColor: 0x66bb6a };
      case 'css':
      case 'scss':
        return { shape: 'flower', stemColor: 0x4caf50, primaryColor: 0x4caf50, accentColor: 0xe040fb };
      case 'json':
      case 'yaml':
        return { shape: 'cactus', stemColor: 0x8d6e63, primaryColor: 0x7cb342, accentColor: 0xffee58 };
      case 'py':
        return { shape: 'fern', stemColor: 0x4caf50, primaryColor: 0x388e3c };
      case 'md':
      case 'txt':
        return { shape: 'tulip', stemColor: 0x4caf50, primaryColor: 0xa5d6a7, accentColor: 0xc8e6c9 };
      default:
        return { shape: 'bush', stemColor: 0x4caf50, primaryColor: 0x81c784 };
    }
  }
}
