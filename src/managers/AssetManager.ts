import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * AssetManager
 * ------------
 * Central registry and loader for all DRIFTER assets: models, textures,
 * and audio. Browser-first, cache-first.
 *
 * Supported formats:
 *   Models   — GLB, GLTF (with optional Draco compression)
 *   Textures — PNG, WebP (via THREE.TextureLoader)
 *   Audio    — MP3, OGG, WAV (raw ArrayBuffer — Web Audio API compatible)
 *
 * Key properties:
 *   Cache-first       — identical URLs are never fetched twice
 *   In-flight dedup   — concurrent requests for the same URL share one fetch
 *   Lazy loading      — nothing loads until requested (or preloaded explicitly)
 *   Progress events   — per-asset and aggregate loading progress
 *   Error isolation   — one failed asset does not block others
 *
 * API:
 *   loadModel(url)    → Promise<GLTF>
 *   loadTexture(url)  → Promise<THREE.Texture>
 *   loadAudio(url)    → Promise<AudioBuffer>  (requires AudioContext)
 *   getModel(url)     → GLTF | undefined      (sync, cache only)
 *   getTexture(url)   → THREE.Texture | undefined
 *   getAudio(url)     → AudioBuffer | undefined
 *   preload(urls[])   → Promise<void>          (batch warm-up)
 *   getProgress()     → { loaded, total, ratio }
 *
 * Future:
 *   - Asset bundles: preload(bundleManifest[]) grouped by region
 *   - Region streaming: releaseRegion(regionId) disposes unused assets
 *   - Sprite sheets: loadSpriteSheet() wraps loadTexture + atlas parsing
 *
 * Usage:
 *   const assets = new AssetManager();
 *   const gltf = await assets.loadModel('/models/relay-station.glb');
 *   scene.add(gltf.scene.clone());
 *
 *   // Wire progress to a loading screen
 *   assets.onProgress((e) => loadingBar.set(e.ratio));
 *   assets.onAllLoaded(() => loadingScreen.hide());
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetType = 'model' | 'texture' | 'audio';

export interface AssetEntry<T> {
  url: string;
  type: AssetType;
  asset: T;
  /** Tags for future region-based release: e.g. ['RS7', 'outdoor'] */
  tags: string[];
  loadedAt: number;
}

export interface ProgressEvent {
  /** URL of the asset being loaded, or 'aggregate' for total progress. */
  url: string;
  /** Bytes loaded so far (0 if browser doesn't report). */
  loaded: number;
  /** Total bytes (0 if unknown). */
  total: number;
  /** 0–1 ratio. Always 1 when complete. 0.5 if total unknown. */
  ratio: number;
}

export interface AggregateProgress {
  /** Total assets requested since construction. */
  total: number;
  /** Assets fully loaded. */
  loaded: number;
  /** 0–1. */
  ratio: number;
}

export type ProgressListener = (event: ProgressEvent) => void;
export type ErrorListener = (url: string, error: Error) => void;
export type AllLoadedListener = () => void;

// ---------------------------------------------------------------------------
// AssetManager
// ---------------------------------------------------------------------------

export class AssetManager {
  // --- Caches (keyed by URL) ---
  private models   = new Map<string, AssetEntry<GLTF>>();
  private textures = new Map<string, AssetEntry<THREE.Texture>>();
  private audio    = new Map<string, AssetEntry<AudioBuffer>>();

  /**
   * In-flight promises — prevents duplicate concurrent requests.
   * While a fetch is in progress, any subsequent request for the same URL
   * receives the same Promise instead of starting a second fetch.
   */
  private inFlight = new Map<string, Promise<unknown>>();

  // --- THREE loaders ---
  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;

  // --- Web Audio ---
  private audioContext: AudioContext | null = null;

  // --- Progress tracking ---
  private totalRequested = 0;
  private totalCompleted = 0;

  // --- Listeners ---
  private progressListeners  = new Set<ProgressListener>();
  private errorListeners     = new Set<ErrorListener>();
  private allLoadedListeners = new Set<AllLoadedListener>();

