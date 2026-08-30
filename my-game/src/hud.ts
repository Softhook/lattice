/**
 * In-canvas HUD rendering for Verdant.
 *
 * Deliberately minimal: the status card shows only what changes combat/build decisions right now
 * — HP, equipped weapon, and (only while one is armed) what's about to get placed. Resource
 * counts already live in the persistent DOM bar at the bottom of the screen (see `main.ts`'s
 * `updateDomHud`), so the canvas card doesn't repeat them; biome flavor text was dropped
 * entirely, and the grid coordinate shrank to a small top-left corner label.
 *
 * Uses scratch arrays to guarantee ZERO memory allocation per frame.
 */

import {
  screenText,
  DEFAULT_TEXT,
  withAlpha,
  hex,
  type Pen,
  type Rgba,
} from '@latticekit/draw';
import { clamp } from '@latticekit/core';
import type { Player } from './players.js';
import {
  MAX_HP,
  MAX_HUNGER,
  canAffordBuilding,
  canAffordWeapon,
  INVENTORY_ITEMS_ORDER,
  INVENTORY_CRAFT_ORDER,
} from './players.js';
import { BUILDING_COSTS, BUILDING_REGISTRY, type BuildingKind } from './buildings.js';
import { WEAPONS } from './combat.js';
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
const UI_CORNER_DIM = hex('#4a6a58');
const UI_HUNGER_MID = hex('#f1c40f');
const UI_HUNGER_LOW = hex('#e67e22');

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

// ── Static Scratch TextStyle for screenText Calls (Zero Allocation) ────────────

/** Mutable twin of `TextStyle`, on the same terms as `draw`'s own `text.ts` `SIZED` scratch:
 *  `{ ...DEFAULT_TEXT, size, weight, ... }` would allocate a fresh style object on every one
 *  of the ~10 `screenText` calls this module makes per player per frame. `screenText` reads
 *  it synchronously and does not retain it, so one reused object is safe to mutate per call. */
const TEXT_SCRATCH: { size: number; weight: number; family: string; align: -1 | 0 | 1; baseline: -1 | 0 | 1 } = {
  size: DEFAULT_TEXT.size,
  weight: DEFAULT_TEXT.weight,
  family: DEFAULT_TEXT.family,
  align: DEFAULT_TEXT.align,
  baseline: DEFAULT_TEXT.baseline,
};

function textStyle(size: number, weight: number, align: -1 | 0 | 1, baseline: -1 | 0 | 1): typeof TEXT_SCRATCH {
  TEXT_SCRATCH.size = size;
  TEXT_SCRATCH.weight = weight;
  TEXT_SCRATCH.align = align;
  TEXT_SCRATCH.baseline = baseline;
  return TEXT_SCRATCH;
}

/** Draw the split-screen divider line between viewports. */
export function drawSplitDivider(pen: Pen): void {
  const fullW = pen.surface.width;
  const viewH = pen.camera.viewH;
  const cx    = fullW * 0.5;
  pen.surface.stroke(setLine(cx, 0, cx, viewH), 2, false, hex('#2d4020'), 2);
}

/**
 * Draw the in-canvas player status card, plus the toast/respawn overlays anchored to it.
 *
 * The card itself has just three rows — header (name + HP), HP bar, equipped weapon — and grows
 * a fourth only while a build kind is armed. Nothing here duplicates the DOM resource bar or
 * repeats a hint the Inventory overlay already explains; see the module doc comment.
 */
