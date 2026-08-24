/**
 * Flora and landscape features in Verdant.
 *
 * Procedural vegetation and rocks scattered across the world:
 * - Pine trees on higher grounds and northern slopes.
 * - Oak / broadleaf trees in temperate meadows.
 * - Berry bushes and flowering shrubs in clearings.
 * - Wildflower patches in sunny valleys.
 * - Boulders and mossy stones on hills.
 * - Forest mushrooms in shady groves.
 *
 * All flora are deterministic, seed-driven, and rendered through SolidWriter.
 */

import {
  defineSprite,
  type SpriteDef,
  type Massing,
  type SolidWriter,
  type Variant,
  hex,
} from '@latticekit/draw';
import { Rng, createRng, fbm2, clamp } from '@latticekit/core';
import { W, H, MAT_WATER, MAT_SAND, MAT_SNOW, MAT_ROCK, MAT_GRASS, getBiomeAt, getBiomeBlendAt, type WorldTerrain } from './world.js';




// ── Colors for Flora ──────────────────────────────────────────────────────────


export const PINE_NEEDLE   = hex('#1b3d22');
export const PINE_NEEDLE2  = hex('#25522e');
export const OAK_LEAF      = hex('#3c6b2e');
export const OAK_LEAF2     = hex('#4d8239');
export const WOOD_TRUNK    = hex('#4a2f1b');
export const BIRCH_TRUNK   = hex('#d2c8b8');
export const BUSH_GREEN    = hex('#357335');
export const BERRY_RED     = hex('#d9383a');
export const FLOWER_PETAL  = hex('#f2d649');
export const FLOWER_BLUE   = hex('#5689db');
export const FLOWER_PURPLE = hex('#9b59b6');
export const ROCK_GRAY     = hex('#6e7370');
export const ROCK_DARK     = hex('#4f5451');
export const MOSS_GREEN    = hex('#4f7832');
export const SHROOM_CAP    = hex('#c0392b');
export const SHROOM_STEM   = hex('#e8dfd8');

// Additional Biome Vegetation & Rock Colors
export const CACTUS_GREEN   = hex('#488236');
export const CACTUS_THORN   = hex('#8ac46e');
export const SWAMP_WOOD     = hex('#2d2015');
export const SWAMP_CANOPY   = hex('#2d421e');
export const SWAMP_VINE     = hex('#3d5926');
export const SPRUCE_WOOD    = hex('#362010');
export const SPRUCE_NEEDLE  = hex('#142e1b');
export const SPRUCE_NEEDLE2 = hex('#1c3d25');
export const BIRCH_BARK     = hex('#e5e1d8');
export const BIRCH_KNOT     = hex('#2b2926');
export const BIRCH_LEAF     = hex('#60b035');
export const BIRCH_LEAF2    = hex('#76c746');
export const SPIRE_RED      = hex('#a84428');
export const SPIRE_ORANGE   = hex('#c96538');
export const DEAD_WOOD      = hex('#7a6147');

// ── Flora Kinds & Definitions ─────────────────────────────────────────────────

export type FloraKind =
  | 'pine'
  | 'oak'
  | 'bush'
  | 'flowers'
  | 'rock'
  | 'mushroom'
  | 'cactus'
  | 'swamp_tree'
  | 'spruce'
  | 'birch'
  | 'rock_spire'
  | 'dead_bush';

export interface FloraItem {
  readonly id: number;
  readonly kind: FloraKind;
  gx: number;
  gy: number;
  w: number;
  d: number;
  basePx: number;
  scale: number;
  subType: number;
}

export interface SavedFlora {
  readonly kind: FloraKind;
  readonly gx: number;
  readonly gy: number;
  readonly scale: number;
  readonly subType: number;
}

import { SpatialGrid, MAX_SPATIAL_ENTITIES } from './spatial.js';


export const FLORA_SPATIAL = new SpatialGrid();