  constructor() {
    // GLTF loader with optional Draco decompression.
    // DRACOLoader path points to Vite-served static files — copy draco/
    // from node_modules/three/examples/jsm/libs/draco/ into public/draco/.
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    draco.preload(); // warm up WASM decoder in background

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(draco);

    this.textureLoader = new THREE.TextureLoader();
  }

  // ---------------------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------------------

  /**
   * Load a GLB/GLTF model. Returns cached result if already loaded.
   * The returned GLTF object is the original — clone gltf.scene before
   * adding to the scene if you need multiple instances.
   */
  public async loadModel(url: string, tags: string[] = []): Promise<GLTF> {
    const cached = this.models.get(url);
    if (cached) return cached.asset;

    return this.dedupe(url, async () => {
      this.totalRequested++;
      try {
        const gltf = await this.loadGLTF(url);
        this.models.set(url, {
          url, type: 'model', asset: gltf, tags, loadedAt: Date.now()
        });
        this.onAssetComplete(url);
        return gltf;
      } catch (err) {
        this.onAssetError(url, err);
        throw err;
      }
    }) as Promise<GLTF>;
  }

  /** Returns a cached model synchronously, or undefined if not loaded yet. */
  public getModel(url: string): GLTF | undefined {
    return this.models.get(url)?.asset;
  }

  // ---------------------------------------------------------------------------
  // Textures
  // ---------------------------------------------------------------------------

  /**
   * Load a PNG/WebP texture. Returns cached result if already loaded.
   * Automatically sets colorSpace to SRGBColorSpace for correct rendering.
   */
  public async loadTexture(url: string, tags: string[] = []): Promise<THREE.Texture> {
    const cached = this.textures.get(url);
    if (cached) return cached.asset;

    return this.dedupe(url, async () => {
      this.totalRequested++;
      try {
        const texture = await this.loadTextureAsync(url);
        this.textures.set(url, {
          url, type: 'texture', asset: texture, tags, loadedAt: Date.now()
        });
        this.onAssetComplete(url);
        return texture;
      } catch (err) {
        this.onAssetError(url, err);
        throw err;
      }
    }) as Promise<THREE.Texture>;
  }

  /** Returns a cached texture synchronously, or undefined if not loaded yet. */
  public getTexture(url: string): THREE.Texture | undefined {
    return this.textures.get(url)?.asset;
  }

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------

  /**
   * Load an MP3/OGG/WAV file as a decoded Web Audio AudioBuffer.
   * Requires an AudioContext — pass one in or call setAudioContext() first.
   * Returns cached result if already loaded.
   *
   * Note: AudioContext must be created in response to a user gesture on
   * iOS/Chrome. Create it on first user interaction, then call
   * assetManager.setAudioContext(ctx).
   */
  public async loadAudio(
    url: string,
    audioContext?: AudioContext,
    tags: string[] = []
  ): Promise<AudioBuffer> {
    const cached = this.audio.get(url);
    if (cached) return cached.asset;

    const ctx = audioContext ?? this.audioContext;
    if (!ctx) {
      throw new Error(
        `[AssetManager] No AudioContext available. ` +
        `Pass one to loadAudio() or call setAudioContext() first.`
      );
    }

    return this.dedupe(url, async () => {
      this.totalRequested++;
      try {
        const buffer = await this.loadAudioBuffer(url, ctx);
        this.audio.set(url, {
          url, type: 'audio', asset: buffer, tags, loadedAt: Date.now()
        });
        this.onAssetComplete(url);
        return buffer;
      } catch (err) {
        this.onAssetError(url, err);
        throw err;
      }
    }) as Promise<AudioBuffer>;
  }

  /** Returns a cached AudioBuffer synchronously, or undefined if not loaded. */
  public getAudio(url: string): AudioBuffer | undefined {
    return this.audio.get(url)?.asset;
  }

  /** Set the AudioContext to use for future loadAudio() calls. */
  public setAudioContext(ctx: AudioContext): void {
    this.audioContext = ctx;
  }

