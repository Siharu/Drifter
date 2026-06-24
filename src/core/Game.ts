import * as THREE from 'three';
import { Renderer } from './Renderer';
import { SceneManager } from './SceneManager';
import { CameraController } from './CameraController';
import { LightingSystem } from './LightingSystem';
import { AssetManager } from '../managers/AssetManager';

/**
 * Updatable
 * ---------
 * Minimal contract for anything registered into the game loop.
 * Future systems (movement, interaction, discovery, etc.) implement
 * this so Game doesn't need to know about their concrete types.
 */
export interface Updatable {
  update(deltaTime: number): void;
}

/**
 * Game
 * ----
 * Owns the renderer, scene, camera, and lighting, and drives the main
 * update/render loop. Other systems register themselves via
 * `registerSystem()` and get their `update(deltaTime)` called every
 * frame, in registration order, before the frame is rendered.
 *
 * This class deliberately does NOT contain movement, interaction, or UI
 * logic — those are separate systems that plug in via registerSystem().
 */
export class Game {
  public readonly renderer: Renderer;
  public readonly sceneManager: SceneManager;
  public readonly cameraController: CameraController;
  public readonly lightingSystem: LightingSystem;
  public readonly assets: AssetManager;

  private readonly systems: Updatable[] = [];

  private clock: THREE.Clock;
  private animationFrameId: number | null = null;
  private isRunning = false;

  /** Caps delta time to avoid huge jumps after tab-switch / debugger pause. */
  private readonly maxDeltaTime = 1 / 15;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.sceneManager = new SceneManager();
    this.assets = new AssetManager();

    const { width, height } = this.renderer.getSize();
    this.cameraController = new CameraController(width / height);

    this.lightingSystem = new LightingSystem(this.sceneManager.scene);

    this.clock = new THREE.Clock(false);

    window.addEventListener('resize', this.handleResize);
    // ResizeObserver inside Renderer covers container resizes; window
    // resize is also handled here to keep the camera aspect in sync,
    // since Renderer doesn't know about CameraController.
  }

  /** Registers a system to receive update(deltaTime) calls every frame. */
  public registerSystem(system: Updatable): void {
    this.systems.push(system);
  }

  /** Unregisters a previously registered system. */
  public unregisterSystem(system: Updatable): void {
    const index = this.systems.indexOf(system);
    if (index !== -1) this.systems.splice(index, 1);
  }

  /** Starts the main loop. */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  /** Stops the main loop. Safe to call multiple times. */
  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.clock.stop();
  }

  private tick = (): void => {
    if (!this.isRunning) return;

    const rawDelta = this.clock.getDelta();
    const deltaTime = Math.min(rawDelta, this.maxDeltaTime);

    for (const system of this.systems) {
      system.update(deltaTime);
    }

    this.cameraController.update(deltaTime);
    this.renderer.render(this.sceneManager.scene, this.cameraController.camera);

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private handleResize = (): void => {
    const { width, height } = this.renderer.getSize();
    if (height === 0) return;
    this.cameraController.setAspect(width / height);
  };

  /** Full teardown — stops the loop, disposes GPU resources, removes listeners. */
  public dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }
}
