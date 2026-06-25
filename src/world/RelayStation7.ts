import * as THREE from 'three';
import { Interactable } from './Interactable';
import { InteractionSystem } from '../systems/InteractionSystem';
import { DiscoverySystem } from '../systems/DiscoverySystem';
import { WorldAssetLoader } from './WorldAssetLoader';

/**
 * RelayStation7
 * -------------
 * First real location in DRIFTER. Structures are spawned through
 * WorldAssetLoader (relay_tower, radio_terminal, maintenance_shed,
 * observation_deck, antenna_array, vehicle_wreck) — real GLB models if
 * present in AssetRegistry/public/assets/models, magenta placeholder
 * geometry otherwise via WorldAssetLoader's built-in fallback. Three
 * interactables surface discoveries that subtly reference the same
 * unexplained signal, location, and date (2032.04.13 — two days after
 * Bangladesh enters lockdown per series canon). The player finds them
 * organically by exploring; the connection emerges when they open the
 * Logbook and read all three.
 *
 * Returns a { root } object whose root Group is added to the scene by main.ts.
 * All interactables are registered into the passed InteractionSystem.
 * All discoveries are registered into the passed DiscoverySystem.
 *
 * Usage (matches main.ts):
 *   const loader = new WorldAssetLoader(game.assets);
 *   const relayStation7 = await buildRelayStation7(interactionSystem, discoverySystem, loader);
 *   game.sceneManager.add(relayStation7.root);
 *
 * Layout — spatial logic, not arbitrary placement:
 *   The relay tower sits at the absolute center — it's the tallest, most
 *   visible object in the region and the landmark every other structure
 *   orients around, matching how an actual relay station would be built
 *   (everything exists to service the tower).
 *
 *   (0, 0, 0)        — Relay tower (central landmark, dominates the skyline)
 *   (-10, 0, -8)      — Radio terminal building (the building that talks
 *                        to the tower — placed near it, not isolated)
 *   (-14, 0, -8)      — Antenna array (auxiliary equipment, clustered
 *                        right beside the terminal — these two belong
 *                        together functionally)
 *   (-10, 0, -16)     — Maintenance shed (utility building, tucked just
 *                        behind/beside the terminal cluster)
 *   (14, 0, -6)       — Observation deck (opposite side from the terminal
 *                        cluster, open sightline back across to the tower)
 *   (6, 0, 10)        — Vehicle wreck (near the spawn/access side — implies
 *                        this is how someone arrived, not placed at random)
 *
 * Recommended player spawn: (0, 0, 22) — south of the tower, facing the
 * station, with an unobstructed establishing view of the tower on the
 * very first frame. Set in main.ts, not here; RelayStation7 only builds
 * the region, it doesn't place the player. See main.ts for the actual
 * spawn call.
 *
 * Discovery order — encouraged by distance, not gated by code:
 *   Photo (closest to spawn, ~9 units) is the natural first find — it
 *   requires zero context to mean something, so it works regardless of
 *   which direction the player wanders first.
 *   Broadcast (~29 units, at the terminal cluster) is the natural second
 *   find — reaching it means the player has crossed toward the station's
 *   main structures.
 *   Survey Note (~40 units, tucked by the shed past the terminal cluster)
 *   is the natural last find — it's the farthest point in the region and
 *   sits behind the structures a player would investigate on the way.
 *   No code enforces this order; a player can still find them in any
 *   sequence by choice, but distance alone makes Photo → Broadcast → Note
 *   the path of least resistance.
 *
 * Interactables:
 *   Radio terminal (−10, *, −5.5), radius 3  → Broadcast: unidentified signal
 *   Survey note    (−9, 0, −17),  radius 2  → Note: field team's account
 *   Damaged photo  (4, 0, 14),    radius 2  → Photo: station before the event
 *   Region exit    (−9, 0, −24),  radius 2.5 → Leads to Region 02 (Service Road)
 */

const REGION_ID   = 'RS7';
const EVENT_DATE  = '2032.04.13';