  // ---------------------------------------------------------------------------
  // Batch preloading
  // ---------------------------------------------------------------------------

  /**
   * Preload a list of assets in parallel.
   * Useful for warming up before a region loads.
   * Individual errors are caught and emitted via onError — they do not
   * reject the returned Promise, so one bad asset won't block the rest.
   *
   * Usage:
   *   await assets.preload([
   *     { url: '/models/rs7.glb',        type: 'model'   },
   *     { url: '/textures/ground.webp',  type: 'texture' },
   *     { url: '/audio/wind.ogg',        type: 'audio'   },
   *   ]);
   */
  public async preload(
    manifest: Array<{ url: string; type: AssetType; tags?: string[] }>,
    audioContext?: AudioContext
  ): Promise<void> {
    const promises = manifest.map(({ url, type, tags = [] }) => {
      if (type === 'model')   return this.loadModel(url, tags).catch(() => {});
      if (type === 'texture') return this.loadTexture(url, tags).catch(() => {});
      if (type === 'audio')   return this.loadAudio(url, audioContext, tags).catch(() => {});
      return Promise.resolve();
    });

    await Promise.all(promises);
  }

  // ---------------------------------------------------------------------------
  // Region-based release (future streaming)
  // ---------------------------------------------------------------------------

  /**
   * Dispose and remove all assets tagged with a given region id.
   * Call when the player leaves a region and its assets are no longer needed.
   * Safe to call with a region that has no assets.
   *
   * Note: only removes from AssetManager's cache — THREE objects already
   * added to the scene must be removed from the scene separately.
   */
  public releaseByTag(tag: string): void {
    for (const [url, entry] of this.models) {
      if (entry.tags.includes(tag)) {
        this.disposeGLTF(entry.asset);
        this.models.delete(url);
      }
    }
    for (const [url, entry] of this.textures) {
      if (entry.tags.includes(tag)) {
        entry.asset.dispose();
        this.textures.delete(url);
      }
    }
    for (const [url, entry] of this.audio) {
      if (entry.tags.includes(tag)) {
        this.audio.delete(url); // AudioBuffers have no explicit dispose
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------------

  /** Returns aggregate loading progress across all asset types. */
  public getProgress(): AggregateProgress {
    const total  = this.totalRequested;
    const loaded = this.totalCompleted;
    return {
      total,
      loaded,
      ratio: total === 0 ? 1 : loaded / total
    };
  }

  /** Subscribe to per-asset progress events. Returns unsubscribe fn. */
  public onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  /**
   * Subscribe to asset load errors. Errors are non-fatal — the failed
   * asset just won't be in the cache. Returns unsubscribe fn.
   */
  public onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * Subscribe to the moment all currently-requested assets are loaded.
   * Fires immediately if nothing is pending. Returns unsubscribe fn.
   *
   * Note: fires each time the queue drains — use for loading screens.
   */
  public onAllLoaded(listener: AllLoadedListener): () => void {
    this.allLoadedListeners.add(listener);
    if (this.totalRequested === this.totalCompleted && this.totalRequested > 0) {
      listener();
    }
    return () => this.allLoadedListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Registry inspection
  // ---------------------------------------------------------------------------

  /** List all loaded model URLs. */
  public getLoadedModels(): string[] {
    return Array.from(this.models.keys());
  }

  /** List all loaded texture URLs. */
  public getLoadedTextures(): string[] {
    return Array.from(this.textures.keys());
  }

  /** List all loaded audio URLs. */
  public getLoadedAudio(): string[] {
    return Array.from(this.audio.keys());
  }

  /** Total number of assets currently in cache. */
  public getCacheSize(): number {
    return this.models.size + this.textures.size + this.audio.size;
  }

  // ---------------------------------------------------------------------------
  // Full dispose
  // ---------------------------------------------------------------------------

  /**
   * Dispose all GPU-side resources and clear all caches.
   * Call on game shutdown or full reset.
   */
  public dispose(): void {
    for (const entry of this.models.values())   this.disposeGLTF(entry.asset);
    for (const entry of this.textures.values()) entry.asset.dispose();
    this.models.clear();
    this.textures.clear();
    this.audio.clear();
    this.inFlight.clear();
    this.progressListeners.clear();
    this.errorListeners.clear();
    this.allLoadedListeners.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal loaders
  // ---------------------------------------------------------------------------

  /** Wraps GLTFLoader in a Promise with progress events. */
  private loadGLTF(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => resolve(gltf),
        (xhr) => {
          this.emitProgress({
            url,
            loaded: xhr.loaded,
            total: xhr.total,
            ratio: xhr.total > 0 ? xhr.loaded / xhr.total : 0.5
          });
        },
        (err) => reject(err instanceof Error ? err : new Error(String(err)))
      );
    });
  }

  /** Wraps THREE.TextureLoader in a Promise with progress events. */
  private loadTextureAsync(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          resolve(texture);
        },
        (xhr) => {
          this.emitProgress({
            url,
            loaded: xhr.loaded,
            total: xhr.total,
            ratio: xhr.total > 0 ? xhr.loaded / xhr.total : 0.5
          });
        },
        (err) => reject(err instanceof Error ? err : new Error(String(err)))
      );
    });
  }

  /** Fetches an audio file and decodes it via Web Audio API. */
  private async loadAudioBuffer(url: string, ctx: AudioContext): Promise<AudioBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[AssetManager] Audio fetch failed: ${response.status} ${url}`);
    }

    // Emit indeterminate progress while fetching
    this.emitProgress({ url, loaded: 0, total: 0, ratio: 0.5 });

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    this.emitProgress({ url, loaded: 1, total: 1, ratio: 1 });
    return audioBuffer;
  }

  // ---------------------------------------------------------------------------
  // In-flight deduplication
  // ---------------------------------------------------------------------------

  /**
   * Ensures only one fetch runs per URL at a time.
   * Concurrent calls for the same URL receive the same Promise.
   * The Promise is removed from inFlight once settled (success or error).
   */
  private dedupe<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(url);
    if (existing) return existing as Promise<T>;

    const promise = fn().finally(() => {
      this.inFlight.delete(url);
    });

    this.inFlight.set(url, promise);
    return promise;
  }

  // ---------------------------------------------------------------------------
  // Completion tracking + events
  // ---------------------------------------------------------------------------

  private onAssetComplete(url: string): void {
    this.totalCompleted++;
    this.emitProgress({ url, loaded: 1, total: 1, ratio: 1 });

    if (this.totalCompleted >= this.totalRequested) {
      for (const l of this.allLoadedListeners) l();
    }
  }

  private onAssetError(url: string, err: unknown): void {
    // Count as "complete" for progress purposes so the bar doesn't stall
    this.totalCompleted++;
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[AssetManager] Failed to load "${url}":`, error.message);
    for (const l of this.errorListeners) l(url, error);

    if (this.totalCompleted >= this.totalRequested) {
      for (const l of this.allLoadedListeners) l();
    }
  }

  private emitProgress(event: ProgressEvent): void {
    for (const l of this.progressListeners) l(event);
  }

  // ---------------------------------------------------------------------------
  // GLTF disposal helpers
  // ---------------------------------------------------------------------------

  /** Traverse a loaded GLTF and dispose all geometries and materials. */
  private disposeGLTF(gltf: GLTF): void {
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const mat of mats) {
          disposeMaterial(mat);
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Material disposal helper
// ---------------------------------------------------------------------------

/** Dispose all texture maps on a material before disposing the material itself. */
function disposeMaterial(mat: THREE.Material): void {
  const textureKeys: Array<keyof THREE.MeshStandardMaterial> = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap',
    'emissiveMap', 'aoMap', 'lightMap', 'alphaMap',
    'bumpMap', 'displacementMap', 'envMap'
  ];

  for (const key of textureKeys) {
    const tex = (mat as THREE.MeshStandardMaterial)[key];
    if (tex instanceof THREE.Texture) {
      tex.dispose();
    }
  }

  mat.dispose();
}