export function drawPlayerHud(pen: Pen, player: Player): void {
  const viewW = pen.camera.viewW;
  const viewH = pen.camera.viewH;

  const pIdx = player.index;
  const pColor = pIdx === 0 ? P1_COLOR : P2_COLOR;
  const pAccent = pIdx === 0 ? P1_ACCENT : P2_ACCENT;
  const pLabel = pIdx === 0 ? 'PLAYER 1' : 'PLAYER 2';
  const invKey = pIdx === 0 ? '[C/V] Inventory' : '[,/.] Inventory';
  const placeKey = pIdx === 0 ? '[Space] Place' : '[N] Place';

  const padX = 14;
  const padY = 14;
  const hudW = 224;
  const rowH = 22;
  const armed = player.mode !== 'move';
  // Base region padY..padY+42 holds the header row plus the stacked HP and hunger bars; the
  // weapon row (and, when armed, the build row) stack below that.
  const hudH = 42 + rowH + (armed ? rowH + 4 : 0) + 8;

  const isHurt = player.hurtFlash > 0;
  const cardBorder = isHurt ? hex('#e74c3c') : pColor;
  const cardBg = isHurt ? hex('#280808') : hex('#0c160a');

  // Tiny grid-coordinate label, tucked above the card in the exact corner of the viewport.
  screenText(
    pen,
    padX,
    6,
    `${Math.floor(player.gx)}, ${Math.floor(player.gy)}`,
    UI_CORNER_DIM,
    textStyle(8, 600, -1, 0),
  );

  // 1. Card background
  pen.surface.poly(setBox(padX, padY, hudW, hudH), 4, cardBg);
  pen.surface.stroke(setBox(padX, padY, hudW, hudH), 4, true, cardBorder, isHurt ? 2.5 : 1.5);

  // 2. Header row: Player tag + HP number + hunger number
  screenText(pen, padX + 10, padY + 12, pLabel, pAccent, textStyle(12, 800, -1, 0));

  const currentHp = Math.max(0, Math.ceil(player.hp));
  const hpRatio = player.hp / MAX_HP;
  const hpColor = isHurt ? hex('#ff6b6b') : (hpRatio > 0.3 ? UI_HP_GOOD : UI_HP_BAD);

  const currentHunger = Math.max(0, Math.ceil(player.hunger));
  const hungerRatio = player.hunger / MAX_HUNGER;
  const starving = player.hunger <= 0;
  const hungerColor = starving
    ? hex('#ff6b6b')
    : hungerRatio > 0.5 ? UI_HP_GOOD : hungerRatio > 0.2 ? UI_HUNGER_MID : UI_HUNGER_LOW;

  screenText(pen, padX + hudW - 10, padY + 12, `${currentHp} ❤`, hpColor, textStyle(11, 700, 1, 0));
  screenText(pen, padX + hudW - 62, padY + 12, `${currentHunger} 🍖`, hungerColor, textStyle(11, 700, 1, 0));

  // 3. Stacked HP bar + hunger bar
  const barX = padX + 10;
  const barW = hudW - 20;
  const barH = 5;
  const hpBarY = padY + 22;
  const hungerBarY = padY + 30;

  pen.surface.poly(setBox(barX, hpBarY, barW, barH), 4, hex('#1a2414'));
  if (hpRatio > 0) {
    const fillW = Math.max(2, barW * clamp(hpRatio, 0, 1));
    pen.surface.poly(setBox(barX, hpBarY, fillW, barH), 4, isHurt ? hex('#ff7979') : (hpRatio > 0.3 ? UI_HP_GOOD : UI_HP_BAD));
  }

  pen.surface.poly(setBox(barX, hungerBarY, barW, barH), 4, hex('#1a2414'));
  if (hungerRatio > 0) {
    const fillW = Math.max(2, barW * clamp(hungerRatio, 0, 1));
    pen.surface.poly(setBox(barX, hungerBarY, fillW, barH), 4, hungerColor);
  }

  // 4. Weapon row — always the single place the Inventory hint is shown.
  const wepY = padY + 42;
  const wepW = hudW - 20;

  pen.surface.poly(setBox(barX, wepY, wepW, rowH), 4, hex('#181a24'));
  pen.surface.stroke(setBox(barX, wepY, wepW, rowH), 4, true, hex('#3d5a80'), 1);
  screenText(pen, barX + 8, wepY + rowH * 0.5 + 1, `${WEAPONS[player.weapon].icon} ${player.weapon.toUpperCase()}`, hex('#90caf9'), textStyle(10, 800, -1, 0));
  screenText(pen, barX + wepW - 8, wepY + rowH * 0.5 + 1, invKey, hex('#ffe082'), textStyle(9, 700, 1, 0));

  // 5. Armed-build row — only while a build kind is actually armed (see `players.ts`'s
  //    `buildAtFacing`, which disarms the instant it lands, so this row is inherently transient).
  if (player.mode !== 'move') {
    const modeY = wepY + rowH + 4;
    const affordable = canAffordBuilding(player, player.mode);
    const modeColor = affordable ? UI_TOOL_GOLD : hex('#e74c3c');
    const name = player.mode.replace('_', ' ').toUpperCase();

    pen.surface.poly(setBox(barX, modeY, wepW, rowH), 4, hex('#132110'));
    pen.surface.stroke(setBox(barX, modeY, wepW, rowH), 4, true, modeColor, 1);
    screenText(pen, barX + 8, modeY + rowH * 0.5 + 1, `🔨 ${name}`, modeColor, textStyle(10, 700, -1, 0));
    screenText(pen, barX + wepW - 8, modeY + rowH * 0.5 + 1, placeKey, hex('#8da882'), textStyle(10, 600, 1, 0));
  }

  // 6. Floating action toast, directly under the card (its height already reflects row 5).
  if (player.lastActionMsg.length > 0 && player.msgTimer > 0) {
    const msgY = padY + hudH + 16;
    const alpha = Math.min(1, player.msgTimer * 2);
    const msgCol = player.lastActionMsg.startsWith('NEED')
      ? withAlpha(hex('#ff7675'), alpha)
      : withAlpha(hex('#55efc4'), alpha);
    screenText(pen, padX + 10, msgY, player.lastActionMsg, msgCol, textStyle(12, 800, -1, 0));
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
      textStyle(12, 800, 0, 0),
    );
  }
}

