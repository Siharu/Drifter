import * as THREE from 'three';
import { AssetManager } from '../managers/AssetManager';
import type { Updatable } from '../core/Game';

/**
 * SkySystem
 * ---------
 * Procedural sky for Another Sky's post-apocalyptic atmosphere: a dim,
 * crimson-tinted dome with faint stars and a barely-visible, blood-toned
 * moon. Deliberately NOT photorealistic — the world is choked with ash
 * and smoke, so the sky reads as oppressive and close rather than clear
 * and deep.
 *
 * Lore intent (per design direction):
 *   - The moon is dim and obscured, not a bright clean light source.
 *   - The sky carries a near-constant crimson cast, even at night.
 *   - Stars are faint and sparse — visible, but never sharp or bright.
 *   - This is a STATIC sky for now: no day/night color animation here.
 *     AtmosphereSystem already owns the time-of-day fog/light cycle;
 *     hooking this sky's color into that cycle is a deliberate future
 *     step, not done here (see setTint() below for where that would plug in).
 *
 * Architecture:
 *   - Sky dome: large inverted sphere with a custom ShaderMaterial doing
 *     a vertical crimson/smoke gradient + procedural stars. Renders behind
 *     everything else (depthWrite: false, rendered first via low renderOrder).
 *   - Moon: a separate small textured sphere, positioned far along a fixed
 *     direction, dimmed via low emissive intensity and a crimson color
 *     multiply on its material — NOT a light source itself (LightingSystem's
 *     moonLight remains the actual scene light; this is just the visible disc).
 *   - Both dome and moon follow the camera/player position every frame
 *     (skybox convention) so they never appear to move relative to the
 *     world as the player walks around RS7.
 *
 * Texture:
 *   Moon color map expected at /assets/textures/moon_color.jpg
 *   (NASA SVS CGI Moon Kit, lroc_color_2k.jpg — public domain, no
 *   license restrictions). If the file is missing, the moon silently
 *   falls back to an untextured dim crimson sphere — same fallback
 *   philosophy as WorldAssetLoader's placeholder behavior, just inline
 *   here since there's only one texture to manage.
 *
 * Usage (main.ts):
 *   const skySystem = new SkySystem(game.sceneManager.scene, game.assets);
 *   game.registerSystem(skySystem);
 *   skySystem.setFollowTarget(localPlayer.object3D);
 */

// ---------------------------------------------------------------------------
// Tunables — lore-driven palette
// ---------------------------------------------------------------------------

/** Sky dome gradient: near-black smoke haze at the horizon-ish band, deep crimson-black above. */
const SKY_HORIZON_COLOR = new THREE.Color(0x140505); // smoke-choked, faint warm-dark
const SKY_ZENITH_COLOR = new THREE.Color(0x05010a); // near-black with a cold-crimson undertone

/** Stars: faint, sparse, never bright-white — slightly warm to avoid a "clean night sky" read. */
const STAR_COLOR = new THREE.Color(0x4a3a3a);
const STAR_DENSITY = 0.0025; // probability per dome-shader cell; tuned low deliberately
const STAR_MAX_BRIGHTNESS = 0.35; // stars never reach full white-point brightness

/** Moon: dim, crimson-tinted, NOT a bright clean light source. */
const MOON_TINT = new THREE.Color(0x8a2a2a); // crimson multiply over the real lunar texture
const MOON_EMISSIVE_INTENSITY = 0.12; // deliberately low — "way too dim" per design direction
const MOON_DISTANCE = 220; // far enough to read as sky-distant, inside camera far plane (500)
const MOON_RADIUS = 14;
const MOON_DIRECTION = new THREE.Vector3(-15, 25, -10).normalize(); // matches LightingSystem.moonLight position direction, so the visible disc agrees with the actual light source

const SKY_DOME_RADIUS = 400; // inside camera far plane (500), comfortably beyond fog falloff

const MOON_TEXTURE_URL = '/assets/textures/moon_color.jpg';

// ---------------------------------------------------------------------------
// Sky dome shader
// ---------------------------------------------------------------------------

