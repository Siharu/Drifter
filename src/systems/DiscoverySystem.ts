/**
 * DiscoverySystem
 * ---------------
 * A Discovery is the primary unit of progression in DRIFTER: a piece of
 * world knowledge the player has found — a broadcast, note, observation,
 * testimony, photo, or anomaly. This system is the in-memory source of
 * truth for which discoveries the player currently holds.
 *
 * Deliberately pure data + logic — no Three.js, no DOM, no UI. Anything
 * visual (a Logbook UI, a "discovery found" toast) listens to this
 * system's events rather than this system reaching out to draw anything.
 *
 * No localStorage yet — memory only, per requirements. `getAll()` /
 * `loadFromSnapshot()` exist specifically so a future save system can
 * persist and rehydrate state without DiscoverySystem needing to know
 * how or where that happens (localStorage, Supabase, a save file, etc).
 */

/** The six discovery categories that exist in Another Sky. */
export type DiscoveryType =
  | 'broadcast'
  | 'note'
  | 'observation'
  | 'testimony'
  | 'photo'
  | 'anomaly';

/**
 * A single discovery record. Plain data — safe to JSON.stringify directly,
 * which matters for future save-system compatibility.
 */
export interface Discovery {
  id: string;
  title: string;
  type: DiscoveryType;
  content: string;
  /** Unix ms timestamp of when this discovery was registered. */
  timestamp: number;
  regionId: string;
}

/** Fields required to register a new discovery. timestamp is assigned automatically. */
export type DiscoveryInput = Omit<Discovery, 'timestamp'>;

export type DiscoveryListener = (discovery: Discovery) => void;

export class DiscoverySystem {
  private discoveries = new Map<string, Discovery>();
  private listeners = new Set<DiscoveryListener>();

  /**
   * Registers a new discovery. No-op (returns false) if a discovery with
   * this id already exists — this is the duplicate-prevention contract.
   * Existing discoveries are never overwritten by a later register() call;
   * use a different id if the content genuinely changed.
   *
   * Emits the "discovery added" event only on a true first-time add.
   */
  public register(input: DiscoveryInput): boolean {
    if (this.discoveries.has(input.id)) {
      return false;
    }

    const discovery: Discovery = {
      ...input,
      timestamp: Date.now()
    };

    this.discoveries.set(discovery.id, discovery);
    this.emit(discovery);
    return true;
  }

  /** True if a discovery with this id has already been registered. */
  public has(id: string): boolean {
    return this.discoveries.has(id);
  }

  /** Looks up a single discovery by id. Returns undefined if not found. */
  public getById(id: string): Discovery | undefined {
    return this.discoveries.get(id);
  }

  /** Returns all discoveries, oldest first by registration order. */
  public getAll(): Discovery[] {
    return Array.from(this.discoveries.values());
  }

  /** Returns all discoveries of a given type, oldest first. */
  public getByType(type: DiscoveryType): Discovery[] {
    return this.getAll().filter((discovery) => discovery.type === type);
  }

  /** Returns all discoveries belonging to a given region, oldest first. */
  public getByRegion(regionId: string): Discovery[] {
    return this.getAll().filter((discovery) => discovery.regionId === regionId);
  }

  public count(): number {
    return this.discoveries.size;
  }

  /**
   * Subscribes to newly-registered discoveries. Returns an unsubscribe
   * function. Listeners are NOT called for discoveries loaded via
   * loadFromSnapshot() — that event means "discovered this session,"
   * not "exists in the player's collection."
   */
  public onDiscoveryAdded(listener: DiscoveryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(discovery: Discovery): void {
    for (const listener of this.listeners) {
      listener(discovery);
    }
  }

  /**
   * Replaces current state with a previously-saved set of discoveries.
   * Intended for a future save system to call on game load. Does NOT
   * emit onDiscoveryAdded — these are not new discoveries, they're
   * restored ones. Existing in-memory discoveries are cleared first.
   */
  public loadFromSnapshot(discoveries: Discovery[]): void {
    this.discoveries.clear();
    for (const discovery of discoveries) {
      this.discoveries.set(discovery.id, discovery);
    }
  }

  /**
   * Returns a plain serializable snapshot of current state. Intended for
   * a future save system to persist (JSON.stringify-safe as-is).
   */
  public toSnapshot(): Discovery[] {
    return this.getAll();
  }

  /** Clears all discoveries without emitting events. Mainly useful for tests. */
  public clear(): void {
    this.discoveries.clear();
  }
}
