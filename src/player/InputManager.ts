/**
 * InputManager
 * ------------
 * Tracks currently-held keyboard keys and exposes a normalized WASD
 * movement vector. Deliberately minimal — no input remapping, no
 * gamepad support, no event queue. Just "is this key down right now."
 *
 * Lives in player/ for now since the Drifter is the only consumer.
 * If other systems (UI, menus) need key state later, this can move
 * to systems/ without changing its public API.
 */
export class InputManager {
  private keysDown = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    this.keysDown.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keysDown.delete(event.code);
  };

  public isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  /**
   * Returns a normalized 2D movement vector from WASD / arrow keys.
   * x: -1 (left/A) to 1 (right/D)
   * z: -1 (forward/W) to 1 (back/S)
   * Diagonal input is normalized so diagonal movement isn't faster.
   */
  public getMoveVector(): { x: number; z: number } {
    let x = 0;
    let z = 0;

    if (this.isDown('KeyW') || this.isDown('ArrowUp')) z -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) z += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;

    if (x !== 0 && z !== 0) {
      const inverseLength = 1 / Math.sqrt(2);
      x *= inverseLength;
      z *= inverseLength;
    }

    return { x, z };
  }

  /** Removes listeners. Call on teardown / hot-reload to avoid leaks. */
  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }
}
