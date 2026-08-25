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
  type Rgba,
} from '@latticekit/draw';
import { clamp } from '@latticekit/core';
import type { Player } from './players.js';
import {
  MAX_HP,
  canAffordBuilding,
  canAffordWeapon,
  INVENTORY_ITEMS_ORDER,
  INVENTORY_CRAFT_ORDER,
} from './players.js';
import { BUILDING_COSTS, BUILDING_REGISTRY, type BuildingKind } from './buildings.js';
import { WEAPONS, type WeaponKind } from './combat.js';
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
  const hudH = 124;

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
    textStyle(12, 800, -1, 0),
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
    textStyle(11, 700, 1, 0),
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

  // 4. Tool / Mode badge
  const toolX = padX + 10;
  const toolY = padY + 38;
  const toolW = hudW - 20;
  const toolH = 26;

  pen.surface.poly(setBox(toolX, toolY, toolW, toolH), 4, hex('#132110'));

  const invKey = pIdx === 0 ? '[C/V] Inventory' : '[,/.] Inventory';
  const placeKey = pIdx === 0 ? '[Space] Place' : '[N] Place';

  let modeText = '';
  let modeAction = invKey;
  let modeColor = hex('#bdc3c7');

  if (player.mode === 'move') {
    modeText = `EXPLORE`;
    modeAction = invKey;
  } else {
    const cost = BUILDING_COSTS[player.mode];
    const affordable = canAffordBuilding(player, player.mode);
    const name = player.mode === 'campfire' ? 'CAMPFIRE 🔥' : player.mode.replace('_', ' ').toUpperCase();
    const fiberCost = cost.fiber ? ` ${cost.fiber}🌿` : '';
    modeText = `🔨 ${name} (${cost.wood}🪵 ${cost.stone}🪨${fiberCost})`;
    modeAction = placeKey;
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
    toolY + 13,
    modeText,
    modeColor,
    textStyle(10, 700, -1, 0),
  );

  screenText(
    pen,
    toolX + toolW - 8,
    toolY + 13,
    modeAction,
    hex('#8da882'),
    textStyle(10, 600, 1, 0),
  );

  // 5. Weapon & Combat Bar
  const wepX = padX + 10;
  const wepY = padY + 68;
  const wepW = hudW - 20;
  const wepH = 26;

  pen.surface.poly(setBox(wepX, wepY, wepW, wepH), 4, hex('#181a24'));
  pen.surface.stroke(setBox(wepX, wepY, wepW, wepH), 4, true, hex('#3d5a80'), 1);

  const wepCycleKey = invKey;
  const wName = player.weapon.toUpperCase();

  screenText(
    pen,
    wepX + 8,
    wepY + 13,
    `⚔️ ${wName}`,
    hex('#90caf9'),
    textStyle(10, 800, -1, 0),
  );

  screenText(
    pen,
    wepX + wepW - 8,
    wepY + 13,
    wepCycleKey,
    hex('#ffe082'),
    textStyle(9, 700, 1, 0),
  );

  // 6. Location & Biome Radar Strip
  const gx = Math.floor(player.gx);
  const gy = Math.floor(player.gy);
  const elevation = world !== undefined ? world.heights.get(gx, gy) : 4;
  const biome = getBiomeAt(gx, gy, seed, elevation);

  screenText(
    pen,
    padX + 10,
    padY + 102,
    `${biome.icon} ${biome.name.toUpperCase()} · ${gx}, ${gy}`,
    hex('#80cbc4'),
    textStyle(9, 700, -1, 0),
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
      textStyle(12, 800, -1, 0),
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
      textStyle(12, 800, 0, 0),
    );
  }
}

// ── Inventory Overlay ───────────────────────────────────────────────────────────

/** Emoji shown per building kind in the Inventory's "craft" tab — `BuildingDefinition` carries
 *  no icon field of its own since only this one screen needs one. */
const BUILDING_ICONS: Record<BuildingKind, string> = {
  campfire: '🔥',
  wood_wall: '🪵',
  stone_wall: '🧱',
  wood_tower: '🗼',
  stone_tower: '🏯',
  floor: '🟫',
  gate: '🚪',
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
      `🪵 ${player.inventory.wood}   🪨 ${player.inventory.stone}   🌿 ${player.inventory.fiber}`,
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
        const affordable = canAffordWeapon(player, kind);
        status = `${def.cost.wood}🪵 ${def.cost.stone}🪨${fiberCost}`;
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