// ── Inventory Overlay ───────────────────────────────────────────────────────────

/** Emoji shown per building kind in the Inventory's "craft" tab — `BuildingDefinition` carries
 *  no icon field of its own since only this one screen needs one. */
const BUILDING_ICONS: Record<BuildingKind, string> = {
  campfire: '🔥',
  bed: '🛏️',
  palisade: '🌲',
  wood_wall: '🪵',
  stone_wall: '🧱',
  wood_tower: '🗼',
  stone_tower: '🏯',
  floor: '🟫',
  gate: '🚪',
  // Never shown — `wizard_tower` isn't in `INVENTORY_CRAFT_ORDER` (see the note on it in
  // `buildings.ts`), but `BUILDING_ICONS` is a `Record` over every `BuildingKind`.
  wizard_tower: '🧙',
};

const ROW_TEXT_OK    = hex('#8da882');
const ROW_TEXT_DENY  = hex('#e74c3c');
const ROW_EQUIPPED   = hex('#2ecc71');
const ROW_OWNED      = hex('#90caf9');
const ROW_ARMED      = hex('#f1c40f');
const TAB_INACTIVE   = hex('#8da882');
const TAB_BORDER_OFF = hex('#34495e');

/** Draw one tab button (module-level, not a closure, so it allocates nothing per frame). */
function drawTabButton(
  pen: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  active: boolean,
  accent: Rgba,
): void {
  pen.surface.poly(setBox(x, y, w, h), 4, active ? withAlpha(accent, 0.22) : hex('#132110'));
  pen.surface.stroke(setBox(x, y, w, h), 4, true, active ? accent : TAB_BORDER_OFF, active ? 1.5 : 1);
  screenText(pen, x + w * 0.5, y + h * 0.5 + 1, label, active ? accent : TAB_INACTIVE, textStyle(11, 800, 0, 0));
}

/**
 * Draw the full-viewport Inventory overlay (opened with C/V or ,/.): weapons to unlock/equip on
 * the "items" tab, build kinds to arm on the "craft" tab. Covers most of the player's half of the
 * split screen, leaving a margin so the world stays visible behind it.
 */
