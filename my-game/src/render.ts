/**
 * Split-screen rendering for Verdant.
 *
 * One canvas. One Surface. The full frame has two viewport passes:
 *   Left  → Player 1's camera
 *   Right → Player 2's camera (via subPen — shares palette and t, new camera)
 *
 * **Split-screen mechanics**: Each camera is sized to half the viewport width. The left
 * camera's coordinate system begins at screen x=0; the right camera's at x=0 within its
 * own half. The Surface interface has no clip concept, so both cameras draw to the full
 * canvas — however, `visibleTileBounds()` culls to each camera's own view frustum, so
 * sprites outside the half are not rendered. Only the divider line and any full-canvas
 * effects need to be aware of the two halves.
 *
 * **DepthSorter**: allocated once (1024 items), re-cleared and re-filled for each pass.
 * We cannot share the sorted state between passes because depth order is camera-dependent.
 *
 * Light field lifecycle (critical):
 *   `light.begin(pen, darkness, tint)` MUST be called before the first `renderFrame`.
 *   It sets `pen.light` active; `renderFrame` calls `pen.light.composite()` in the Light
 *   pass. `subPen` carries no light (by design), so the right viewport has no night mask.
 *   This is acceptable for the initial scaffold — a full per-viewport night would need
 *   two light fields.
 */

import {
  beginFrame,
  endFrame,
  subPen,
  isoTerrain,
  isoTile,
  drawSprite,
  renderFrame,
  BASE_SLOTS,
  createPalette,
  createLightField,
  hex,
  shade,
  spriteHeightPx,
  VARIANT_ZERO,
  type Pen,
  type Passes,
  type Surface,
  type LightField,
  type LightFieldOpts,
} from '@latticekit/draw';
import {
  DepthSorter,
  footprintBase,
  type Camera,
  type Rect,
  type TileRange,
  type Footprint,
} from '@latticekit/iso';
import type { WorldTerrain } from './world.js';
import { W, H, MAT_WATER } from './world.js';
import type { Creature } from './creatures.js';
import type { Player } from './players.js';
import type { Building } from './buildings.js';
import { defFor } from './buildings.js';
import {
  spriteForCreature,
  creatureVariant,
  playerVariant,
  PLAYER_SPRITES,
  VARIANT_SCRATCH,
} from './sprites.js';
import {
  GRASS, ROCK, WATER, SAND, SNOW, NIGHT_COLOR, SKY_TOP, SKY_MID,
  HEIGHT_WATER, HEIGHT_SAND, HEIGHT_ROCK, HEIGHT_SNOW,
} from './palette.js';

// ── Palette ────────────────────────────────────────────────────────────────────

export function createVerdantPalette() {
  return createPalette({
    ...BASE_SLOTS,
    sky:    SKY_TOP,
    ground: GRASS,
    brand:  hex('#60a080'),
    ok:     hex('#60e0a0'),
    bad:    hex('#e06040'),
  });
}

// ── Shared DepthSorter (allocated once, cleared per pass) ──────────────────────

const ORDER = new DepthSorter(1024);

// ── Footprint scratch (hoisted — reused per entity per frame) ──────────────────

interface MutableFootprint {
  gx: number;
  gy: number;
  w: number;
  d: number;
}

const FP_SCRATCH: MutableFootprint = { gx: 0, gy: 0, w: 1, d: 1 };

// ── Main render ────────────────────────────────────────────────────────────────

/**
 * Draw one complete frame: left (Camera 1), then right (Camera 2).
 *
 * `pen.light` is attached to the left viewport only. The right viewport uses a `subPen`
 * which never carries a light field — this means the right half has no night mask. For a
 * playable game this is fine at this stage; a per-viewport night would need two light fields.
 */
