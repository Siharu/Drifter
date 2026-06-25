import * as THREE from 'three';

/**
 * Player
 * ------
 * Entity-only representation of a Logbook Drifter. Holds world transform,
 * visual representation, and identity/ownership state — nothing else.
 *
 * Deliberately knows nothing about:
 * - input (see PlayerController)
 * - movement math (see PlayerController)
 * - animation decision-making (see PlayerController; this class only
 *   exposes the mesh/sprite to swap, not the logic for *when* to swap)
 * - collision (not built yet)
 * - interaction (not built yet)
 *
 * This separation exists so a future multiplayer layer can spawn a
 * `Player` per connected client — local or remote — while only the
 * local player gets a `PlayerController` driving it from keyboard
 * input. Remote players will instead have their `object3D.position`
 * (and eventually animation state) set directly from network snapshots.
 */
export class Player {
  /** World transform. Valid CameraController follow-target as-is. */
  public readonly object3D: THREE.Group;

  /** Convenience alias for object3D.position — entity's ground-contact point. */
  public readonly position: THREE.Vector3;

  /**
   * Stable identifier for this player. Defaults to a locally-generated
   * id; a multiplayer layer will overwrite this with a server-assigned
   * session/player id when the entity represents a networked client.
   */
  public readonly id: string;

  /**
   * True if this Player is driven by local input (via PlayerController).
   * False for remote players whose transform is set from network state.
   * Multiplayer ownership hinges on this flag — systems that shouldn't
   * touch remote entities (e.g. local-only PlayerController) can check it.
   */
  public isLocallyControlled: boolean;

  /** Current facing-relevant visual object. Capsule placeholder for now. */
  private visual: THREE.Object3D;
  private placeholderMaterial: THREE.MeshStandardMaterial;

  /**
   * Placeholder slot for a future animation state machine. PlayerController
   * (or a dedicated AnimationSystem later) will read/write this; Player
   * itself does not interpret it, only stores it.
   */
  public animationState: string = 'idle';

  constructor(options: { id: string; isLocallyControlled?: boolean } = { id: createLocalId() }) {
    this.id = options.id;
    this.isLocallyControlled = options.isLocallyControlled ?? true;

    this.object3D = new THREE.Group();
    this.object3D.name = `Player:${this.id}`;

    this.placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0x9fffe0 });

    // Capsule placeholder: origin at feet (y=0) so position represents
    // ground contact, matching what a future CollisionSystem/ground-snap
    // logic will expect. No collision behavior implemented yet.
    const geometry = new THREE.CapsuleGeometry(0.4, 0.9, 4, 8);
    const mesh = new THREE.Mesh(geometry, this.placeholderMaterial);
    mesh.position.y = 0.85;
    mesh.castShadow = true;

    this.visual = mesh;
    this.object3D.add(this.visual);

    this.position = this.object3D.position;
  }

  /**
   * Swaps the placeholder capsule for a billboarded sprite plane.
   * Pure visual swap — does not touch movement, ownership, or transform.
   * Call once a sprite atlas/texture exists.
   */
  public setSpriteTexture(texture: THREE.Texture): void {
    this.object3D.remove(this.visual);

    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.y = 0.9;
    sprite.scale.set(1.2, 1.8, 1);

    this.visual = sprite;
    this.object3D.add(sprite);
  }

  /** Returns the currently active visual object (mesh or sprite). */
  public getVisual(): THREE.Object3D {
    return this.visual;
  }

  /** Removes this player's visual from the scene graph. Call on despawn. */
  public dispose(): void {
    this.object3D.remove(this.visual);
    this.placeholderMaterial.dispose();
  }
}

let localIdCounter = 0;

/** Generates a simple local id until a multiplayer layer assigns real ones. */
function createLocalId(): string {
  localIdCounter += 1;
  return `local-${localIdCounter}`;
}
