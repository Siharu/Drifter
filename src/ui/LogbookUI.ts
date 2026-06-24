import { LogbookSystem, type LogbookCategoryGroup } from '../systems/LogbookSystem';
import type { Discovery } from '../systems/DiscoverySystem';

/**
 * LogbookUI
 * ---------
 * Pure DOM rendering for the Logbook panel. Reads from LogbookSystem and
 * re-renders when told to — it does not listen for the L key itself
 * (LogbookSystem owns that), and it does not know about DiscoverySystem
 * directly (LogbookSystem is the only thing this class talks to).
 *
 * Minimal DRIFTER aesthetic: dark panel, thin teal border, monospace
 * type, no icons/imagery — consistent with the interaction prompt's
 * styling already established elsewhere in the project. No framework:
 * plain DOM nodes with inline styles, built and torn down by this class.
 */
export class LogbookUI {
  private logbookSystem: LogbookSystem;
  private container: HTMLElement;

  private rootElement: HTMLDivElement;
  private bodyElement: HTMLDivElement;
  private countElement: HTMLSpanElement;

  private unsubscribeOpenState: () => void;
  private unsubscribeContent: () => void;

  constructor(logbookSystem: LogbookSystem, container: HTMLElement) {
    this.logbookSystem = logbookSystem;
    this.container = container;

    const built = this.buildDom();
    this.rootElement = built.root;
    this.bodyElement = built.body;
    this.countElement = built.count;

    this.container.appendChild(this.rootElement);

    this.unsubscribeOpenState = this.logbookSystem.onOpenStateChanged((isOpen) => {
      this.applyOpenState(isOpen);
    });

    this.unsubscribeContent = this.logbookSystem.onContentChanged(() => {
      // Only re-render content immediately if visible; if closed, the
      // next open() will render fresh content via applyOpenState anyway.
      if (this.logbookSystem.getIsOpen()) {
        this.renderContent();
      }
    });

    // Initial state: hidden, matching LogbookSystem's default closed state.
    this.applyOpenState(this.logbookSystem.getIsOpen());
  }

  private applyOpenState(isOpen: boolean): void {
    this.rootElement.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
      this.renderContent();
    }
  }

  private renderContent(): void {
    this.countElement.textContent = String(this.logbookSystem.getTotalCount());

    this.bodyElement.innerHTML = '';

    const groups = this.logbookSystem.getGroupedDiscoveries();
    for (const group of groups) {
      this.bodyElement.appendChild(this.buildCategorySection(group));
    }
  }

  private buildCategorySection(group: LogbookCategoryGroup): HTMLDivElement {
    const section = document.createElement('div');
    section.style.marginBottom = '18px';

    const header = document.createElement('div');
    header.textContent = `${group.label} (${group.discoveries.length})`;
    header.style.color = '#9fffe0';
    header.style.fontSize = '12px';
    header.style.letterSpacing = '0.12em';
    header.style.textTransform = 'uppercase';
    header.style.borderBottom = '1px solid rgba(159, 255, 224, 0.25)';
    header.style.paddingBottom = '4px';
    header.style.marginBottom = '8px';
    section.appendChild(header);

    if (group.discoveries.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'Nothing recorded yet.';
      empty.style.color = 'rgba(191, 255, 233, 0.35)';
      empty.style.fontSize = '12px';
      empty.style.fontStyle = 'italic';
      section.appendChild(empty);
      return section;
    }

    for (const discovery of group.discoveries) {
      section.appendChild(this.buildDiscoveryEntry(discovery));
    }

    return section;
  }

  private buildDiscoveryEntry(discovery: Discovery): HTMLDivElement {
    const entry = document.createElement('div');
    entry.style.marginBottom = '10px';
    entry.style.paddingLeft = '8px';
    entry.style.borderLeft = '2px solid rgba(159, 255, 224, 0.3)';

    const title = document.createElement('div');
    title.textContent = discovery.title;
    title.style.color = '#bfffe9';
    title.style.fontSize = '13px';
    title.style.fontWeight = 'bold';
    entry.appendChild(title);

    const meta = document.createElement('div');
    meta.textContent = `${formatTimestamp(discovery.timestamp)} — ${discovery.regionId}`;
    meta.style.color = 'rgba(191, 255, 233, 0.45)';
    meta.style.fontSize = '10px';
    meta.style.marginBottom = '3px';
    entry.appendChild(meta);

    const content = document.createElement('div');
    content.textContent = discovery.content;
    content.style.color = 'rgba(191, 255, 233, 0.8)';
    content.style.fontSize = '12px';
    content.style.lineHeight = '1.4';
    entry.appendChild(content);

    return entry;
  }

  private buildDom(): {
    root: HTMLDivElement;
    panel: HTMLDivElement;
    body: HTMLDivElement;
    count: HTMLSpanElement;
  } {
    const root = document.createElement('div');
    root.style.position = 'absolute';
    root.style.inset = '0';
    root.style.display = 'none';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'center';
    root.style.background = 'rgba(2, 4, 5, 0.7)';
    root.style.zIndex = '20';
    root.style.fontFamily = 'monospace';

    const panel = document.createElement('div');
    panel.style.width = 'min(560px, 86vw)';
    panel.style.maxHeight = '74vh';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.background = 'rgba(6, 12, 12, 0.92)';
    panel.style.border = '1px solid rgba(159, 255, 224, 0.35)';
    panel.style.borderRadius = '4px';
    panel.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.6)';
    root.appendChild(panel);

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '14px 18px';
    header.style.borderBottom = '1px solid rgba(159, 255, 224, 0.25)';
    panel.appendChild(header);

    const titleEl = document.createElement('div');
    titleEl.textContent = 'LOGBOOK';
    titleEl.style.color = '#9fffe0';
    titleEl.style.fontSize = '15px';
    titleEl.style.letterSpacing = '0.15em';
    titleEl.style.textShadow = '0 0 8px rgba(80, 255, 200, 0.6)';
    header.appendChild(titleEl);

    const countWrap = document.createElement('div');
    countWrap.style.color = 'rgba(191, 255, 233, 0.6)';
    countWrap.style.fontSize = '11px';
    countWrap.style.letterSpacing = '0.05em';

    const countLabel = document.createTextNode('RECORDS: ');
    countWrap.appendChild(countLabel);

    const count = document.createElement('span');
    count.textContent = '0';
    countWrap.appendChild(count);
    header.appendChild(countWrap);

    const body = document.createElement('div');
    body.style.padding = '16px 18px';
    body.style.overflowY = 'auto';
    body.style.flex = '1';
    panel.appendChild(body);

    const footer = document.createElement('div');
    footer.textContent = '[L] Close';
    footer.style.padding = '10px 18px';
    footer.style.borderTop = '1px solid rgba(159, 255, 224, 0.25)';
    footer.style.color = 'rgba(191, 255, 233, 0.45)';
    footer.style.fontSize = '11px';
    footer.style.letterSpacing = '0.08em';
    footer.style.textAlign = 'center';
    panel.appendChild(footer);

    return { root, panel, body, count };
  }

  /** Removes DOM elements and unsubscribes from LogbookSystem. */
  public dispose(): void {
    this.unsubscribeOpenState();
    this.unsubscribeContent();
    if (this.rootElement.parentElement === this.container) {
      this.container.removeChild(this.rootElement);
    }
  }
}

function formatTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
