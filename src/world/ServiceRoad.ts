import * as THREE from 'three';
import { Interactable } from './Interactable';
import { InteractionSystem } from '../systems/InteractionSystem';
import { DiscoverySystem } from '../systems/DiscoverySystem';
import { WorldAssetLoader } from './WorldAssetLoader';

/**
 * ServiceRoad
 * -----------
 * Region 02 — the second real location in DRIFTER. Deliberately tiny:
 * a stretch of road, one abandoned checkpoint, one discovery, one
 * broadcast. Built to the same pattern as RelayStation7.ts — same
 * systems passed in, same WorldAssetLoader pipeline, same Discovery/
 * Interactable mechanics. No new architecture.
 *
 * Canon placement: same date as RS7 (2032.04.13, Day 9 of the outbreak,
 * two days after Bangladesh lockdown) — this is the road a Drifter
 * would walk if they left RS7 looking for the missing operator. The
 * checkpoint's presence implies this road was a controlled access
 * point during lockdown, now abandoned with its barrier arm left raised
 * mid-use rather than lowered and secured.
 *
 * Layout (top-down, all positions relative to root):
 *   (0, 0, 0)     — Checkpoint booth + barrier arm, straddling the road
 *   Road runs north-south through the checkpoint, narrow region overall
 *   — intentionally small per design brief ("not a whole region, just
 *   a destination").
 *
 * Recommended player arrival position: (0, 0, 12) — south end of the
 * road, facing the checkpoint, the same "establishing view of the
 * landmark" approach used in RelayStation7. Set by whatever travel
 * trigger brings the player here (see RelayStation7.ts's region-exit
 * Interactable), not by this function.
 *
 * Interactables:
 *   Checkpoint terminal/clipboard (0, *, 2), radius 3 → Broadcast: second signal
 *   Abandoned post note (-3, 0, -4), radius 2         → Note: checkpoint log
 */

const REGION_ID  = 'SVC_ROAD';
const EVENT_DATE = '2032.04.13';

export interface ServiceRoadInstance {
  root: THREE.Group;
}

export async function buildServiceRoad(
  interactionSystem: InteractionSystem,
  discoverySystem: DiscoverySystem,
  loader: WorldAssetLoader
): Promise<ServiceRoadInstance> {
  const root = new THREE.Group();
  root.name = 'ServiceRoad';

  buildRoad(root);

  const spawns = await Promise.all([
    loader.spawn('checkpoint', { position: new THREE.Vector3(0, 0, 0), regionId: REGION_ID }),

    // Reuse already-registered prop IDs for minimal dressing — same
    // pipeline, no new asset types beyond the one structural checkpoint.
    loader.spawn('fence', { position: new THREE.Vector3(-3, 0, 0), regionId: REGION_ID }),
    loader.spawn('fence', { position: new THREE.Vector3(3, 0, 0), regionId: REGION_ID }),
    loader.spawn('crate', { position: new THREE.Vector3(-2.5, 0, -3), regionId: REGION_ID }),
    loader.spawn('warning_sign', { position: new THREE.Vector3(2.5, 0, 6), regionId: REGION_ID })
  ]);

  for (const result of spawns) {
    root.add(result.object);
  }

  createCheckpointTerminal(root, interactionSystem, discoverySystem);
  createAbandonedPostNote(root, interactionSystem, discoverySystem);

  return { root };
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function buildRoad(root: THREE.Group): void {
  // Narrow road surface running north-south through the checkpoint —
  // deliberately small footprint per design brief.
  const roadMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 30),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 })
  );
  roadMesh.name = 'RoadSurface';
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.receiveShadow = true;
  root.add(roadMesh);

  // Shoulder/verge on either side, slightly lighter, wider than the road
  const shoulderMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 30),
    new THREE.MeshStandardMaterial({ color: 0x3a4438, roughness: 0.95 })
  );
  shoulderMesh.name = 'RoadShoulder';
  shoulderMesh.rotation.x = -Math.PI / 2;
  shoulderMesh.position.y = -0.02;
  shoulderMesh.receiveShadow = true;
  root.add(shoulderMesh);

  // Faint centerline markings — implies a maintained road, once.
  for (let z = -12; z <= 12; z += 4) {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x6a6a4a, roughness: 0.7, transparent: true, opacity: 0.4 })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.005, z);
    root.add(line);
  }
}

