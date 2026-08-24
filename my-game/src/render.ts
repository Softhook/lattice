/**
 * Split-screen rendering for Verdant.
 *
 * One canvas. One Surface. The full frame has two viewport passes:
 *   Left  → Player 1's camera
 *   Right → Player 2's camera (via subPen — shares palette and t, new camera)
 *
 * Engineered for zero allocations on the hot render path.
 */

import {
  beginFrame,
  endFrame,
  subPen,
  isoTerrain,
  isoTile,
  drawSprite,
  drawGhost,
  drawFootprint,
  SELECT_LIFT,
  renderFrame,
  BASE_SLOTS,
  createPalette,
  hex,
  shade,
  mix,
  withAlpha,
  spriteHeightPx,
  VARIANT_ZERO,
  type Pen,
  type Passes,
  type LightField,
  type OffscreenSurface,
} from '@latticekit/draw';
import { noise2, hash2, toUnit } from '@latticekit/core';
import {
  DepthSorter,
  footprintBase,
  heightAt,
  type Camera,
  type Footprint,
} from '@latticekit/iso';
import type { WorldTerrain } from './world.js';
import { W, H } from './world.js';
import type { Creature } from './creatures.js';
import type { Player } from './players.js';
import { facingTile, canAffordBuilding } from './players.js';
import type { Building, BuildingKind } from './buildings.js';
import { defFor, canPlaceBuilding, LANTERN_GLOW } from './buildings.js';
import type { FloraItem } from './flora.js';
import { defForFlora, floraVariant } from './flora.js';
import {
  spriteForCreature,
  creatureVariant,
  playerVariant,
  PLAYER_SPRITES,
  setScratchVariant,
} from './sprites.js';
import {
  GRASS, ROCK, WATER, SAND, SNOW, NIGHT_COLOR, SKY_TOP,
  HEIGHT_WATER, HEIGHT_SAND, HEIGHT_ROCK, HEIGHT_SNOW,
  TOOL_GOLD,
} from './palette.js';
import { drawSky, farRanges } from './sky.js';
import { drawAmbientEffects } from './ambient.js';
import { drawPlayerHud, drawSplitDivider } from './hud.js';
import type { Projectile } from './combat.js';

// ── Scratch for Projectiles (Zero Allocation) ──────────────────────────────────

const ARROW_LINE_SCRATCH = new Float64Array(4);
const SHADOW_BOX_SCRATCH = new Float64Array(8);

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

// ── Shared DepthSorter ─────────────────────────────────────────────────────────

const ORDER = new DepthSorter(2048);

// ── Footprint scratch ──────────────────────────────────────────────────────────

interface MutableFootprint {
  gx: number;
  gy: number;
  w: number;
  d: number;
}

const FP_SCRATCH: MutableFootprint = { gx: 0, gy: 0, w: 1, d: 1 };

// ── Zero-Allocation Pre-allocated Index Mapping Buffers ────────────────────────

// ── Zero-Allocation Pre-allocated Index Mapping & Viewport Buffers ─────────────

const BLD_INDEX_BUFFER = new Int32Array(1024);
const FLORA_INDEX_BUFFER = new Int32Array(2048);
const CRE_INDEX_BUFFER = new Int32Array(1024);
const TILE_RANGE_SCRATCH = { gx0: 0, gy0: 0, gx1: 0, gy1: 0 };

// ── Reusable Pen2 for Viewport 2 ───────────────────────────────────────────────

interface MutablePen extends Pen {
  surface: OffscreenSurface;
  camera: Camera;
  palette: ReturnType<typeof createVerdantPalette>;
  t: number;
  light: LightField | undefined;
  snapX: number;
  snapY: number;
}

const PEN2_XY = new Float64Array(256);
const PEN2_SCRATCH: MutablePen = {
  surface: null as unknown as OffscreenSurface,
  camera: null as unknown as Camera,
  palette: null as unknown as ReturnType<typeof createVerdantPalette>,
  t: 0,
  xy: PEN2_XY,
  light: undefined,
  snapX: 0,
  snapY: 0,
  snap: true,
};

