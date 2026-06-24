import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { AssetManager } from '../managers/AssetManager';
import { AssetRegistry, type AssetId } from '../core/AssetRegistry';

/**
 * WorldAssetLoader
 * ----------------
 * Bridges AssetManager (loading/caching) and the scene (spawning).
 *
 * Architecture:
 *   AssetRegistry    — source of truth for asset IDs → URLs
 *   AssetManager     — loads and caches assets (one fetch per URL, ever)
 *   WorldAssetLoader — resolves IDs, spawns into scene, handles fallback
 *
 * Key behaviours:
 *   - Looks up the URL from AssetRegistry
 *   - Delegates loading/caching to AssetManager
 *   - If an asset fails or isn't registered, falls back to placeholder geometry
 *   - Placeholder geometry matches the real asset's approximate footprint
 *     so the world feels correct while real models are being authored
 *   - Returned Object3D is always a clone — the cached GLTF scene is never
 *     mutated, so multiple spawns of the same asset are safe
 *   - Tags each spawned object's userData for future region streaming
 *
 * Usage — single spawn:
 *   const loader = new WorldAssetLoader(game.assets);
 *   const tower = await loader.spawn('relay_tower', {
 *     position: new THREE.Vector3(0, 0, 0),
 *     rotation: new THREE.Euler(0, 0, 0),
 *     regionId: 'RS7'
 *   });
 *   scene.add(tower);
 *
 * Usage — batch spawn (preloads in parallel, then spawns all):
 *   const objects = await loader.spawnRegion('RS7', SPAWN_CONFIG);
 *   objects.forEach(obj => scene.add(obj));
 *
 * Future — region streaming:
 *   loader.releaseRegion('RS7'); // removes cached assets for that region
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpawnOptions {
  /** World position for the spawned object. */
  position?: THREE.Vector3;
  /** World rotation for the spawned object. */
  rotation?: THREE.Euler;
  /** Uniform scale. Defaults to 1. */
  scale?: number;
  /**
   * Region the object belongs to — written to userData.regionId.
   * Used for future region streaming (release by tag).
   */
  regionId?: string;
}

export interface SpawnConfig {
  id: AssetId;
  options?: SpawnOptions;
}

export interface SpawnResult {
  /** The spawned THREE.Object3D (real model or placeholder). */
  object: THREE.Object3D;
  /** Whether real asset was used (true) or placeholder was used (false). */
  isPlaceholder: boolean;
  /** The asset ID that was requested. */
  assetId: AssetId;
}

// ---------------------------------------------------------------------------
// Placeholder geometry — one per asset ID
// ---------------------------------------------------------------------------
// Placeholders are intentionally low-detail and visually distinct (pink
// emissive material) so it's obvious when a real model hasn't been supplied.
// Dimensions are approximate matches for their real-model counterparts so
// the world layout is correct during development.
// ---------------------------------------------------------------------------

const PLACEHOLDER_COLOR = 0xff00ff; // magenta — instantly visible as missing
const PLACEHOLDER_EMISSIVE = 0x550055;

function makePlaceholderMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PLACEHOLDER_COLOR,
    emissive: PLACEHOLDER_EMISSIVE,
    emissiveIntensity: 0.4,
    roughness: 0.9,
    wireframe: false
  });
}

function makePlaceholder(id: AssetId): THREE.Object3D {
  const mat = makePlaceholderMaterial();
  const group = new THREE.Group();
  group.name = `Placeholder_${id}`;

  switch (id) {
    case 'relay_tower': {
      // Shaft ~20m tall
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 20, 8), mat);
      shaft.position.y = 10;
      group.add(shaft);
      break;
    }
    case 'radio_terminal': {
      // Small building 3×3×2
      const walls = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 2), mat);
      walls.position.y = 1.5;
      group.add(walls);
      break;
    }
    case 'maintenance_shed': {
      // Small shed 2×2×1.8
      const shed = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1.8), mat);
      shed.position.y = 1;
      group.add(shed);
      break;
    }
    case 'observation_deck': {
      // Platform 4×0.5×4 at height 3
      const platform = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 4), mat);
      platform.position.y = 3;
      group.add(platform);
      // Simple support pillar
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 8), mat);
      pillar.position.y = 1.5;
      group.add(pillar);
      break;
    }
    case 'vehicle_wreck': {
      // Vehicle hull ~1.2×0.9×2.8
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 2.8), mat);
      hull.position.y = 0.45;
      group.add(hull);
      break;
    }
    case 'fence': {
      // Fence panel 4m wide, 1.5m tall
      const panel = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 0.1), mat);
      panel.position.y = 0.75;
      group.add(panel);
      break;
    }
    case 'crate': {
      // Standard crate 0.8×0.8×0.8
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat);
      box.position.y = 0.4;
      group.add(box);
      break;
    }
    case 'warning_sign': {
      // Sign on post — post 1.5m tall, sign 0.5×0.5
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), mat);
      post.position.y = 0.75;
      group.add(post);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), mat);
      sign.position.y = 1.65;
      group.add(sign);
      break;
    }
    default: {
      // Generic 1m cube fallback for any future unrecognised IDs
      const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      cube.position.y = 0.5;
      group.add(cube);
    }
  }

  return group;
}

