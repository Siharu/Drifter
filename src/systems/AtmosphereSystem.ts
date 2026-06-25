import * as THREE from 'three';
import { SceneManager } from '../core/SceneManager';
import { LightingSystem } from '../core/LightingSystem';
import type { Updatable } from '../core/Game';

/**
 * AtmosphereSystem
 * ----------------
 * Manages all environmental atmosphere in DRIFTER.
 *
 * Visual:
 *   - Dynamic fog density (time-of-day curve + noise fluctuation)
 *   - Ambient light fluctuation (subtle per-frame shimmer, not jarring)
 *   - Distant haze (secondary fog layer via fog density + color shift)
 *   - Yellow gas zone support (fog color → sickly yellow, density spike)
 *
 * Audio hooks (event-driven — this system emits, audio system listens):
 *   - Wind strength events  → onWindEvent()
 *   - Radio static events   → onRadioStaticEvent()
 *   - Distant ambient hooks → onDistantSoundEvent()
 *
 * Architecture:
 *   - Browser-friendly: THREE.FogExp2 only, no post-processing
 *   - No screen-space effects
 *   - All audio/weather integration is event-driven, not direct
 *   - Future weather: setRaining(), setYellowGasIntensity()
 *   - Future region zones: setZoneOverride() / clearZoneOverride()
 *
 * Usage:
 *   const atmo = new AtmosphereSystem(sceneManager, lightingSystem, {
 *     initialTimeHour: 18,        // start at dusk
 *     autoAdvanceTime: true,
 *     secondsPerDay: 600          // 10 real minutes = 1 in-game day
 *   });
 *   game.registerSystem(atmo);
 *
 *   // Wire audio
 *   atmo.onWindEvent((strength) => audioSystem.setWindVolume(strength));
 *   atmo.onRadioStaticEvent((intensity) => audioSystem.setStaticVolume(intensity));
 *   atmo.onDistantSoundEvent((type, volume) => audioSystem.playDistant(type, volume));
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalized time 0–1 (0 = midnight, 0.5 = noon, 1 = next midnight). */
export type NormalizedTime = number;

/** Hour value 0–24. */
export type TimeOfDay = number;

export interface FogState {
  density: number;
  color: THREE.Color;
}

export interface LightState {
  ambientIntensity: number;
  moonlightIntensity: number;
}

export interface AtmosphereState {
  timeNormalized: NormalizedTime;
  fog: FogState;
  light: LightState;
  windStrength: number;
  radioStaticIntensity: number;
  isRaining: boolean;
  rainIntensity: number;
  yellowGasIntensity: number;
}

/** Audio hook event types for distant environment sounds. */
export type DistantSoundType =
  | 'rumble'       // low distant rumble, heard rarely
  | 'creak'        // structural creak (metal, wood)
  | 'tone'         // a sustained distant tone (ARG-adjacent)
  | 'static_burst' // short burst of static from somewhere far
  | 'drip'         // water drip (for enclosed/cave zones later)
  | 'wind_gust';   // a single strong gust

// ---------------------------------------------------------------------------
// Listener types
// ---------------------------------------------------------------------------

/** Fired ~1–2× per second with current wind strength (0–1). */
export type WindEventListener = (strength: number) => void;

/** Fired when radio static intensity changes (0–1). High near anomaly zones. */
export type RadioStaticEventListener = (intensity: number) => void;

/** Fired for one-off distant environmental sounds. */
export type DistantSoundEventListener = (type: DistantSoundType, volume: number) => void;

/** Fired when fog state changes (density or color). */
export type FogChangedListener = (state: FogState) => void;

/** Fired when rain state changes. */
export type RainStateChangedListener = (isRaining: boolean, intensity: number) => void;

/** Fired when yellow gas intensity changes. */
export type YellowGasChangedListener = (intensity: number) => void;