function getSubPenWithLight(
  pen: Pen,
  surface: OffscreenSurface,
  camera: Camera,
  light: LightField,
): Pen {
  const ratio = surface.pixelRatio;
  const devX = camera.toScreenX(0) * ratio;
  const devY = camera.toScreenY(0) * ratio;
  const snapX = (Math.round(devX) - devX) / ratio;
  const snapY = (Math.round(devY) - devY) / ratio;

  PEN2_SCRATCH.surface = surface;
  PEN2_SCRATCH.camera = camera;
  PEN2_SCRATCH.palette = pen.palette as ReturnType<typeof createVerdantPalette>;
  PEN2_SCRATCH.t = pen.t;
  PEN2_SCRATCH.light = light;
  PEN2_SCRATCH.snapX = snapX;
  PEN2_SCRATCH.snapY = snapY;
  return PEN2_SCRATCH;
}

// ── Main render ────────────────────────────────────────────────────────────────

export function renderVerdant(
  surface: OffscreenSurface,
  light1: LightField,
  light2: LightField,
  palette: ReturnType<typeof createVerdantPalette>,
  camera1: Camera,
  camera2: Camera,
  world: WorldTerrain,
  flora: readonly FloraItem[],
  creatures: readonly Creature[],
  players: readonly [Player, Player],
  buildings: readonly Building[],
  projectiles: readonly Projectile[],
  t: number,
  darkness: number,
  daylight: number,
  cycle: number,
  seed: number,
): void {
  // Open the frame — clears canvas and builds pen with camera1 and light1.
  const pen = beginFrame({
    surface,
    camera: camera1,
    palette,
    light: light1,
    t,
    clear: 'sky',
  });

  const ctx = surface.element.getContext('2d');
  if (ctx === null) {
    endFrame(pen);
    return;
  }

  const halfW = Math.max(1, Math.floor(surface.width / 2));

  // ── Left viewport (Camera 1 / Player 1) ────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, halfW, surface.height);
  ctx.clip();
  drawViewport(pen, camera1, world, flora, creatures, players, buildings, projectiles, players[0], t, darkness, daylight, cycle, seed, light1, true);
  ctx.restore();

  // ── Right viewport (Camera 2 / Player 2) ───────────────────────────────────────
  const pen2 = getSubPenWithLight(pen, surface, camera2, light2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(halfW, 0, halfW, surface.height);
  ctx.clip();
  ctx.translate(halfW, 0);
  drawViewport(pen2, camera2, world, flora, creatures, players, buildings, projectiles, players[1], t, darkness, daylight, cycle, seed, light2, false);
  ctx.restore();

  endFrame(pen);
}

/** Draw one viewport pass into the given pen without heap allocations. */
function drawViewport(
  pen: Pen,
  camera: Camera,
  world: WorldTerrain,
  flora: readonly FloraItem[],
  creatures: readonly Creature[],
  players: readonly [Player, Player],
  buildings: readonly Building[],
  projectiles: readonly Projectile[],
  activePlayer: Player,
  t: number,
  darkness: number,
  daylight: number,
  cycle: number,
  seed: number,
  light: LightField,
  isLeft: boolean,
): void {
  ORDER.clear();

  // Initialize light accumulator for this viewport's camera and pen
  light.begin(pen, darkness, NIGHT_COLOR);

  // Compute visible tile bounding box with safety margin for spatial frustum culling
  camera.visibleTileBounds(TILE_RANGE_SCRATCH, Math.ceil(world.currentMaxHeightPx / 16) + 4);
  const minGx = Math.max(0, TILE_RANGE_SCRATCH.gx0 - 3);
  const maxGx = Math.min(W - 1, TILE_RANGE_SCRATCH.gx1 + 3);
  const minGy = Math.max(0, TILE_RANGE_SCRATCH.gy0 - 3);
  const maxGy = Math.min(H - 1, TILE_RANGE_SCRATCH.gy1 + 3);

  // 1. Add active visible buildings (using preallocated index buffer)
  let liveBldCount = 0;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0) continue;
    if (b.gx + b.w < minGx || b.gx > maxGx || b.gy + b.d < minGy || b.gy > maxGy) continue;

    BLD_INDEX_BUFFER[liveBldCount] = i;
    liveBldCount++;
    const def = defFor(b.kind);
    ORDER.add(b.gx, b.gy, b.w, b.d, b.basePx + spriteHeightPx(def, VARIANT_ZERO));
  }

  // 2. Add visible flora items (culled against viewport)
  let liveFloraCount = 0;
  const numFlora = flora.length;
  for (let i = 0; i < numFlora; i++) {
    const f = flora[i];
    if (f === undefined) continue;
    if (f.gx < minGx || f.gx > maxGx || f.gy < minGy || f.gy > maxGy) continue;

    FLORA_INDEX_BUFFER[liveFloraCount] = i;
    liveFloraCount++;
    const def = defForFlora(f.kind);
    FP_SCRATCH.gx = f.gx; FP_SCRATCH.gy = f.gy; FP_SCRATCH.w = def.w; FP_SCRATCH.d = def.d;
    f.basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
    ORDER.add(f.gx, f.gy, def.w, def.d, f.basePx + spriteHeightPx(def, floraVariant(f)));
  }

  // 3. Add active visible creatures (culled against viewport)
  let liveCreCount = 0;
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c === undefined || c.hp <= 0) continue;
    if (c.gx < minGx || c.gx > maxGx || c.gy < minGy || c.gy > maxGy) continue;

    CRE_INDEX_BUFFER[liveCreCount] = i;
    liveCreCount++;
    const def    = spriteForCreature(c.species);
    const basePx = heightAt(world.field, c.gx, c.gy);
    ORDER.add(c.gx, c.gy, def.w, def.d, basePx + spriteHeightPx(def, creatureVariant(c)));
  }

  // 4. Add players
  const numPlayers = players.length;
  for (let i = 0; i < numPlayers; i++) {
    const p = players[i];
    if (p === undefined || p.respawnTimer > 0) continue;
    const basePx = heightAt(world.field, p.gx, p.gy);
    ORDER.add(p.gx, p.gy, 1, 1, basePx + spriteHeightPx(PLAYER_SPRITES[p.index], playerVariant(p)));
  }

  // 5. Add placement ghost building into DepthSorter for correct Z-ordering
  const hasGhost = activePlayer.respawnTimer <= 0 && activePlayer.mode !== 'move';
  const ghostTile = hasGhost ? facingTile(activePlayer) : { gx: -1, gy: -1 };
  const ghostValidTile = hasGhost && ghostTile.gx >= 0 && ghostTile.gy >= 0 && ghostTile.gx < W && ghostTile.gy < H;
  const buildKind = hasGhost ? (activePlayer.mode as BuildingKind) : undefined;
  const ghostDef = (buildKind !== undefined && ghostValidTile) ? defFor(buildKind) : undefined;
  let ghostBasePx = 0;
  let isLegal = false;

  if (ghostDef !== undefined && buildKind !== undefined) {
    const canPlace = canPlaceBuilding(buildKind, ghostTile.gx, ghostTile.gy, world, buildings);
    const canAfford = canAffordBuilding(activePlayer, buildKind);
    isLegal = canPlace && canAfford;

    FP_SCRATCH.gx = ghostTile.gx; FP_SCRATCH.gy = ghostTile.gy; FP_SCRATCH.w = ghostDef.w; FP_SCRATCH.d = ghostDef.d;
    ghostBasePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
    ORDER.add(ghostTile.gx, ghostTile.gy, ghostDef.w, ghostDef.d, ghostBasePx + spriteHeightPx(ghostDef, VARIANT_ZERO));
  }

  const ghostIndex = ghostDef !== undefined ? liveBldCount + liveFloraCount + liveCreCount + numPlayers : -1;


  const passes: Passes = {
    maxHeightPx: world.currentMaxHeightPx,

    backdrop(pen) {
      // Atmospheric sky gradient and stars
      drawSky(pen, daylight, cycle);
      // Distant horizon mountain ranges
      farRanges(pen, seed, daylight);
    },

    terrain(pen, visible) {
      for (let gy = visible.gy0; gy < visible.gy1; gy++) {
        for (let gx = visible.gx0; gx < visible.gx1; gx++) {
          if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;

          const minH = Math.min(
            world.heights.get(gx,     gy),
            world.heights.get(gx + 1, gy),
            world.heights.get(gx,     gy + 1),
            world.heights.get(gx + 1, gy + 1),
          );

          if (minH <= HEIGHT_WATER) {
            isoTile(pen, gx, gy, WATER);
            // Animated wave swell and glints
            const swell = noise2(seed ^ 0x33, gx * 0.38 + pen.t * 0.25, gy * 0.38) * 0.5 + 0.5;
            if (swell > 0.6) {
              const glint = mix(WATER, pen.palette.get('sky'), 0.65);
              pen.surface.poly(pen.xy, 4, withAlpha(glint, (swell - 0.6) * (0.85 * daylight + 0.2)));
            }
          } else {
            const baseColor = minH >= HEIGHT_SNOW ? SNOW :
                              minH >= HEIGHT_ROCK ? ROCK :
                              minH <= HEIGHT_SAND ? SAND : GRASS;
            // Multi-frequency micro-grain texture
            const field = noise2(seed ^ 0x9e1, gx * 0.12, gy * 0.12) * 0.08;
            const grain = (toUnit(hash2(seed, gx, gy)) - 0.5) * 0.09;
            isoTerrain(pen, world.field, gx, gy, baseColor, undefined, 1 + field + grain);

            if (pen.camera.zoom > 0.65) {
              // Elevation contour seam
              pen.surface.stroke(pen.xy, 3, false, withAlpha(shade(baseColor, 0.88), 0.32), 1);
            }
          }
        }
      }

      // Draw ground footprint boundary on ground plane
      if (ghostDef !== undefined) {
        drawFootprint(pen, ghostTile.gx, ghostTile.gy, ghostDef.w, ghostDef.d, isLegal ? 'ok' : 'bad', SELECT_LIFT, ghostBasePx);
      }
    },

    solids(pen, order) {
      for (let i = 0; i < order.count; i++) {
        const idx = order.indexAt(i);

        if (idx < liveBldCount) {
          // Buildings
          const realIdx = BLD_INDEX_BUFFER[idx] ?? -1;
          const b = realIdx >= 0 ? buildings[realIdx] : undefined;
          if (b === undefined) continue;
          const def  = defFor(b.kind);
          const v = setScratchVariant(b.id, 0, 0, 1, '');
          drawSprite(pen, def, b.gx, b.gy, v, b.basePx);

          // Towers emit warm protective beacon light pools at night
          if (darkness > 0) {
            if (b.kind === 'wood_tower') {
              light.add(b.gx + 1, b.gy + 1, b.basePx + 48, 6.0, darkness * 0.95, LANTERN_GLOW);
            } else if (b.kind === 'stone_tower') {
              light.add(b.gx + 1, b.gy + 1, b.basePx + 65, 7.5, darkness * 1.0, LANTERN_GLOW);
            }
          }

        } else if (idx < liveBldCount + liveFloraCount) {
          // Flora
          const realFloraIdx = FLORA_INDEX_BUFFER[idx - liveBldCount] ?? -1;
          const f = realFloraIdx >= 0 ? flora[realFloraIdx] : undefined;
          if (f === undefined) continue;
          const def = defForFlora(f.kind);
          const v = floraVariant(f);
          drawSprite(pen, def, f.gx, f.gy, v, f.basePx);

        } else if (idx < liveBldCount + liveFloraCount + liveCreCount) {
          // Creatures
          const creIdx = CRE_INDEX_BUFFER[idx - liveBldCount - liveFloraCount] ?? -1;
          const c = creIdx >= 0 ? creatures[creIdx] : undefined;
          if (c === undefined) continue;
          const def    = spriteForCreature(c.species);
          const v      = creatureVariant(c);
          const basePx = heightAt(world.field, c.gx, c.gy);
          drawSprite(pen, def, c.gx, c.gy, v, basePx);

          // Hostile predators emit subtle auras in darkness
          if (darkness > 0) {
            if (c.species === 'troll') {
              light.add(c.gx, c.gy, basePx, 3.5, darkness * 0.55, hex('#e74c3c'));
            } else if (c.species === 'wolf') {
              light.add(c.gx, c.gy, basePx, 2.4, darkness * 0.4, hex('#e67e22'));
            }
          }

        } else if (idx < liveBldCount + liveFloraCount + liveCreCount + numPlayers) {
          // Players
          const p = players[idx - liveBldCount - liveFloraCount - liveCreCount];
          if (p === undefined || p.respawnTimer > 0) continue;
          const def    = PLAYER_SPRITES[p.index];
          const v      = playerVariant(p);
          const basePx = heightAt(world.field, p.gx, p.gy);
          drawSprite(pen, def, p.gx, p.gy, v, basePx);

          // Player torchlight at night
          if (darkness > 0) {
            light.add(p.gx, p.gy, basePx, 4.5, darkness * 0.95, TOOL_GOLD);
          }

        } else if (idx === ghostIndex && ghostDef !== undefined) {
          // Ghost preview — depth-sorted against world
          drawGhost(pen, ghostDef, ghostTile.gx, ghostTile.gy, VARIANT_ZERO, isLegal, ghostBasePx);
        }
      }
    },

    effects(pen) {
      // Ambient atmospheric particles
      drawAmbientEffects(pen, seed, world, daylight, light, buildings);

      // Render 3D ballistic projectiles (Arrows)
      const numProj = projectiles.length;
      for (let pi = 0; pi < numProj; pi++) {
        const p = projectiles[pi];
        if (p === undefined || !p.live) continue;

        const wx = (p.x - p.y) * 32;
        const wy = (p.x + p.y) * 16 - p.z;
        const sx = (wx - camera.x) * camera.zoom + camera.viewW * 0.5;
        const sy = (wy - camera.y) * camera.zoom + camera.viewH * 0.5;

        // Ground shadow with true elevation interpolation
        const groundH = heightAt(world.field, p.x, p.y);
        const gwy = (p.x + p.y) * 16 - groundH;
        const gsy = (gwy - camera.y) * camera.zoom + camera.viewH * 0.5;


        // Shadow dot
        SHADOW_BOX_SCRATCH[0] = sx - 3; SHADOW_BOX_SCRATCH[1] = gsy - 1.5;
        SHADOW_BOX_SCRATCH[2] = sx + 3; SHADOW_BOX_SCRATCH[3] = gsy - 1.5;
        SHADOW_BOX_SCRATCH[4] = sx + 3; SHADOW_BOX_SCRATCH[5] = gsy + 1.5;
        SHADOW_BOX_SCRATCH[6] = sx - 3; SHADOW_BOX_SCRATCH[7] = gsy + 1.5;
        pen.surface.poly(SHADOW_BOX_SCRATCH, 4, withAlpha(hex('#000000'), 0.35));

        // Arrow shaft and tip
        const vwx = (p.vx - p.vy) * 32;
        const vwy = (p.vx + p.vy) * 16 - p.vz;
        const vlen = Math.sqrt(vwx * vwx + vwy * vwy) || 1;
        const arrowLen = 10 * camera.zoom;
        const tailX = sx - (vwx / vlen) * arrowLen;
        const tailY = sy - (vwy / vlen) * arrowLen;

        ARROW_LINE_SCRATCH[0] = tailX;
        ARROW_LINE_SCRATCH[1] = tailY;
        ARROW_LINE_SCRATCH[2] = sx;
        ARROW_LINE_SCRATCH[3] = sy;
        pen.surface.stroke(ARROW_LINE_SCRATCH, 2, false, hex('#ffd54f'), 2);
      }
    },

    overlay(pen) {
      // Draw players in the overlay pass above the night mask so the ground light circle sits behind the player!
      for (let i = 0; i < numPlayers; i++) {
        const p = players[i];
        if (p === undefined || p.respawnTimer > 0) continue;
        const def    = PLAYER_SPRITES[p.index];
        const v      = playerVariant(p);
        const basePx = heightAt(world.field, p.gx, p.gy);
        drawSprite(pen, def, p.gx, p.gy, v, basePx);
      }

      if (isLeft) {
        drawSplitDivider(pen);
      }
      drawPlayerHud(pen, activePlayer);
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
