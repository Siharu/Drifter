import * as THREE from 'three';
import { Interactable } from './Interactable';
import { InteractionSystem } from '../systems/InteractionSystem';
import { DiscoverySystem } from '../systems/DiscoverySystem';

/**
 * RelayStation7
 * -------------
 * First real location in DRIFTER. Built entirely from primitive geometry —
 * no external assets. Three interactables surface discoveries that subtly
 * reference the same mysterious event, date, and callsign. The player finds
 * them organically by exploring; the connection emerges when they open the
 * Logbook and read all three.
 *
 * Returns a { root } object whose root Group is added to the scene by main.ts.
 * All interactables are registered into the passed InteractionSystem.
 * All discoveries are registered into the passed DiscoverySystem.
 *
 * Usage (matches main.ts):
 *   const relayStation7 = buildRelayStation7(interactionSystem, discoverySystem);
 *   game.sceneManager.add(relayStation7.root);
 *
 * Layout (top-down, all positions relative to root):
 *   (0, 0, 0)     — Relay tower base (central landmark)
 *   (-8, 0, 5)    — Radio terminal building
 *   (8, 0, -5)    — Observation deck
 *   (4, 0, -10)   — Maintenance shed
 *   (-6, 0, -8)   — Antenna array
 *   (-4, 0, 2)    — Broken vehicle
 *
 * Interactables:
 *   Radio terminal (−8, *, 5), radius 3   → Broadcast: KESTREL-9 anomaly
 *   Survey note   (2, 0, 3),  radius 2   → Note: field observation same event
 *   Damaged photo (5, 0, −10), radius 2  → Photo: image taken 1hr before anomaly
 */

const REGION_ID   = 'RS7';
const EVENT_DATE  = '2024.01.15';
const CALLSIGN    = 'KESTREL-9';

export interface RelayStation7Instance {
  root: THREE.Group;
}

export function buildRelayStation7(
  interactionSystem: InteractionSystem,
  discoverySystem: DiscoverySystem
): RelayStation7Instance {
  const root = new THREE.Group();
  root.name = 'RelayStation7';

  buildGround(root);
  buildRelayTower(root);
  buildObservationDeck(root);
  buildRadioTerminalBuilding(root);
  buildMaintenanceShed(root);
  buildAntennaArray(root);
  buildBrokenVehicle(root);

  createRadioTerminal(root, interactionSystem, discoverySystem);
  createSurveyNote(root, interactionSystem, discoverySystem);
  createDamagedPhoto(root, interactionSystem, discoverySystem);

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

function buildRelayTower(root: THREE.Group): void {
  const group = new THREE.Group();
  group.name = 'RelayTower';

  // Base ring
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.8, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.7 })
  );
  base.position.y = 0.25;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Main shaft
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0x6a7a8a, metalness: 0.6, roughness: 0.4 })
  );
  shaft.position.y = 10;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  // Top cap (where the anomaly photo shows overexposure — subtle lore tie)
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 16, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a9aaa, metalness: 0.7, roughness: 0.3 })
  );
  cap.position.y = 20;
  cap.castShadow = true;
  group.add(cap);

  // Red warning strut
  const strut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3333 })
  );
  strut.position.set(1.2, 18, 0);
  strut.rotation.z = Math.PI / 4;
  strut.castShadow = true;
  group.add(strut);

  root.add(group);
}

function buildObservationDeck(root: THREE.Group): void {
  const group = new THREE.Group();
  group.name = 'ObservationDeck';
  group.position.set(8, 0, -5);

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.8 })
  );
  platform.position.y = 3;
  platform.castShadow = true;
  platform.receiveShadow = true;
  group.add(platform);

  // Stairs (three flat steps)
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.3, 1),
      new THREE.MeshStandardMaterial({ color: 0x4a5a6a })
    );
    step.position.y = (i + 1) * 0.8;
    step.position.z = -2 + i;
    step.receiveShadow = true;
    group.add(step);
  }

  // Railing posts
  for (let i = 0; i < 4; i++) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.2, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x3a4a5a })
    );
    post.position.set(-1.8 + i * 1.2, 3.8, 0);
    group.add(post);
  }

  root.add(group);
}

function buildRadioTerminalBuilding(root: THREE.Group): void {
  const group = new THREE.Group();
  group.name = 'RadioTerminalBuilding';
  group.position.set(-8, 0, 5);

  // Walls
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(3, 3, 2),
    new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.8 })
  );
  walls.position.y = 1.5;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // Pyramidal roof
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 1, 4),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 })
  );
  roof.position.y = 3.2;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  // Dark door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.8, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x2a1a1a })
  );
  door.position.set(0, 1.2, 1.05);
  group.add(door);

  // Faintly glowing window (emissive to read as lit-from-within)
  const win = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1a3a4a, emissive: 0x0a4a5a, emissiveIntensity: 0.5 })
  );
  win.position.set(-1.2, 2.2, 1.05);
  group.add(win);

  // Roof antenna
  const ant = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 2, 8),
    new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8 })
  );
  ant.position.set(0, 4.2, 0);
  ant.castShadow = true;
  group.add(ant);

  root.add(group);
}

