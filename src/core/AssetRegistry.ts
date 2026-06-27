import type { AssetType } from '../managers/AssetManager';

/**
 * AssetRegistry
 * -------------
 * Source of truth for every named asset in DRIFTER.
 *
 * Architecture:
 *   AssetRegistry  — maps asset IDs to { url, type, tags }
 *   AssetManager   — loads and caches assets by URL
 *   WorldAssetLoader — resolves IDs → spawns objects into scenes
 *
 * Usage:
 *   const entry = AssetRegistry.get('relay_tower');
 *   // → { url: '/assets/models/relay_tower.glb', type: 'model', tags: ['RS7'] }
 *
 *   const manifest = AssetRegistry.getRegionManifest('RS7');
 *   await assetManager.preload(manifest);
 *
 * Naming conventions:
 *   Models   → /assets/models/<id>.glb
 *   Textures → /assets/textures/<id>.webp  (PNG fallback: <id>.png)
 *   Audio    → /assets/audio/<id>.ogg      (MP3 fallback: <id>.mp3)
 *
 * Adding new assets:
 *   1. Add an entry to ASSET_REGISTRY below.
 *   2. Drop the file at the declared url path inside /public.
 *   3. Tag it with the region(s) it belongs to.
 *   That is all. WorldAssetLoader and AssetManager pick it up automatically.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetId =
  // RS7 structural
  | 'relay_tower'
  | 'radio_terminal'
  | 'maintenance_shed'
  | 'observation_deck'
  | 'antenna_array'
  // RS7 props
  | 'vehicle_wreck'
  | 'fence'
  | 'crate'
  | 'warning_sign'
  // Region 02 (Service Road) structural
  | 'checkpoint';

export interface AssetDefinition {
  /** Public URL served by Vite from the /public directory. */
  url: string;
  /** Asset type — drives which AssetManager loader is used. */
  type: AssetType;
  /**
   * Region tags. Used by AssetManager.preload() and releaseByTag().
   * Multiple tags = asset shared between regions (not released until all
   * regions using it are unloaded).
   */
  tags: string[];
  /**
   * Human-readable description for debugging.
   * Never shown to players.
   */
  description: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ASSET_REGISTRY: Record<AssetId, AssetDefinition> = {
  // --- RS7: Structural elements (mapped to retro-urban-kit) ----------------------------------------
  relay_tower: {
    url: '/assets/models/retro-urban-kit/roof-metal-poles.glb',
    type: 'model',
    tags: ['RS7'],
    description: 'Central relay tower structure (roof-metal-poles).'
  },
  radio_terminal: {
    url: '/assets/models/retro-urban-kit/scaffolding-structure.glb',
    type: 'model',
    tags: ['RS7'],
    description: 'Small radio terminal building (scaffolding-structure).'
  },
  maintenance_shed: {
    url: '/assets/models/retro-urban-kit/wall-a-flat.glb',
    type: 'model',
    tags: ['RS7'],
    description: 'Small maintenance shed structure (wall-a-flat).'
  },
  observation_deck: {
    url: '/assets/models/retro-urban-kit/scaffolding-floor.glb',
    type: 'model',
    tags: ['RS7'],
    description: 'Raised observation platform (scaffolding-floor).'
  },
  antenna_array: {
    url: '/assets/models/retro-urban-kit/detail-cables-type-a.glb',
    type: 'model',
    tags: ['RS7'],
    description: 'Antenna array structure (detail-cables-type-a).'
  },

  // --- RS7: Props -------------------------------------------------------
  vehicle_wreck: {
    url: '/assets/models/retro-urban-kit/truck-flat.glb',
    type: 'model',
    tags: ['RS7'],
    description: 'Broken-down vehicle prop (truck-flat).'
  },
  fence: {
    url: '/assets/models/retro-urban-kit/wall-fence.glb',
    type: 'model',
    tags: ['RS7'],
    description: 'Fence segment from retro-urban-kit.'
  },
  crate: {
    url: '/assets/models/retro-urban-kit/pallet.glb',
    type: 'model',
    tags: ['RS7'],
    description: 'Storage prop (pallet).'
  },
  warning_sign: {
    url: '/assets/models/retro-urban-kit/detail-light-traffic.glb',
    type: 'model',
    tags: ['RS7'],
    description: 'Warning sign prop (detail-light-traffic).'
  },

  // --- Region 02 (Service Road): Structural elements --------------------
  checkpoint: {
    url: '/assets/models/retro-urban-kit/wall-a-flat-garage.glb',
    type: 'model',
    tags: ['SVC_ROAD'],
    description: 'Checkpoint booth structure (wall-a-flat-garage).'
  }
};

// ---------------------------------------------------------------------------
// AssetRegistry class
// ---------------------------------------------------------------------------

export class AssetRegistry {
  /**
   * Look up an asset definition by ID.
   * Returns undefined if the ID is not registered — callers should
   * treat this as "use placeholder geometry".
   */
  static get(id: AssetId): AssetDefinition | undefined {
    return ASSET_REGISTRY[id];
  }

  /**
   * Returns every registered definition — useful for validation or tooling.
   */
  static getAll(): Record<AssetId, AssetDefinition> {
    return { ...ASSET_REGISTRY };
  }

  /**
   * Returns all asset definitions tagged with a specific region.
   * Pass the result directly to AssetManager.preload() to warm up a region.
   *
   * Usage:
   *   const manifest = AssetRegistry.getRegionManifest('RS7');
   *   await game.assets.preload(manifest);
   */
  static getRegionManifest(regionId: string): Array<{ url: string; type: AssetType; tags: string[] }> {
    return Object.values(ASSET_REGISTRY)
      .filter(def => def.tags.includes(regionId))
      .map(({ url, type, tags }) => ({ url, type, tags }));
  }

  /**
   * Returns every registered asset ID.
   */
  static getIds(): AssetId[] {
    return Object.keys(ASSET_REGISTRY) as AssetId[];
  }

  /**
   * Returns whether a given string is a registered asset ID.
   * Useful as a type guard when IDs come from external data.
   */
  static isRegistered(id: string): id is AssetId {
    return id in ASSET_REGISTRY;
  }
}
