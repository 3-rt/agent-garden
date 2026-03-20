import Phaser from 'phaser';

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private followTarget: Phaser.GameObjects.GameObject | null = null;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private cameraStartX = 0;
  private cameraStartY = 0;

  private readonly minZoom = 0.5;
  private readonly maxZoom = 2.0;
  private readonly zoomStep = 0.1;
  private readonly followLerp = 0.1;

  private wheelHandler: Function;
  private pointerDownHandler: Function;
  private pointerMoveHandler: Function;
  private pointerUpHandler: Function;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.wheelHandler = () => {};
    this.pointerDownHandler = () => {};
    this.pointerMoveHandler = () => {};
    this.pointerUpHandler = () => {};
    this.setupInput();
  }

  private setupInput() {
    // Scroll wheel zoom — centered on mouse pointer position
    this.wheelHandler = (pointer: Phaser.Input.Pointer, _gameObjects: any[], _deltaX: number, deltaY: number) => {
      const oldZoom = this.camera.zoom;
      const newZoom = Phaser.Math.Clamp(
        oldZoom + (deltaY > 0 ? -this.zoomStep : this.zoomStep),
        this.minZoom,
        this.maxZoom,
      );

      // Zoom toward mouse pointer: adjust scroll so the world point under the
      // pointer stays in the same screen position after the zoom change.
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const newScrollX = worldX - (pointer.x / newZoom);
      const newScrollY = worldY - (pointer.y / newZoom);

      this.camera.zoom = newZoom;
      this.camera.scrollX = newScrollX;
      this.camera.scrollY = newScrollY;
    };
    this.scene.input.on('wheel', this.wheelHandler);

    // Right-click / middle-click drag to pan
    this.pointerDownHandler = (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.isDragging = true;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        this.cameraStartX = this.camera.scrollX;
        this.cameraStartY = this.camera.scrollY;
        this.detachFollow();
      }
    };
    this.scene.input.on('pointerdown', this.pointerDownHandler);

    this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      const dx = (this.dragStartX - pointer.x) / this.camera.zoom;
      const dy = (this.dragStartY - pointer.y) / this.camera.zoom;
      this.camera.scrollX = this.cameraStartX + dx;
      this.camera.scrollY = this.cameraStartY + dy;
    };
    this.scene.input.on('pointermove', this.pointerMoveHandler);

    this.pointerUpHandler = (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonReleased() || pointer.middleButtonReleased()) {
        this.isDragging = false;
      }
    };
    this.scene.input.on('pointerup', this.pointerUpHandler);

    // Disable right-click context menu on the canvas
    this.scene.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  startFollow(target: Phaser.GameObjects.GameObject) {
    this.followTarget = target;
    this.camera.startFollow(target, true, this.followLerp, this.followLerp);
  }

  detachFollow() {
    if (this.followTarget) {
      this.camera.stopFollow();
    }
  }

  reattachFollow() {
    if (this.followTarget) {
      this.camera.startFollow(this.followTarget, true, this.followLerp, this.followLerp);
    }
  }

  snapToTarget() {
    if (this.followTarget) {
      const target = this.followTarget as any;
      this.camera.scrollX = target.x - this.camera.width / (2 * this.camera.zoom);
      this.camera.scrollY = target.y - this.camera.height / (2 * this.camera.zoom);
      this.reattachFollow();
    }
  }

  destroy() {
    this.scene.input.off('wheel', this.wheelHandler);
    this.scene.input.off('pointerdown', this.pointerDownHandler);
    this.scene.input.off('pointermove', this.pointerMoveHandler);
    this.scene.input.off('pointerup', this.pointerUpHandler);
  }
}
