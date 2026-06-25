import { RadioSystem } from '../systems/RadioSystem';
import type { Discovery } from '../systems/DiscoverySystem';

/**
 * RadioNotificationPopup
 * ----------------------
 * A small transient notification that appears when a new broadcast is discovered.
 * Shows title and first ~100 characters of content.
 * Automatically fades after 5 seconds, or can be dismissed/clicked to expand.
 *
 * Listens to RadioSystem.onBroadcastDiscovered().
 * Does not own discovery state — reads from RadioSystem.
 *
 * UI Pattern (DRIFTER aesthetic):
 *   - Small panel (lower right or top right)
 *   - Dark background with teal border
 *   - Monospace font
 *   - Notification text in teal
 *   - Auto-dismiss or click to view full
 *
 * Typical usage:
 *   const popup = new RadioNotificationPopup(radioSystem, container);
 *   // Automatically listens and shows notifications
 *   // Call popup.dispose() on game shutdown
 */

export interface RadioNotificationPopupOptions {
  /** Container to append to. Usually the main game canvas parent. */
  container?: HTMLElement;
  /** Auto-dismiss time in ms. Set to 0 to disable auto-dismiss. Default: 5000. */
  autoDismissMs?: number;
  /** Callback when user clicks to expand/view. */
  onExpand?: (discovery: Discovery) => void;
  /** Callback when dismissed. */
  onDismiss?: () => void;
}

export class RadioNotificationPopup {
  private radioSystem: RadioSystem;
  private container: HTMLElement;
  private autoDismissMs: number;
  private onExpand: ((discovery: Discovery) => void) | undefined;
  private onDismiss: (() => void) | undefined;

  private rootElement: HTMLDivElement | null = null;
  private currentDiscovery: Discovery | null = null;
  private dismissTimeout: number | null = null;
  private unsubscribeRadio: () => void = () => {};

  constructor(radioSystem: RadioSystem, options: RadioNotificationPopupOptions = {}) {
    this.radioSystem = radioSystem;
    this.container = options.container || document.body;
    this.autoDismissMs = options.autoDismissMs ?? 5000;
    this.onExpand = options.onExpand;
    this.onDismiss = options.onDismiss;

    // Listen to radio system for new broadcasts
    this.unsubscribeRadio = radioSystem.onBroadcastDiscovered((discovery) => {
      this.showNotification(discovery);
    });
  }

  /**
   * Show a notification for a broadcast discovery.
   * If one is already showing, it gets replaced.
   */
  private showNotification(discovery: Discovery): void {
    this.currentDiscovery = discovery;

    // Clear existing timeout
    if (this.dismissTimeout !== null) {
      clearTimeout(this.dismissTimeout);
      this.dismissTimeout = null;
    }

    // Remove old popup if present
    if (this.rootElement && this.rootElement.parentElement) {
      this.rootElement.parentElement.removeChild(this.rootElement);
    }

    // Build new popup
    this.rootElement = this.buildNotificationDOM(discovery);
    this.container.appendChild(this.rootElement);

    // Auto-dismiss
    if (this.autoDismissMs > 0) {
      this.dismissTimeout = window.setTimeout(() => {
        this.dismiss();
      }, this.autoDismissMs);
    }
  }

  /**
   * Dismiss the notification.
   */
  public dismiss(): void {
    if (this.dismissTimeout !== null) {
      clearTimeout(this.dismissTimeout);
      this.dismissTimeout = null;
    }

    if (this.rootElement && this.rootElement.parentElement) {
      this.rootElement.parentElement.removeChild(this.rootElement);
      this.rootElement = null;
    }

    this.currentDiscovery = null;

    if (this.onDismiss) {
      this.onDismiss();
    }
  }