export function drawInventoryOverlay(pen: Pen, player: Player): void {
  const viewW = pen.camera.viewW;
  const viewH = pen.camera.viewH;
  const pIdx = player.index;
  const pColor = pIdx === 0 ? P1_COLOR : P2_COLOR;
  const pAccent = pIdx === 0 ? P1_ACCENT : P2_ACCENT;
  const invKey = pIdx === 0 ? '[C/V]' : '[,/.]';
  const navKey = pIdx === 0 ? '[W/S/A/D]' : '[I/K/J/L]';
  const selectKey = pIdx === 0 ? '[Space]' : '[N]';

  const margin = Math.max(16, Math.min(viewW, viewH) * 0.05);
  const panelX = margin;
  const panelY = margin;
  const panelW = viewW - margin * 2;
  const panelH = viewH - margin * 2;

  // Dim the world behind the overlay, then the panel itself.
  pen.surface.poly(setBox(0, 0, viewW, viewH), 4, withAlpha(hex('#000000'), 0.55));
  pen.surface.poly(setBox(panelX, panelY, panelW, panelH), 4, hex('#0c160a'));
  pen.surface.stroke(setBox(panelX, panelY, panelW, panelH), 4, true, pColor, 2);

  // Header
  screenText(pen, panelX + 18, panelY + 24, `INVENTORY — PLAYER ${pIdx + 1}`, pAccent, textStyle(15, 800, -1, 0));
  screenText(pen, panelX + panelW - 18, panelY + 24, `${navKey} Move   ${selectKey} Select   ${invKey} Close`, ROW_TEXT_OK, textStyle(10, 700, 1, 0));

  // Tabs
  const tabY = panelY + 42;
  const tabW = Math.min(140, (panelW - 36) * 0.3);
  const tabH = 28;
  drawTabButton(pen, panelX + 18, tabY, tabW, tabH, 'ITEMS', player.invTab === 'items', pAccent);
  drawTabButton(pen, panelX + 18 + tabW + 10, tabY, tabW, tabH, 'CRAFT', player.invTab === 'craft', pAccent);

  // Resource strip (items tab only — what the crafting costs below are measured against)
  let gridTop = tabY + tabH + 14;
  if (player.invTab === 'items') {
    screenText(
      pen,
      panelX + 18,
      gridTop,
      `🪵 ${player.inventory.wood}   🪨 ${player.inventory.stone}   🌿 ${player.inventory.fiber}   ⛓️ ${player.inventory.iron}   💎 ${player.inventory.gems}`,
      hex('#d4a373'),
      textStyle(12, 700, -1, 0),
    );
    gridTop += 22;
  }

  // Row grid — scrolls to keep the cursor visible when the list overflows the panel.
  const footerH = 20;
  const rowH = 36;
  const gridX = panelX + 18;
  const gridW = panelW - 36;
  const gridH = Math.max(rowH, panelY + panelH - footerH - 14 - gridTop);
  const rowsVisible = Math.max(1, Math.floor(gridH / rowH));

  const total = player.invTab === 'items' ? INVENTORY_ITEMS_ORDER.length : INVENTORY_CRAFT_ORDER.length;
  let scroll = player.invCursor >= rowsVisible ? player.invCursor - rowsVisible + 1 : 0;
  scroll = Math.min(scroll, Math.max(0, total - rowsVisible));

  for (let i = scroll; i < Math.min(total, scroll + rowsVisible); i++) {
    const rowY = gridTop + (i - scroll) * rowH;
    const selected = i === player.invCursor;

    let icon: string;
    let name: string;
    let status: string;
    let statusColor: Rgba;
    let highlight: Rgba;

    if (player.invTab === 'items') {
      const kind = INVENTORY_ITEMS_ORDER[i];
      if (kind === undefined) continue;
      const def = WEAPONS[kind];
      const owned = player.craftedWeapons.includes(kind);
      const equipped = player.weapon === kind;
      icon = def.icon;
      name = def.name.toUpperCase();
      if (equipped) {
        status = 'EQUIPPED';
        statusColor = ROW_EQUIPPED;
        highlight = ROW_EQUIPPED;
      } else if (owned) {
        status = 'OWNED — SELECT TO EQUIP';
        statusColor = ROW_OWNED;
        highlight = ROW_OWNED;
      } else {
        const fiberCost = def.cost.fiber ? ` ${def.cost.fiber}🌿` : '';
        const ironCost = def.cost.iron ? ` ${def.cost.iron}⛓️` : '';
        const affordable = canAffordWeapon(player, kind);
        status = `${def.cost.wood}🪵 ${def.cost.stone}🪨${fiberCost}${ironCost}`;
        statusColor = affordable ? UI_TOOL_GOLD : ROW_TEXT_DENY;
        highlight = statusColor;
      }
    } else {
      const kind = INVENTORY_CRAFT_ORDER[i];
      if (kind === undefined) continue;
      const def = BUILDING_REGISTRY[kind];
      const cost = BUILDING_COSTS[kind];
      const armed = player.mode === kind;
      icon = BUILDING_ICONS[kind];
      name = def.name.toUpperCase();
      if (armed) {
        status = 'ARMED — SELECT TO DISARM';
        statusColor = ROW_ARMED;
        highlight = ROW_ARMED;
      } else {
        const fiberCost = cost.fiber ? ` ${cost.fiber}🌿` : '';
        const affordable = canAffordBuilding(player, kind);
        status = `${cost.wood}🪵 ${cost.stone}🪨${fiberCost}`;
        statusColor = affordable ? ROW_OWNED : ROW_TEXT_DENY;
        highlight = statusColor;
      }
    }

    pen.surface.poly(setBox(gridX, rowY, gridW, rowH - 4), 4, selected ? withAlpha(highlight, 0.18) : hex('#101c0c'));
    pen.surface.stroke(setBox(gridX, rowY, gridW, rowH - 4), 4, true, selected ? highlight : hex('#20301c'), selected ? 1.5 : 1);

    screenText(pen, gridX + 12, rowY + (rowH - 4) * 0.5 + 1, `${icon}  ${name}`, selected ? hex('#ffffff') : hex('#d2e8bf'), textStyle(12, selected ? 800 : 600, -1, 0));
    screenText(pen, gridX + gridW - 12, rowY + (rowH - 4) * 0.5 + 1, status, statusColor, textStyle(10, 700, 1, 0));
  }

  // Scroll indicator
  if (total > rowsVisible) {
    const trackX = gridX + gridW + 6;
    const trackY = gridTop;
    const trackH = rowsVisible * rowH - 4;
    pen.surface.stroke(setLine(trackX, trackY, trackX, trackY + trackH), 2, false, hex('#20301c'), 3);
    const thumbH = Math.max(14, trackH * (rowsVisible / total));
    const thumbY = trackY + (trackH - thumbH) * (scroll / Math.max(1, total - rowsVisible));
    pen.surface.stroke(setLine(trackX, thumbY, trackX, thumbY + thumbH), 2, false, pAccent, 3);
  }
}