/** Rebuild the spatial grid index across all flora items. */
export function rebuildFloraSpatial(flora: readonly FloraItem[]): void {
  FLORA_SPATIAL.clear();
  for (let i = 0; i < flora.length; i++) {
    const f = flora[i];
    if (f !== undefined) {
      FLORA_SPATIAL.insert(i, f.gx, f.gy);
    }
  }
}

/** Extract current living flora items for persistence. */
export function extractSavedFlora(flora: readonly FloraItem[]): SavedFlora[] {
  return flora.map((f) => ({
    kind: f.kind,
    gx: f.gx,
    gy: f.gy,
    scale: f.scale,
    subType: f.subType,
  }));
}

/** Reconstruct flora items from saved state. */
export function restoreFlora(saved: readonly SavedFlora[]): FloraItem[] {
  let seq = 1;
  const items = saved.map((s) => ({
    id: seq++,
    kind: s.kind,
    gx: s.gx,
    gy: s.gy,
    w: 1,
    d: 1,
    basePx: 0,
    scale: s.scale,
    subType: s.subType,
  }));
  rebuildFloraSpatial(items);
  return items;
}


// ── Pine Tree Massing ─────────────────────────────────────────────────────────

const pineMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0.1, 0.1, 0.8 * s, 0.8 * s, 0.35);
  // Brown bark trunk
  w.box(0.4, 0.4, 0.2 * s, 0.2 * s, { color: WOOD_TRUNK, h: 1.4 * s });
  // Tier 1 bottom foliage
  w.box(0.12, 0.12, 0.76 * s, 0.76 * s, { color: PINE_NEEDLE, h: 0.9 * s, z: 0.8 * s });
  // Tier 2 middle foliage
  w.box(0.22, 0.22, 0.56 * s, 0.56 * s, { color: PINE_NEEDLE2, h: 0.9 * s, z: 1.6 * s });
  // Tier 3 top peak
  w.box(0.32, 0.32, 0.36 * s, 0.36 * s, { color: PINE_NEEDLE, h: 0.9 * s, z: 2.3 * s });
};

export const PINE_DEF: SpriteDef = defineSprite({ id: 'flora_pine', w: 1, d: 1, massing: pineMassing });

// ── Towering Spruce Massing (Deep Taiga) ──────────────────────────────────────

const spruceMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0.1, 0.1, 0.9 * s, 0.9 * s, 0.4);
  // Tall dark trunk
  w.box(0.38, 0.38, 0.24 * s, 0.24 * s, { color: SPRUCE_WOOD, h: 3.2 * s });
  // 4 Tight conical tiers of northern dark conifer needles
  w.box(0.1, 0.1, 0.8 * s, 0.8 * s, { color: SPRUCE_NEEDLE, h: 0.8 * s, z: 1.0 * s });
  w.box(0.18, 0.18, 0.64 * s, 0.64 * s, { color: SPRUCE_NEEDLE2, h: 0.8 * s, z: 1.7 * s });
  w.box(0.25, 0.25, 0.5 * s, 0.5 * s, { color: SPRUCE_NEEDLE, h: 0.8 * s, z: 2.4 * s });
  w.box(0.33, 0.33, 0.34 * s, 0.34 * s, { color: SPRUCE_NEEDLE2, h: 0.9 * s, z: 3.1 * s });
};

export const SPRUCE_DEF: SpriteDef = defineSprite({ id: 'flora_spruce', w: 1, d: 1, massing: spruceMassing });

// ── Oak Tree Massing ──────────────────────────────────────────────────────────

const oakMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0, 0, 1.2 * s, 1.2 * s, 0.4);
  // Thick trunk
  w.box(0.35, 0.35, 0.3 * s, 0.3 * s, { color: WOOD_TRUNK, h: 1.6 * s });
  // Broad lush lower canopy
  w.box(0.05, 0.05, 0.9 * s, 0.9 * s, { color: OAK_LEAF, h: 1.4 * s, z: 1.2 * s });
  // Crown highlight
  w.box(0.18, 0.18, 0.64 * s, 0.64 * s, { color: OAK_LEAF2, h: 0.9 * s, z: 2.3 * s });
};

