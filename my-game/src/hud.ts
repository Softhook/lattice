/**
 * In-canvas HUD rendering for Verdant.
 *
 * Renders player stats, health bar, inventory counts, active mode/cost badges,
 * action toasts, and respawn banners.
 *
 * Uses scratch arrays to guarantee ZERO memory allocation per frame.
 */

import {
  screenText,
  DEFAULT_TEXT,
  withAlpha,
  hex,
  type Pen,
} from '@latticekit/draw';
import { clamp } from '@latticekit/core';
import type { Player } from './players.js';
import { MAX_HP, canAffordBuilding } from './players.js';
import { BUILDING_COSTS } from './buildings.js';
import { getBiomeAt, type WorldTerrain } from './world.js';
import {
  P1_COLOR,
  P1_ACCENT,
  P2_COLOR,
  P2_ACCENT,
} from './palette.js';


// ── Colors for UI ─────────────────────────────────────────────────────────────

const UI_HP_GOOD    = hex('#2ecc71');
const UI_HP_BAD     = hex('#e74c3c');
const UI_TOOL_GOLD  = hex('#f1c40f');
const UI_WOOD_COL   = hex('#d4a373');
const UI_STONE_COL  = hex('#b0bec5');
const UI_FIBER_COL  = hex('#81c784');

// ── Static Scratch Arrays for Poly / Stroke Calls (Zero Allocation) ────────────

const QUAD_SCRATCH = new Float64Array(8);

function setQuad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): Float64Array {
  QUAD_SCRATCH[0] = x0;
  QUAD_SCRATCH[1] = y0;
  QUAD_SCRATCH[2] = x1;
  QUAD_SCRATCH[3] = y1;
  QUAD_SCRATCH[4] = x2;
  QUAD_SCRATCH[5] = y2;
  QUAD_SCRATCH[6] = x3;
  QUAD_SCRATCH[7] = y3;
  return QUAD_SCRATCH;
}

function setBox(x: number, y: number, w: number, h: number): Float64Array {
  return setQuad(x, y, x + w, y, x + w, y + h, x, y + h);
}

const LINE_SCRATCH = new Float64Array(4);

function setLine(x0: number, y0: number, x1: number, y1: number): Float64Array {
  LINE_SCRATCH[0] = x0;
  LINE_SCRATCH[1] = y0;
  LINE_SCRATCH[2] = x1;
  LINE_SCRATCH[3] = y1;
  return LINE_SCRATCH;
}

/** Draw the split-screen divider line between viewports. */
export function drawSplitDivider(pen: Pen): void {
  const fullW = pen.surface.width;
  const viewH = pen.camera.viewH;
  const cx    = fullW * 0.5;
  pen.surface.stroke(setLine(cx, 0, cx, viewH), 2, false, hex('#2d4020'), 2);
}

