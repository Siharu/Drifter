import * as THREE from 'three';

/**
 * Renderer
 * --------
 * Thin wrapper around THREE.WebGLRenderer.
 *
 * Responsibilities:
 * - Create and configure the WebGL renderer.
 * - Attach the renderer's DOM element to a container.
 * - Keep the renderer's size in sync with its container (responsive).
 * - Cap device pixel ratio to protect performance on high-DPI screens.
 *
 * This class does NOT know about scenes, cameras, or game logic.
 * It only renders whatever (scene, camera) pair it's given.
 */
export class Renderer {
  public readonly instance: THREE.WebGLRenderer;
  public readonly domElement: HTMLCanvasElement;

  private container: HTMLElement;
  private maxPixelRatio: number;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, options: { maxPixelRatio?: number } = {}) {
    this.container = container;
    this.maxPixelRatio = options.maxPixelRatio ?? 2;

    this.instance = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      // Stencil/depth left at defaults; no need for stencil buffer right now.
      stencil: false
    });

    this.domElement = this.instance.domElement;

    // Color management: keep output predictable across browsers/devices.
    this.instance.outputColorSpace = THREE.SRGBColorSpace;
    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 1.0;

    // Shadows are opt-in and cheap by default; systems can enable per-light.
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap;

    this.applyPixelRatio();
    this.applySize();

    this.container.appendChild(this.domElement);

    // Respond to container size changes (not just window resize) so the
    // renderer behaves correctly if it's ever embedded in a non-fullscreen panel.
    this.resizeObserver = new ResizeObserver(() => this.applySize());
    this.resizeObserver.observe(this.container);
  }

  /** Caps device pixel ratio to avoid burning GPU on retina/4K displays. */
  private applyPixelRatio(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    this.instance.setPixelRatio(ratio);
  }

  /** Resizes the renderer + canvas to match the current container bounds. */
  private applySize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.instance.setSize(width, height, true);
  }

  /** Returns current drawing buffer size, useful for cameras/post effects. */
  public getSize(): { width: number; height: number } {
    const size = new THREE.Vector2();
    this.instance.getSize(size);
    return { width: size.x, height: size.y };
  }

  /** Renders a single frame. */
  public render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.instance.render(scene, camera);
  }

  /** Call on game shutdown / hot-reload teardown to free GPU resources. */
  public dispose(): void {
    this.resizeObserver.disconnect();
    this.instance.dispose();
    if (this.domElement.parentElement === this.container) {
      this.container.removeChild(this.domElement);
    }
  }
}