export const OAK_DEF: SpriteDef = defineSprite({ id: 'flora_oak', w: 1, d: 1, massing: oakMassing });

// ── Birch Tree Massing (Meadows & Groves) ──────────────────────────────────────

const birchMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0.05, 0.05, 1.0 * s, 1.0 * s, 0.35);
  // White bark trunk with dark knots
  w.box(0.38, 0.38, 0.24 * s, 0.24 * s, { color: BIRCH_BARK, h: 2.2 * s });
  w.box(0.36, 0.36, 0.28 * s, 0.08 * s, { color: BIRCH_KNOT, h: 0.08 * s, z: 0.7 * s });
  w.box(0.36, 0.36, 0.08 * s, 0.28 * s, { color: BIRCH_KNOT, h: 0.08 * s, z: 1.3 * s });
  // Airy lime/golden-emerald foliage
  w.box(0.12, 0.12, 0.76 * s, 0.76 * s, { color: BIRCH_LEAF, h: 1.3 * s, z: 1.5 * s });
  w.box(0.22, 0.22, 0.56 * s, 0.56 * s, { color: BIRCH_LEAF2, h: 0.9 * s, z: 2.4 * s });
};

export const BIRCH_DEF: SpriteDef = defineSprite({ id: 'flora_birch', w: 1, d: 1, massing: birchMassing });

// ── Giant Swamp Willow Massing (Wetlands) ──────────────────────────────────────

const swampTreeMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0, 0, 1.4 * s, 1.4 * s, 0.5);
  // Buttress gnarled root cluster and dark wet trunk
  w.box(0.25, 0.25, 0.5 * s, 0.5 * s, { color: SWAMP_WOOD, h: 0.6 * s });
  w.box(0.35, 0.35, 0.3 * s, 0.3 * s, { color: SWAMP_WOOD, h: 1.8 * s, z: 0.5 * s });
  // Wide spreading canopy
  w.box(0.02, 0.02, 0.96 * s, 0.96 * s, { color: SWAMP_CANOPY, h: 1.2 * s, z: 1.5 * s });
  // Long hanging mossy vines
  w.box(0.08, 0.08, 0.18 * s, 0.18 * s, { color: SWAMP_VINE, h: 1.1 * s, z: 0.6 * s });
  w.box(0.74, 0.08, 0.18 * s, 0.18 * s, { color: SWAMP_VINE, h: 1.2 * s, z: 0.5 * s });
  w.box(0.08, 0.74, 0.18 * s, 0.18 * s, { color: SWAMP_VINE, h: 1.0 * s, z: 0.7 * s });
  w.box(0.74, 0.74, 0.18 * s, 0.18 * s, { color: SWAMP_VINE, h: 1.15 * s, z: 0.55 * s });
};

export const SWAMP_TREE_DEF: SpriteDef = defineSprite({ id: 'flora_swamp_tree', w: 1, d: 1, massing: swampTreeMassing });

// ── Saguaro Cactus Massing (Badlands & Deserts) ────────────────────────────────

const cactusMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0.15, 0.15, 0.7 * s, 0.7 * s, 0.25);
  // Main columnar stem
  w.box(0.38, 0.38, 0.24 * s, 0.24 * s, { color: CACTUS_GREEN, h: 2.2 * s });
  // Right arm branching out and up
  w.box(0.62, 0.42, 0.22 * s, 0.16 * s, { color: CACTUS_GREEN, h: 0.18 * s, z: 0.8 * s });
  w.box(0.68, 0.42, 0.16 * s, 0.16 * s, { color: CACTUS_GREEN, h: 0.85 * s, z: 0.98 * s });
  // Left arm branching out and up
  w.box(0.16, 0.42, 0.22 * s, 0.16 * s, { color: CACTUS_GREEN, h: 0.18 * s, z: 1.1 * s });
  w.box(0.16, 0.42, 0.16 * s, 0.16 * s, { color: CACTUS_GREEN, h: 0.75 * s, z: 1.28 * s });
};