export interface RelayStation7Instance {
  root: THREE.Group;
}

export async function buildRelayStation7(
  interactionSystem: InteractionSystem,
  discoverySystem: DiscoverySystem,
  loader: WorldAssetLoader,
  onLeaveRegion: () => void
): Promise<RelayStation7Instance> {
  const root = new THREE.Group();
  root.name = 'RelayStation7';

  buildGround(root);

  const spawns = await Promise.all([
    loader.spawn('relay_tower', { position: new THREE.Vector3(0, 0, 0), regionId: REGION_ID }),
    loader.spawn('radio_terminal', { position: new THREE.Vector3(-10, 0, -8), regionId: REGION_ID }),
    loader.spawn('antenna_array', { position: new THREE.Vector3(-14, 0, -8), regionId: REGION_ID }),
    loader.spawn('maintenance_shed', { position: new THREE.Vector3(-10, 0, -16), regionId: REGION_ID }),
    loader.spawn('observation_deck', { position: new THREE.Vector3(14, 0, -6), regionId: REGION_ID }),
    loader.spawn('vehicle_wreck', { position: new THREE.Vector3(6, -0.5, 10), regionId: REGION_ID }),

    // --- Environmental storytelling props ---
    // Existing, already-registered asset IDs (AssetRegistry) that were
    // previously unused because nothing called spawn() for them. Placed
    // here purely for scene dressing — no new gameplay, no new systems,
    // same pipeline as every structure above.

    // Fence: a longer perimeter run along the access side, with a
    // deliberate gap at x=9 — a missing/broken segment reads as breach
    // or neglect, which does more storytelling work than an intact line.
    loader.spawn('fence', { position: new THREE.Vector3(-1, 0, 14), regionId: REGION_ID }),
    loader.spawn('fence', { position: new THREE.Vector3(1, 0, 14), regionId: REGION_ID }),
    loader.spawn('fence', { position: new THREE.Vector3(3, 0, 14), regionId: REGION_ID }),
    loader.spawn('fence', { position: new THREE.Vector3(5, 0, 14), regionId: REGION_ID }),
    loader.spawn('fence', { position: new THREE.Vector3(7, 0, 14), regionId: REGION_ID }),
    // (gap at x=9 — deliberately no fence segment here)
    loader.spawn('fence', { position: new THREE.Vector3(11, 0, 14), regionId: REGION_ID }),
    loader.spawn('fence', { position: new THREE.Vector3(13, 0, 14), regionId: REGION_ID }),

    // Crates: dropped near the maintenance shed — the kind of supply
    // clutter a station crew would leave behind, never put away.
    loader.spawn('crate', { position: new THREE.Vector3(-12, 0, -17), regionId: REGION_ID }),
    loader.spawn('crate', { position: new THREE.Vector3(-11.3, 0, -17.6), regionId: REGION_ID }),
    loader.spawn('crate', { position: new THREE.Vector3(-12.6, 0, -16.3), regionId: REGION_ID }),

    // Crates near the wreck: a second, smaller cluster implying cargo
    // that came out of the vehicle, not a tidy storage pile — a
    // different story than the shed's stacked crates.
    loader.spawn('crate', { position: new THREE.Vector3(7.5, 0, 9), regionId: REGION_ID }),
    loader.spawn('crate', { position: new THREE.Vector3(8.2, 0, 10.5), regionId: REGION_ID }),

    // Warning signs: one at the tower base (mundane until you already
    // suspect something happened here), one at the fence gap (echoes
    // the tower sign, quietly implies the gap itself was a known hazard).
    loader.spawn('warning_sign', { position: new THREE.Vector3(2.5, 0, 2), regionId: REGION_ID }),
    loader.spawn('warning_sign', { position: new THREE.Vector3(9, 0, 12), regionId: REGION_ID })
  ]);

  for (const result of spawns) {
    root.add(result.object);
  }

  buildPlaceholderProps(root);

  createRadioTerminal(root, interactionSystem, discoverySystem);
  createSurveyNote(root, interactionSystem, discoverySystem);
  createDamagedPhoto(root, interactionSystem, discoverySystem);
  createRegionExit(root, interactionSystem, onLeaveRegion);

  return { root };
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function buildGround(root: THREE.Group): void {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x4a5a5a, roughness: 0.85, metalness: 0 })
  );
  mesh.name = 'Ground';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  root.add(mesh);

  // Subtle ground-crack lines for scale and atmosphere
  for (let i = -4; i <= 4; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(i * 10, 0.01, -40),
      new THREE.Vector3(i * 10, 0.01,  40)
    ]);
    root.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3a4a4a, transparent: true, opacity: 0.3 })));
  }
}

