import * as THREE from 'three';
import { InputManager } from './InputManager';
import type { Player, FacingDirection } from './Player';
import type { CameraController } from '../core/CameraController';
import type { Updatable } from '../core/Game';

/**
 * The 8 facing directions in angle order, starting at 0 radians = +Z
 * (south/"down" on screen, matching atan2(x, z) convention used below)
 * and proceeding clockwise. Index i covers the 45° slice centered on
 * i * 45°. This order must stay in sync with the angle math in
 * directionFromVector() — it is not arbitrary.
 */
const DIRECTION_ORDER: FacingDirection[] = [
  'down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right',
];

/**
 * PlayerController
 * -----------------
 * Drives a `Player` entity from local keyboard input: reads WASD via
 * InputManager, computes camera-relative movement, and decides the
 * player's 8-direction facing + walk-cycle frame for the HD-2D sprite.
 *
 * Facing is NOT free rotation. THREE.Sprite objects always billboard
 * toward the camera, so rotating `player.object3D.rotation.y` has no
 * visible effect on a sprite — instead, facing must be expressed as
 * "which row of the sprite sheet," snapped to the nearest of 8 fixed
 * directions. That snapping happens here, in directionFromVector().
 *
 * This class should only ever drive a Player where
 * `player.isLocallyControlled === true`. A multiplayer layer will skip
 * creating a PlayerController for remote players entirely — their
 * transform comes from network state instead, never from this class.
 *
 * Does NOT do collision, interaction, or combat — those are separate
 * systems layered on top later.
 */
export class PlayerController implements Updatable {
  private player: Player;
  private input: InputManager;
  private cameraController: CameraController;

  /** Units per second. */
  private moveSpeed = 4.5;

  /** Seconds each walk-cycle frame is held before advancing to the next. */
  private frameDuration = 0.12;

  /** Frames per direction row, excluding idle (e.g. 3 walk frames after idle = indices 1,2,3). */
  private walkFrameCount = 3;

  private frameTimer = 0;
  private currentWalkFrame = 0;

  /**
   * Reusable scratch vectors to avoid per-frame allocations.
   * Safe because update() runs synchronously and doesn't re-enter itself.
   */
  private readonly scratchCameraForward = new THREE.Vector3();
  private readonly scratchCameraRight = new THREE.Vector3();
  private readonly scratchMoveDirection = new THREE.Vector3();
  private readonly scratchProposedPosition = new THREE.Vector3();

  constructor(player: Player, input: InputManager, cameraController: CameraController) {
    if (!player.isLocallyControlled) {
      // Not a hard failure — just a strong signal of misuse. A remote
      // player should never be driven by a local PlayerController.
      console.warn(
        `PlayerController: attached to Player "${player.id}" which is not ` +
        `locally controlled. Remote players should be driven by network state, not input.`
      );
    }

    this.player = player;
    this.input = input;
    this.cameraController = cameraController;
  }

  public update(deltaTime: number): void {
    const move = this.input.getMoveVector();
    const isMoving = move.x !== 0 || move.z !== 0;

    if (!isMoving) {
      this.setAnimationState('idle');
      // Idle always shows frame 0 of the current facing row — hold last
      // facing rather than resetting to 'down', so stopping mid-walk
      // doesn't visibly snap the character to face south.
      this.player.setFrame(this.player.facing, 0);
      this.frameTimer = 0;
      this.currentWalkFrame = 0;
      return;
    }

    // Camera-relative movement: project the camera's forward/right onto
    // the horizontal plane so movement direction doesn't tilt with
    // camera pitch, then combine with input axes.
    this.cameraController.camera.getWorldDirection(this.scratchCameraForward);
    this.scratchCameraForward.y = 0;
    this.scratchCameraForward.normalize();

    this.scratchCameraRight
      .crossVectors(this.scratchCameraForward, this.player.object3D.up)
      .normalize();

    this.scratchMoveDirection
      .set(0, 0, 0)
      .addScaledVector(this.scratchCameraForward, -move.z)
      .addScaledVector(this.scratchCameraRight, move.x);

    if (this.scratchMoveDirection.lengthSq() === 0) {
      this.setAnimationState('idle');
      this.player.setFrame(this.player.facing, 0);
      return;
    }
    this.scratchMoveDirection.normalize();

    // Proposed position this frame — written directly to the Player's
    // transform. No collision system exists yet to intercept this; when
    // one is built, it will sit between this computation and the final
    // position write (e.g. as a registered correction step), without
    // PlayerController needing to know how correction works.
    this.scratchProposedPosition
      .copy(this.player.position)
      .addScaledVector(this.scratchMoveDirection, this.moveSpeed * deltaTime);

    this.player.position.copy(this.scratchProposedPosition);

    // Snap movement direction to the nearest of 8 facing directions —
    // this picks which sprite-sheet row is shown. Unlike the old
    // free-yaw rotation, this is a discrete choice, not a smoothed one;
    // smoothing a sprite's discrete facing would just make it flicker
    // between rows, not visually rotate (sprites don't rotate).
    const direction = directionFromVector(this.scratchMoveDirection.x, this.scratchMoveDirection.z);

    // Walk-cycle: advance frame index every frameDuration seconds while
    // moving. Frame 0 is idle/contact pose, so the cycle uses 1..walkFrameCount.
    this.frameTimer += deltaTime;
    if (this.frameTimer >= this.frameDuration) {
      this.frameTimer -= this.frameDuration;
      this.currentWalkFrame = (this.currentWalkFrame % this.walkFrameCount) + 1;
    } else if (this.currentWalkFrame === 0) {
      this.currentWalkFrame = 1;
    }

    this.player.setFrame(direction, this.currentWalkFrame);
    this.setAnimationState('walking');
  }

  /**
   * Writes the player's current animation state. Trivial today (idle vs
   * walking) — a future animation system can replace this with a real
   * state machine (blending, transitions, attack/interact states, etc.)
   * without changing how movement is computed above.
   */
  private setAnimationState(state: string): void {
    if (this.player.animationState !== state) {
      this.player.animationState = state;
    }
  }

  /** Removes input listeners owned by this controller's InputManager. */
  public dispose(): void {
    this.input.dispose();
  }
}

/**
 * Snaps a world-space XZ movement vector to the nearest of 8 fixed
 * facing directions, for sprite-row selection.
 *
 * Angle convention: atan2(-x, z) gives 0 at +Z ("down"/south on screen,
 * i.e. toward the camera in this game's fixed camera setup) and
 * increases CLOCKWISE when viewed from above, matching screen-space
 * clockwise rotation as the player turns from facing the camera toward
 * facing right. (Plain atan2(x, z) increases counter-clockwise toward
 * +X instead — the negation on x is what flips it to clockwise so
 * "right" input actually maps to the 'right' sprite row instead of
 * 'left'. This was caught by directionFromVector's own unit test,
 * not by visual inspection — verify with a test, not just a build.)
 * Each of the 8 directions covers a 45° slice centered on its
 * index * 45°, so we round to the nearest slice rather than floor, to
 * land in the correct bucket rather than at its edge.
 */
function directionFromVector(x: number, z: number): FacingDirection {
  const angle = Math.atan2(-x, z); // -PI..PI, clockwise from +Z
  const slice = (Math.PI * 2) / DIRECTION_ORDER.length; // 45° in radians
  const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // 0..2PI
  const index = Math.round(normalizedAngle / slice) % DIRECTION_ORDER.length;
  return DIRECTION_ORDER[index];
}
