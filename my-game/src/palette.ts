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

import { hex, mix, type Rgba } from '@latticekit/draw';
import { toUnit, hash2 } from '@latticekit/core';


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

// ── Biome-Specific Terrain Colors (Minecraft-Style Vibrancy) ──────────────────

// 1. Badlands / Mesa Terracotta Strata & Sand
export const MESA_RED       = hex('#b84828');
export const MESA_ORANGE    = hex('#d97236');
export const MESA_YELLOW    = hex('#e2a048');
export const MESA_BROWN     = hex('#7c3d22');
export const MESA_WHITE     = hex('#d5bba8');
export const MESA_SAND      = hex('#c86b36');

// 2. Deep Taiga Cold Conifer Loam & Dark Slate
export const TAIGA_GRASS    = hex('#25462e');
export const TAIGA_DIRT     = hex('#3c342a');
export const TAIGA_ROCK     = hex('#4a555e');
export const TAIGA_SNOW     = hex('#d8e2ea');

// 3. Wetlands / Swamp Murky Peat & Dark Waters
export const SWAMP_GRASS    = hex('#364e22');
export const SWAMP_PEAT     = hex('#242918');
export const SWAMP_WATER    = hex('#1b3e34');
export const SWAMP_ALGAE    = hex('#4a6627');

// 4. Alpine Jagged Granite & Glacial Ice
export const ALPINE_ROCK    = hex('#56616b');
export const ALPINE_CLIFF   = hex('#3f464e');
export const ALPINE_ICE     = hex('#b0d5ea');
export const ALPINE_SNOW    = hex('#edf4fa');

// 5. Temperate Meadows Lush Turf & Chalk
export const MEADOW_GRASS   = hex('#4ea632');
export const MEADOW_LUSH    = hex('#5db83a');
export const MEADOW_DIRT    = hex('#825a32');
export const MEADOW_ROCK    = hex('#7a7268');

// 6. Desert Dunes & Coastal Shallows
export const DESERT_SAND    = hex('#e8be6b');
export const DESERT_DUNE    = hex('#d6a851');
export const SANDSTONE      = hex('#b88b4c');
export const COASTAL_WATER  = hex('#1c6499');

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
export const HEIGHT_ROCK  = 14;
/** Above this → snow cap. */
export const HEIGHT_SNOW  = 19;

/**
 * Return the exact ink color for any terrain tile driven by its biome, height stratum,

 * and natural geological banding (e.g. Minecraft-style terracotta layers in mesas).
 * Supports subtle smooth transitions between biomes via linear color interpolation.
 */
export function getTileColor(
  biomeKind: string,
  h: number,
  seed: number,
  gx: number,
  gy: number,
  secondaryBiome?: string,
  blend = 0,
): Rgba {
  const c1 = getPureBiomeColor(biomeKind, h, seed, gx, gy);
  if (secondaryBiome !== undefined && secondaryBiome !== biomeKind && blend > 0.05) {
    const c2 = getPureBiomeColor(secondaryBiome, h, seed, gx, gy);
    return mix(c1, c2, Math.min(0.5, blend * 0.6));
  }
  return c1;
}

function getPureBiomeColor(
  biomeKind: string,
  h: number,
  seed: number,
  gx: number,
  gy: number,
): Rgba {
  if (h <= HEIGHT_WATER) {
    if (biomeKind === 'wetlands') return SWAMP_WATER;
    if (biomeKind === 'coastal') return COASTAL_WATER;
    return WATER;
  }

  // 1. Badlands / Mesa: Layered Terracotta Strata
  if (biomeKind === 'badlands') {
    if (h <= HEIGHT_SAND) return MESA_SAND;
    // Stratified banding based on elevation layer
    const band = (Math.floor(h) + Math.floor(toUnit(hash2(seed, gx, gy)) * 2)) % 5;
    switch (band) {
      case 0: return MESA_RED;
      case 1: return MESA_ORANGE;
      case 2: return MESA_YELLOW;
      case 3: return MESA_BROWN;
      default: return MESA_WHITE;
    }
  }

  // 2. Alpine: Glacial Granite, Ice, and Summit Snow
  if (biomeKind === 'alpine') {
    if (h >= 18) return ALPINE_SNOW;
    if (h >= 14) return ALPINE_ROCK;
    if (h >= 11) return ALPINE_CLIFF;
    if (h >= 8) return ALPINE_ICE;
    return ROCK;
  }

  // 3. Deep Taiga: Cold Conifer Loam, Slate & Snow
  if (biomeKind === 'taiga') {
    if (h >= 17) return TAIGA_SNOW;
    if (h >= 13) return TAIGA_ROCK;
    if (h <= HEIGHT_SAND) return TAIGA_DIRT;
    return TAIGA_GRASS;
  }

  // 4. Wetlands: Dark Swamp Peat, Algae Green
  if (biomeKind === 'wetlands') {
    if (h <= HEIGHT_SAND) return SWAMP_PEAT;
    const algaeRoll = toUnit(hash2(seed ^ 0x33, gx, gy));
    return algaeRoll > 0.6 ? SWAMP_ALGAE : SWAMP_GRASS;
  }

  // 5. Coastal / Dunes
  if (biomeKind === 'coastal') {
    if (h <= HEIGHT_SAND + 1) return DESERT_SAND;
    if (h >= 12) return SANDSTONE;
    return DESERT_DUNE;
  }

  // 6. Temperate Meadows (Default)
  if (h >= HEIGHT_SNOW) return SNOW;
  if (h >= HEIGHT_ROCK) return MEADOW_ROCK;
  if (h <= HEIGHT_SAND) return SAND;
  const lushRoll = toUnit(hash2(seed ^ 0x55, gx, gy));
  return lushRoll > 0.5 ? MEADOW_LUSH : MEADOW_GRASS;
}

/** Legacy terrain color helper. */
export function terrainColor(heightUnits: number): Rgba {
  if (heightUnits <= HEIGHT_WATER) return WATER;
  if (heightUnits <= HEIGHT_SAND)  return SAND;
  if (heightUnits >= HEIGHT_SNOW)  return SNOW;
  if (heightUnits >= HEIGHT_ROCK)  return ROCK;
  return GRASS;
}


