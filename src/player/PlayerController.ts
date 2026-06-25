import * as THREE from 'three';
import { InputManager } from './InputManager';
import type { Player } from './Player';
import type { CameraController } from '../core/CameraController';
import type { Updatable } from '../core/Game';

/**
 * PlayerController
 * -----------------
 * Drives a `Player` entity from local keyboard input: reads WASD via
 * InputManager, computes camera-relative movement, and writes the
 * result into the Player's transform. Also owns the (currently trivial)
 * animation-state decision of whether the player is idle or walking.
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

  /** Turn speed, radians per second, for smoothly facing movement direction. */
  private turnSpeed = 10;

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

    // Smoothly face the direction of movement.
    const targetYaw = Math.atan2(this.scratchMoveDirection.x, this.scratchMoveDirection.z);
    const yawAlpha = 1 - Math.exp(-this.turnSpeed * deltaTime);
    this.player.object3D.rotation.y = lerpAngle(this.player.object3D.rotation.y, targetYaw, yawAlpha);

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

/** Shortest-path angle interpolation, avoids the 359°→0° spin-around bug. */
function lerpAngle(from: number, to: number, alpha: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * alpha;
}
