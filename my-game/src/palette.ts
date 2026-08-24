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

// ── Creature & Character detail hues ─────────────────────────────────────────

/** Rabbit — small, shy, fast. */
export const RABBIT       = hex('#e8dfd8');
export const RABBIT_EAR   = hex('#f5b8be');
/** Deer — graceful, medium, grazer. */
export const DEER         = hex('#a66a38');
export const DEER_BELLY   = hex('#e6cfb8');
export const ANTLER_BONE  = hex('#dcd2b8');
/** Wolf — predator, low silhouette, dark. */
export const WOLF         = hex('#424754');
export const WOLF_MANE    = hex('#6a7282');
export const WOLF_EYE     = hex('#f39c12');
/** Troll — hostile, large, aggressive. Destroys buildings. */
export const TROLL        = hex('#4d5747');
export const TROLL_MOSS   = hex('#5b7a3e');
export const TROLL_EYE    = hex('#e74c3c');
/** Fox — cunning, mid-tier, raids food stores. */
export const FOX          = hex('#d35400');
export const FOX_WHITE    = hex('#fdfefe');
export const FOX_DARK     = hex('#2c3e50');

// ── Player & Tool colors ───────────────────────────────────────────────────────

/** Player 1 accent — vibrant cobalt blue. */
export const P1_COLOR     = hex('#2980b9');
export const P1_ACCENT    = hex('#5dade2');
/** Player 2 accent — warm explorer amber/orange. */
export const P2_COLOR     = hex('#d35400');
export const P2_ACCENT    = hex('#f39c12');

export const SKIN_TONE    = hex('#f5cba7');
export const HAIR_DARK    = hex('#342216');
export const HAIR_BLONDE  = hex('#d4ac0d');
export const BOOTS_DARK   = hex('#212f3d');
export const BACKPACK_COL = hex('#6e4c27');
export const TOOL_GOLD    = hex('#f1c40f');
export const TOOL_STEEL   = hex('#bdc3c7');

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
