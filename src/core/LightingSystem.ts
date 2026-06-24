import * as THREE from 'three';

/**
 * LightingSystem
 * --------------
 * Atmospheric lighting setup for Another Sky: a dim, cold ambient fill
 * plus a single dominant "moonlight" directional light. Deliberately
 * minimal — no real-time GI, no multiple shadow-casting lights — to
 * stay cheap on the GPU while still reading as moody and dimensional.
 */
export class LightingSystem {
  public readonly ambientLight: THREE.AmbientLight;
  public readonly moonLight: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    // Low-intensity cold ambient: keeps shadow areas from going pure black
    // without flattening the scene's contrast.
    this.ambientLight = new THREE.AmbientLight(0x3a4a5e, 0.35);

    // Moonlight: a single directional light standing in for an unseen moon.
    // Cool, slightly desaturated blue-white — avoids the "warm sunset"
    // cliché and supports the wrongness/horror-adjacent tone.
    this.moonLight = new THREE.DirectionalLight(0xaecbff, 1.1);
    this.moonLight.position.set(-15, 25, -10);
    this.moonLight.target.position.set(0, 0, 0);

    // Shadows: enabled but kept small/cheap. Systems with large terrain
    // can call configureShadowBounds() to fit the frustum to their scale.
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.near = 1;
    this.moonLight.shadow.camera.far = 100;
    this.moonLight.shadow.camera.left = -30;
    this.moonLight.shadow.camera.right = 30;
    this.moonLight.shadow.camera.top = 30;
    this.moonLight.shadow.camera.bottom = -30;
    this.moonLight.shadow.bias = -0.0015;

    scene.add(this.ambientLight);
    scene.add(this.moonLight);
    scene.add(this.moonLight.target);
  }

  /** Re-fits the moonlight's shadow frustum to a given world-space radius. */
  public configureShadowBounds(radius: number, far: number = radius * 3): void {
    const cam = this.moonLight.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.far = far;
    cam.updateProjectionMatrix();
  }

  /** Lets the moonlight follow a target (e.g. keep shadows centered on the player). */
  public setMoonlightFocus(position: THREE.Vector3, distance: number = 30): void {
    this.moonLight.position.set(
      position.x - 15,
      position.y + 25,
      position.z - 10
    );
    this.moonLight.target.position.copy(position);
    void distance; // reserved for future use (e.g. scaling offset by zone size)
  }
}