export const CACTUS_DEF: SpriteDef = defineSprite({ id: 'flora_cactus', w: 1, d: 1, massing: cactusMassing });

// ── Sandstone / Granite Rock Spire Massing (Badlands & Alpine) ─────────────────

const rockSpireMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0.05, 0.05, 0.9 * s, 0.9 * s, 0.4);
  // Massive stepped monolith
  w.box(0.15, 0.15, 0.7 * s, 0.7 * s, { color: SPIRE_RED, h: 1.0 * s });
  w.box(0.24, 0.24, 0.52 * s, 0.52 * s, { color: SPIRE_ORANGE, h: 1.1 * s, z: 0.95 * s });
  w.box(0.32, 0.32, 0.36 * s, 0.36 * s, { color: SPIRE_RED, h: 1.2 * s, z: 2.0 * s });
};

export const ROCK_SPIRE_DEF: SpriteDef = defineSprite({ id: 'flora_rock_spire', w: 1, d: 1, massing: rockSpireMassing });

// ── Arid Dead Bush Massing ─────────────────────────────────────────────────────

const deadBushMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0.2, 0.2, 0.6 * s, 0.6 * s, 0.15);
  w.box(0.35, 0.35, 0.3 * s, 0.3 * s, { color: DEAD_WOOD, h: 0.3 * s });
  w.box(0.2, 0.25, 0.25 * s, 0.25 * s, { color: DEAD_WOOD, h: 0.4 * s, z: 0.18 * s });
  w.box(0.55, 0.45, 0.25 * s, 0.25 * s, { color: DEAD_WOOD, h: 0.45 * s, z: 0.18 * s });
};

export const DEAD_BUSH_DEF: SpriteDef = defineSprite({ id: 'flora_dead_bush', w: 1, d: 1, massing: deadBushMassing });

// ── Bush Massing ──────────────────────────────────────────────────────────────

const bushMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0.1, 0.1, 0.8 * s, 0.8 * s, 0.2);
  // Main rounded shrub
  w.box(0.15, 0.15, 0.7 * s, 0.7 * s, { color: BUSH_GREEN, h: 0.6 * s });
  w.box(0.25, 0.25, 0.5 * s, 0.5 * s, { color: OAK_LEAF2, h: 0.4 * s, z: 0.5 * s });
  // Little berries if subType > 0
  if (v.level > 0) {
    w.box(0.2, 0.3, 0.15, 0.15, { color: BERRY_RED, h: 0.2, z: 0.7 * s });
    w.box(0.6, 0.4, 0.15, 0.15, { color: BERRY_RED, h: 0.2, z: 0.6 * s });
    w.box(0.35, 0.65, 0.15, 0.15, { color: BERRY_RED, h: 0.2, z: 0.65 * s });
  }
};

export const BUSH_DEF: SpriteDef = defineSprite({ id: 'flora_bush', w: 1, d: 1, massing: bushMassing });

// ── Flower Patch Massing ──────────────────────────────────────────────────────

const flowerMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const flowerColor = v.level === 1 ? FLOWER_BLUE : v.level === 2 ? FLOWER_PURPLE : FLOWER_PETAL;
  w.shadow(0.2, 0.2, 0.6, 0.6, 0.15);
  // Green stems/tufts
  w.box(0.25, 0.25, 0.5, 0.5, { color: BUSH_GREEN, h: 0.15 });
  // Blossom petals
  w.box(0.2, 0.25, 0.2, 0.2, { color: flowerColor, h: 0.25, z: 0.15 });
  w.box(0.55, 0.3, 0.2, 0.2, { color: flowerColor, h: 0.25, z: 0.15 });
  w.box(0.35, 0.6, 0.2, 0.2, { color: flowerColor, h: 0.3, z: 0.15 });
};