// ── Mission Announcement Banner ─────────────────────────────────────────────────

const MISSION_GLOW = hex('#a55eea');

/**
 * Draw a mission's discovery banner across the top of one viewport — a global event, so
 * `render.ts` calls this in both viewports' overlay passes rather than tying it to either
 * player's own HUD card. Fades in over the first quarter-second and out over the last, driven
 * entirely by `secondsRemaining` (so both viewports stay in lockstep without their own timers).
 */
export function drawMissionBanner(
  pen: Pen,
  title: string,
  subtitle: string,
  secondsRemaining: number,
  totalSeconds: number,
): void {
  const viewW = pen.camera.viewW;
  const alpha = Math.min(1, (totalSeconds - secondsRemaining) * 4) * Math.min(1, secondsRemaining * 2);
  if (alpha <= 0) return;

  const bannerW = Math.min(560, viewW - 40);
  const bannerX = (viewW - bannerW) * 0.5;
  const bannerY = 26;
  const bannerH = 56;

  pen.surface.poly(setBox(bannerX, bannerY, bannerW, bannerH), 6, withAlpha(hex('#160c22'), alpha * 0.92));
  pen.surface.stroke(setBox(bannerX, bannerY, bannerW, bannerH), 6, true, withAlpha(MISSION_GLOW, alpha), 2);

  screenText(pen, viewW * 0.5, bannerY + 24, title, withAlpha(MISSION_GLOW, alpha), textStyle(15, 800, 0, 0));
  screenText(pen, viewW * 0.5, bannerY + 42, subtitle, withAlpha(hex('#d2bfe8'), alpha), textStyle(10, 600, 0, 0));
}