const skyVertexShader = `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = `
  varying vec3 vWorldDir;

  uniform vec3 horizonColor;
  uniform vec3 zenithColor;
  uniform vec3 starColor;
  uniform float starDensity;
  uniform float starMaxBrightness;

  // Cheap hash-based pseudo-random, deterministic per direction — no texture lookup needed.
  float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 dir = normalize(vWorldDir);

    // Vertical gradient: horizon-ish band (dir.y near 0) to zenith (dir.y near 1).
    // Clamped so the lower hemisphere (below horizon) just holds horizon color
    // rather than going darker than the world fog it sits behind.
    float t = clamp(dir.y, 0.0, 1.0);
    t = smoothstep(0.0, 1.0, t);
    vec3 col = mix(horizonColor, zenithColor, t);

    // Procedural stars: cell-based hash, only above the horizon band, faint.
    if (dir.y > 0.05) {
      float cell = hash(floor(dir * 220.0));
      if (cell > (1.0 - starDensity)) {
        float twinkleSeed = hash(floor(dir * 220.0) + 7.0);
        float brightness = starMaxBrightness * (0.4 + 0.6 * twinkleSeed);
        col += starColor * brightness;
      }
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// SkySystem
// ---------------------------------------------------------------------------

export class SkySystem implements Updatable {
  private scene: THREE.Scene;
  private assetManager: AssetManager;

  private domeMesh: THREE.Mesh;
  private domeMaterial: THREE.ShaderMaterial;

  private moonMesh: THREE.Mesh;
  private moonMaterial: THREE.MeshStandardMaterial;

  private followTarget: THREE.Object3D | null = null;

  constructor(scene: THREE.Scene, assetManager: AssetManager) {
    this.scene = scene;
    this.assetManager = assetManager;

    // --- Sky dome ---
    const domeGeometry = new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 16);
    this.domeMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      uniforms: {
        horizonColor: { value: SKY_HORIZON_COLOR.clone() },
        zenithColor: { value: SKY_ZENITH_COLOR.clone() },
        starColor: { value: STAR_COLOR.clone() },
        starDensity: { value: STAR_DENSITY },
        starMaxBrightness: { value: STAR_MAX_BRIGHTNESS }
      },
      side: THREE.BackSide, // render the inside of the sphere
      depthWrite: false,
      fog: false
    });

    this.domeMesh = new THREE.Mesh(domeGeometry, this.domeMaterial);
    this.domeMesh.name = 'SkyDome';
    this.domeMesh.renderOrder = -1000; // draw behind everything else
    this.domeMesh.matrixAutoUpdate = true;
    this.scene.add(this.domeMesh);

    // --- Moon ---
    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 32, 32);
    this.moonMaterial = new THREE.MeshStandardMaterial({
      color: MOON_TINT.clone(),
      emissive: MOON_TINT.clone(),
      emissiveIntensity: MOON_EMISSIVE_INTENSITY,
      roughness: 1,
      metalness: 0,
      fog: false
    });

    this.moonMesh = new THREE.Mesh(moonGeometry, this.moonMaterial);
    this.moonMesh.name = 'Moon';
    this.moonMesh.renderOrder = -999;
    this.positionMoon(new THREE.Vector3(0, 0, 0));
    this.scene.add(this.moonMesh);

    // Load the real lunar texture asynchronously. If it's missing (file not
    // yet dropped into public/assets/textures/), this fails silently and
    // the moon stays an untextured dim crimson sphere — no crash, no
    // visible error to the player.
    void this.loadMoonTexture();
  }

  /** Sets the object (typically the player) the sky/moon should stay centered on. */
  public setFollowTarget(target: THREE.Object3D | null): void {
    this.followTarget = target;
  }

  /**
   * Future hook: AtmosphereSystem's day/night cycle can call this once the
   * sky is wired to react to time of day. Not called anywhere yet — the
   * sky is intentionally static per current design direction.
   */
  public setTint(horizonColor: THREE.Color, zenithColor: THREE.Color): void {
    (this.domeMaterial.uniforms.horizonColor.value as THREE.Color).copy(horizonColor);
    (this.domeMaterial.uniforms.zenithColor.value as THREE.Color).copy(zenithColor);
  }

  /** Per-frame update — keeps the dome and moon centered on the follow target. */
  public update(_deltaTime: number): void {
    void _deltaTime; // static sky: nothing animates per-frame yet beyond following the target
    const center = this.followTarget?.position ?? new THREE.Vector3(0, 0, 0);
    this.domeMesh.position.copy(center);
    this.positionMoon(center);
  }

  /** Disposes GPU resources. Call on full teardown. */
  public dispose(): void {
    this.domeMesh.geometry.dispose();
    this.domeMaterial.dispose();
    this.moonMesh.geometry.dispose();
    this.moonMaterial.dispose();
    if (this.moonMaterial.map) this.moonMaterial.map.dispose();
    this.scene.remove(this.domeMesh);
    this.scene.remove(this.moonMesh);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private positionMoon(center: THREE.Vector3): void {
    this.moonMesh.position.copy(
      center.clone().add(MOON_DIRECTION.clone().multiplyScalar(MOON_DISTANCE))
    );
  }

  private async loadMoonTexture(): Promise<void> {
    try {
      const texture = await this.assetManager.loadTexture(MOON_TEXTURE_URL);
      this.moonMaterial.map = texture;
      this.moonMaterial.needsUpdate = true;
    } catch (err) {
      console.warn(
        `[SkySystem] Moon texture not found at "${MOON_TEXTURE_URL}". ` +
        `Falling back to untextured crimson moon. Drop the NASA CGI Moon Kit ` +
        `color map (lroc_color_2k.jpg) at public${MOON_TEXTURE_URL} to enable it.`,
        err
      );
    }
  }
}