export const FLOWER_DEF: SpriteDef = defineSprite({ id: 'flora_flowers', w: 1, d: 1, massing: flowerMassing });

// ── Rock / Boulder Massing ────────────────────────────────────────────────────

const rockMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0.1, 0.1, 0.8 * s, 0.8 * s, 0.3);
  // Main boulder base
  w.box(0.15, 0.15, 0.7 * s, 0.7 * s, { color: ROCK_GRAY, h: 0.5 * s });
  // Angular stone top
  w.box(0.25, 0.2, 0.5 * s, 0.5 * s, { color: ROCK_DARK, h: 0.4 * s, z: 0.4 * s });
  // Moss top patch
  if (v.level > 0) {
    w.box(0.3, 0.3, 0.4 * s, 0.3 * s, { color: MOSS_GREEN, h: 0.1 * s, z: 0.8 * s });
  }
};

export const ROCK_DEF: SpriteDef = defineSprite({ id: 'flora_rock', w: 1, d: 1, massing: rockMassing });

// ── Forest Mushroom Massing ───────────────────────────────────────────────────

const mushroomMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0.2, 0.2, 0.6, 0.6, 0.15);
  // Big Mushroom
  w.box(0.35, 0.35, 0.15, 0.15, { color: SHROOM_STEM, h: 0.35 });
  w.box(0.25, 0.25, 0.35, 0.35, { color: SHROOM_CAP, h: 0.2, z: 0.35 });
  // Small companion mushroom
  w.box(0.65, 0.55, 0.1, 0.1, { color: SHROOM_STEM, h: 0.2 });
  w.box(0.58, 0.48, 0.22, 0.22, { color: SHROOM_CAP, h: 0.15, z: 0.2 });
};

export const MUSHROOM_DEF: SpriteDef = defineSprite({ id: 'flora_mushroom', w: 1, d: 1, massing: mushroomMassing });

// ── Flora Sprite Lookup ───────────────────────────────────────────────────────

export function defForFlora(kind: FloraKind): SpriteDef {
  switch (kind) {
    case 'pine':       return PINE_DEF;
    case 'spruce':     return SPRUCE_DEF;
    case 'oak':        return OAK_DEF;
    case 'birch':      return BIRCH_DEF;
    case 'swamp_tree': return SWAMP_TREE_DEF;
    case 'cactus':     return CACTUS_DEF;
    case 'rock_spire': return ROCK_SPIRE_DEF;
    case 'dead_bush':  return DEAD_BUSH_DEF;
    case 'bush':       return BUSH_DEF;
    case 'flowers':    return FLOWER_DEF;
    case 'rock':       return ROCK_DEF;
    case 'mushroom':   return MUSHROOM_DEF;
  }
}

const FLORA_VARIANT_SCRATCH: {
  seed: number;
  flags: number;
  level: number;
  progress: number;
  label: string;
} = {
  seed:     0,
  flags:    0,
  level:    0,
  progress: 1,
  label:    '',
};

/**
 * Return the visual Variant for a flora item.
 * Reuses an internal scratch variant to guarantee zero heap allocation.
 */
export function floraVariant(f: FloraItem): Variant {
  FLORA_VARIANT_SCRATCH.seed = f.id;
  FLORA_VARIANT_SCRATCH.flags = 0;
  FLORA_VARIANT_SCRATCH.level = f.subType;
  FLORA_VARIANT_SCRATCH.progress = f.scale;
  FLORA_VARIANT_SCRATCH.label = '';
  return FLORA_VARIANT_SCRATCH;
}

// ── Populate World with Flora ─────────────────────────────────────────────────

let floraIdSeq = 1;

