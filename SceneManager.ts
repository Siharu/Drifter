import * as THREE from 'three';

/**
 * SceneManager
 * ------------
 * Owns the THREE.Scene instance and its global visual properties:
 * background color and fog.
 *
 * Future support:
 * - Region loading: swapping/streaming groups of objects in and out of
 *   the scene as the player moves between areas. The `regionRoot` group
 *   below is a placeholder anchor point for that system — region loaders
 *   will add/remove their content under `regionRoot` rather than directly
 *   on `scene`, keeping a clean separation between "always present" scene
 *   setup (lighting, fog, sky) and "streamed" world content.
 */
export class SceneManager {
  public readonly scene: THREE.Scene;

  /** Anchor group for future region-streamed content. Empty for now. */
  public readonly regionRoot: THREE.Group;

  constructor() {
    this.scene = new THREE.Scene();

    // Another Sky aesthetic: dark, smoke-choked, crimson-cast background.
    // Acts as the "void" color when fog doesn't fully occlude.
    this.scene.background = new THREE.Color(0x0a0303);

    // Exponential fog reads better than linear fog for atmospheric/horror
    // tone — it falls off gradually rather than with a hard cutoff edge,
    // and it scales naturally regardless of scene scale.
    this.scene.fog = new THREE.FogExp2(0x0a0303, 0.035);

    this.regionRoot = new THREE.Group();
    this.regionRoot.name = 'regionRoot';
    this.scene.add(this.regionRoot);
  }

  /** Adds an object directly to the scene root (lights, camera rigs, etc). */
  public add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  /** Removes an object from the scene root. */
  public remove(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  /** Updates background + fog color together, e.g. for day/night or zone shifts. */
  public setAtmosphereColor(color: THREE.ColorRepresentation): void {
    (this.scene.background as THREE.Color).set(color);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(color);
    }
  }

  /** Adjusts fog density, e.g. for indoor/outdoor or weather transitions. */
  public setFogDensity(density: number): void {
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = density;
    }
  }
}
