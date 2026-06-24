import { DiscoverySystem, type Discovery, type DiscoveryType } from './DiscoverySystem';

/**
 * LogbookSystem
 * -------------
 * The Logbook is the player's record of everything they've discovered.
 * This class owns open/closed state and category-grouped access to
 * DiscoverySystem's data — it does NOT render anything. LogbookUI reads
 * from this class and reacts to its events.
 *
 * No inventory, no quests, no XP, no rewards: the logbook is not a
 * progress bar toward something else, it IS the progression. This
 * system's only job is to make discoveries legible, organized by
 * category, and to track whether the player currently has the logbook
 * open.
 *
 * Input handling here is intentionally narrow: only the L key, only for
 * toggling open/closed. Movement (WASD) and interaction (E) are owned by
 * their own systems — this does not become a general input hub.
 */

/** Stable display order for the six discovery categories. */
export const LOGBOOK_CATEGORY_ORDER: DiscoveryType[] = [
  'broadcast',
  'note',
  'observation',
  'testimony',
  'photo',
  'anomaly'
];

/** Human-readable category labels, plural, matching the spec's naming. */
export const LOGBOOK_CATEGORY_LABELS: Record<DiscoveryType, string> = {
  broadcast: 'Broadcasts',
  note: 'Notes',
  observation: 'Observations',
  testimony: 'Testimonies',
  photo: 'Photos',
  anomaly: 'Anomalies'
};

export type LogbookCategoryGroup = {
  type: DiscoveryType;
  label: string;
  discoveries: Discovery[];
};

export type LogbookOpenStateListener = (isOpen: boolean) => void;
export type LogbookContentListener = () => void;

export class LogbookSystem {
  private discoverySystem: DiscoverySystem;

  private isOpen = false;

  private openStateListeners = new Set<LogbookOpenStateListener>();
  private contentListeners = new Set<LogbookContentListener>();

  private unsubscribeFromDiscoveries: () => void;

  constructor(discoverySystem: DiscoverySystem) {
    this.discoverySystem = discoverySystem;

    // Re-render trigger: any newly added discovery means logbook content
    // is stale, regardless of whether it's currently open.
    this.unsubscribeFromDiscoveries = this.discoverySystem.onDiscoveryAdded(() => {
      this.emitContentChanged();
    });

    window.addEventListener('keydown', this.handleKeyDown);
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.emitOpenStateChanged();
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.emitOpenStateChanged();
  }

  public toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  /** Returns all discoveries grouped by category, in fixed category order. */
  public getGroupedDiscoveries(): LogbookCategoryGroup[] {
    return LOGBOOK_CATEGORY_ORDER.map((type) => ({
      type,
      label: LOGBOOK_CATEGORY_LABELS[type],
      discoveries: this.discoverySystem.getByType(type)
    }));
  }

  public getTotalCount(): number {
    return this.discoverySystem.count();
  }

  /** Subscribes to open/close changes. Returns an unsubscribe function. */
  public onOpenStateChanged(listener: LogbookOpenStateListener): () => void {
    this.openStateListeners.add(listener);
    return () => this.openStateListeners.delete(listener);
  }

  /**
   * Subscribes to content changes (new discoveries added). Fires
   * regardless of open/closed state — UI decides whether to actually
   * re-render based on getIsOpen().
   */
  public onContentChanged(listener: LogbookContentListener): () => void {
    this.contentListeners.add(listener);
    return () => this.contentListeners.delete(listener);
  }

  private emitOpenStateChanged(): void {
    for (const listener of this.openStateListeners) {
      listener(this.isOpen);
    }
  }

  private emitContentChanged(): void {
    for (const listener of this.contentListeners) {
      listener();
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyL') {
      this.toggle();
    }
  };

  /** Removes listeners. Call on teardown / hot-reload. */
  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.unsubscribeFromDiscoveries();
    this.openStateListeners.clear();
    this.contentListeners.clear();
  }
}