/**
 * Hand-built primitive dressing for shapes not yet covered by
 * AssetRegistry (desk, chair, generator, barrels, cable run, wreck
 * debris). Same placeholder philosophy as buildGround()'s crack lines —
 * simple geometry standing in until real GLB models (e.g. from Retro
 * Urban Kit) are sourced and registered. Swapping these for real models
 * later only requires registering new AssetIds and replacing the calls
 * below with loader.spawn() — no structural change to this function's
 * callers.
 *
 * This is purely environmental storytelling, per the design plan:
 *   - Desk + chair at the radio terminal: the operator's workspace,
 *     placed exactly where the broadcast discovery already lives. The
 *     chair is angled as if pushed back suddenly — the one deliberate
 *     "something happened here" beat in the whole station.
 *   - Generator + barrels by the shed: implies the station ran on
 *     backup power, reinforces the utility area's purpose.
 *   - Cable run between the terminal and antenna array: visually
 *     connects two objects that were previously just placed near each
 *     other with nothing implying they were wired together.
 *   - Debris near the vehicle wreck: turns a static prop into a second,
 *     smaller "something happened here too" beat near the access route.
 */
function buildPlaceholderProps(root: THREE.Group): void {
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.6, metalness: 0.5 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 0.85 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x6a3a28, roughness: 0.8, metalness: 0.3 });
  const cableMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });

  // --- Desk + chair, at the radio terminal (same spot as the broadcast
  //     discovery anchor, -10, *, -5.5) ---
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.6), woodMat);
  desk.position.set(-10, 0.4, -6.3);
  desk.castShadow = true;
  desk.receiveShadow = true;
  root.add(desk);

  const chair = new THREE.Group();
  chair.name = 'OperatorChair';
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), metalMat);
  chairSeat.position.y = 0.45;
  chair.add(chairSeat);
  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.06), metalMat);
  chairBack.position.set(0, 0.7, -0.2);
  chair.add(chairBack);
  // Pushed back and rotated, not tucked under the desk — the rupture beat.
  chair.position.set(-10, 0, -7.1);
  chair.rotation.y = 0.5;
  chair.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; } });
  root.add(chair);

  // --- Generator + barrels, beside the maintenance shed (-10, *, -16) ---
  const generator = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.8), rustMat);
  generator.position.set(-8.5, 0.45, -16.5);
  generator.castShadow = true;
  generator.receiveShadow = true;
  root.add(generator);

  const barrelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.85, 12);
  for (const [bx, bz] of [[-9, -17.6], [-8.4, -17.8]] as const) {
    const barrel = new THREE.Mesh(barrelGeo, rustMat);
    barrel.position.set(bx, 0.425, bz);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    root.add(barrel);
  }

  // --- Cable run between the radio terminal (-10,-8) and antenna array
  //     (-14,-8) — visually links two functionally-paired objects that
  //     would otherwise just be sitting near each other. ---
  const cableGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-10.5, 0.1, -8),
    new THREE.Vector3(-12, 0.4, -8.3),
    new THREE.Vector3(-13.5, 0.1, -8)
  ]);
  root.add(new THREE.Line(cableGeo, cableMat));

  // --- Debris near the vehicle wreck (6, -0.5, 10) — a second, smaller
  //     "something happened here too" beat, distinct from the desk/chair. ---
  const debrisGeo = new THREE.BoxGeometry(0.3, 0.15, 0.5);
  for (const [dx, dz, ry] of [[7, 9.2, 0.3], [5.2, 10.8, -0.6], [6.5, 11.5, 1.1]] as const) {
    const debris = new THREE.Mesh(debrisGeo, metalMat);
    debris.position.set(dx, 0.08, dz);
    debris.rotation.y = ry;
    debris.castShadow = true;
    debris.receiveShadow = true;
    root.add(debris);
  }
}