function buildMaintenanceShed(root: THREE.Group): void {
  const group = new THREE.Group();
  group.name = 'MaintenanceShed';
  group.position.set(4, 0, -10);

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x3a4a52, roughness: 0.9 })
  );
  walls.position.y = 1;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 0.8, 4),
    new THREE.MeshStandardMaterial({ color: 0x2a3a42, roughness: 0.85 })
  );
  roof.position.y = 2.2;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.6, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x2a1a1a })
  );
  door.position.set(0, 1, 0.95);
  group.add(door);

  root.add(group);
}

function buildAntennaArray(root: THREE.Group): void {
  const group = new THREE.Group();
  group.name = 'AntennaArray';
  group.position.set(-6, 0, -8);

  const mat = new THREE.MeshStandardMaterial({ color: 0x7a8a9a, metalness: 0.7 });

  for (let i = 0; i < 3; i++) {
    const el = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), mat);
    el.position.set((i - 1) * 1.5, 2, 0);
    // Slight lean — each was straight once
    el.rotation.z = (i - 1) * 0.08;
    el.castShadow = true;
    group.add(el);
  }

  root.add(group);
}

function buildBrokenVehicle(root: THREE.Group): void {
  const group = new THREE.Group();
  group.name = 'BrokenVehicle';
  group.position.set(-4, -0.5, 2);

  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.9, 2.8),
    new THREE.MeshStandardMaterial({ color: 0x4a5a5a, roughness: 0.8 })
  );
  hull.position.y = 0.45;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4 });
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16);

  for (let i = 0; i < 2; i++) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(-0.7 + i * 1.4, 0.35, -0.8);
    w.rotation.z = Math.PI / 2;
    w.castShadow = true;
    group.add(w);
  }

  const windshield = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x3a3a4a, side: THREE.DoubleSide, metalness: 0.3 })
  );
  windshield.position.set(0, 1.05, -1.3);
  windshield.rotation.x = 0.3;
  group.add(windshield);

  root.add(group);
}

// ---------------------------------------------------------------------------
// Interactables
// ---------------------------------------------------------------------------

/**
 * Radio Terminal
 * Discovery: Broadcast about KESTREL-9 signal anomaly
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
  anchor.position.set(-8, 1.5, 6.5);
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
            `Callsign: ${CALLSIGN}`,
            '',
            '[TRANSMISSION LOG — PARTIAL RECOVERY]',
            '',
            'An unexplained signal anomaly was recorded at this location.',
            `The callsign "${CALLSIGN}" appeared in the transmission log`,
            'moments before the anomaly propagated across all monitoring',
            'equipment simultaneously.',
            '',
            'Signal characteristics did not match any known source.',
            'Broadcasting ceased at 14:37 UTC.',
            '',
            'All attempts to re-establish contact have failed.',
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
 * Discovery: Ground-level field observation of the same event
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
  noteVisual.position.set(2, 0.05, 3);
  noteVisual.rotation.y = 0.4;
  noteVisual.receiveShadow = true;
  root.add(noteVisual);

  // Interaction anchor at same position, slightly raised for range calculation
  const anchor = new THREE.Object3D();
  anchor.name = 'SurveyNote_Anchor';
  anchor.position.set(2, 0.5, 3);
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
            'At approximately 14:30 UTC all personnel at this location reported',
            'simultaneous radio interference across all frequencies. The interference',
            `was preceded by a distinctive pattern identified as callsign "${CALLSIGN}"`,
            'embedded in the static.',
            '',
            'The signal did not match any known source. It appeared to originate',
            'from multiple directions simultaneously.',
            '',
            'Three team members reported brief disorientation. One described the',
            'signal as feeling "wrong" — their words, not a technical observation.',
            '',
            'By 14:37 UTC the signal ceased entirely. No equipment damage recorded.',
            'All attempts to log or analyze the signal after the fact have failed.',
            '',
            'Phenomenon remains unexplained.'
          ].join('\n'),
          regionId: REGION_ID
        });
      }
    })
  );
}

/**
 * Damaged Photo
 * Discovery: Photograph of the station taken one hour before the anomaly
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
  photoVisual.position.set(5, 0.05, -10);
  photoVisual.rotation.y = -0.6;
  photoVisual.receiveShadow = true;
  root.add(photoVisual);

  // Interaction anchor
  const anchor = new THREE.Object3D();
  anchor.name = 'DamagedPhoto_Anchor';
  anchor.position.set(5, 0.5, -10);
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
            `[PHOTOGRAPH — ARCHIVE ${EVENT_DATE}]`,
            '',
            'Relay Station 7. Taken approximately 13:45 UTC.',
            '',
            'The station appears to be in normal operational state. The relay',
            'tower is clearly visible. All structures intact.',
            '',
            'Noted: the photograph is slightly overexposed in the center, as if',
            'the light source above the tower was brighter than it should be.',
            'Overexposure is centered directly above the relay tower.',
            '',
            'This photograph was taken less than one hour before the signal anomaly.',
            '',
            '[CONDITION: FADED. WATER DAMAGE. EMULSION DECAY.]',
            '',
            'The center of the image has deteriorated significantly — as if',
            'exposed to an intense light source long after the photo was taken.',
            '',
            'No explanation on file.'
          ].join('\n'),
          regionId: REGION_ID
        });
      }
    })
  );
}