/** Populate the massive 640x640 world with lush procedural trees, bushes, flowers, and stones. */
export function populateFlora(seed: number, world: WorldTerrain): FloraItem[] {
  const rng = createRng(seed ^ 0x5a5a5a5a);
  const items: FloraItem[] = [];

  for (let gy = 6; gy < H - 6; gy += 4) {
    for (let gx = 6; gx < W - 6; gx += 4) {
      // Small 3-tile exclusion directly around player spawn centers
      if ((Math.abs(gx - 160) <= 3 && Math.abs(gy - 160) <= 3) ||
          (Math.abs(gx - 480) <= 3 && Math.abs(gy - 160) <= 3)) {
        continue;
      }

      const mat = world.surface.get(gx, gy);
      if (mat === MAT_WATER) continue;

      const jitterX = gx + (rng.next() * 2.2 - 1.1);
      const jitterY = gy + (rng.next() * 2.2 - 1.1);
      const tgx = clamp(Math.floor(jitterX), 4, W - 5);
      const tgy = clamp(Math.floor(jitterY), 4, H - 5);

      const tMat = world.surface.get(tgx, tgy);
      if (tMat === MAT_WATER) continue;

      const elevation = world.heights.get(tgx, tgy);
      const blend = getBiomeBlendAt(tgx, tgy, seed, elevation);

      // Noise density creates natural clusters and clearings
      const density = fbm2(seed ^ 0x3333, tgx * 0.04, tgy * 0.04, 3);
      if (density < -0.35) continue;

      const roll = rng.next();
      // In transition ecotones, seamlessly intermingle species from secondary biome
      const activeKind = (blend.blend > 0.2 && roll < blend.blend * 0.65) ? blend.secondary : blend.primary;

      let kind: FloraKind | undefined = undefined;
      let scale = 0.85 + rng.next() * 0.35;
      let subType = 0;

      // 1. Water shoreline flora (within 1-2 tiles of water level)
      if (elevation <= 2) {
        if (roll < 0.35) {
          kind = 'swamp_tree';
          scale = 1.1 + rng.next() * 0.4;
        } else if (roll < 0.65) {
          kind = 'flowers';
          subType = Math.floor(rng.next() * 3);
        } else if (roll < 0.85) {
          kind = 'bush';
          subType = 1;
        } else {
          kind = 'rock';
          subType = 1;
        }
      }
      // 2. High altitude rocky spires and mountain pines
      else if (elevation >= 13) {
        if (roll < 0.40) {
          kind = 'rock_spire';
          scale = 1.1 + rng.next() * 0.5;
        } else if (roll < 0.75) {
          kind = 'pine';
          scale = 0.95 + rng.next() * 0.4;
        } else {
          kind = 'rock';
          subType = 1;
        }
      }
      // 3. Biome-specific vegetation
      else if (activeKind === 'badlands') {
        // Arid badlands & mesas: Saguaro cacti, stepped rock spires, and tumbleweed dead bushes
        if (roll < 0.42) {
          kind = 'cactus';
          scale = 0.95 + rng.next() * 0.5;
        } else if (roll < 0.70) {
          kind = 'rock_spire';
          scale = 1.05 + rng.next() * 0.55;
        } else if (roll < 0.90) {
          kind = 'dead_bush';
          scale = 0.75 + rng.next() * 0.4;
        } else {
          kind = 'rock';
        }
      } else if (activeKind === 'wetlands') {
        // Lush wetlands & bayous: giant weeping swamp willows, flower carpets, and mushrooms
        if (roll < 0.42) {
          kind = 'swamp_tree';
          scale = 1.15 + rng.next() * 0.45;
        } else if (roll < 0.68) {
          kind = 'flowers';
          subType = Math.floor(rng.next() * 3);
        } else if (roll < 0.84) {
          kind = 'mushroom';
        } else {
          kind = 'bush';
          subType = 1;
        }
      } else if (activeKind === 'taiga') {
        // Deep northern taiga: towering spruce, evergreen pines, mushrooms, and mossy granite boulders
        if (roll < 0.45) {
          kind = 'spruce';
          scale = 1.1 + rng.next() * 0.45;
        } else if (roll < 0.70) {
          kind = 'pine';
          scale = 0.95 + rng.next() * 0.35;
        } else if (roll < 0.82) {
          kind = 'rock';
          subType = 1;
        } else if (roll < 0.92) {
          kind = 'mushroom';
        } else {
          kind = 'bush';
        }
      } else if (activeKind === 'alpine') {
        // Alpine high peaks: hardy mountain pines, sharp rock spires, and granite boulders
        if (roll < 0.42) {
          kind = 'pine';
          scale = 0.95 + rng.next() * 0.4;
        } else if (roll < 0.75) {
          kind = 'rock_spire';
          scale = 1.1 + rng.next() * 0.55;
        } else {
          kind = 'rock';
        }
      } else if (activeKind === 'coastal') {
        // Coastal dunes & shallows
        if (roll < 0.35) {
          kind = 'rock_spire';
          scale = 0.85 + rng.next() * 0.4;
        } else if (roll < 0.60) {
          kind = 'dead_bush';
        } else if (roll < 0.80) {
          kind = 'rock';
        } else {
          kind = 'bush';
        }
      } else {
        // Temperate Meadows: white-barked birch trees, broadleaf oaks, pines, wildflower carpets, and bushes
        if (roll < 0.32) {
          kind = 'birch';
          scale = 1.0 + rng.next() * 0.4;
        } else if (roll < 0.58) {
          kind = 'oak';
          scale = 1.0 + rng.next() * 0.4;
        } else if (roll < 0.70) {
          kind = 'pine';
          scale = 0.9 + rng.next() * 0.35;
        } else if (roll < 0.82) {
          kind = 'flowers';
          subType = Math.floor(rng.next() * 3);
        } else if (roll < 0.92) {
          kind = 'bush';
          subType = roll > 0.85 ? 1 : 0;
        } else {
          kind = 'mushroom';
        }
      }

      if (kind !== undefined) {
        items.push({
          id: floraIdSeq++,
          kind,
          gx: tgx,
          gy: tgy,
          w: 1,
          d: 1,
          basePx: 0,
          scale,
          subType,
        });
      }
    }
  }

  rebuildFloraSpatial(items);
  return items;
}




