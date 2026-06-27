import * as THREE from 'three';

/**
 * CameraController
 * -----------------
 * Fixed HD-2D orthographic camera with follow-target support.
 *
 * HD-2D here means: an ORTHOGRAPHIC projection (no perspective
 * foreshortening — this is what makes a 3D low-poly world read as
 * "2D-ish", Octopath Traveler-style) held at a fixed downward pitch
 * and fixed yaw relative to its target. It is NOT a free-look/orbit
 * rig — pitch and yaw never change at runtime, only position pans to
 * follow the target. This fixed angle is what keeps the world reading
 * as a stable diorama rather than a free 3D camera.
 *
 * Sprite billboarding note: THREE.Sprite objects (the player's visual)
 * always face the camera regardless of camera yaw, so a fixed yaw is
 * safe — it never causes the sprite to be viewed edge-on.
 *
 * Future support:
 * - Camera zones: named regions that override offset/zoom/damping when
 *   the target enters them (e.g. a tighter framing inside a corridor,
 *   a pulled-back establishing shot entering a new area). The
 *   `setZoneOverride` / `clearZoneOverride` methods are placeholders
 *   for that system to hook into without needing to touch this class.
 *
 * This class does NOT handle player input or movement. It only follows
 * a target position it's given each frame.
 */
export class CameraController {
  public readonly camera: THREE.OrthographicCamera;

  /** World-space object the camera follows. Null = camera stays static. */
  private target: THREE.Object3D | null = null;

  /**
   * Fixed downward pitch, in degrees, measured from horizontal.
   * 35-45° is the standard HD-2D range (Octopath Traveler sits around 40°).
   * This never changes at runtime — only the camera's position pans.
   */
  private readonly pitchDegrees = 40;

  /**
   * Half-height of the orthographic view volume, in world units.
   * Smaller = more zoomed in. Width is derived from this and the aspect ratio.
   */
  private viewSize = 6;

  /** Default offset from target, in target-local space (before zone override). */
  private readonly baseOffset: THREE.Vector3;
  private readonly baseLookAtOffset = new THREE.Vector3(0, 1, 0);

  /** Active offset (may be overridden by a camera zone). */
  private offset = new THREE.Vector3();
  private lookAtOffset = new THREE.Vector3();

  /** Smoothing factor for position only (per second, exponential damping). Yaw/pitch never move, so no rotation damping is needed. */
  private positionDamping = 4.5;

  private currentLookAt = new THREE.Vector3();
  private hasInitialized = false;
  private aspect: number;

  constructor(aspect: number) {
    this.aspect = aspect;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);

    // Derive a fixed offset direction from the pitch angle, at a distance
    // that doesn't matter for orthographic projection (no perspective
    // falloff) but keeps the camera comfortably outside world geometry.
    const pitchRad = (this.pitchDegrees * Math.PI) / 180;
    const distance = 14;
    this.baseOffset = new THREE.Vector3(0, Math.sin(pitchRad) * distance, Math.cos(pitchRad) * distance);

    this.offset.copy(this.baseOffset);
    this.lookAtOffset.copy(this.baseLookAtOffset);
    this.updateFrustum();
  }

  /** Sets the object the camera should follow. Pass null to stop following. */
  public setTarget(target: THREE.Object3D | null): void {
    this.target = target;
    this.hasInitialized = false;
  }

  /** Updates the renderer aspect ratio when the canvas size changes. */
  public setAspect(aspect: number): void {
    this.aspect = aspect;
    this.updateFrustum();
  }

  /**
   * Sets how much world space is visible vertically (in world units).
   * Smaller values zoom in. Use this instead of FOV — orthographic
   * cameras have no FOV concept.
   */
  public setZoom(viewSize: number): void {
    this.viewSize = viewSize;
    this.updateFrustum();
  }

  /** Recomputes the orthographic frustum from current viewSize + aspect. */
  private updateFrustum(): void {
    const halfHeight = this.viewSize;
    const halfWidth = halfHeight * this.aspect;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Placeholder for future camera-zone system.
   * A zone can call this to temporarily override offset/lookAt/damping
   * while the target is inside it.
   */
  public setZoneOverride(params: {
    offset?: THREE.Vector3;
    lookAtOffset?: THREE.Vector3;
    positionDamping?: number;
  }): void {
    if (params.offset) this.offset.copy(params.offset);
    if (params.lookAtOffset) this.lookAtOffset.copy(params.lookAtOffset);
    if (params.positionDamping !== undefined) this.positionDamping = params.positionDamping;
  }

  /** Reverts to the default (non-zone) offset and damping values. */
  public clearZoneOverride(): void {
    this.offset.copy(this.baseOffset);
    this.lookAtOffset.copy(this.baseLookAtOffset);
    this.positionDamping = 4.5;
  }

  /**
   * Advances the camera by one frame.
   * @param deltaTime Seconds since last frame.
   */
  public update(deltaTime: number): void {
    if (!this.target) return;

    // World-space offset — deliberately NOT rotated by the target's
    // quaternion. A fixed HD-2D diorama camera must hold the same
    // pitch/yaw no matter which way the player is facing; only its
    // position pans to follow. (Rotating the offset by target.quaternion
    // would make the camera orbit the player as they turn, which is the
    // free-look behavior this class explicitly avoids.)
    const desiredPosition = this.offset.clone().add(this.target.position);
    const desiredLookAt = this.lookAtOffset.clone().add(this.target.position);

    if (!this.hasInitialized) {
      // Snap on first frame after acquiring a target — no smoothing from origin.
      this.camera.position.copy(desiredPosition);
      this.currentLookAt.copy(desiredLookAt);
      this.hasInitialized = true;
    } else {
      const posAlpha = 1 - Math.exp(-this.positionDamping * deltaTime);

      this.camera.position.lerp(desiredPosition, posAlpha);
      this.currentLookAt.lerp(desiredLookAt, posAlpha);
    }

    this.camera.lookAt(this.currentLookAt);
  }
}
