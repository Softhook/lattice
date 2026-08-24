/**
 * Color vocabulary for Verdant.
 *
 * All colors are pre-compiled to Rgba numbers via `hex()`.
 * Never store a color in a save file — store the hue/role and re-derive here on load,
 * so a palette change doesn't corrupt saves.
 *
 * The three-face rule: every solid gets left/right/top derived by `draw.shade` from one
 * base hex. The constants below are those base hues; never pick three hues for one object.
 */

import { hex, type Rgba } from '@latticekit/draw';

// ── Terrain biome colors ───────────────────────────────────────────────────────

/** Low elevation: lush meadow grass. */
export const GRASS  = hex('#5a8a4a');
/** Exposed dirt — dug tiles, player-raised mounds. */
export const DIRT   = hex('#9b7040');
/** High altitude rock face. */
export const ROCK   = hex('#7a7068');
/** Water — below sea-level tiles. */
export const WATER  = hex('#2a4a8a');
/** Snowcap above ~10 height units. */
export const SNOW   = hex('#d8dce8');
/** Sandy shore — just above water level. */
export const SAND   = hex('#c8a870');

// ── Building colors ────────────────────────────────────────────────────────────

/** Timber wall — basic wall block. */
export const TIMBER = hex('#8a6040');
/** Stone wall — upgraded wall. */
export const STONE  = hex('#888078');
/** Wood floor/platform. */
export const FLOOR  = hex('#a07848');
/** Tower body. */
export const TOWER  = hex('#686058');

// ── Creature base hues ─────────────────────────────────────────────────────────

/** Rabbit — small, shy, fast. */
export const RABBIT = hex('#c8b89a');
/** Deer — graceful, medium, grazer. */
export const DEER   = hex('#b08060');
/** Wolf — predator, low silhouette, dark. */
export const WOLF   = hex('#505060');
/** Troll — hostile, large, aggressive. Destroys buildings. */
export const TROLL  = hex('#486840');
/** Fox — cunning, mid-tier, raids food stores. */
export const FOX    = hex('#c87030');

// ── Player colors ──────────────────────────────────────────────────────────────

/** Player 1 accent — cool blue. */
export const P1_COLOR = hex('#60a8e0');
/** Player 2 accent — warm amber. */
export const P2_COLOR = hex('#e08040');

// ── Sky and atmosphere ─────────────────────────────────────────────────────────

/** Night sky color for the darkness overlay. */
export const NIGHT_COLOR = hex('#08100a');
/** Sky gradient top (deep) and bottom (horizon haze). */
export const SKY_TOP  = hex('#1a2f10');
export const SKY_MID  = hex('#2a4520');

// ── Palette slot names ─────────────────────────────────────────────────────────
//
// Named slots for the `Palette` the renderer uses. Each slot maps to a hex in the current
// lighting state. We use the BASE_SLOTS from draw, which provides: sky, ground, brand, etc.
// We extend with our own terrain and creature slots below.

/** Slot name for the active ground color (derived per biome in the terrain pass). */
export const SLOT_GROUND = 'ground';
/** Slot name for the sky backdrop gradient start. */
export const SLOT_SKY    = 'sky';
/** Slot name for the accent/brand color (used for UI highlights). */
export const SLOT_BRAND  = 'brand';

// ── Height thresholds (in height units, matching world.ts) ────────────────────

/** Below this → water tile (rendered as flat water quad). */
export const HEIGHT_WATER = 1;
/** Below this → sand/shore. */
export const HEIGHT_SAND  = 2;
/** Above this → rock face. */
export const HEIGHT_ROCK  = 8;
/** Above this → snow cap. */
export const HEIGHT_SNOW  = 11;

/** Pick the terrain ink slot name based on a height unit value. */
export function terrainColor(heightUnits: number): Rgba {
  if (heightUnits <= HEIGHT_WATER) return WATER;
  if (heightUnits <= HEIGHT_SAND)  return SAND;
  if (heightUnits >= HEIGHT_SNOW)  return SNOW;
  if (heightUnits >= HEIGHT_ROCK)  return ROCK;
  return GRASS;
}
