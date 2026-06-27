import * as THREE from 'three';
import { Game } from './core/Game';
import { InputManager } from './player/InputManager';
import { Player } from './player/Player';
import { PlayerController } from './player/PlayerController';
import { createPlaceholderSpriteSheet } from './player/PlaceholderSprites';
import { InteractionSystem } from './systems/InteractionSystem';
import { DiscoverySystem } from './systems/DiscoverySystem';
import { LogbookSystem } from './systems/LogbookSystem';
import { AtmosphereSystem } from './systems/AtmosphereSystem';
import { SkySystem } from './systems/SkySystem';
import { RadioSystem } from './systems/RadioSystem';
import { CollisionSystem } from './systems/CollisionSystem';
import { SaveManager } from './managers/SaveManager';
import { LogbookUI } from './ui/LogbookUI';
import { RadioNotificationPopup } from './ui/RadioNotificationPopup';
import { BroadcastArchive } from './ui/BroadcastArchive';
import { WorldAssetLoader } from './world/WorldAssetLoader';
import { buildRelayStation7 } from './world/RelayStation7';
import { buildServiceRoad } from './world/ServiceRoad';

/**
 * main.ts
 * -------
 * Bootstraps the game: finds the mount point, constructs Game, spawns
 * the local Player entity, attaches a PlayerController to drive it from
 * keyboard input, registers the controller into the update loop, sets
 * the player as the CameraController's follow target, wires up
 * InteractionSystem + DiscoverySystem + LogbookSystem/UI, and builds
 * Relay Station 7 — the first real location in the game.
 *
 * This is the first vertical slice of actual DRIFTER gameplay:
 *   spawn → walk → find a discovery → it appears in the Logbook → find
 *   another discovery that references the same event → realize the
 *   connection. Everything before this point was infrastructure with no
 *   content sitting on top of it.
 *
 * The ground plane below is a temporary verification scaffold — real
 * terrain/region content will replace it once the world/terrain system
 * exists. Relay Station 7 itself is real content, not a placeholder.
 */

const container = document.getElementById('app');

if (!container) {
  throw new Error('main.ts: could not find #app container element in index.html');
}

const game = new Game(container);

// --- Temporary ground scaffold (remove once terrain system exists) ---
const groundGeometry = new THREE.PlaneGeometry(60, 60);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x10151c });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
game.sceneManager.add(ground);
// --- End temporary ground scaffold ---

const localPlayer = new Player({ id: 'local-drifter', isLocallyControlled: true });
// Spawn south of the relay tower, facing the station, with a clear
// establishing view of the tower on the very first frame and the
// nearest discovery (photo) close by — see RelayStation7.ts's layout
// doc comment for the full spatial design. Without this, Player
// defaults to (0,0,0), which is also the relay tower's base position.
// A save file (if one exists) overrides this via saveManager.load()
// further down.
localPlayer.position.set(0, 0, 22);
game.sceneManager.add(localPlayer.object3D);

// Temporary placeholder sprite sheet — delete this call (and
// PlaceholderSprites.ts) once real pixel art for the Drifter exists.
// Verifies the 8-direction facing + walk-cycle system visually.
localPlayer.setSpriteSheet(createPlaceholderSpriteSheet());

const input = new InputManager();
const collisionSystem = new CollisionSystem();
const playerController = new PlayerController(localPlayer, input, game.cameraController, collisionSystem);
game.registerSystem(playerController);

game.cameraController.setTarget(localPlayer.object3D);
// 30-unit radius covers RS7's layout (max structure radius ~22 units
// from the tower) with margin.
game.lightingSystem.configureShadowBounds(30);

// --- Sky system ---
// Static crimson/smoke sky dome with faint stars and a dim, blood-toned
// moon — see SkySystem.ts for full lore rationale. Not yet wired to
// AtmosphereSystem's day/night cycle; that's a deliberate future step.
const skySystem = new SkySystem(game.sceneManager.scene, game.assets);
skySystem.setFollowTarget(localPlayer.object3D);
game.registerSystem(skySystem);

// --- Interaction system ---
const interactionSystem = new InteractionSystem({
  container,
  subjectPosition: localPlayer.position,
  subjectPlayerId: localPlayer.id
});
game.registerSystem(interactionSystem);

// --- Discovery system ---
const discoverySystem = new DiscoverySystem();

// --- Logbook system + UI ---
const logbookSystem = new LogbookSystem(discoverySystem);
const logbookUI = new LogbookUI(logbookSystem, container);
void logbookUI; // retained for its side effects (DOM mount); no further calls needed here

// --- Atmosphere system ---
// Starts at dusk (18:00), auto-advances time. Fog, ambient, and
// directional light shift across a 10-minute day cycle.
const atmosphereSystem = new AtmosphereSystem(
  game.sceneManager,
  game.lightingSystem,
  { initialTimeHour: 18, autoAdvanceTime: true, secondsPerDay: 600 } // dusk; 10 min/day
);
game.registerSystem(atmosphereSystem);

// --- Radio system + UI ---
// Listens to DiscoverySystem for broadcasts; popup and archive react to it.
const radioSystem = new RadioSystem(discoverySystem);
const radioPopup = new RadioNotificationPopup(radioSystem, {
  container,
  autoDismissMs: 6000,
  onExpand: () => broadcastArchive.open()
});
void radioPopup; // retained for its side effects
const broadcastArchive = new BroadcastArchive(discoverySystem, radioSystem, { container });
void broadcastArchive; // retained for its side effects

// --- Save system ---
// Load first (restores discoveries + player position if a save exists),
// then start autosave so progress is captured every 30s + on discovery.
const saveManager = new SaveManager(discoverySystem, radioSystem, localPlayer);
saveManager.load(); // no-op if no save exists yet
saveManager.startAutosave(30_000);
void saveManager; // retained; no further direct calls needed in main

// --- Relay Station 7: the first real location ---
const worldAssetLoader = new WorldAssetLoader(game.assets);

/**
 * Transition from RS7 to Region 02 (Service Road). Called by RS7's
 * region-exit Interactable. Tears down RS7's root, releases its
 * cached assets, builds Region 02, repositions the player at its
 * arrival point, and notifies SaveManager so the save file tracks
 * the new region. One-directional for now — no return trip exists
 * yet, matching the current milestone's scope.
 */
async function leaveRelayStation7ForServiceRoad(): Promise<void> {
  game.sceneManager.remove(relayStation7.root);
  worldAssetLoader.releaseRegion('RS7');
  collisionSystem.clear(); // Clear all RS7 colliders before building new region

  const serviceRoad = await buildServiceRoad(interactionSystem, discoverySystem, worldAssetLoader, collisionSystem);
  game.sceneManager.add(serviceRoad.root);

  // Arrival point: south end of the road, facing the checkpoint —
  // same establishing-view approach used for RS7's own spawn.
  localPlayer.position.set(0, 0, 12);

  saveManager.notifyRegionChange('SVC_ROAD');
}

const relayStation7 = await buildRelayStation7(
  interactionSystem,
  discoverySystem,
  worldAssetLoader,
  () => { void leaveRelayStation7ForServiceRoad(); },
  collisionSystem
);
game.sceneManager.add(relayStation7.root);

game.start();
