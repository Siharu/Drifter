import * as THREE from 'three';

/**
 * InteractionContext
 * -------------------
 * Passed to an Interactable's callback when triggered. Deliberately
 * minimal today — just identifies who triggered it. Future systems
 * (NPCs needing dialogue state, terminals needing save data, multiplayer
 * needing to know which remote client triggered a shared object) can
 * extend this shape without changing Interactable's public API.
 */
export interface InteractionContext {
  /** id of the player who triggered the interaction (see Player.id). */
  playerId: string;
}

export type InteractionCallback = (context: InteractionContext) => void;

/**
 * Interactable
 * ------------
 * Wraps any THREE.Object3D and makes it something a Drifter can interact
 * with: stores how close the player must be, what prompt label to show,
 * and what happens on trigger.
 *
 * Composition, not inheritance — an Interactable does not replace or
 * subclass the object it wraps. This is what makes "any world object
 * can become interactable": meshes, groups, empty anchor objects, future
 * NPC root nodes, terminal props, clue pickups, radio props, etc. all
 * work identically, since this class only ever reads `.object3D.position`.
 *
 * This class does NOT do detection (which Interactable is nearest, when
 * to fire) — that's InteractionSystem's job. Interactable is passive data
 * plus a single `trigger()` method.
 */
export class Interactable {
  /** The wrapped world object. Read-only reference, not owned/disposed here. */
  public readonly object3D: THREE.Object3D;

  /** Distance (world units) within which this becomes the active target. */
  public radius: number;

  /** Text shown in the interaction prompt, e.g. "Terminal", "Strange Note". */
  public label: string;

  /** Called when the player presses E while this is the active target. */
  public onInteract: InteractionCallback;

  /**
   * Set false to temporarily disable interaction (e.g. a terminal already
   * used, an NPC mid-conversation in a future dialogue system) without
   * unregistering it from InteractionSystem.
   */
  public enabled: boolean;

  /**
   * Category hint for future type-specific behavior (NPCs, terminals,
   * clues, broadcasts, notes). Purely descriptive right now — the
   * InteractionSystem does not branch on this — but gives future systems
   * (e.g. a dialogue system that only cares about 'npc' interactables) a
   * stable field to filter on instead of inspecting labels/objects.
   */
  public kind: InteractableKind;

  constructor(options: {
    object3D: THREE.Object3D;
    radius?: number;
    label: string;
    onInteract: InteractionCallback;
    kind?: InteractableKind;
    enabled?: boolean;
  }) {
    this.object3D = options.object3D;
    this.radius = options.radius ?? 2;
    this.label = options.label;
    this.onInteract = options.onInteract;
    this.kind = options.kind ?? 'generic';
    this.enabled = options.enabled ?? true;
  }

  /** World-space position of the wrapped object. */
  public getPosition(): THREE.Vector3 {
    return this.object3D.position;
  }

  /** Invoked by InteractionSystem when this is the active target and E is pressed. */
  public trigger(context: InteractionContext): void {
    if (!this.enabled) return;
    this.onInteract(context);
  }
}

/**
 * Known interactable categories. 'generic' covers anything not yet
 * specialized. 'npc', 'terminal', and 'clue' are world-object archetypes
 * without a 1:1 discovery type. The remaining five mirror DiscoveryType
 * exactly ('broadcast', 'note', 'observation', 'testimony', 'photo',
 * 'anomaly') since most interactables map directly to the kind of
 * discovery they unlock. No kind-specific behavior exists yet —
 * dialogue, inventory, and quests are explicitly out of scope for this
 * system.
 */
export type InteractableKind =
  | 'generic'
  | 'npc'
  | 'terminal'
  | 'clue'
  | 'broadcast'
  | 'note'
  | 'observation'
  | 'testimony'
  | 'photo'
  | 'anomaly';