export interface HarvestYield {
  readonly item: FloraItem;
  readonly wood: number;
  readonly stone: number;
  readonly fiber: number;
  readonly label: string;
}

/** Find and remove a flora item at or adjacent to (gx, gy). Returns the harvested yield. */
export function harvestFloraAt(flora: FloraItem[], gx: number, gy: number): HarvestYield | undefined {
  const index = flora.findIndex((f) => Math.abs(f.gx - gx) <= 0.8 && Math.abs(f.gy - gy) <= 0.8);
  if (index === -1) return undefined;
  const item = flora[index];
  if (item === undefined) return undefined;
  flora.splice(index, 1);
  rebuildFloraSpatial(flora);

  let wood = 0;
  let stone = 0;
  let fiber = 0;
  let label = '';

  switch (item.kind) {
    case 'pine':
      wood = 4;
      label = '+4 WOOD (PINE CHOPPED)';
      break;
    case 'spruce':
      wood = 7;
      label = '+7 WOOD (TALL SPRUCE CHOPPED)';
      break;
    case 'oak':
      wood = 6;
      label = '+6 WOOD (OAK CHOPPED)';
      break;
    case 'birch':
      wood = 5;
      label = '+5 WOOD (BIRCH CHOPPED)';
      break;
    case 'swamp_tree':
      wood = 8;
      fiber = 3;
      label = '+8 WOOD, +3 FIBER (SWAMP WILLOW CHOPPED)';
      break;
    case 'cactus':
      wood = 3;
      fiber = 2;
      label = '+3 WOOD, +2 FIBER (CACTUS HARVESTED)';
      break;
    case 'dead_bush':
      wood = 1;
      fiber = 2;
      label = '+1 WOOD, +2 FIBER (DEAD BUSH CLEARED)';
      break;
    case 'rock_spire':
      stone = 8;
      label = '+8 STONE (ROCK SPIRE MINED)';
      break;
    case 'rock':
      stone = 5;
      label = '+5 STONE (BOULDER MINED)';
      break;
    case 'bush':
      wood = 2;
      fiber = 2;
      label = '+2 WOOD, +2 FIBER (BUSH HARVESTED)';
      break;
    case 'flowers':
      fiber = 2;
      label = '+2 FIBER (FLOWERS GATHERED)';
      break;
    case 'mushroom':
      fiber = 2;
      label = '+2 FIBER (MUSHROOM FORAGED)';
      break;
  }

  return { item, wood, stone, fiber, label };
}


