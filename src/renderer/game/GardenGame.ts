import Phaser from 'phaser';
import { GardenScene } from './scenes/GardenScene';
import type { PlantState, AgentRole } from '../../shared/types';

export class GardenGame {
  private game: Phaser.Game;
  private scene: GardenScene | null = null;

  constructor(container: HTMLElement) {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: w,
      height: h,
      backgroundColor: '#2d5a27',
      pixelArt: true,
      scene: GardenScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    this.game.events.on('ready', () => {
      this.scene = this.game.scene.getScene('GardenScene') as GardenScene;
    });
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

  onFileCreated(filename: string) {
    this.scene?.onFileCreated(filename);
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

  restorePlants(plants: PlantState[]) {
    this.scene?.restorePlants(plants);
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
    this.game.destroy(true);
  }
}
