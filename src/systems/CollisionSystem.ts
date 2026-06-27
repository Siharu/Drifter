import * as THREE from 'three';

/**
 * CollisionSystem
 * ----------------
 * Static, world-space collision for solid objects the player should not
 * be able to walk through. XZ-plane only (this is a top-down/HD-2D game —
 * the player never needs to navigate vertically), so colliders are either
 * circles or axis-aligned boxes in the XZ plane, each effectively infinite
 * in Y (no floors/ceilings to clip against yet).
 *
 * This is intentionally NOT a physics engine. It does one job: given a
 * proposed next position, tell the caller whether that position is
 * blocked, or hand back a corrected position that slides along whatever
 * it hit instead of stopping dead. That's the only behavior DRIFTER's
 * movement currently needs.
 *
 * Per PlayerController's own pre-existing comment ("No collision system
 * exists yet to intercept this... it will sit between this computation
 * and the final position write"), this class is designed to slot in
 * exactly there — PlayerController computes a proposed position, passes
 * it through CollisionSystem.resolve(), and writes the corrected result.
 *
 * Colliders here are registered manually with positions/radii matching
 * RelayStation7's placeholder geometry (see WorldAssetLoader.makePlaceholder
 * for the footprint each placeholder actually draws on screen). When real
 * GLB models replace the placeholders, these collider definitions should
 * be re-checked against the new models' actual footprints — they are NOT
 * automatically derived from mesh bounding boxes (deliberately; the goal
 * is forgiving, readable collision shapes a player can intuit, not exact
 * mesh-accurate collision, which would feel snaggy against irregular GLB
 * geometry).
 */

export interface CircleCollider {
  type: 'circle';
  /** World-space center, XZ plane (Y ignored). */
  center: THREE.Vector2;
  radius: number;
  /** Debug label — which object this collider represents. Not shown to players. */
  label: string;
}

export interface BoxCollider {
  type: 'box';
  /** World-space center, XZ plane (Y ignored). */
  center: THREE.Vector2;
  /** Half-extents along X and Z. */
  halfExtents: THREE.Vector2;
  /** Rotation around Y axis, radians. Most placeholders are axis-aligned (0). */
  rotation: number;
  label: string;
}

export type Collider = CircleCollider | BoxCollider;

/** How much clearance to add beyond an object's visual footprint, so the player doesn't appear to clip into edges. */
const DEFAULT_PADDING = 0.3;

/** Player's own collision radius — keeps a consistent minimum distance from any collider's surface. */
const PLAYER_RADIUS = 0.4;

export class CollisionSystem {
  private colliders: Collider[] = [];

  /** Registers a circular collider (good fit for towers, sheds, crates, barrels — anything roughly round or square-ish viewed from above). */
  public addCircle(centerX: number, centerZ: number, radius: number, label: string, padding = DEFAULT_PADDING): void {
    this.colliders.push({
      type: 'circle',
      center: new THREE.Vector2(centerX, centerZ),
      radius: radius + padding,
      label,
    });
  }

  /** Registers a box collider (good fit for fence segments, desks, anything notably non-square). */
  public addBox(
    centerX: number,
    centerZ: number,
    sizeX: number,
    sizeZ: number,
    label: string,
    rotation = 0,
    padding = DEFAULT_PADDING
  ): void {
    this.colliders.push({
      type: 'box',
      center: new THREE.Vector2(centerX, centerZ),
      halfExtents: new THREE.Vector2(sizeX / 2 + padding, sizeZ / 2 + padding),
      rotation,
      label,
    });
  }

  /** Removes every registered collider. Call when leaving a region before building the next one. */
  public clear(): void {
    this.colliders = [];
  }

  /**
   * Given the player's current position and a proposed next position
   * (both XZ, Y ignored), returns a corrected position that respects all
   * registered colliders.
   *
   * Approach: try the full proposed move first. If it's blocked, try
   * sliding along just the X axis, then just the Z axis (classic
   * axis-separated sliding — lets the player slide along a wall instead
   * of stopping dead when moving diagonally into it). If even the
   * current position is somehow inside a collider (shouldn't happen in
   * normal play, but guards against bad spawn points), the original
   * proposed position's axis-by-axis fallback still applies, never NaN.
   */
  public resolve(currentX: number, currentZ: number, proposedX: number, proposedZ: number): { x: number; z: number } {
    if (!this.isBlocked(proposedX, proposedZ)) {
      return { x: proposedX, z: proposedZ };
    }

    // Try sliding: keep the new X, revert Z (move along X only).
    const slideX = !this.isBlocked(proposedX, currentZ);
    // Try sliding: keep the new Z, revert X (move along Z only).
    const slideZ = !this.isBlocked(currentX, proposedZ);

    if (slideX && slideZ) {
      // Both individually clear (diagonal corner case) — prefer the axis
      // with more actual movement, so sliding feels responsive rather
      // than arbitrarily favoring X.
      const dx = Math.abs(proposedX - currentX);
      const dz = Math.abs(proposedZ - currentZ);
      return dx >= dz ? { x: proposedX, z: currentZ } : { x: currentX, z: proposedZ };
    }
    if (slideX) return { x: proposedX, z: currentZ };
    if (slideZ) return { x: currentX, z: proposedZ };

    // Fully blocked in every direction tried — hold position.
    return { x: currentX, z: currentZ };
  }

  /** True if the given XZ point intersects any registered collider. */
  private isBlocked(x: number, z: number): boolean {
    for (const collider of this.colliders) {
      if (collider.type === 'circle') {
        const dx = x - collider.center.x;
        const dz = z - collider.center.y;
        const distSq = dx * dx + dz * dz;
        const combinedRadius = collider.radius + PLAYER_RADIUS;
        if (distSq < combinedRadius * combinedRadius) return true;
      } else {
        // Box test: transform the point into the box's local (rotated) space, then do a simple AABB check.
        const dx = x - collider.center.x;
        const dz = z - collider.center.y;
        const cos = Math.cos(-collider.rotation);
        const sin = Math.sin(-collider.rotation);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        if (
          Math.abs(localX) < collider.halfExtents.x + PLAYER_RADIUS &&
          Math.abs(localZ) < collider.halfExtents.y + PLAYER_RADIUS
        ) {
          return true;
        }
      }
    }
    return false;
  }
}