export function renderVerdant(
  surface: Surface,
  light: LightField,
  palette: ReturnType<typeof createVerdantPalette>,
  camera1: Camera,
  camera2: Camera,
  world: WorldTerrain,
  creatures: Creature[],
  players: readonly Player[],
  buildings: Building[],
  t: number,
  darkness: number,
): void {
  // Open the frame — clears the canvas and builds the pen with camera1.
  const pen = beginFrame({
    surface,
    camera: camera1,
    palette,
    t,
    clear: 'sky',
    light,
  });

  // Start the light field.
  light.begin(pen, darkness, NIGHT_COLOR);

  // Live buildings and creatures — pre-filter once, shared by both viewports.
  const liveBuildings = buildings.filter(b => b.hp > 0);
  const liveCreatures = creatures.filter(c => c.hp > 0);

  // Split-screen viewport clipping and translation
  const ctx = (surface as any).element.getContext('2d') as CanvasRenderingContext2D;
  const halfW = Math.max(1, Math.floor(surface.width / 2));

  // ── Left viewport (Camera 1) ──────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, halfW, surface.height);
  ctx.clip();
  drawViewport(pen, camera1, world, liveCreatures, players, liveBuildings, t, true);
  ctx.restore();

  // ── Right viewport (Camera 2) ─────────────────────────────────────────────────
  // subPen: same palette and t, but camera2 and no light field.
  const pen2 = subPen(pen, surface, camera2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(halfW, 0, halfW, surface.height);
  ctx.clip();
  ctx.translate(halfW, 0);
  drawViewport(pen2, camera2, world, liveCreatures, players, liveBuildings, t, false);
  ctx.restore();

  endFrame(pen);
}

/** Draw one viewport pass into the given pen. `isLeft` controls the divider line. */
function drawViewport(
  pen: Pen,
  camera: Camera,
  world: WorldTerrain,
  liveCreatures: Creature[],
  players: readonly Player[],
  liveBuildings: Building[],
  t: number,
  isLeft: boolean,
): void {
  // Fill the DepthSorter.
  ORDER.clear();

  // Add buildings.
  for (const b of liveBuildings) {
    const def = defFor(b.kind);
    ORDER.add(b.gx, b.gy, b.w, b.d, b.basePx + spriteHeightPx(def, VARIANT_ZERO));
  }
  // Add live creatures.
  for (const c of liveCreatures) {
    const def    = spriteForCreature(c.species);
    const cgx    = Math.floor(c.gx);
    const cgy    = Math.floor(c.gy);
    FP_SCRATCH.gx = cgx; FP_SCRATCH.gy = cgy; FP_SCRATCH.w = def.w; FP_SCRATCH.d = def.d;
    const basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
    ORDER.add(cgx, cgy, def.w, def.d, basePx + spriteHeightPx(def, creatureVariant(c)));
  }
  // Add players.
  for (const p of players) {
    if (p.respawnTimer > 0) continue;
    const pgx = Math.floor(p.gx);
    const pgy = Math.floor(p.gy);
    FP_SCRATCH.gx = pgx; FP_SCRATCH.gy = pgy; FP_SCRATCH.w = 1; FP_SCRATCH.d = 1;
    const basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
    ORDER.add(pgx, pgy, 1, 1, basePx + spriteHeightPx(PLAYER_SPRITES[p.index], playerVariant(p)));
  }

  const passes: Passes = {
    maxHeightPx: world.currentMaxHeightPx,

    backdrop(pen, visible) {
      const topColor = pen.palette.ink('sky');
      const midColor = SKY_MID;
      pen.surface.polyRamp(
        Float64Array.of(
          visible.minX, visible.minY,
          visible.maxX, visible.minY,
          visible.maxX, visible.maxY,
          visible.minX, visible.maxY,
        ),
        4,
        0, visible.minY,
        0, visible.maxY,
        topColor,
        midColor,
      );
    },

    terrain(pen, visible) {
      for (let gy = visible.gy0; gy < visible.gy1; gy++) {
        for (let gx = visible.gx0; gx < visible.gx1; gx++) {
          // Clamp to valid height grid.
          if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;

          const minH = Math.min(
            world.heights.get(gx,   gy),
            world.heights.get(gx+1, gy),
            world.heights.get(gx,   gy+1),
            world.heights.get(gx+1, gy+1),
          );

          if (minH <= HEIGHT_WATER) {
            isoTile(pen, gx, gy, WATER);
          } else {
            const fill = minH >= HEIGHT_SNOW ? SNOW :
                         minH >= HEIGHT_ROCK ? ROCK :
                         minH <= HEIGHT_SAND ? SAND : GRASS;
            isoTerrain(pen, world.field, gx, gy, fill);
          }
        }
      }
    },

    solids(pen, order) {
      for (let i = 0; i < order.count; i++) {
        const idx = order.indexAt(i);
        if (idx < liveBuildings.length) {
          const b = liveBuildings[idx];
          if (b === undefined) continue;
          const def  = defFor(b.kind);
          // Fill the scratch variant — hoisted, no allocation.
          (VARIANT_SCRATCH as any).seed  = b.id;
          (VARIANT_SCRATCH as any).progress = 1;
          drawSprite(pen, def, b.gx, b.gy, VARIANT_SCRATCH, b.basePx);

        } else if (idx < liveBuildings.length + liveCreatures.length) {
          const c = liveCreatures[idx - liveBuildings.length];
          if (c === undefined) continue;
          const def    = spriteForCreature(c.species);
          const v      = creatureVariant(c);
          const cgx    = Math.floor(c.gx);
          const cgy    = Math.floor(c.gy);
          FP_SCRATCH.gx = cgx; FP_SCRATCH.gy = cgy; FP_SCRATCH.w = def.w; FP_SCRATCH.d = def.d;
          const basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
          drawSprite(pen, def, c.gx, c.gy, v, basePx);

        } else {
          const p = players[idx - liveBuildings.length - liveCreatures.length];
          if (p === undefined || p.respawnTimer > 0) continue;
          const def    = PLAYER_SPRITES[p.index];
          const v      = playerVariant(p);
          const pgx    = Math.floor(p.gx);
          const pgy    = Math.floor(p.gy);
          FP_SCRATCH.gx = pgx; FP_SCRATCH.gy = pgy; FP_SCRATCH.w = 1; FP_SCRATCH.d = 1;
          const basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
          drawSprite(pen, def, p.gx, p.gy, v, basePx);
        }
      }
    },

    overlay(pen) {
      // Divider — only on the left viewport, so it appears once.
      if (isLeft) {
        const cx = pen.surface.width * 0.5;
        const h  = pen.surface.height;
        pen.surface.stroke(
          Float64Array.of(cx, 0, cx, h),
          2,
          false,
          hex('#1a2a12'),
          2,
        );
      }
      // TODO: player HP bars with surface.stroke / surface.poly.
    },
  };

  renderFrame(pen, passes, ORDER);
}

/** Resize both cameras and the surface to fill the window. */
export function resizeCameras(
  surface: { resize(w: number, h: number, ratio: number): void; readonly pixelRatio: number },
  camera1: Camera,
  camera2: Camera,
): void {
  const w    = Math.max(1, window.innerWidth);
  const h    = Math.max(1, window.innerHeight - 32);
  surface.resize(w, h, surface.pixelRatio);

  const half = Math.max(1, Math.floor(w / 2));
  camera1.resize(half, h);
  camera2.resize(half, h);
}