// ---------------------------------------------------------------------------
// Interactables
// ---------------------------------------------------------------------------

/**
 * Checkpoint Terminal
 * Discovery: a second, related broadcast — a different angle on the
 * same unexplained-signal thread RS7 introduced, not a repeat of it.
 * Location: at the checkpoint booth (0, *, 2)
 */
function createCheckpointTerminal(
  root: THREE.Group,
  interactionSystem: InteractionSystem,
  discoverySystem: DiscoverySystem
): void {
  const anchor = new THREE.Object3D();
  anchor.name = 'CheckpointTerminal_Anchor';
  anchor.position.set(0, 1.2, 2);
  root.add(anchor);

  interactionSystem.register(
    new Interactable({
      object3D: anchor,
      label: 'Checkpoint Radio',
      radius: 3,
      kind: 'terminal',
      onInteract: () => {
        discoverySystem.register({
          id: 'SVC-BC-001',
          title: 'WNCORE Broadcast #002',
          type: 'broadcast',
          content: [
            'CHECKPOINT TRAFFIC ADVISORY — ARCHIVED',
            '',
            `Date: ${EVENT_DATE}`,
            'Frequency: 88.7 FM',
            'Source: WNCORE Network — Checkpoint Relay',
            '',
            '[TRANSMISSION LOG — PARTIAL RECOVERY]',
            '',
            'This checkpoint stopped reporting status updates the same day',
            'Relay Station 7 went silent. WNCORE flagged both losses as',
            'unrelated at the time — different equipment, different crews,',
            'eleven kilometers apart.',
            '',
            'That assessment has not been revisited since.',
            '',
            'Vehicles attempting this route should expect no checkpoint',
            'staff and no barrier control. Proceed at your own risk.',
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
 * Abandoned Post Note
 * Discovery: the checkpoint's own log, found at the booth — confirms
 * the same date and a detail that doesn't quite match RS7's account.
 * Location: just behind the checkpoint booth (-3, 0, -4)
 */
function createAbandonedPostNote(
  root: THREE.Group,
  interactionSystem: InteractionSystem,
  discoverySystem: DiscoverySystem
): void {
  const noteVisual = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.04, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xd5d2a8, roughness: 0.9, emissive: 0x2a2a1a, emissiveIntensity: 0.15 })
  );
  noteVisual.name = 'CheckpointLog_Visual';
  noteVisual.position.set(-3, 0.05, -4);
  noteVisual.rotation.y = -0.3;
  noteVisual.receiveShadow = true;
  root.add(noteVisual);

  const anchor = new THREE.Object3D();
  anchor.name = 'CheckpointLog_Anchor';
  anchor.position.set(-3, 0.5, -4);
  root.add(anchor);

  interactionSystem.register(
    new Interactable({
      object3D: anchor,
      label: 'Checkpoint Log',
      radius: 2,
      kind: 'note',
      onInteract: () => {
        discoverySystem.register({
          id: 'SVC-NOTE-001',
          title: 'Checkpoint Duty Log',
          type: 'note',
          content: [
            'CHECKPOINT DUTY LOG — LAST ENTRY',
            '',
            `Date: ${EVENT_DATE}`,
            'Location: Service Road Checkpoint',
            '',
            'Nothing through since the lockdown order. Two vehicles came',
            'from the relay station direction this morning, both empty,',
            'doors unlocked, engines off but not cold. Didn\'t log them —',
            'wasn\'t sure how to write up a vehicle with no driver.',
            '',
            'Radio\'s been doing the multi-frequency thing WNCORE warned us',
            'about. Started maybe an hour before the vehicles showed up.',
            'Might be nothing. Might be the same thing the relay station',
            'people called in about before they stopped answering.',
            '',
            'Raising the barrier and stepping inside until someone relieves',
            'me. If no one does, figure it out from here.'
          ].join('\n'),
          regionId: REGION_ID
        });
      }
    })
  );
}
