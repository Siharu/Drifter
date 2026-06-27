import * as THREE from 'three';

/**
 * 8 facing directions, ordered to match the sprite sheet row order
 * (see SpriteSheetConfig.rowOrder below for how this maps to actual
 * texture rows — that mapping is data, not hardcoded here).
 */
export type FacingDirection =
  | 'down' | 'down-left' | 'left' | 'up-left'
  | 'up' | 'up-right' | 'right' | 'down-right';

/**
 * Describes the layout of an 8-direction sprite sheet so Player doesn't
 * need to hardcode frame counts or row order — different sheets (e.g.
 * a future enemy sheet) can reuse this same slicing logic with their
 * own config.
 */
export interface SpriteSheetConfig {
  /** Frames per direction row (e.g. idle + 3 walk frames = 4). */
  framesPerRow: number;
  /** Direction-to-row-index mapping, top to bottom in the texture. */
  rowOrder: FacingDirection[];
}

/** Matches the 8-direction sheet layout: idle, walk1-3, per direction. */
export const DEFAULT_SPRITE_SHEET_CONFIG: SpriteSheetConfig = {
  framesPerRow: 4,
  rowOrder: ['down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right'],
};

/**
 * Player
 * ------
 * Entity-only representation of a Logbook Drifter. Holds world transform,
 * visual representation, and identity/ownership state — nothing else.
 *
 * Deliberately knows nothing about:
 * - input (see PlayerController)
 * - movement math (see PlayerController)
 * - animation/facing DECISION-making (see PlayerController; this class
 *   only exposes setFrame() to call, not the logic for *when* to call it)
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

  /** Set once setSpriteSheet() has loaded a real sprite-plane visual. */
  private spriteMaterial: THREE.SpriteMaterial | null = null;
  private spriteSheetConfig: SpriteSheetConfig = DEFAULT_SPRITE_SHEET_CONFIG;

  /**
   * Placeholder slot for a future animation state machine. PlayerController
   * (or a dedicated AnimationSystem later) will read/write this; Player
   * itself does not interpret it, only stores it.
   */
  public animationState: string = 'idle';

  /** Current facing direction. Defaults to 'down', matching most JRPG conventions for spawn-facing. */
  public facing: FacingDirection = 'down';

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
   * Swaps the placeholder capsule for a billboarded sprite-sheet plane.
   * The texture is expected to be a grid of [config.rowOrder.length] rows
   * by [config.framesPerRow] columns — one row per facing direction.
   *
   * Pure visual swap — does not touch movement, ownership, or transform.
   * Call once a real sprite atlas exists; until then the capsule remains.
   */
  public setSpriteSheet(texture: THREE.Texture, config: SpriteSheetConfig = DEFAULT_SPRITE_SHEET_CONFIG): void {
    this.object3D.remove(this.visual);
    if (this.placeholderMaterial) {
      this.placeholderMaterial.dispose();
    }

    this.spriteSheetConfig = config;

    // Nearest-neighbor filtering: pixel art must not be smoothed/blurred
    // by mipmapping or linear filtering, or it loses the crisp HD-2D look.
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;

    // UV repeat is one cell's worth of the grid; offset is set per-frame
    // by setFrame(). Starting offset matches the default facing ('down',
    // frame 0 — i.e. row 0, column 0 of the sheet).
    texture.repeat.set(1 / config.framesPerRow, 1 / config.rowOrder.length);
    texture.offset.set(0, 1 - 1 / config.rowOrder.length);

    this.spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(this.spriteMaterial);
    sprite.position.y = 0.9;
    sprite.scale.set(1.2, 1.8, 1);

    this.visual = sprite;
    this.object3D.add(sprite);
  }

  /**
   * Selects which cell of the sprite sheet is currently displayed.
   * PlayerController calls this every frame with the direction/frame
   * it has decided on; Player just applies it as a UV offset.
   *
   * No-ops safely if setSpriteSheet() hasn't been called yet (still
   * showing the placeholder capsule) — this keeps PlayerController free
   * to call setFrame() unconditionally without checking sprite state.
   */
  public setFrame(direction: FacingDirection, frameIndex: number): void {
    this.facing = direction;
    if (!this.spriteMaterial || !this.spriteMaterial.map) return;

    const config = this.spriteSheetConfig;
    const rowIndex = config.rowOrder.indexOf(direction);
    if (rowIndex === -1) {
      console.warn(`Player.setFrame: direction "${direction}" not found in sprite sheet config rowOrder.`);
      return;
    }
    const col = ((frameIndex % config.framesPerRow) + config.framesPerRow) % config.framesPerRow;

    const texture = this.spriteMaterial.map;
    const cellWidth = 1 / config.framesPerRow;
    const cellHeight = 1 / config.rowOrder.length;

    // Texture V axis is flipped relative to row order (row 0 is the TOP
    // of the image, but V=0 is the BOTTOM of the texture in GL/Three
    // convention), so row index counts down from the top in V-space.
    texture.offset.set(col * cellWidth, 1 - cellHeight * (rowIndex + 1));
  }

  /** Returns the currently active visual object (mesh or sprite). */
  public getVisual(): THREE.Object3D {
    return this.visual;
  }

  /** Removes this player's visual from the scene graph. Call on despawn. */
  public dispose(): void {
    this.object3D.remove(this.visual);
    this.placeholderMaterial.dispose();
    this.spriteMaterial?.dispose();
  }
}

let localIdCounter = 0;

/** Generates a simple local id until a multiplayer layer assigns real ones. */
function createLocalId(): string {
  localIdCounter += 1;
  return `local-${localIdCounter}`;
}