/** Draw the in-canvas player status HUD card. */
export function drawPlayerHud(
  pen: Pen,
  player: Player,
  world?: WorldTerrain,
  seed = 42,
): void {
  const viewW = pen.camera.viewW;
  const viewH = pen.camera.viewH;

  const pIdx = player.index;
  const pColor = pIdx === 0 ? P1_COLOR : P2_COLOR;
  const pAccent = pIdx === 0 ? P1_ACCENT : P2_ACCENT;
  const pLabel = pIdx === 0 ? 'PLAYER 1' : 'PLAYER 2';

  const padX = 14;
  const padY = 14;
  const hudW = 280;
  const hudH = 152;

  const isHurt = player.hurtFlash > 0;
  const cardBorder = isHurt ? hex('#e74c3c') : pColor;
  const cardBg = isHurt ? hex('#280808') : hex('#0c160a');

  // 1. HUD Background panel
  pen.surface.poly(setBox(padX, padY, hudW, hudH), 4, cardBg);
  pen.surface.stroke(setBox(padX, padY, hudW, hudH), 4, true, cardBorder, isHurt ? 2.5 : 1.5);

  // 2. Header row: Player Tag + HP number
  screenText(
    pen,
    padX + 10,
    padY + 12,
    pLabel,
    pAccent,
    { ...DEFAULT_TEXT, size: 12, weight: 800, align: -1, baseline: 0 },
  );

  const currentHp = Math.max(0, Math.ceil(player.hp));
  const hpRatio = player.hp / MAX_HP;
  const hpColor = isHurt ? hex('#ff6b6b') : (hpRatio > 0.3 ? UI_HP_GOOD : UI_HP_BAD);
  screenText(
    pen,
    padX + hudW - 10,
    padY + 12,
    `${currentHp} / ${MAX_HP} HP`,
    hpColor,
    { ...DEFAULT_TEXT, size: 11, weight: 700, align: 1, baseline: 0 },
  );

  // 3. Health bar
  const barX = padX + 10;
  const barY = padY + 24;
  const barW = hudW - 20;
  const barH = 7;

  pen.surface.poly(setBox(barX, barY, barW, barH), 4, hex('#1a2414'));
  if (hpRatio > 0) {
    const fillW = Math.max(2, barW * clamp(hpRatio, 0, 1));
    pen.surface.poly(
      setBox(barX, barY, fillW, barH),
      4,
      isHurt ? hex('#ff7979') : (hpRatio > 0.3 ? UI_HP_GOOD : UI_HP_BAD),
    );
  }

  // 4. Inventory Row
  const invY = padY + 41;
  const inv = player.inventory;
  screenText(
    pen,
    padX + 10,
    invY,
    `WOOD: ${inv.wood}`,
    UI_WOOD_COL,
    { ...DEFAULT_TEXT, size: 11, weight: 700, align: -1, baseline: 0 },
  );
  screenText(
    pen,
    padX + 105,
    invY,
    `STONE: ${inv.stone}`,
    UI_STONE_COL,
    { ...DEFAULT_TEXT, size: 11, weight: 700, align: -1, baseline: 0 },
  );
  screenText(
    pen,
    padX + 200,
    invY,
    `FIBER: ${inv.fiber}`,
    UI_FIBER_COL,
    { ...DEFAULT_TEXT, size: 11, weight: 700, align: -1, baseline: 0 },
  );

  // 5. Tool / Mode badge
  const toolX = padX + 10;
  const toolY = padY + 56;
  const toolW = hudW - 20;
  const toolH = 28;

  pen.surface.poly(setBox(toolX, toolY, toolW, toolH), 4, hex('#132110'));

  const actKey = pIdx === 0 ? '[Space]' : '[N]';
  const cycleKey = pIdx === 0 ? '[E/F] Build' : '[O/H] Build';

  let modeText = '';
  let modeColor = hex('#bdc3c7');

  if (player.mode === 'move') {
    modeText = `EXPLORE / ACTION ${actKey}`;
  } else {
    const cost = BUILDING_COSTS[player.mode];
    const affordable = canAffordBuilding(player, player.mode);
    const name = player.mode === 'campfire' ? 'CAMPFIRE 🔥' : player.mode.replace('_', ' ').toUpperCase();
    const fiberCost = cost.fiber ? ` ${cost.fiber}F` : '';
    modeText = `${name} (${cost.wood}W ${cost.stone}S${fiberCost}) ${actKey}`;
    modeColor = affordable ? UI_TOOL_GOLD : hex('#e74c3c');
  }

  pen.surface.stroke(
    setBox(toolX, toolY, toolW, toolH),
    4,
    true,
    player.mode === 'move' ? hex('#34495e') : modeColor,
    1,
  );

  screenText(
    pen,
    toolX + 8,
    toolY + 14,
    modeText,
    modeColor,
    { ...DEFAULT_TEXT, size: 10, weight: 700, align: -1, baseline: 0 },
  );

  screenText(
    pen,
    toolX + toolW - 8,
    toolY + 14,
    cycleKey,
    hex('#8da882'),
    { ...DEFAULT_TEXT, size: 10, weight: 600, align: 1, baseline: 0 },
  );

  // 6. Weapon & Combat Bar
  const wepX = padX + 10;
  const wepY = padY + 88;
  const wepW = hudW - 20;
  const wepH = 28;

  pen.surface.poly(setBox(wepX, wepY, wepW, wepH), 4, hex('#181a24'));
  pen.surface.stroke(setBox(wepX, wepY, wepW, wepH), 4, true, hex('#3d5a80'), 1);

  const wepCycleKey = pIdx === 0 ? '[C] Tool / Craft' : '[,] Tool / Craft';
  const wName = player.weapon.toUpperCase();

  screenText(
    pen,
    wepX + 8,
    wepY + 14,
    `EQUIPPED: ${wName}`,
    hex('#90caf9'),
    { ...DEFAULT_TEXT, size: 10, weight: 800, align: -1, baseline: 0 },
  );

  screenText(
    pen,
    wepX + wepW - 8,
    wepY + 14,
    wepCycleKey,
    hex('#ffe082'),
    { ...DEFAULT_TEXT, size: 9, weight: 700, align: 1, baseline: 0 },
  );

  // 7. Location & Biome Radar Strip
  const gx = Math.floor(player.gx);
  const gy = Math.floor(player.gy);
  const elevation = world !== undefined ? world.heights.get(gx, gy) : 4;
  const biome = getBiomeAt(gx, gy, seed, elevation);

  screenText(
    pen,
    padX + 10,
    padY + 124,
    `${biome.icon} ${biome.name.toUpperCase()} (X:${gx}, Y:${gy})`,
    hex('#80cbc4'),
    { ...DEFAULT_TEXT, size: 9, weight: 700, align: -1, baseline: 0 },
  );

  // 8. Floating action notification if present
  if (player.lastActionMsg.length > 0 && player.msgTimer > 0) {
    const msgY = padY + hudH + 16;
    const alpha = Math.min(1, player.msgTimer * 2);
    const msgCol = player.lastActionMsg.startsWith('NEED')
      ? withAlpha(hex('#ff7675'), alpha)
      : withAlpha(hex('#55efc4'), alpha);

    screenText(
      pen,
      padX + 10,
      msgY,
      player.lastActionMsg,
      msgCol,
      { ...DEFAULT_TEXT, size: 12, weight: 800, align: -1, baseline: 0 },
    );
  }


  // 7. Respawn banner if knocked down
  if (player.respawnTimer > 0) {
    const respawnSec = Math.ceil(player.respawnTimer);
    const bannerY = viewH * 0.45;
    const bannerW = Math.min(320, viewW - 40);
    const bannerX = (viewW - bannerW) * 0.5;

    pen.surface.poly(setBox(bannerX, bannerY, bannerW, 44), 4, hex('#400a0a'));
    pen.surface.stroke(setBox(bannerX, bannerY, bannerW, 44), 4, true, hex('#e74c3c'), 2);
    screenText(
      pen,
      viewW * 0.5,
      bannerY + 22,
      `KNOCKED DOWN — RESPAWN IN ${respawnSec}s`,
      hex('#ffffff'),
      { ...DEFAULT_TEXT, size: 12, weight: 800, align: 0, baseline: 0 },
    );
  }
}
