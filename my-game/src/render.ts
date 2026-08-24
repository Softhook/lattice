/**
 * Split-screen rendering for Verdant.
 *
 * One canvas. One Surface. The full frame has two viewport passes:
 *   Left  → Player 1's camera
 *   Right → Player 2's camera (via subPen — shares palette and t, new camera)
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
  createLightField,
  hex,
  shade,
  withAlpha,
  spriteHeightPx,
  screenText,
  DEFAULT_TEXT,
  VARIANT_ZERO,
  type Pen,
  type Passes,
  type Surface,
  type LightField,
} from '@latticekit/draw';
import { clamp } from '@latticekit/core';
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
import { facingTile, MAX_HP } from './players.js';
import type { Building, BuildingKind } from './buildings.js';
import { defFor, canPlaceBuilding } from './buildings.js';
import type { FloraItem } from './flora.js';
import { defForFlora, floraVariant } from './flora.js';
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
  P1_COLOR, P1_ACCENT, P2_COLOR, P2_ACCENT,
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

// ── Colors for UI / Ghost ──────────────────────────────────────────────────────

const GHOST_VALID   = hex('#2ecc71');
const GHOST_INVALID = hex('#e74c3c');
const UI_BG         = hex('#0a1208');
const UI_BORDER     = hex('#1b3014');
const UI_HP_GOOD    = hex('#2ecc71');
const UI_HP_BAD     = hex('#e74c3c');
const UI_TEXT_WHITE = hex('#ecf0f1');
const UI_TOOL_GOLD  = hex('#f1c40f');

// ── Main render ────────────────────────────────────────────────────────────────

export function renderVerdant(
  surface: Surface,
  light: LightField,
  palette: ReturnType<typeof createVerdantPalette>,
  camera1: Camera,
  camera2: Camera,
  world: WorldTerrain,
  flora: FloraItem[],
  creatures: Creature[],
  players: readonly [Player, Player],
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
  });

  // Live items
  const liveBuildings = buildings.filter(b => b.hp > 0);
  const liveCreatures = creatures.filter(c => c.hp > 0);

  // Split-screen viewport clipping and translation
  const ctx = (surface as any).element.getContext('2d') as CanvasRenderingContext2D;
  const halfW = Math.max(1, Math.floor(surface.width / 2));

  // ── Left viewport (Camera 1 / Player 1) ────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, halfW, surface.height);
  ctx.clip();
  drawViewport(pen, camera1, world, flora, liveCreatures, players, liveBuildings, players[0], t, darkness, true);
  ctx.restore();

  // ── Right viewport (Camera 2 / Player 2) ───────────────────────────────────────
  const pen2 = subPen(pen, surface, camera2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(halfW, 0, halfW, surface.height);
  ctx.clip();
  ctx.translate(halfW, 0);
  drawViewport(pen2, camera2, world, flora, liveCreatures, players, liveBuildings, players[1], t, darkness, false);
  ctx.restore();

  endFrame(pen);
}

/** Draw one viewport pass into the given pen. */
function drawViewport(
  pen: Pen,
  camera: Camera,
  world: WorldTerrain,
  flora: FloraItem[],
  liveCreatures: Creature[],
  players: readonly [Player, Player],
  liveBuildings: Building[],
  activePlayer: Player,
  t: number,
  darkness: number,
  isLeft: boolean,
): void {
  ORDER.clear();

  // 1. Add buildings
  for (const b of liveBuildings) {
    const def = defFor(b.kind);
    ORDER.add(b.gx, b.gy, b.w, b.d, b.basePx + spriteHeightPx(def, VARIANT_ZERO));
  }

  // 2. Add flora items
  for (const f of flora) {
    const def = defForFlora(f.kind);
    FP_SCRATCH.gx = f.gx; FP_SCRATCH.gy = f.gy; FP_SCRATCH.w = def.w; FP_SCRATCH.d = def.d;
    f.basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
    ORDER.add(f.gx, f.gy, def.w, def.d, f.basePx + spriteHeightPx(def, floraVariant(f)));
  }

  // 3. Add live creatures
  for (const c of liveCreatures) {
    const def    = spriteForCreature(c.species);
    const cgx    = Math.floor(c.gx);
    const cgy    = Math.floor(c.gy);
    FP_SCRATCH.gx = cgx; FP_SCRATCH.gy = cgy; FP_SCRATCH.w = def.w; FP_SCRATCH.d = def.d;
    const basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
    ORDER.add(cgx, cgy, def.w, def.d, basePx + spriteHeightPx(def, creatureVariant(c)));
  }

  // 4. Add players
  for (const p of players) {
    if (p.respawnTimer > 0) continue;
    const pgx = Math.floor(p.gx);
    const pgy = Math.floor(p.gy);
    FP_SCRATCH.gx = pgx; FP_SCRATCH.gy = pgy; FP_SCRATCH.w = 1; FP_SCRATCH.d = 1;
    const basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
    ORDER.add(pgx, pgy, 1, 1, basePx + spriteHeightPx(PLAYER_SPRITES[p.index], playerVariant(p)));
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
    isLegal = canPlaceBuilding(buildKind, ghostTile.gx, ghostTile.gy, world, liveBuildings);
    FP_SCRATCH.gx = ghostTile.gx; FP_SCRATCH.gy = ghostTile.gy; FP_SCRATCH.w = ghostDef.w; FP_SCRATCH.d = ghostDef.d;
    ghostBasePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
    ORDER.add(ghostTile.gx, ghostTile.gy, ghostDef.w, ghostDef.d, ghostBasePx + spriteHeightPx(ghostDef, VARIANT_ZERO));
  }

  const numBuildings = liveBuildings.length;
  const numFlora     = flora.length;
  const numCreatures = liveCreatures.length;
  const numPlayers   = players.length;
  const ghostIndex   = ghostDef !== undefined ? numBuildings + numFlora + numCreatures + numPlayers : -1;

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

      // Draw ground footprint boundary (marching-ant lines) directly on the ground plane
      // BEFORE solids are sorted and drawn, so all foreground players, trees, and structures
      // correctly occlude and sort over the ground lines.
      if (ghostDef !== undefined) {
        drawFootprint(pen, ghostTile.gx, ghostTile.gy, ghostDef.w, ghostDef.d, isLegal ? 'ok' : 'bad', SELECT_LIFT, ghostBasePx);
      }
    },

    solids(pen, order) {
      for (let i = 0; i < order.count; i++) {
        const idx = order.indexAt(i);

        if (idx < numBuildings) {
          // Buildings
          const b = liveBuildings[idx];
          if (b === undefined) continue;
          const def  = defFor(b.kind);
          (VARIANT_SCRATCH as any).seed  = b.id;
          (VARIANT_SCRATCH as any).progress = 1;
          drawSprite(pen, def, b.gx, b.gy, VARIANT_SCRATCH, b.basePx);

        } else if (idx < numBuildings + numFlora) {
          // Flora
          const f = flora[idx - numBuildings];
          if (f === undefined) continue;
          const def = defForFlora(f.kind);
          const v = floraVariant(f);
          drawSprite(pen, def, f.gx, f.gy, v, f.basePx);

        } else if (idx < numBuildings + numFlora + numCreatures) {
          // Creatures
          const c = liveCreatures[idx - numBuildings - numFlora];
          if (c === undefined) continue;
          const def    = spriteForCreature(c.species);
          const v      = creatureVariant(c);
          const cgx    = Math.floor(c.gx);
          const cgy    = Math.floor(c.gy);
          FP_SCRATCH.gx = cgx; FP_SCRATCH.gy = cgy; FP_SCRATCH.w = def.w; FP_SCRATCH.d = def.d;
          const basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
          drawSprite(pen, def, c.gx, c.gy, v, basePx);

        } else if (idx < numBuildings + numFlora + numCreatures + numPlayers) {
          // Players
          const p = players[idx - numBuildings - numFlora - numCreatures];
          if (p === undefined || p.respawnTimer > 0) continue;
          const def    = PLAYER_SPRITES[p.index];
          const v      = playerVariant(p);
          const pgx    = Math.floor(p.gx);
          const pgy    = Math.floor(p.gy);
          FP_SCRATCH.gx = pgx; FP_SCRATCH.gy = pgy; FP_SCRATCH.w = 1; FP_SCRATCH.d = 1;
          const basePx = footprintBase(world.field, FP_SCRATCH as unknown as Footprint);
          drawSprite(pen, def, p.gx, p.gy, v, basePx);

        } else if (idx === ghostIndex && ghostDef !== undefined) {
          // Ghost preview — correctly depth-sorted against players, trees and structures!
          drawGhost(pen, ghostDef, ghostTile.gx, ghostTile.gy, VARIANT_ZERO, isLegal, ghostBasePx);
        }
      }
    },

    overlay(pen) {
      // In-Canvas HUD for each player's viewport
      const viewW = pen.camera.viewW;
      const viewH = pen.camera.viewH;

      // 1. Synchronized darkness wash across the viewport
      if (darkness > 0) {
        pen.surface.poly(
          Float64Array.of(0, 0, viewW, 0, viewW, viewH, 0, viewH),
          4,
          withAlpha(NIGHT_COLOR, darkness),
        );
      }

      // 2. Divider line (drawn once on left viewport)
      if (isLeft) {
        const fullW = pen.surface.width;
        const cx    = fullW * 0.5;
        pen.surface.stroke(Float64Array.of(cx, 0, cx, viewH), 2, false, hex('#2d4020'), 2);
      }

      // 3. Player HUD Card
      const pIdx = activePlayer.index;
      const pColor = pIdx === 0 ? P1_COLOR : P2_COLOR;
      const pAccent = pIdx === 0 ? P1_ACCENT : P2_ACCENT;
      const pLabel = pIdx === 0 ? 'PLAYER 1' : 'PLAYER 2';

      const padX = 14;
      const padY = 14;
      const hudW = 240;
      const hudH = 74;

      const isHurt = activePlayer.hurtFlash > 0;
      const cardBorder = isHurt ? hex('#e74c3c') : pColor;
      const cardBg = isHurt ? hex('#280808') : hex('#0c160a');

      // HUD Background panel
      pen.surface.poly(
        Float64Array.of(
          padX, padY,
          padX + hudW, padY,
          padX + hudW, padY + hudH,
          padX, padY + hudH,
        ),
        4,
        cardBg,
      );
      pen.surface.stroke(
        Float64Array.of(
          padX, padY,
          padX + hudW, padY,
          padX + hudW, padY + hudH,
          padX, padY + hudH,
        ),
        4,
        true,
        cardBorder,
        isHurt ? 2.5 : 1.5,
      );

      // Header row: Player Tag + HP number
      screenText(
        pen,
        padX + 10,
        padY + 12,
        pLabel,
        pAccent,
        { ...DEFAULT_TEXT, size: 12, weight: 800, align: -1, baseline: 0 },
      );

      const currentHp = Math.max(0, Math.ceil(activePlayer.hp));
      const hpRatio = activePlayer.hp / MAX_HP;
      const hpColor = isHurt ? hex('#ff6b6b') : (hpRatio > 0.3 ? UI_HP_GOOD : UI_HP_BAD);
      screenText(
        pen,
        padX + hudW - 10,
        padY + 12,
        `${currentHp} / ${MAX_HP} HP`,
        hpColor,
        { ...DEFAULT_TEXT, size: 11, weight: 700, align: 1, baseline: 0 },
      );

      // Health bar container
      const barX = padX + 10;
      const barY = padY + 24;
      const barW = hudW - 20;
      const barH = 8;

      pen.surface.poly(
        Float64Array.of(barX, barY, barX + barW, barY, barX + barW, barY + barH, barX, barY + barH),
        4,
        hex('#1a2414'),
      );
      if (hpRatio > 0) {
        const fillW = Math.max(2, barW * clamp(hpRatio, 0, 1));
        pen.surface.poly(
          Float64Array.of(barX, barY, barX + fillW, barY, barX + fillW, barY + barH, barX, barY + barH),
          4,
          isHurt ? hex('#ff7979') : (hpRatio > 0.3 ? UI_HP_GOOD : UI_HP_BAD),
        );
      }

      // Tool / Mode badge
      const toolX = padX + 10;
      const toolY = padY + 38;
      const toolW = hudW - 20;
      const toolH = 26;

      pen.surface.poly(
        Float64Array.of(toolX, toolY, toolX + toolW, toolY, toolX + toolW, toolY + toolH, toolX, toolY + toolH),
        4,
        hex('#132110'),
      );
      pen.surface.stroke(
        Float64Array.of(toolX, toolY, toolX + toolW, toolY, toolX + toolW, toolY + toolH, toolX, toolY + toolH),
        4,
        true,
        activePlayer.mode === 'move' ? hex('#34495e') : UI_TOOL_GOLD,
        1,
      );

      const actKey = pIdx === 0 ? '[E]' : '[O]';
      const modeText = activePlayer.mode === 'move' ? `MOVE  ${actKey} INTERACT` : `BUILD: ${activePlayer.mode.toUpperCase()}  ${actKey}`;
      const cycleKey = pIdx === 0 ? '[F] Mode' : '[H] Mode';

      screenText(
        pen,
        toolX + 8,
        toolY + 13,
        modeText,
        activePlayer.mode === 'move' ? hex('#bdc3c7') : UI_TOOL_GOLD,
        { ...DEFAULT_TEXT, size: 10, weight: 700, align: -1, baseline: 0 },
      );

      screenText(
        pen,
        toolX + toolW - 8,
        toolY + 13,
        cycleKey,
        hex('#8da882'),
        { ...DEFAULT_TEXT, size: 10, weight: 600, align: 1, baseline: 0 },
      );

      // Respawn banner if knocked down
      if (activePlayer.respawnTimer > 0) {
        const respawnSec = Math.ceil(activePlayer.respawnTimer);
        const bannerY = viewH * 0.45;
        const bannerW = Math.min(300, viewW - 40);
        const bannerX = (viewW - bannerW) * 0.5;

        pen.surface.poly(
          Float64Array.of(bannerX, bannerY, bannerX + bannerW, bannerY, bannerX + bannerW, bannerY + 44, bannerX, bannerY + 44),
          4,
          hex('#400a0a'),
        );
        pen.surface.stroke(
          Float64Array.of(bannerX, bannerY, bannerX + bannerW, bannerY, bannerX + bannerW, bannerY + 44, bannerX, bannerY + 44),
          4,
          true,
          hex('#e74c3c'),
          2,
        );
        screenText(
          pen,
          viewW * 0.5,
          bannerY + 22,
          `KNOCKED DOWN — RESPAWN IN ${respawnSec}s`,
          hex('#ffffff'),
          { ...DEFAULT_TEXT, size: 12, weight: 800, align: 0, baseline: 0 },
        );
      }
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
