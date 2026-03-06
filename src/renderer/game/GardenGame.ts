import Phaser from 'phaser';
import { GardenScene } from './scenes/GardenScene';

export class GardenGame {
  private game: Phaser.Game;
  private scene: GardenScene | null = null;

  constructor(container: HTMLElement) {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth,
      height: container.clientHeight,
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

  onTaskStart() {
    this.scene?.startTask();
  }

  onAgentThought(text: string) {
    this.scene?.showThought(text);
  }

  onTaskComplete() {
    this.scene?.completeTask();
  }

  onFileCreated(filename: string) {
    this.scene?.onFileCreated(filename);
  }

  onFileModified(filename: string) {
    this.scene?.onFileModified(filename);
  }

  destroy() {
    this.game.destroy(true);
  }
}
