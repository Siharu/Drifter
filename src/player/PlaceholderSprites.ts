import * as THREE from 'three';
import { DEFAULT_SPRITE_SHEET_CONFIG, type SpriteSheetConfig } from './Player';

/**
 * PlaceholderSprites
 * -------------------
 * Generates a temporary 8-direction sprite sheet at runtime using
 * Canvas2D — no image asset required. Exists purely so the HD-2D
 * camera + 8-direction facing system can be visually verified in the
 * browser before real pixel art exists.
 *
 * Per the production bible's testing rules ("use placeholder assets
 * while systems are being built"), this is intentionally crude: each
 * direction is a colored circle (the "body") with a wedge (the "facing
 * indicator") pointing the direction that row represents, so facing is
 * legible at a glance without needing real art. Idle vs walk frames are
 * distinguished only by a slight bob, just enough to confirm the
 * walk-cycle frame-advance logic is actually running.
 *
 * Delete this whole file once real sprite art lands — nothing else in
 * the codebase depends on it; main.ts is the only caller.
 */

/** Screen-space angle (radians, 0 = up on the canvas) for each direction's facing wedge. */
const DIRECTION_ANGLES: Record<string, number> = {
  up: 0,
  'up-right': Math.PI / 4,
  right: Math.PI / 2,
  'down-right': (3 * Math.PI) / 4,
  down: Math.PI,
  'down-left': (5 * Math.PI) / 4,
  left: (3 * Math.PI) / 2,
  'up-left': (7 * Math.PI) / 4,
};

/**
 * Builds the placeholder sheet and returns it as a THREE.Texture ready
 * to pass into Player.setSpriteSheet(). Cell size is small (64x64) since
 * this is a temporary visual aid, not final art.
 */
export function createPlaceholderSpriteSheet(
  config: SpriteSheetConfig = DEFAULT_SPRITE_SHEET_CONFIG
): THREE.Texture {
  const cellSize = 64;
  const canvas = document.createElement('canvas');
  canvas.width = cellSize * config.framesPerRow;
  canvas.height = cellSize * config.rowOrder.length;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('PlaceholderSprites: failed to acquire 2D context for sprite sheet canvas.');
  }

  config.rowOrder.forEach((direction, rowIndex) => {
    for (let col = 0; col < config.framesPerRow; col++) {
      drawPlaceholderCell(ctx, col * cellSize, rowIndex * cellSize, cellSize, direction, col);
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Draws one cell: a colored body circle + a wedge indicating facing direction. */
function drawPlaceholderCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  direction: string,
  frameIndex: number
): void {
  const cx = x + size / 2;
  // Idle (frame 0) sits at rest height; walk frames 1-3 bob up/down
  // slightly so the walk-cycle advance is visibly distinguishable from
  // idle, even with no real animation art.
  const bob = frameIndex === 0 ? 0 : Math.sin((frameIndex / 3) * Math.PI) * 4;
  const cy = y + size / 2 + bob;
  const radius = size * 0.3;

  ctx.clearRect(x, y, size, size);

  // Body: color distinguishes nothing meaningful here, just visual clarity
  // against the world. Slightly darker outline so it reads against bright backgrounds.
  ctx.fillStyle = '#9fffe0';
  ctx.strokeStyle = '#1a2e28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Facing wedge: a triangle pointing in the direction this row represents.
  // This is the part that actually matters for verifying the 8-direction
  // system — if the wedge doesn't point where the player is moving,
  // the direction-bucket math (or the row mapping) has a bug.
  const angle = DIRECTION_ANGLES[direction] ?? 0;
  const wedgeLength = radius * 1.6;
  const wedgeHalfWidth = radius * 0.5;

  const tipX = cx + Math.sin(angle) * wedgeLength;
  const tipY = cy - Math.cos(angle) * wedgeLength;
  const baseAngle1 = angle + (Math.PI * 2) / 3;
  const baseAngle2 = angle - (Math.PI * 2) / 3;
  const base1X = cx + Math.sin(baseAngle1) * wedgeHalfWidth;
  const base1Y = cy - Math.cos(baseAngle1) * wedgeHalfWidth;
  const base2X = cx + Math.sin(baseAngle2) * wedgeHalfWidth;
  const base2Y = cy - Math.cos(baseAngle2) * wedgeHalfWidth;

  ctx.fillStyle = '#ff5a4d';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(base1X, base1Y);
  ctx.lineTo(base2X, base2Y);
  ctx.closePath();
  ctx.fill();
}
