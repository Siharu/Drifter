import { DiscoverySystem, type Discovery } from './DiscoverySystem';

/**
 * RadioSystem
 * -----------
 * Listens to DiscoverySystem for new discoveries of type 'broadcast'.
 * Does NOT own discovery state — DiscoverySystem is the source of truth.
 * 
 * Manages radio-specific state:
 * - Which broadcasts have been "played" (read/viewed)
 * - Current/last broadcast being displayed
 * - Emits events for UI systems to react to
 * 
 * Architecture:
 *   Discovery registered → DiscoverySystem event
 *   ↓
 *   RadioSystem receives event → checks if broadcast
 *   ↓
 *   RadioSystem emits broadcastDiscovered event
 *   ↓
 *   RadioNotificationPopup & BroadcastArchive listen and react
 * 
 * Typical usage:
 *   const radio = new RadioSystem(discoverySystem);
 *   radio.onBroadcastDiscovered((discovery) => {
 *     notificationPopup.show(discovery);
 *   });
 */

export interface BroadcastState {
  /** The discovery object (source of truth from DiscoverySystem). */
  discovery: Discovery;
  /** Whether this broadcast has been "played" (viewed in full). */
  isPlayed: boolean;
  /** When this broadcast was first discovered. */
  discoveredAt: number;
}

export type BroadcastDiscoveredListener = (discovery: Discovery) => void;
export type BroadcastPlayedListener = (discovery: Discovery) => void;

export class RadioSystem {
  private discoverySystem: DiscoverySystem;

  /** Tracks which broadcasts have been read (keyed by discovery.id). */
  private playedBroadcasts = new Set<string>();

  /** Current/last broadcast being displayed. */
  private currentBroadcast: Discovery | null = null;

  /** Listeners for new broadcast discoveries. */
  private broadcastDiscoveredListeners = new Set<BroadcastDiscoveredListener>();

  /** Listeners for when a broadcast is marked as played. */
  private broadcastPlayedListeners = new Set<BroadcastPlayedListener>();

  /** Unsubscribe function from DiscoverySystem. */
  private unsubscribeDiscovery: () => void = () => {};

  constructor(discoverySystem: DiscoverySystem) {
    this.discoverySystem = discoverySystem;

    // Subscribe to all new discoveries
    this.unsubscribeDiscovery = discoverySystem.onDiscoveryAdded((discovery) => {
      // Only react to broadcasts; let other types flow through
      if (discovery.type === 'broadcast') {
        this.onBroadcastAdded(discovery);
      }
    });
  }

  // --- Broadcast Discovery Events ---

  /**
   * Listen for newly discovered broadcasts.
   * Returns unsubscribe function.
   */
  public onBroadcastDiscovered(listener: BroadcastDiscoveredListener): () => void {
    this.broadcastDiscoveredListeners.add(listener);
    return () => this.broadcastDiscoveredListeners.delete(listener);
  }

  /**
   * Listen for broadcasts marked as "played" (viewed in full).
   * Returns unsubscribe function.
   */
  public onBroadcastPlayed(listener: BroadcastPlayedListener): () => void {
    this.broadcastPlayedListeners.add(listener);
    return () => this.broadcastPlayedListeners.delete(listener);
  }

  // --- Broadcast State Management ---

  /**
   * Set current broadcast being displayed.
   * Usually called by RadioNotificationPopup or BroadcastArchive.
   */
  public setCurrentBroadcast(discovery: Discovery): void {
    if (discovery.type !== 'broadcast') {
      console.warn('RadioSystem: attempted to set non-broadcast as current');
      return;
    }
    this.currentBroadcast = discovery;
  }

  /**
   * Get current broadcast, if any.
   */
  public getCurrentBroadcast(): Discovery | null {
    return this.currentBroadcast;
  }

  /**
   * Mark a broadcast as "played" (viewed).
   * Typically called when user opens broadcast in popup or archive.
   */
  public markBroadcastAsPlayed(discoveryId: string): void {
    if (this.playedBroadcasts.has(discoveryId)) {
      return; // Already played
    }

    const discovery = this.discoverySystem.getById(discoveryId);
    if (!discovery || discovery.type !== 'broadcast') {
      return;
    }

    this.playedBroadcasts.add(discoveryId);
    this.emitBroadcastPlayed(discovery);
  }

  /**
   * Check if a broadcast has been played.
   */
  public isBroadcastPlayed(discoveryId: string): boolean {
    return this.playedBroadcasts.has(discoveryId);
  }

  /**
   * Get all broadcasts in the order discovered (from DiscoverySystem).
   * Source of truth lives in DiscoverySystem; this is just a convenience wrapper.
   */
  public getAllBroadcasts(): Discovery[] {
    return this.discoverySystem.getByType('broadcast');
  }

  /**
   * Get broadcasts by region.
   */
  public getBroadcastsByRegion(regionId: string): Discovery[] {
    return this.discoverySystem
      .getByRegion(regionId)
      .filter((d) => d.type === 'broadcast');
  }

  /**
   * Get count of discovered broadcasts.
   */
  public getBroadcastCount(): number {
    return this.getAllBroadcasts().length;
  }

  /**
   * Get count of unplayed (newly discovered) broadcasts.
   */
  public getUnplayedBroadcastCount(): number {
    return this.getAllBroadcasts().filter((b) => !this.isBroadcastPlayed(b.id))
      .length;
  }

  // --- Snapshots (for future save system) ---

  /**
   * Returns radio state snapshot (which broadcasts are played).
   * Broadcasts themselves are stored in DiscoverySystem.
   */
  public getStateSnapshot(): {
    playedBroadcasts: string[];
    currentBroadcastId: string | null;
  } {
    return {
      playedBroadcasts: Array.from(this.playedBroadcasts),
      currentBroadcastId: this.currentBroadcast?.id ?? null
    };
  }

  /**
   * Restore radio state from snapshot.
   * Typically called by save system after loading discoveries.
   */
  public loadStateSnapshot(snapshot: {
    playedBroadcasts: string[];
    currentBroadcastId: string | null;
  }): void {
    this.playedBroadcasts.clear();
    for (const id of snapshot.playedBroadcasts) {
      this.playedBroadcasts.add(id);
    }

    if (snapshot.currentBroadcastId) {
      const discovery = this.discoverySystem.getById(snapshot.currentBroadcastId);
      if (discovery?.type === 'broadcast') {
        this.currentBroadcast = discovery;
      }
    }
  }

  // --- Cleanup ---

  /**
   * Unsubscribe from DiscoverySystem. Call when tearing down the game.
   */
  public dispose(): void {
    this.unsubscribeDiscovery();
  }

  // --- Private ---

  private onBroadcastAdded(discovery: Discovery): void {
    // Set as current automatically (will be shown in popup)
    this.setCurrentBroadcast(discovery);

    // Emit event for UI systems to listen to
    this.emitBroadcastDiscovered(discovery);
  }

  private emitBroadcastDiscovered(discovery: Discovery): void {
    for (const listener of this.broadcastDiscoveredListeners) {
      listener(discovery);
    }
  }

  private emitBroadcastPlayed(discovery: Discovery): void {
    for (const listener of this.broadcastPlayedListeners) {
      listener(discovery);
    }
  }
}