// ---------------------------------------------------------------------------
// WorldAssetLoader
// ---------------------------------------------------------------------------

export class WorldAssetLoader {
  private assetManager: AssetManager;

  constructor(assetManager: AssetManager) {
    this.assetManager = assetManager;
  }

  // ---------------------------------------------------------------------------
  // Single spawn
  // ---------------------------------------------------------------------------

  /**
   * Load (if not cached) and spawn a single asset into the world.
   * Always resolves — falls back to placeholder if the model isn't available.
   *
   * The returned object has:
   *   .name          — the asset ID (e.g. 'relay_tower')
   *   .userData.assetId    — the asset ID
   *   .userData.regionId   — the region it belongs to (if provided)
   *   .userData.isPlaceholder — true if placeholder was used
   */
  async spawn(id: AssetId, options: SpawnOptions = {}): Promise<SpawnResult> {
    const def = AssetRegistry.get(id);

    let object: THREE.Object3D;
    let isPlaceholder = false;

    if (!def) {
      console.warn(`[WorldAssetLoader] Asset "${id}" is not registered. Using placeholder.`);
      object = makePlaceholder(id);
      isPlaceholder = true;
    } else {
      try {
        const gltf = await this.assetManager.loadModel(def.url, def.tags);
        object = this.cloneGLTF(gltf, id);
      } catch (err) {
        console.warn(
          `[WorldAssetLoader] Failed to load model for "${id}" (${def.url}). Using placeholder.`,
          err
        );
        object = makePlaceholder(id);
        isPlaceholder = true;
      }
    }

    this.applyOptions(object, id, options, isPlaceholder);
    return { object, isPlaceholder, assetId: id };
  }

  // ---------------------------------------------------------------------------
  // Batch spawn for a region
  // ---------------------------------------------------------------------------

  /**
   * Preload all assets in the spawn config in parallel, then spawn them.
   * Individual load failures fall back to placeholders — one bad asset
   * does not block the others.
   *
   * Usage:
   *   const SPAWN_CONFIG: SpawnConfig[] = [
   *     { id: 'relay_tower',  options: { position: new THREE.Vector3(0, 0, 0), regionId: 'RS7' } },
   *     { id: 'radio_terminal', options: { position: new THREE.Vector3(-8, 0, 5), regionId: 'RS7' } },
   *   ];
   *   const results = await loader.spawnRegion('RS7', SPAWN_CONFIG);
   *   results.forEach(r => scene.add(r.object));
   */
  async spawnRegion(regionId: string, configs: SpawnConfig[]): Promise<SpawnResult[]> {
    // Preload all assets for this region in parallel.
    // AssetManager deduplicates concurrent requests for the same URL.
    const manifest = AssetRegistry.getRegionManifest(regionId);
    if (manifest.length > 0) {
      await this.assetManager.preload(manifest);
    }

    // Spawn in declaration order (sequential — preload already ran in parallel).
    const results: SpawnResult[] = [];
    for (const config of configs) {
      const result = await this.spawn(config.id, {
        regionId,
        ...config.options
      });
      results.push(result);
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Region streaming (future)
  // ---------------------------------------------------------------------------

  /**
   * Release all cached assets tagged with a region.
   * Call when the player leaves a region and its objects have been removed
   * from the scene (WorldAssetLoader does not manage scene membership —
   * that's the caller's responsibility).
   *
   * Note: Placeholders hold no GPU resources, so only real assets are
   * released. This is handled automatically by AssetManager.releaseByTag().
   */
  releaseRegion(regionId: string): void {
    this.assetManager.releaseByTag(regionId);
    console.log(`[WorldAssetLoader] Released assets for region "${regionId}".`);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Clone a loaded GLTF scene so each spawn is an independent object.
   * The source GLTF cached in AssetManager is never mutated.
   */
  private cloneGLTF(gltf: GLTF, id: AssetId): THREE.Object3D {
    const clone = gltf.scene.clone(true);
    clone.name = id;

    // Re-enable shadows on every mesh in the cloned hierarchy.
    // (Three.js clone() copies shadow flags but they're sometimes lost
    // depending on loader version.)
    clone.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    return clone;
  }

  /**
   * Apply position, rotation, scale, and userData to a spawned object.
   */
  private applyOptions(
    object: THREE.Object3D,
    id: AssetId,
    options: SpawnOptions,
    isPlaceholder: boolean
  ): void {
    if (options.position) object.position.copy(options.position);
    if (options.rotation) object.rotation.copy(options.rotation);
    if (options.scale !== undefined) object.scale.setScalar(options.scale);

    object.userData.assetId      = id;
    object.userData.regionId     = options.regionId ?? null;
    object.userData.isPlaceholder = isPlaceholder;
  }
}