  /**
   * Build the notification DOM.
   */
  private buildNotificationDOM(discovery: Discovery): HTMLDivElement {
    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.bottom = '20px';
    root.style.right = '20px';
    root.style.width = 'min(320px, calc(100vw - 40px))';
    root.style.zIndex = '100';
    root.style.fontFamily = 'monospace';
    root.style.cursor = 'pointer';
    root.style.animation = 'fadeIn 0.3s ease-in-out';

    const panel = document.createElement('div');
    panel.style.background = 'rgba(6, 12, 12, 0.95)';
    panel.style.border = '1px solid rgba(159, 255, 224, 0.5)';
    panel.style.borderRadius = '2px';
    panel.style.padding = '12px 16px';
    panel.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.8)';
    root.appendChild(panel);

    // Header: "Broadcast incoming..." or similar
    const header = document.createElement('div');
    header.textContent = 'BROADCAST INCOMING...';
    header.style.color = '#50ffc8';
    header.style.fontSize = '11px';
    header.style.letterSpacing = '0.1em';
    header.style.textTransform = 'uppercase';
    header.style.marginBottom = '8px';
    header.style.textShadow = '0 0 8px rgba(80, 255, 200, 0.4)';
    panel.appendChild(header);

    // Title
    const title = document.createElement('div');
    title.textContent = discovery.title;
    title.style.color = '#bfffe9';
    title.style.fontSize = '13px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    panel.appendChild(title);

    // Content snippet (first ~100 chars)
    const snippet = document.createElement('div');
    const preview = discovery.content.substring(0, 100);
    snippet.textContent =
      preview.length < discovery.content.length ? preview + '...' : preview;
    snippet.style.color = 'rgba(191, 255, 233, 0.7)';
    snippet.style.fontSize = '11px';
    snippet.style.lineHeight = '1.4';
    snippet.style.marginBottom = '10px';
    panel.appendChild(snippet);

    // Footer: hint text
    const footer = document.createElement('div');
    footer.textContent = '[Click to view] [X to dismiss]';
    footer.style.color = 'rgba(159, 255, 224, 0.4)';
    footer.style.fontSize = '9px';
    footer.style.letterSpacing = '0.05em';
    footer.style.textAlign = 'right';
    panel.appendChild(footer);

    // Click to expand
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onExpand && this.currentDiscovery) {
        this.radioSystem.markBroadcastAsPlayed(this.currentDiscovery.id);
        this.onExpand(this.currentDiscovery);
      }
      this.dismiss();
    });

    // X button (dismiss)
    const dismissBtn = document.createElement('div');
    dismissBtn.textContent = '×';
    dismissBtn.style.position = 'absolute';
    dismissBtn.style.top = '8px';
    dismissBtn.style.right = '10px';
    dismissBtn.style.color = 'rgba(159, 255, 224, 0.6)';
    dismissBtn.style.fontSize = '18px';
    dismissBtn.style.cursor = 'pointer';
    dismissBtn.style.userSelect = 'none';
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
    });
    panel.appendChild(dismissBtn);

    // Add fade-out animation
    this.addFadeOutStyle();

    return root;
  }

  /**
   * Add CSS animations (fadeIn, fadeOut).
   */
  private addFadeOutStyle(): void {
    if (document.getElementById('radio-popup-styles')) {
      return; // Already added
    }

    const style = document.createElement('style');
    style.id = 'radio-popup-styles';
    style.textContent = `
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes fadeOut {
        from {
          opacity: 1;
          transform: translateY(0);
        }
        to {
          opacity: 0;
          transform: translateY(10px);
        }
      }

      .radio-popup-fadeout {
        animation: fadeOut 0.3s ease-in-out !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Cleanup: unsubscribe from radio system.
   */
  public dispose(): void {
    if (this.dismissTimeout !== null) {
      clearTimeout(this.dismissTimeout);
      this.dismissTimeout = null;
    }

    if (this.rootElement && this.rootElement.parentElement) {
      this.rootElement.parentElement.removeChild(this.rootElement);
    }

    this.unsubscribeRadio();
  }
}
