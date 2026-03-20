import Phaser from 'phaser';
import { GardenScene } from './scenes/GardenScene';
import type { GardenLayoutState, PlantState, AgentRole } from '../../shared/types';

import { GAME_DPR } from './dpr';

export class GardenGame {
  private game!: Phaser.Game;
  private scene: GardenScene | null = null;
  private sceneReadyPromise: Promise<void>;
  private resizeObserver?: ResizeObserver;

  constructor(container: HTMLElement) {
    const cssW = container.clientWidth || 800;
    const cssH = container.clientHeight || 600;

    this.sceneReadyPromise = new Promise<void>((resolve) => {
      this.game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: container,
        width: cssW * GAME_DPR,
        height: cssH * GAME_DPR,
        backgroundColor: '#2d5a27',
        antialias: true,
        scene: GardenScene,
        scale: {
          mode: Phaser.Scale.NONE,
        },
      });

      this.game.events.on('ready', () => {
        // CSS-scale canvas to fill container; internal resolution stays at dpr-scaled size
        const canvas = this.game.canvas;
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        // Observe container resizes and update internal resolution
        if (typeof ResizeObserver !== 'undefined') {
          this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const { width, height } = entry.contentRect;
              if (width > 0 && height > 0) {
                this.game.scale.resize(width * GAME_DPR, height * GAME_DPR);
              }
            }
          });
          this.resizeObserver.observe(container);
        }

        const scene = this.game.scene.getScene('GardenScene') as GardenScene;
        if (scene.scene.isActive()) {
          // Scene already created (no assets to preload)
          this.scene = scene;
          resolve();
        } else {
          scene.events.once(Phaser.Scenes.Events.CREATE, () => {
            this.scene = scene;
            resolve();
          });
        }
      });
    });
  }

  onSceneReady(): Promise<void> {
    return this.sceneReadyPromise;
  }

  onTaskStart(agentId: string) {
    this.scene?.startTask(agentId);
  }

  onAgentThought(agentId: string, text: string) {
    this.scene?.showThought(agentId, text);
  }

  onTaskComplete(agentId: string) {
    this.scene?.completeTask(agentId);
  }

  onFileCreated(filename: string, directory?: string, creatorRole?: AgentRole, growthScale?: number) {
    this.scene?.onFileCreated(filename, directory, creatorRole, growthScale);
  }

  clearPlants() {
    this.scene?.clearPlants();
  }

  onFileDeleted(filename: string, directory?: string) {
    this.scene?.onFileDeleted(filename, directory);
  }

  onFileModified(filename: string) {
    this.scene?.onFileModified(filename);
  }

  onError(agentId: string) {
    this.scene?.showError(agentId);
  }

  updateAgentTokens(agentId: string, tokens: number) {
    this.scene?.updateAgentTokens(agentId, tokens);
  }

  // Phase 4: Themes
  setTheme(themeId: string) {
    this.scene?.setTheme(themeId);
  }

  getThemeId(): string {
    return this.scene?.getThemeId() || 'garden';
  }

  // Phase 4: Persistence
  getPlantStates(): PlantState[] {
    return this.scene?.getPlantStates() || [];
  }

  getGardenLayout(): GardenLayoutState {
    return this.scene?.getGardenLayout() || { plants: [], beds: [] };
  }

  restorePlants(plants: PlantState[]) {
    this.scene?.restorePlants(plants);
  }

  restoreGardenLayout(layout: GardenLayoutState, version?: number) {
    this.scene?.restoreGardenLayout(layout, version);
  }

  getPlantCount(): number {
    return this.scene?.getPlantCount() || 0;
  }

  // Phase 5: Claude Code agent management
  addAgent(agentId: string, role: AgentRole, label?: string) {
    this.scene?.addAgent(agentId, role, label);
  }

  removeAgent(agentId: string) {
    this.scene?.removeAgent(agentId);
  }

  setAgentRole(agentId: string, role: AgentRole) {
    this.scene?.setAgentRole(agentId, role);
  }

  showActivity(agentId: string, eventType: string, detail?: string) {
    this.scene?.showActivity(agentId, eventType, detail);
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.game.destroy(true);
  }
}
