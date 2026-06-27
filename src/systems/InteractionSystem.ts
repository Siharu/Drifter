import * as THREE from 'three';
import { Interactable } from '../world/Interactable';
import type { Updatable } from '../core/Game';

/**
 * InteractionSystem
 * ------------------
 * Tracks a registry of Interactables, finds the nearest one in range of
 * a tracked subject (the local player) each frame, and fires its
 * callback when E is pressed.
 *
 * Design notes:
 * - Only one active interaction target at a time: the nearest enabled
 *   Interactable whose radius contains the subject. Ties are broken by
 *   registration order (first found wins) — irrelevant in practice since
 *   exact-equal distances are rare, but deterministic rather than
 *   undefined.
 * - Delta-time friendly: `update(deltaTime)` matches the Updatable
 *   contract used everywhere else in the game loop, even though this
 *   system's own logic (distance checks) doesn't need deltaTime today.
 *   Kept in the signature so future per-frame behavior (e.g. a hold-to-
 *   interact charge timer) can be added without changing the call site.
 * - Future multiplayer-safe: this system only ever reasons about ONE
 *   subject position (typically the local player). It has no concept of
 *   "other players" and never inspects remote state. A networked
 *   interaction (e.g. notifying other clients that a shared terminal was
 *   used) is the responsibility of the Interactable's own `onInteract`
 *   callback, not this system — InteractionSystem stays local-only and
 *   dumb about networking by design.
 * - No framework: detection is plain distance math; the prompt is a
 *   single DOM element with inline styles, created/destroyed by this
 *   class. No React, no CSS files.
 *
 * Does NOT build dialogue, inventory, or quests — `onInteract` callbacks
 * are the seam where those systems will eventually hook in.
 */
export class InteractionSystem implements Updatable {
  private interactables: Interactable[] = [];

  /** Position this system measures distance from — typically the local player. */
  private subjectPosition: THREE.Vector3;

  /** id passed into InteractionContext when triggering a callback. */
  private subjectPlayerId: string;

  private activeTarget: Interactable | null = null;

  private promptElement: HTMLDivElement;
  private container: HTMLElement;

  /** Tracks E key edge-detection so holding the key doesn't repeat-fire. */
  private interactKeyWasDown = false;

  constructor(options: {
    container: HTMLElement;
    subjectPosition: THREE.Vector3;
    subjectPlayerId: string;
  }) {
    this.container = options.container;
    this.subjectPosition = options.subjectPosition;
    this.subjectPlayerId = options.subjectPlayerId;

    this.promptElement = this.createPromptElement();
    this.container.appendChild(this.promptElement);

    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
  }

  /** Registers a world object as interactable. Returns it for convenience/chaining. */
  public register(interactable: Interactable): Interactable {
    this.interactables.push(interactable);
    return interactable;
  }

  /** Removes an interactable from consideration (e.g. on despawn). */
  public unregister(interactable: Interactable): void {
    const index = this.interactables.indexOf(interactable);
    if (index !== -1) this.interactables.splice(index, 1);
    if (this.activeTarget === interactable) {
      this.activeTarget = null;
      this.hidePrompt();
    }
  }

  /** Repoints which position this system measures distance from. */
  public setSubjectPosition(position: THREE.Vector3): void {
    this.subjectPosition = position;
  }

  /** Updates which player id is credited when triggering an interaction. */
  public setSubjectPlayerId(playerId: string): void {
    this.subjectPlayerId = playerId;
  }

  public update(_deltaTime: number): void {
    const nearest = this.findNearestInRange();

    if (nearest !== this.activeTarget) {
      this.activeTarget = nearest;
      if (nearest) {
        console.log(`[InteractionSystem] Active target: ${nearest.label}`);
        this.showPrompt(nearest.label);
      } else {
        this.hidePrompt();
      }
    }

    const interactKeyIsDown = this.isInteractKeyDown;
    const justPressed = interactKeyIsDown && !this.interactKeyWasDown;
    this.interactKeyWasDown = interactKeyIsDown;

    if (justPressed) {
      console.log(`[InteractionSystem] E pressed, active target:`, this.activeTarget?.label);
    }

    if (justPressed && this.activeTarget) {
      console.log(`[InteractionSystem] Triggering interaction: ${this.activeTarget.label}`);
      this.activeTarget.trigger({ playerId: this.subjectPlayerId });
    }
  }

  private findNearestInRange(): Interactable | null {
    let nearest: Interactable | null = null;
    let nearestDistanceSq = Infinity;

    for (const interactable of this.interactables) {
      if (!interactable.enabled) continue;

      const distanceSq = this.subjectPosition.distanceToSquared(interactable.getPosition());
      const radiusSq = interactable.radius * interactable.radius;

      if (distanceSq <= radiusSq && distanceSq < nearestDistanceSq) {
        nearest = interactable;
        nearestDistanceSq = distanceSq;
      }
    }

    return nearest;
  }

  // --- Input (local, dedicated to this system — not shared with InputManager,
  // since InputManager's getMoveVector() is movement-specific and E is not
  // a movement key) ---

  private isInteractKeyDown = false;

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyE') {
      console.log('[InteractionSystem] E key DOWN');
      this.isInteractKeyDown = true;
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'KeyE') {
      console.log('[InteractionSystem] E key UP');
      this.isInteractKeyDown = false;
    }
  };

  // --- Temporary DOM prompt ---

  private createPromptElement(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.bottom = '14%';
    el.style.transform = 'translateX(-50%)';
    el.style.padding = '8px 16px';
    el.style.background = 'rgba(5, 8, 10, 0.75)';
    el.style.border = '1px solid rgba(159, 255, 224, 0.4)';
    el.style.color = '#9fffe0';
    el.style.fontFamily = 'monospace';
    el.style.fontSize = '14px';
    el.style.letterSpacing = '0.05em';
    el.style.borderRadius = '4px';
    el.style.pointerEvents = 'none';
    el.style.userSelect = 'none';
    el.style.display = 'none';
    el.style.zIndex = '10';
    return el;
  }

  private showPrompt(label: string): void {
    this.promptElement.textContent = `[E] ${label}`;
    this.promptElement.style.display = 'block';
  }

  private hidePrompt(): void {
    this.promptElement.style.display = 'none';
  }

  /** Removes listeners and DOM elements. Call on teardown / hot-reload. */
  public dispose(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    if (this.promptElement.parentElement === this.container) {
      this.container.removeChild(this.promptElement);
    }
  }
}
