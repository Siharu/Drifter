import { DiscoverySystem, type Discovery } from '../systems/DiscoverySystem';
import { RadioSystem } from '../systems/RadioSystem';

/**
 * BroadcastArchive
 * ----------------
 * A searchable, filterable display of all discovered broadcasts.
 * Queries DiscoverySystem directly (source of truth).
 * Listens to DiscoverySystem for new broadcasts to update in real-time.
 *
 * Features:
 * - List all broadcasts in discovery order
 * - Filter by region
 * - Show "new" badge for unplayed broadcasts
 * - Click to view full broadcast
 * - Integrate with RadioSystem (mark as played)
 *
 * Typical usage:
 *   const archive = new BroadcastArchive(discoverySystem, radioSystem, container);
 *   // Automatically listens for new discoveries and updates
 *   archive.open();
 *   archive.close();
 */

export interface BroadcastArchiveOptions {
  /** Container to append to. Default: document.body */
  container?: HTMLElement;
  /** Callback when user clicks to view a broadcast. */
  onBroadcastSelected?: (discovery: Discovery) => void;
}

export class BroadcastArchive {
  private discoverySystem: DiscoverySystem;
  private radioSystem: RadioSystem;
  private container: HTMLElement;
  private onBroadcastSelected: ((discovery: Discovery) => void) | undefined;

  private rootElement: HTMLDivElement | null = null;
  private bodyElement: HTMLDivElement | null = null;
  private unsubscribeDiscovery: () => void = () => {};

  private isOpen: boolean = false;

  constructor(
    discoverySystem: DiscoverySystem,
    radioSystem: RadioSystem,
    options: BroadcastArchiveOptions = {}
  ) {
    this.discoverySystem = discoverySystem;
    this.radioSystem = radioSystem;
    this.container = options.container || document.body;
    this.onBroadcastSelected = options.onBroadcastSelected;

    // Listen to DiscoverySystem for new discoveries
    this.unsubscribeDiscovery = discoverySystem.onDiscoveryAdded((discovery) => {
      // Only update if it's a broadcast and we're open
      if (discovery.type === 'broadcast' && this.isOpen) {
        this.render();
      }
    });
  }

  /**
   * Open the archive.
   */
  public open(): void {
    if (this.isOpen) return;

    this.isOpen = true;

    if (!this.rootElement) {
      this.rootElement = this.buildArchiveDOM();
      this.container.appendChild(this.rootElement);
    } else {
      this.rootElement.style.display = 'flex';
    }

    this.render();
  }

  /**
   * Close the archive.
   */
  public close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;