// ---------------------------------------------------------------------------
// Interactables
// ---------------------------------------------------------------------------

/**
 * Radio Terminal
 * Discovery: WNCORE broadcast about an unidentified signal
 * Location: front face of the radio terminal building (−8, *, 5)
 */
function createRadioTerminal(
  root: THREE.Group,
  interactionSystem: InteractionSystem,
  discoverySystem: DiscoverySystem
): void {
  // Anchor sits at the building's front door — player walks up to building
  const anchor = new THREE.Object3D();
  anchor.name = 'RadioTerminal_Anchor';
  anchor.position.set(-10, 1.5, -5.5);
  root.add(anchor);

  interactionSystem.register(
    new Interactable({
      object3D: anchor,
      label: 'Radio Terminal',
      radius: 3,
      kind: 'terminal',
      onInteract: () => {
        discoverySystem.register({
          id: 'RS7-BC-001',
          title: 'WNCORE Broadcast #001',
          type: 'broadcast',
          content: [
            'SIGNAL ANOMALY DETECTED',
            '',
            `Date: ${EVENT_DATE}`,
            'Frequency: 88.7 FM',
            'Source: WNCORE Network — Regional Relay',
            '',
            '[TRANSMISSION LOG — PARTIAL RECOVERY]',
            '',
            'An unidentified signal was recorded at this location two days',
            'after the regional lockdown order. It did not originate from',
            'any registered station and could not be traced to a known source.',
            '',
            'Listeners reported the signal arriving on multiple frequencies',
            'at once — something WNCORE engineers say should not be possible',
            'without coordinated equipment, which this station did not have.',
            '',
            'Broadcasting from this relay ceased shortly after. WNCORE has',
            'not been able to re-establish contact with Relay Station 7 since.',
            '',
            '[END TRANSMISSION]'
          ].join('\n'),
          regionId: REGION_ID
        });
      }
    })
  );
}

/**
 * Survey Note
 * Discovery: Field team's account of arriving at the abandoned station
 * Location: open ground between buildings (2, 0, 3) — visible as a small paper object
 */
function createSurveyNote(
  root: THREE.Group,
  interactionSystem: InteractionSystem,
  discoverySystem: DiscoverySystem
): void {
  // Visible object: weathered paper on the ground, slightly rotated
  const noteVisual = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.04, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xd5d2a8, roughness: 0.9, emissive: 0x2a2a1a, emissiveIntensity: 0.15 })
  );
  noteVisual.name = 'SurveyNote_Visual';
  noteVisual.position.set(-9, 0.05, -17);
  noteVisual.rotation.y = 0.4;
  noteVisual.receiveShadow = true;
  root.add(noteVisual);

  // Interaction anchor at same position, slightly raised for range calculation
  const anchor = new THREE.Object3D();
  anchor.name = 'SurveyNote_Anchor';
  anchor.position.set(-9, 0.5, -17);
  root.add(anchor);

  interactionSystem.register(
    new Interactable({
      object3D: anchor,
      label: 'Survey Note',
      radius: 2,
      kind: 'note',
      onInteract: () => {
        discoverySystem.register({
          id: 'RS7-NOTE-001',
          title: 'Field Survey #001',
          type: 'note',
          content: [
            'RELAY STATION 7 — FIELD OBSERVATION',
            '',
            `Date: ${EVENT_DATE}`,
            'Location: RS7',
            'Recorded by: Field Team Delta',
            '',
            'Two days into lockdown and the roads are already quiet. We came',
            'to check on the relay station after losing contact with the',
            'operator.',
            '',
            'Found the equipment running but nobody here. No signs of a',
            'struggle. The receiver was mid-transmission when we arrived —',
            'just open static, looping, like it had been left recording',
            'without anyone there to send anything.',
            '',
            'Three of us heard something underneath the static. Not words.',
            'None of us agree on what it sounded like. One of the team said',
            'it felt like the air "pressed in" for a second, then let go.',
            '',
            'We\'re noting it here in case another team passes through. If',
            'WNCORE asks, tell them the equipment\'s fine. We don\'t know',
            'what isn\'t.'
          ].join('\n'),
          regionId: REGION_ID
        });
      }
    })
  );
}

