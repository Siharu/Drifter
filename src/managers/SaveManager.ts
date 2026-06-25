import type { DiscoverySystem } from '../systems/DiscoverySystem';
import type { Discovery } from '../systems/DiscoverySystem';
import type { RadioSystem } from '../systems/RadioSystem';
import type { Player } from '../player/Player';

/**
 * SaveManager
 * -----------
 * Persists DRIFTER progress to localStorage between browser sessions.
 *
 * Save data:
 *   - discoveries     Full Discovery records (id, title, type, content, timestamp, regionId)
 *   - logbook         Currently derived from discoveries; reserved for future unlock state
 *   - broadcasts      Played/unplayed state per broadcast id
 *   - player          Position (x, y, z) + last known region
 *
 * Features:
 *   save()            Write current game state to localStorage immediately
 *   load()            Read saved state and rehydrate all systems
 *   autosave()        Internal interval + event-triggered save (30s + on discovery)
 *   clearSave()       Wipe localStorage slot
 *   hasSave()         Returns true if a valid save exists
 *
 * Autosave triggers:
 *   - Every 30 seconds of real time
 *   - Immediately on any new discovery (via DiscoverySystem.onDiscoveryAdded)
 *   - On player region change (call notifyRegionChange(regionId) from world code)
 *
 * Architecture:
 *   - Versioned format: SAVE_VERSION bump forces clearSave() on load
 *   - Future cloud-save: toSaveData() / fromSaveData() are pure JSON —
 *     swap localStorage for Supabase by changing only read/writePersisted()
 *   - No circular deps: SaveManager imports systems, not vice versa
 *   - Dirty flag: skips write if nothing changed since last save
 *
 * Usage (in main.ts):
 *   const saveManager = new SaveManager(discoverySystem, radioSystem, localPlayer);
 *   saveManager.startAutosave();
 *
 *   // Optional: hook save/load feedback into UI
 *   saveManager.onSaved(() => showToast('Game saved'));
 *   saveManager.onLoaded((data) => console.log('Loaded', data.discoveries.length, 'discoveries'));
 *
 *   // Load on startup
 *   saveManager.load();
 *
 *   // From region transition code:
 *   saveManager.notifyRegionChange('RS7');
 */

// ---------------------------------------------------------------------------
// Save format
// ---------------------------------------------------------------------------

/**
 * Bump this when the save shape changes in a breaking way.
 * On load: if stored version !== SAVE_VERSION, save is discarded.
 */
const SAVE_VERSION = 1;

const STORAGE_KEY = 'drifter_save_v1';

/** Serialized player state. THREE.Vector3 → plain object for JSON. */
export interface SavedPlayerState {
  x: number;
  y: number;
  z: number;
  lastRegionId: string;
}

/** Full broadcast archive state. */
export interface SavedBroadcastState {
  /** IDs of broadcasts that have been opened/read. */
  playedIds: string[];
  /** ID of the last broadcast that was set as current. */
  currentBroadcastId: string | null;
}

/** Top-level save document — what actually goes to localStorage. */
export interface SaveData {
  /** Format version. Mismatched versions are discarded on load. */
  version: number;
  /** Unix ms timestamp of the last save. */
  savedAt: number;
  /** Full discovery records (JSON-safe, no THREE types). */
  discoveries: Discovery[];
  /** Broadcast played/unplayed state. */
  broadcasts: SavedBroadcastState;
  /** Player transform + region. */
  player: SavedPlayerState;
}

// ---------------------------------------------------------------------------
// Listener types
// ---------------------------------------------------------------------------

export type SavedListener = (data: SaveData) => void;
export type LoadedListener = (data: SaveData) => void;
export type SaveErrorListener = (error: Error) => void;

// ---------------------------------------------------------------------------
// SaveManager
// ---------------------------------------------------------------------------

export class SaveManager {
  private discoverySystem: DiscoverySystem;
  private radioSystem: RadioSystem;
  private player: Player;

  /** Current last-known region, updated via notifyRegionChange(). */
  private currentRegionId = 'RS7';

  /** Dirty flag: true when game state has changed since last save. */
  private isDirty = false;

  /** Autosave interval handle (setInterval). */
  private autosaveIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Autosave interval in ms (default 30s). */
  private autosaveIntervalMs = 30_000;

  /** Timestamp of last successful save, or null if never saved. */
  private lastSavedAt: number | null = null;