    if (this.rootElement) {
      this.rootElement.style.display = 'none';
    }
  }

  /**
   * Toggle open/close.
   */
  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Re-render the archive content.
   */
  private render(): void {
    if (!this.bodyElement) return;

    this.bodyElement.innerHTML = '';

    const broadcasts = this.discoverySystem.getByType('broadcast');

    if (broadcasts.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No broadcasts received yet.';
      empty.style.color = 'rgba(191, 255, 233, 0.35)';
      empty.style.fontSize = '12px';
      empty.style.fontStyle = 'italic';
      empty.style.textAlign = 'center';
      empty.style.padding = '20px';
      this.bodyElement.appendChild(empty);
      return;
    }

    // Group by region
    const byRegion = new Map<string, Discovery[]>();
    for (const broadcast of broadcasts) {
      const region = broadcast.regionId;
      if (!byRegion.has(region)) {
        byRegion.set(region, []);
      }
      byRegion.get(region)!.push(broadcast);
    }

    // Render each region
    for (const [regionId, regionBroadcasts] of byRegion) {
      this.bodyElement.appendChild(this.buildRegionSection(regionId, regionBroadcasts));
    }
  }

  /**
   * Build a region section with its broadcasts.
   */
  private buildRegionSection(regionId: string, broadcasts: Discovery[]): HTMLDivElement {
    const section = document.createElement('div');
    section.style.marginBottom = '16px';

    // Region header
    const header = document.createElement('div');
    header.textContent = `${regionId} (${broadcasts.length})`;
    header.style.color = '#9fffe0';
    header.style.fontSize = '11px';
    header.style.letterSpacing = '0.12em';
    header.style.textTransform = 'uppercase';
    header.style.borderBottom = '1px solid rgba(159, 255, 224, 0.25)';
    header.style.paddingBottom = '4px';
    header.style.marginBottom = '8px';
    section.appendChild(header);

    // Broadcasts in this region
    for (const broadcast of broadcasts) {
      section.appendChild(this.buildBroadcastEntry(broadcast));
    }

    return section;
  }

  /**
   * Build a single broadcast entry.
   */
  private buildBroadcastEntry(discovery: Discovery): HTMLDivElement {
    const entry = document.createElement('div');
    entry.style.marginBottom = '10px';
    entry.style.paddingLeft = '8px';
    entry.style.borderLeft = '2px solid rgba(159, 255, 224, 0.3)';
    entry.style.cursor = 'pointer';
    entry.style.transition = 'all 0.2s ease';

    // Hover effect
    entry.addEventListener('mouseenter', () => {
      entry.style.borderLeftColor = 'rgba(159, 255, 224, 0.8)';
      entry.style.background = 'rgba(159, 255, 224, 0.05)';
    });

    entry.addEventListener('mouseleave', () => {
      entry.style.borderLeftColor = 'rgba(159, 255, 224, 0.3)';
      entry.style.background = 'transparent';
    });

    // Click handler
    entry.addEventListener('click', () => {
      this.radioSystem.markBroadcastAsPlayed(discovery.id);
      if (this.onBroadcastSelected) {
        this.onBroadcastSelected(discovery);
      }
    });

    // Title + NEW badge
    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap = '8px';
    titleRow.style.marginBottom = '4px';

    const title = document.createElement('div');
    title.textContent = discovery.title;
    title.style.color = '#bfffe9';
    title.style.fontSize = '12px';
    title.style.fontWeight = 'bold';
    titleRow.appendChild(title);

    // NEW badge for unplayed
    if (!this.radioSystem.isBroadcastPlayed(discovery.id)) {
      const badge = document.createElement('div');
      badge.textContent = '[NEW]';
      badge.style.color = '#ff6b6b';
      badge.style.fontSize = '9px';
      badge.style.letterSpacing = '0.05em';
      badge.style.fontWeight = 'bold';
      titleRow.appendChild(badge);
    }

    entry.appendChild(titleRow);

    // Meta (timestamp + region)
    const meta = document.createElement('div');
    meta.textContent = formatTimestamp(discovery.timestamp);
    meta.style.color = 'rgba(191, 255, 233, 0.45)';
    meta.style.fontSize = '10px';
    meta.style.marginBottom = '3px';
    entry.appendChild(meta);

    // Content snippet
    const snippet = document.createElement('div');
    const preview = discovery.content.substring(0, 80);
    snippet.textContent =
      preview.length < discovery.content.length ? preview + '...' : preview;
    snippet.style.color = 'rgba(191, 255, 233, 0.7)';
    snippet.style.fontSize = '11px';
    snippet.style.lineHeight = '1.3';
    entry.appendChild(snippet);

    return entry;
  }

  /**
   * Build the archive DOM (modal/panel).
   */
  private buildArchiveDOM(): HTMLDivElement {
    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.display = 'none';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'center';
    root.style.background = 'rgba(2, 4, 5, 0.7)';
    root.style.zIndex = '30';
    root.style.fontFamily = 'monospace';

    const panel = document.createElement('div');
    panel.style.width = 'min(640px, 90vw)';
    panel.style.maxHeight = '80vh';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.background = 'rgba(6, 12, 12, 0.92)';
    panel.style.border = '1px solid rgba(159, 255, 224, 0.35)';
    panel.style.borderRadius = '4px';
    panel.style.boxShadow = '0 0 40px rgba(0, 0, 0, 0.8)';
    root.appendChild(panel);

    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '14px 18px';
    header.style.borderBottom = '1px solid rgba(159, 255, 224, 0.25)';
    panel.appendChild(header);

    const title = document.createElement('div');
    title.textContent = 'BROADCAST ARCHIVE';
    title.style.color = '#9fffe0';
    title.style.fontSize = '14px';
    title.style.letterSpacing = '0.15em';
    title.style.textShadow = '0 0 8px rgba(80, 255, 200, 0.6)';
    header.appendChild(title);

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '×';
    closeBtn.style.color = 'rgba(159, 255, 224, 0.6)';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.userSelect = 'none';
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);

    // Body (scrollable)
    const body = document.createElement('div');
    body.style.padding = '16px 18px';
    body.style.overflowY = 'auto';
    body.style.flex = '1';
    panel.appendChild(body);
    this.bodyElement = body;

    // Footer
    const footer = document.createElement('div');
    footer.textContent = '[Click broadcast to view] [X to close]';
    footer.style.padding = '10px 18px';
    footer.style.borderTop = '1px solid rgba(159, 255, 224, 0.25)';
    footer.style.color = 'rgba(191, 255, 233, 0.45)';
    footer.style.fontSize = '10px';
    footer.style.letterSpacing = '0.08em';
    footer.style.textAlign = 'center';
    panel.appendChild(footer);

    return root;
  }

  /**
   * Cleanup: unsubscribe from DiscoverySystem.
   */
  public dispose(): void {
    this.unsubscribeDiscovery();

    if (this.rootElement && this.rootElement.parentElement) {
      this.rootElement.parentElement.removeChild(this.rootElement);
    }
  }
}

function formatTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