/** Fired when time of day changes. */
export type TimeChangedListener = (normalized: NormalizedTime, hour: TimeOfDay) => void;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Simple seeded pseudo-noise for smooth fluctuation. Not cryptographic. */
function smoothNoise(t: number, scale: number = 1): number {
  const s = t * scale;
  return (
    Math.sin(s * 1.3) * 0.4 +
    Math.sin(s * 2.7 + 1.1) * 0.3 +
    Math.sin(s * 5.1 + 2.3) * 0.2 +
    Math.sin(s * 11.3 + 0.7) * 0.1
  );
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// AtmosphereSystem
// ---------------------------------------------------------------------------

export class AtmosphereSystem implements Updatable {
  private sceneManager: SceneManager;
  private lightingSystem: LightingSystem;

  // --- Time ---
  private timeNormalized: NormalizedTime = 0.75; // default: 18:00 (dusk)
  private autoAdvanceTime = false;
  private secondsPerDay = 0;
  private elapsedTime = 0; // total real seconds since start, used for noise

  // --- Fog ---
  private baseFogDensity = 0.035;
  private fogDensity = 0.035;
  private fogColor = new THREE.Color(0x05070a);
  private hazeColor = new THREE.Color(0x1a0a08);   // distant haze tint — smoke/ash, not blue
  private _yellowGasIntensity = 0;

  // --- Lights ---

  // --- Wind ---
  private windStrength = 0;
  private windTimer = 0;
  private windEventEvery = 1.5; // seconds between wind events

  // --- Radio static ---
  private radioStaticIntensity = 0;
  private radioStaticTimer = 0;
  private radioStaticEventEvery = 3.0; // seconds between static events

  // --- Distant sounds ---
  private distantSoundTimer = 0;
  private distantSoundEventEvery = 8.0; // seconds between distant sound events
  private distantSoundChance = 0.4;     // 40% chance each interval fires

  // --- Rain (future) ---
  private _isRaining = false;
  private _rainIntensity = 0;

  // --- Zone override ---
  private zoneOverride: Partial<{
    fogDensityMultiplier: number;
    fogColor: THREE.Color;
    windStrengthOverride: number;
    radioStaticOverride: number;
    yellowGasIntensity: number;
  }> | null = null;

  // --- Event listeners ---
  private windListeners = new Set<WindEventListener>();
  private radioStaticListeners = new Set<RadioStaticEventListener>();
  private distantSoundListeners = new Set<DistantSoundEventListener>();
  private fogChangedListeners = new Set<FogChangedListener>();
  private rainStateListeners = new Set<RainStateChangedListener>();
  private yellowGasListeners = new Set<YellowGasChangedListener>();
  private timeChangedListeners = new Set<TimeChangedListener>();

  constructor(
    sceneManager: SceneManager,
    lightingSystem: LightingSystem,
    options?: {
      initialTimeHour?: TimeOfDay;
      autoAdvanceTime?: boolean;
      secondsPerDay?: number;
    }
  ) {
    this.sceneManager = sceneManager;
    this.lightingSystem = lightingSystem;

    if (options?.initialTimeHour !== undefined) {
      this.timeNormalized = clamp(options.initialTimeHour, 0, 24) / 24;
    }

    if (options?.autoAdvanceTime && options.secondsPerDay) {
      this.autoAdvanceTime = true;
      this.secondsPerDay = options.secondsPerDay;
    }

    this.applyAll();
  }

  // ---------------------------------------------------------------------------
  // Update loop
  // ---------------------------------------------------------------------------

  public update(deltaTime: number): void {
    this.elapsedTime += deltaTime;

    // Advance time of day
    if (this.autoAdvanceTime && this.secondsPerDay > 0) {
      this.timeNormalized = (this.timeNormalized + deltaTime / this.secondsPerDay) % 1;
      this.emitTimeChanged();
    }

    // Apply dynamic visual fluctuation every frame
    this.applyAll();

    // Wind events
    this.windTimer += deltaTime;
    if (this.windTimer >= this.windEventEvery) {
      this.windTimer = 0;
      // Stagger next event slightly so it doesn't feel metronomic
      this.windEventEvery = lerp(1.0, 2.5, Math.random());
      this.emitWindEvent();
    }

    // Radio static events
    this.radioStaticTimer += deltaTime;
    if (this.radioStaticTimer >= this.radioStaticEventEvery) {
      this.radioStaticTimer = 0;
      this.radioStaticEventEvery = lerp(2.0, 5.0, Math.random());
      this.emitRadioStaticEvent();
    }

    // Distant sound events
    this.distantSoundTimer += deltaTime;
    if (this.distantSoundTimer >= this.distantSoundEventEvery) {
      this.distantSoundTimer = 0;
      this.distantSoundEventEvery = lerp(6.0, 14.0, Math.random());
      if (Math.random() < this.distantSoundChance) {
        this.emitDistantSoundEvent();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Visual application
  // ---------------------------------------------------------------------------

  private applyAll(): void {
    const hour = this.timeNormalized * 24;
    const t = this.elapsedTime;

    // --- Fog density (time-of-day base + noise fluctuation) ---
    const timeFogMultiplier = this.timeFogMultiplier(hour);
    const fogNoise = smoothNoise(t, 0.08) * 0.008; // very subtle, ±0.8%
    let density = this.baseFogDensity * timeFogMultiplier + fogNoise;

    // Rain boosts fog
    if (this._isRaining) {
      density += 0.012 * this._rainIntensity;
    }

    // Zone override can multiply
    if (this.zoneOverride?.fogDensityMultiplier !== undefined) {
      density *= this.zoneOverride.fogDensityMultiplier;
    }

    // Yellow gas spikes fog density
    if (this._yellowGasIntensity > 0) {
      density += 0.04 * this._yellowGasIntensity;
    }

    this.fogDensity = clamp(density, 0.005, 0.25);

    // --- Fog color (time-of-day + haze + yellow gas) ---
    // Crimson cast persists through night/dawn/dusk per lore direction —
    // the apocalypse colors the sky red even after dark. Day stays a
    // neutral, smoke-dusky tone (not clean blue) so occasional red-light
    // spikes during the day read as a deliberate departure, not the baseline.
    const nightColor  = new THREE.Color(0x140405);
    const dawnColor   = new THREE.Color(0x2a0a0a);
    const dayColor    = new THREE.Color(0x2a2420);
    const duskColor   = new THREE.Color(0x300a0a);
    const yellowColor = new THREE.Color(0x3a3200);

    let computedColor: THREE.Color;

    if (hour < 5) {
      computedColor = nightColor.clone();
    } else if (hour < 7) {
      computedColor = nightColor.clone().lerp(dawnColor, smoothstep(5, 7, hour));
    } else if (hour < 9) {
      computedColor = dawnColor.clone().lerp(dayColor, smoothstep(7, 9, hour));
    } else if (hour < 17) {
      computedColor = dayColor.clone();
    } else if (hour < 19) {
      computedColor = dayColor.clone().lerp(duskColor, smoothstep(17, 19, hour));
    } else if (hour < 21) {
      computedColor = duskColor.clone().lerp(nightColor, smoothstep(19, 21, hour));
    } else {
      computedColor = nightColor.clone();
    }

    // Add distant haze tint (smoke/ash haze — warm-dark, not blue)
    computedColor.lerp(this.hazeColor, 0.25);

    // Zone can override fog color entirely
    if (this.zoneOverride?.fogColor) {
      computedColor = this.zoneOverride.fogColor.clone();
    }

    // Yellow gas: blend fog toward sickly yellow
    const yellowGas = this.zoneOverride?.yellowGasIntensity ?? this._yellowGasIntensity;
    if (yellowGas > 0) {
      computedColor.lerp(yellowColor, yellowGas * 0.8);
    }

    this.fogColor.copy(computedColor);
    this.sceneManager.setFogDensity(this.fogDensity);
    this.sceneManager.setAtmosphereColor(this.fogColor);

    // --- Ambient light fluctuation (subtle, not jarring) ---
    const ambientBase = this.timeAmbientIntensity(hour);
    // Very slight flicker: ±3% with a slow, smooth noise
    const ambientNoise = smoothNoise(t, 0.12) * 0.03;
    this.lightingSystem.ambientLight.intensity = clamp(
      ambientBase + ambientNoise,
      0.05,
      1.0
    );

    // --- Moonlight / directional intensity (time-of-day, no flicker) ---
    this.lightingSystem.moonLight.intensity = this.timeMoonIntensity(hour);

    // --- Wind strength (noise-driven) ---
    const windNoise = (smoothNoise(t, 0.05) + 1) * 0.5; // remap to 0-1
    this.windStrength = this.zoneOverride?.windStrengthOverride ?? clamp(windNoise, 0, 1);

    // --- Radio static intensity ---
    // Higher at night and near yellow gas zones; subtle noise variation
    const nightFactor = hour < 6 || hour > 20 ? 0.5 : 0.1;
    const staticNoise = (smoothNoise(t, 0.3) + 1) * 0.5;
    this.radioStaticIntensity =
      this.zoneOverride?.radioStaticOverride ??
      clamp(nightFactor + staticNoise * 0.2 + yellowGas * 0.4, 0, 1);
  }

  // ---------------------------------------------------------------------------
  // Time-of-day curves
  // ---------------------------------------------------------------------------

  private timeFogMultiplier(hour: number): number {
    // Denser at night, clearer midday, ramps at dawn/dusk
    if (hour < 5)       return lerp(1.4, 1.6, smoothstep(0, 5, hour));
    if (hour < 8)       return lerp(1.6, 0.7, smoothstep(5, 8, hour));
    if (hour < 16)      return 0.7;
    if (hour < 19)      return lerp(0.7, 1.2, smoothstep(16, 19, hour));
    return              lerp(1.2, 1.4, smoothstep(19, 24, hour));
  }

  private timeAmbientIntensity(hour: number): number {
    if (hour < 5)       return lerp(0.12, 0.15, smoothstep(0, 5, hour));
    if (hour < 8)       return lerp(0.15, 0.5, smoothstep(5, 8, hour));
    if (hour < 16)      return 0.5;
    if (hour < 19)      return lerp(0.5, 0.2, smoothstep(16, 19, hour));
    return              lerp(0.2, 0.12, smoothstep(19, 24, hour));
  }

  private timeMoonIntensity(hour: number): number {
    if (hour < 5)       return 1.1;
    if (hour < 8)       return lerp(1.1, 0.4, smoothstep(5, 8, hour));
    if (hour < 16)      return 0.4;
    if (hour < 19)      return lerp(0.4, 1.0, smoothstep(16, 19, hour));
    return              lerp(1.0, 1.1, smoothstep(19, 24, hour));
  }

  // ---------------------------------------------------------------------------
  // Public API: time
  // ---------------------------------------------------------------------------

  public setTimeOfDay(hour: TimeOfDay): void {
    this.timeNormalized = clamp(hour, 0, 24) / 24;
    this.applyAll();
    this.emitTimeChanged();
  }

  public setTimeNormalized(t: NormalizedTime): void {
    this.timeNormalized = clamp(t, 0, 1);
    this.applyAll();
    this.emitTimeChanged();
  }

  public getTimeOfDay(): TimeOfDay {
    return this.timeNormalized * 24;
  }

  public getTimeNormalized(): NormalizedTime {
    return this.timeNormalized;
  }

  // ---------------------------------------------------------------------------
  // Public API: wind
  // ---------------------------------------------------------------------------

  public getWindStrength(): number {
    return this.windStrength;
  }

  /** Subscribe to wind events (~1–2× per second). Returns unsubscribe fn. */
  public onWindEvent(listener: WindEventListener): () => void {
    this.windListeners.add(listener);
    return () => this.windListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Public API: radio static
  // ---------------------------------------------------------------------------

  public getRadioStaticIntensity(): number {
    return this.radioStaticIntensity;
  }

  /** Subscribe to radio static events (~every 3–5s). Returns unsubscribe fn. */
  public onRadioStaticEvent(listener: RadioStaticEventListener): () => void {
    this.radioStaticListeners.add(listener);
    return () => this.radioStaticListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Public API: distant sounds
  // ---------------------------------------------------------------------------

  /** Subscribe to distant environmental sound events. Returns unsubscribe fn. */
  public onDistantSoundEvent(listener: DistantSoundEventListener): () => void {
    this.distantSoundListeners.add(listener);
    return () => this.distantSoundListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Public API: fog
  // ---------------------------------------------------------------------------

  public getFogState(): FogState {
    return { density: this.fogDensity, color: this.fogColor.clone() };
  }

  public onFogChanged(listener: FogChangedListener): () => void {
    this.fogChangedListeners.add(listener);
    return () => this.fogChangedListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Public API: rain (future weather integration)
  // ---------------------------------------------------------------------------

  /**
   * Set rain state. When active:
   *   - Fog density increases
   *   - Wind strength increases
   *   - Distant sound type biases toward 'drip'
   * Audio system should listen to onWindEvent + onDistantSoundEvent.
   */
  public setRaining(isRaining: boolean, intensity = 0.5): void {
    const prev = this._isRaining;
    this._isRaining = isRaining;
    this._rainIntensity = isRaining ? clamp(intensity, 0, 1) : 0;
    if (prev !== isRaining) {
      this.emitRainStateChanged();
    }
  }

  public get isRaining(): boolean { return this._isRaining; }
  public get rainIntensity(): number { return this._rainIntensity; }

  public onRainStateChanged(listener: RainStateChangedListener): () => void {
    this.rainStateListeners.add(listener);
    return () => this.rainStateListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Public API: yellow gas (future zone integration)
  // ---------------------------------------------------------------------------

  /**
   * Set yellow gas intensity (0–1). When active:
   *   - Fog color shifts toward sickly yellow
   *   - Fog density increases
   *   - Radio static intensity increases
   * Visual particles are the responsibility of a future ParticleSystem
   * that listens to onYellowGasChanged().
   */
  public setYellowGasIntensity(intensity: number): void {
    const prev = this._yellowGasIntensity;
    this._yellowGasIntensity = clamp(intensity, 0, 1);
    if (Math.abs(prev - this._yellowGasIntensity) > 0.001) {
      this.emitYellowGasChanged();
    }
  }

  public get yellowGasIntensity(): number { return this._yellowGasIntensity; }

  public onYellowGasChanged(listener: YellowGasChangedListener): () => void {
    this.yellowGasListeners.add(listener);
    return () => this.yellowGasListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Public API: zone override
  // ---------------------------------------------------------------------------

  /**
   * Zone overrides let specific world regions force atmosphere state.
   * E.g. indoors: lower fog + no wind. Yellow gas zone: spike gas + static.
   * Call clearZoneOverride() when player exits the zone.
   */
  public setZoneOverride(override: {
    fogDensityMultiplier?: number;
    fogColor?: THREE.Color;
    windStrengthOverride?: number;
    radioStaticOverride?: number;
    yellowGasIntensity?: number;
  }): void {
    this.zoneOverride = { ...override };
  }

  public clearZoneOverride(): void {
    this.zoneOverride = null;
  }

  // ---------------------------------------------------------------------------
  // Public API: state snapshot
  // ---------------------------------------------------------------------------

  public getAtmosphereState(): AtmosphereState {
    return {
      timeNormalized: this.timeNormalized,
      fog: this.getFogState(),
      light: {
        ambientIntensity: this.lightingSystem.ambientLight.intensity,
        moonlightIntensity: this.lightingSystem.moonLight.intensity
      },
      windStrength: this.windStrength,
      radioStaticIntensity: this.radioStaticIntensity,
      isRaining: this._isRaining,
      rainIntensity: this._rainIntensity,
      yellowGasIntensity: this._yellowGasIntensity
    };
  }

  public restoreAtmosphereState(state: AtmosphereState): void {
    this.setTimeNormalized(state.timeNormalized);
    this._isRaining = state.isRaining;
    this._rainIntensity = state.rainIntensity;
    this._yellowGasIntensity = state.yellowGasIntensity;
    this.applyAll();
  }

  // ---------------------------------------------------------------------------
  // Event emitters
  // ---------------------------------------------------------------------------

  private emitWindEvent(): void {
    for (const l of this.windListeners) l(this.windStrength);
  }

  private emitRadioStaticEvent(): void {
    for (const l of this.radioStaticListeners) l(this.radioStaticIntensity);
  }

  private emitDistantSoundEvent(): void {
    // At night / high static: bias toward tone and static_burst (ARG feel)
    const hour = this.timeNormalized * 24;
    const isNight = hour < 6 || hour > 20;
    const hasGas = this._yellowGasIntensity > 0.2;

    let pool: DistantSoundType[];
    if (hasGas) {
      pool = ['rumble', 'creak', 'static_burst', 'static_burst', 'tone'];
    } else if (isNight) {
      pool = ['rumble', 'creak', 'tone', 'wind_gust', 'static_burst'];
    } else {
      pool = ['creak', 'wind_gust', 'rumble'];
    }

    const type = pool[Math.floor(Math.random() * pool.length)];
    const volume = lerp(0.1, 0.5, Math.random());

    for (const l of this.distantSoundListeners) l(type, volume);
  }

  private emitRainStateChanged(): void {
    for (const l of this.rainStateListeners) l(this._isRaining, this._rainIntensity);
  }

  private emitYellowGasChanged(): void {
    for (const l of this.yellowGasListeners) l(this._yellowGasIntensity);
  }

  private emitTimeChanged(): void {
    for (const l of this.timeChangedListeners) l(this.timeNormalized, this.getTimeOfDay());
  }

  public onTimeChanged(listener: TimeChangedListener): () => void {
    this.timeChangedListeners.add(listener);
    return () => this.timeChangedListeners.delete(listener);
  }
}