const DEFAULT_EDIBLE_KINDS: readonly FloraKind[] = ['flowers', 'bush', 'mushroom'];

/** Find the closest edible flora within radius for herbivores. */
export function findClosestEdibleFlora(
  flora: readonly FloraItem[],
  fromX: number,
  fromY: number,
  radius: number,
  edibleKinds: readonly FloraKind[] = DEFAULT_EDIBLE_KINDS,
  spatialGrid?: SpatialGrid,
): FloraItem | undefined {
  let closest: FloraItem | undefined = undefined;
  let minDistSq = radius * radius;

  if (spatialGrid !== undefined) {
    const count = spatialGrid.queryRadius(fromX, fromY, radius);
    for (let i = 0; i < count; i++) {
      const idx = spatialGrid.queryBuffer[i];
      if (idx === undefined) continue;
      const f = flora[idx];
      if (f === undefined) continue;
      if (!edibleKinds.includes(f.kind)) continue;
      const dx = f.gx - fromX;
      const dy = f.gy - fromY;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closest = f;
      }
    }
    return closest;
  }

  for (let i = 0; i < flora.length; i++) {
    const f = flora[i];
    if (f === undefined) continue;
    if (!edibleKinds.includes(f.kind)) continue;

    const dx = f.gx - fromX;
    const dy = f.gy - fromY;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      closest = f;
    }
  }
  return closest;
}

let regrowthTimer = 0;

/** Slowly regrow small flora (flowers, mushrooms, bushes) in the ecosystem. */
export function tickFloraRegrowth(
  seed: number,
  flora: FloraItem[],
  world: WorldTerrain,
  dt: number,
): void {
  regrowthTimer += dt;
  if (regrowthTimer < 5.0) return;
  regrowthTimer = 0;

  if (flora.length >= 6000 || flora.length >= MAX_SPATIAL_ENTITIES) return; // Ecosystem capacity for 640x640 continent

  const rng = createRng((seed + flora.length * 31) ^ 0xabcdef);
  const gx = Math.floor(4 + rng.next() * (W - 8));
  const gy = Math.floor(4 + rng.next() * (H - 8));

  const mat = world.surface.get(gx, gy);
  if (mat !== MAT_GRASS) return;

  // Check if tile already has flora using O(1) spatial query
  if (FLORA_SPATIAL.queryRadius(gx, gy, 0.8) > 0) return;

  const roll = rng.next();
  const kind: FloraKind = roll < 0.5 ? 'flowers' : roll < 0.8 ? 'bush' : 'mushroom';

  const newIdx = flora.length;
  flora.push({
    id: floraIdSeq++,
    kind,
    gx,
    gy,
    w: 1,
    d: 1,
    basePx: 0,
    scale: 0.8 + rng.next() * 0.3,
    subType: Math.floor(rng.next() * 3),
  });
  FLORA_SPATIAL.insert(newIdx, gx, gy);
}