/**
 * Damaged Photo
 * Discovery: Photograph of the station from before the event
 * Location: outside maintenance shed (5, 0, −10) — visible as a small photograph object
 */
function createDamagedPhoto(
  root: THREE.Group,
  interactionSystem: InteractionSystem,
  discoverySystem: DiscoverySystem
): void {
  // Visible object: faded photograph lying face-up near the shed
  const photoVisual = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.04, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.95, emissive: 0x1a1a0a, emissiveIntensity: 0.1 })
  );
  photoVisual.name = 'DamagedPhoto_Visual';
  photoVisual.position.set(4, 0.05, 14);
  photoVisual.rotation.y = -0.6;
  photoVisual.receiveShadow = true;
  root.add(photoVisual);

  // Interaction anchor
  const anchor = new THREE.Object3D();
  anchor.name = 'DamagedPhoto_Anchor';
  anchor.position.set(4, 0.5, 14);
  root.add(anchor);

  interactionSystem.register(
    new Interactable({
      object3D: anchor,
      label: 'Damaged Photo',
      radius: 2,
      kind: 'photo',
      onInteract: () => {
        discoverySystem.register({
          id: 'RS7-PHOTO-001',
          title: 'Station Archive Photo',
          type: 'photo',
          content: [
            '[PHOTOGRAPH — WATER DAMAGED]',
            '',
            'Found near the access road, half-buried, partially decomposed.',
            '',
            'The image shows Relay Station 7 from the access road, taken in',
            'daylight — the sky in the photo is still ordinary, grey-overcast,',
            'nothing wrong with it yet.',
            '',
            'Someone has written on the back in pencil, smudged but legible:',
            '',
            '"Before. So we remember it wasn\'t always like this."',
            '',
            'No name. No further date than what\'s already known from the',
            `station log — this was taken before the ${EVENT_DATE.slice(-2)}th.`
          ].join('\n'),
          regionId: REGION_ID
        });
      }
    })
  );
}

/**
 * Region Exit
 * Leads out of RS7 toward Region 02 (Service Road). Placed past the
 * survey note — the furthest existing point in the station — so
 * reaching it naturally follows "I've found everything here" rather
 * than competing with or gating the three discoveries. No popup, no
 * prompt text beyond the existing Interactable label; the road simply
 * continues from where the station's fence and ground scaffold end.
 *
 * onLeave is provided by main.ts and is responsible for the actual
 * region swap (tear down RS7's root, build Region 02, reposition the
 * player, notify SaveManager) — this function only registers the
 * trigger, it does not perform the transition itself.
 */
function createRegionExit(
  root: THREE.Group,
  interactionSystem: InteractionSystem,
  onLeave: () => void
): void {
  const anchor = new THREE.Object3D();
  anchor.name = 'RegionExit_Anchor';
  anchor.position.set(-9, 0.5, -24);
  root.add(anchor);

  interactionSystem.register(
    new Interactable({
      object3D: anchor,
      label: 'Service Road',
      radius: 2.5,
      kind: 'generic',
      onInteract: () => {
        onLeave();
      }
    })
  );
}
