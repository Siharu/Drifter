import * as THREE from 'three';

/**
 * CameraController
 * -----------------
 * Fixed cinematic camera with optional follow-target support.
 *
 * "Fixed cinematic" here means: the camera holds a stable offset/angle
 * relative to its target rather than being a free-look/orbit rig. It
 * smoothly trails whatever target it's given (typically the player),
 * which reads as deliberate and composed rather than reactive — fitting
 * the 2.5D pixel-diorama + low-poly-world aesthetic.
 *
 * Future support:
 * - Camera zones: named regions that override offset/fov/damping when
 *   the target enters them (e.g. a tighter framing inside a corridor,
 *   a pulled-back establishing shot entering a new area). The
 *   `setZoneOverride` / `clearZoneOverride` methods are placeholders
 *   for that system to hook into without needing to touch this class.
 *
 * This class does NOT handle player input or movement. It only follows
 * a target position it's given each frame.
 */
export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;

  /** World-space object the camera follows. Null = camera stays static. */
  private target: THREE.Object3D | null = null;

  /** Default offset from target, in target-local space (before zone override). */
  private readonly baseOffset = new THREE.Vector3(0, 4.5, 8);
  private readonly baseLookAtOffset = new THREE.Vector3(0, 1, 0);

  /** Active offset (may be overridden by a camera zone). */
  private offset = new THREE.Vector3();
  private lookAtOffset = new THREE.Vector3();

  /** Smoothing factors (per second, exponential damping — frame-rate independent). */
  private positionDamping = 4.5;
  private rotationDamping = 6.0;

  private currentLookAt = new THREE.Vector3();
  private hasInitialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
    this.offset.copy(this.baseOffset);
    this.lookAtOffset.copy(this.baseLookAtOffset);
  }

  /** Sets the object the camera should follow. Pass null to stop following. */
  public setTarget(target: THREE.Object3D | null): void {
    this.target = target;
    this.hasInitialized = false;
  }

  /** Updates the renderer aspect ratio when the canvas size changes. */
  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
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
    rotationDamping?: number;
  }): void {
    if (params.offset) this.offset.copy(params.offset);
    if (params.lookAtOffset) this.lookAtOffset.copy(params.lookAtOffset);
    if (params.positionDamping !== undefined) this.positionDamping = params.positionDamping;
    if (params.rotationDamping !== undefined) this.rotationDamping = params.rotationDamping;
  }

  /** Reverts to the default (non-zone) offset and damping values. */
  public clearZoneOverride(): void {
    this.offset.copy(this.baseOffset);
    this.lookAtOffset.copy(this.baseLookAtOffset);
    this.positionDamping = 4.5;
    this.rotationDamping = 6.0;
  }

  /**
   * Advances the camera by one frame.
   * @param deltaTime Seconds since last frame.
   */
  public update(deltaTime: number): void {
    if (!this.target) return;

    const desiredPosition = this.offset.clone().applyQuaternion(this.target.quaternion);
    desiredPosition.add(this.target.position);

    const desiredLookAt = this.lookAtOffset.clone().add(this.target.position);

    if (!this.hasInitialized) {
      // Snap on first frame after acquiring a target — no smoothing from origin.
      this.camera.position.copy(desiredPosition);
      this.currentLookAt.copy(desiredLookAt);
      this.hasInitialized = true;
    } else {
      const posAlpha = 1 - Math.exp(-this.positionDamping * deltaTime);
      const lookAlpha = 1 - Math.exp(-this.rotationDamping * deltaTime);

      this.camera.position.lerp(desiredPosition, posAlpha);
      this.currentLookAt.lerp(desiredLookAt, lookAlpha);
    }

    this.camera.lookAt(this.currentLookAt);
  }
}