  /** Unsubscribe fn for DiscoverySystem listener. */
  private unsubscribeDiscovery: (() => void) | null = null;

  /** Whether a save/load operation is in progress (guards against re-entry). */
  private isBusy = false;

  // --- Listeners ---
  private savedListeners = new Set<SavedListener>();
  private loadedListeners = new Set<LoadedListener>();
  private errorListeners = new Set<SaveErrorListener>();

  constructor(
    discoverySystem: DiscoverySystem,
    radioSystem: RadioSystem,
    player: Player
  ) {
    this.discoverySystem = discoverySystem;
    this.radioSystem = radioSystem;
    this.player = player;

    // Mark dirty on every new discovery so the next autosave interval fires
    this.unsubscribeDiscovery = this.discoverySystem.onDiscoveryAdded(() => {
      this.isDirty = true;
      // Also save immediately on discovery — progress should never be lost
      this.save();
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Write current game state to localStorage immediately.
   * No-ops if a save/load is already in progress.
   * Returns true on success, false on failure.
   */
  public save(): boolean {
    if (this.isBusy) return false;
    this.isBusy = true;

    try {
      const data = this.toSaveData();
      this.writePersisted(data);
      this.lastSavedAt = data.savedAt;
      this.isDirty = false;
      this.emitSaved(data);
      return true;
    } catch (err) {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * Read save from localStorage and rehydrate all systems.
   * Returns the loaded SaveData on success, null if no save or invalid.
   */
  public load(): SaveData | null {
    if (this.isBusy) return null;
    this.isBusy = true;

    try {
      const data = this.readPersisted();
      if (!data) return null;

      this.fromSaveData(data);
      this.lastSavedAt = data.savedAt;
      this.isDirty = false;
      this.emitLoaded(data);
      return data;
    } catch (err) {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
      return null;
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * Start the autosave interval (default every 30 seconds).
   * Also saves on dirty-check tick: only writes when state has changed.
   * Call once in main.ts after all systems are initialized.
   */
  public startAutosave(intervalMs = 30_000): void {
    this.stopAutosave();
    this.autosaveIntervalMs = intervalMs;

    this.autosaveIntervalId = setInterval(() => {
      if (this.isDirty) {
        this.save();
      }
    }, this.autosaveIntervalMs);
  }

  /** Stop the autosave interval. */
  public stopAutosave(): void {
    if (this.autosaveIntervalId !== null) {
      clearInterval(this.autosaveIntervalId);
      this.autosaveIntervalId = null;
    }
  }

  /**
   * Wipe the save slot entirely.
   * Does NOT reset in-memory game state — call after resetting systems.
   */
  public clearSave(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      this.lastSavedAt = null;
      this.isDirty = false;
    } catch (err) {
      this.emitError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Returns true if a valid save exists in localStorage.
   * Does not load it — just checks existence and version.
   */
  public hasSave(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return parsed.version === SAVE_VERSION;
    } catch {
      return false;
    }
  }

  /**
   * Notify SaveManager that the player has entered a new region.
   * Triggers an immediate save and updates the stored region id.
   */
  public notifyRegionChange(regionId: string): void {
    if (regionId === this.currentRegionId) return;
    this.currentRegionId = regionId;
    this.isDirty = true;
    this.save();
  }

  /**
   * Returns time since last save in seconds, or null if never saved.
   * Useful for displaying "Saved X seconds ago" in UI.
   */
  public getTimeSinceLastSave(): number | null {
    if (this.lastSavedAt === null) return null;
    return (Date.now() - this.lastSavedAt) / 1000;
  }

  /** Returns a copy of the current save data without writing it. */
  public getSaveData(): SaveData {
    return this.toSaveData();
  }

  // ---------------------------------------------------------------------------
  // Event subscriptions
  // ---------------------------------------------------------------------------

  /** Fires after every successful save(). Returns unsubscribe fn. */
  public onSaved(listener: SavedListener): () => void {
    this.savedListeners.add(listener);
    return () => this.savedListeners.delete(listener);
  }

  /** Fires after every successful load(). Returns unsubscribe fn. */
  public onLoaded(listener: LoadedListener): () => void {
    this.loadedListeners.add(listener);
    return () => this.loadedListeners.delete(listener);
  }

  /** Fires on any save/load error. Returns unsubscribe fn. */
  public onError(listener: SaveErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Serialization (pure: no I/O, swappable for cloud later)
  // ---------------------------------------------------------------------------

  /**
   * Collect current game state into a plain JSON-safe SaveData object.
   * This is the only place we touch the systems — making it easy to
   * swap the storage backend by only changing writePersisted/readPersisted.
   */
  public toSaveData(): SaveData {
    // Player position
    const pos = this.player.position;
    const playerState: SavedPlayerState = {
      x: roundTo(pos.x, 3),
      y: roundTo(pos.y, 3),
      z: roundTo(pos.z, 3),
      lastRegionId: this.currentRegionId
    };

    // Broadcast archive state from RadioSystem
    const radioSnapshot = this.radioSystem.getStateSnapshot();
    const broadcastState: SavedBroadcastState = {
      playedIds: radioSnapshot.playedBroadcasts,
      currentBroadcastId: radioSnapshot.currentBroadcastId
    };

    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      discoveries: this.discoverySystem.toSnapshot(),
      broadcasts: broadcastState,
      player: playerState
    };
  }

  /**
   * Rehydrate all systems from a SaveData object.
   * Called by load(). Same separation: only touches systems here.
   */
  public fromSaveData(data: SaveData): void {
    // Restore discoveries (does NOT emit onDiscoveryAdded — see DiscoverySystem)
    this.discoverySystem.loadFromSnapshot(data.discoveries);

    // Restore radio state
    this.radioSystem.loadStateSnapshot({
      playedBroadcasts: data.broadcasts.playedIds,
      currentBroadcastId: data.broadcasts.currentBroadcastId
    });

    // Restore player position
    this.player.position.set(
      data.player.x,
      data.player.y,
      data.player.z
    );

    // Restore region
    this.currentRegionId = data.player.lastRegionId;
  }

  // ---------------------------------------------------------------------------
  // Persistence layer (swap this for Supabase/cloud later)
  // ---------------------------------------------------------------------------

  private writePersisted(data: SaveData): void {
    const serialized = JSON.stringify(data);

    // Guard against localStorage quota errors (rare but real on mobile)
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (err) {
      // QuotaExceededError — attempt to free space by removing old backup
      localStorage.removeItem(`${STORAGE_KEY}_backup`);
      localStorage.setItem(STORAGE_KEY, serialized);
    }

    // Keep a rolling backup (previous save) for recovery
    // Doesn't throw if this fails — primary write already succeeded
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        localStorage.setItem(`${STORAGE_KEY}_backup`, existing);
      }
    } catch {
      // Backup write failed — not critical
    }
  }

  private readPersisted(): SaveData | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[SaveManager] Corrupt save data — attempting backup restore');
      return this.readBackup();
    }

    if (!isValidSaveData(parsed)) {
      console.warn('[SaveManager] Save version mismatch or invalid shape — discarding');
      return null;
    }

    return parsed;
  }

  private readBackup(): SaveData | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}_backup`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!isValidSaveData(parsed)) return null;
      console.info('[SaveManager] Restored from backup save');
      return parsed;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Event emitters
  // ---------------------------------------------------------------------------

  private emitSaved(data: SaveData): void {
    for (const l of this.savedListeners) l(data);
  }

  private emitLoaded(data: SaveData): void {
    for (const l of this.loadedListeners) l(data);
  }

  private emitError(err: Error): void {
    console.error('[SaveManager]', err);
    for (const l of this.errorListeners) l(err);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /** Stop autosave and remove all listeners. Call on game teardown. */
  public dispose(): void {
    this.stopAutosave();
    this.unsubscribeDiscovery?.();
    this.savedListeners.clear();
    this.loadedListeners.clear();
    this.errorListeners.clear();
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Runtime type guard. Checks shape + version before accepting save data. */
function isValidSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  if (v['version'] !== SAVE_VERSION) return false;
  if (typeof v['savedAt'] !== 'number') return false;
  if (!Array.isArray(v['discoveries'])) return false;
  if (!v['broadcasts'] || typeof v['broadcasts'] !== 'object') return false;
  if (!v['player'] || typeof v['player'] !== 'object') return false;

  const player = v['player'] as Record<string, unknown>;
  if (typeof player['x'] !== 'number') return false;
  if (typeof player['y'] !== 'number') return false;
  if (typeof player['z'] !== 'number') return false;
  if (typeof player['lastRegionId'] !== 'string') return false;

  return true;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Round a float to n decimal places — keeps save file small. */
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
