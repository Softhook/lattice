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
  type Ink,
  hex,
} from '@latticekit/draw';
import { Rng, createRng, fbm2, clamp } from '@latticekit/core';
import { W, H, MAT_WATER, MAT_GRASS, getBiomeBlendAt, type BiomeKind, type WorldTerrain } from './world.js';




// ── Colors for Flora ──────────────────────────────────────────────────────────


export const PINE_NEEDLE   = hex('#1b3d22');
export const PINE_NEEDLE2  = hex('#25522e');
export const OAK_LEAF      = hex('#3c6b2e');
export const OAK_LEAF2     = hex('#4d8239');
export const WOOD_TRUNK    = hex('#4a2f1b');
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

// ── Flora Kinds & Declarative Registry ─────────────────────────────────────────

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

export type FloraCategory = 'tree' | 'shrub' | 'rock' | 'plant' | 'fungus';

export interface FloraHarvest {
  readonly wood?: number;
  readonly stone?: number;
  readonly fiber?: number;
}

export interface FloraDefinition {
  readonly kind: FloraKind;
  readonly name: string;
  readonly category: FloraCategory;
  readonly harvest: FloraHarvest;
  readonly harvestVerb: string;
  readonly edible: boolean;
  readonly preferredBiomes: readonly BiomeKind[];
  readonly toolMultiplier: {
    readonly axe?: number;
    readonly pickaxe?: number;
  };
  readonly spriteDef: SpriteDef;
}

// ── Parametric Procedural Massing Builders ─────────────────────────────────────

export interface ConiferOptions {
  trunkColor: Ink;
  needleColor1: Ink;
  needleColor2: Ink;
  tiers: number;
  trunkH: number;
  baseW: number;
  tierH: number;
  shadowAlpha?: number;
}

export function createConiferMassing(opts: ConiferOptions): Massing {
  return (w: SolidWriter, v: Variant, _rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    w.shadow(0.1, 0.1, opts.baseW * s, opts.baseW * s, opts.shadowAlpha ?? 0.35);
    w.box(0.38, 0.38, 0.24 * s, 0.24 * s, { color: opts.trunkColor, h: opts.trunkH * s });
    for (let t = 0; t < opts.tiers; t++) {
      const frac = (opts.tiers - 1 - t) / opts.tiers;
      const tierW = (0.34 + frac * (opts.baseW - 0.34)) * s;
      const tierOffset = (1 - tierW) * 0.5;
      const color = t % 2 === 0 ? opts.needleColor1 : opts.needleColor2;
      const z = (0.8 + t * opts.tierH * 0.9) * s;
      w.box(tierOffset, tierOffset, tierW, tierW, { color, h: opts.tierH * s, z });
    }
  };
}

export interface BroadleafOptions {
  trunkColor: Ink;
  leafColor1: Ink;
  leafColor2: Ink;
  trunkH: number;
  canopyW: number;
  canopyH: number;
  crownH?: number;
  knotColor?: Ink;
  vines?: Ink;
  shadowRadius?: number;
}

export function createBroadleafMassing(opts: BroadleafOptions): Massing {
  return (w: SolidWriter, v: Variant, _rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    w.shadow(0, 0, (opts.shadowRadius ?? 1.2) * s, (opts.shadowRadius ?? 1.2) * s, 0.4);
    const trunkW = (opts.vines ? 0.3 : 0.26) * s;
    const trunkOffset = (1 - trunkW) * 0.5;
    if (opts.vines) {
      w.box(0.25, 0.25, 0.5 * s, 0.5 * s, { color: opts.trunkColor, h: 0.6 * s });
      w.box(trunkOffset, trunkOffset, trunkW, trunkW, { color: opts.trunkColor, h: opts.trunkH * s, z: 0.5 * s });
    } else {
      w.box(trunkOffset, trunkOffset, trunkW, trunkW, { color: opts.trunkColor, h: opts.trunkH * s });
    }

    if (opts.knotColor) {
      w.box(trunkOffset - 0.02, trunkOffset - 0.02, trunkW + 0.04, 0.08 * s, { color: opts.knotColor, h: 0.08 * s, z: 0.7 * s });
      w.box(trunkOffset - 0.02, trunkOffset - 0.02, 0.08 * s, trunkW + 0.04, { color: opts.knotColor, h: 0.08 * s, z: 1.3 * s });
    }

    const canopyOffset = (1 - opts.canopyW) * 0.5;
    const canopyZ = opts.trunkH * 0.7 * s;
    w.box(canopyOffset, canopyOffset, opts.canopyW * s, opts.canopyW * s, {
      color: opts.leafColor1,
      h: opts.canopyH * s,
      z: canopyZ,
    });

    const crownW = opts.canopyW * 0.7;
    const crownOffset = (1 - crownW) * 0.5;
    w.box(crownOffset, crownOffset, crownW * s, crownW * s, {
      color: opts.leafColor2,
      h: (opts.crownH ?? 0.85) * s,
      z: canopyZ + opts.canopyH * 0.7 * s,
    });

    if (opts.vines) {
      const vCol = opts.vines;
      w.box(0.08, 0.08, 0.18 * s, 0.18 * s, { color: vCol, h: 1.1 * s, z: 0.6 * s });
      w.box(0.74, 0.08, 0.18 * s, 0.18 * s, { color: vCol, h: 1.2 * s, z: 0.5 * s });
      w.box(0.08, 0.74, 0.18 * s, 0.18 * s, { color: vCol, h: 1.0 * s, z: 0.7 * s });
      w.box(0.74, 0.74, 0.18 * s, 0.18 * s, { color: vCol, h: 1.15 * s, z: 0.55 * s });
    }
  };
}

export interface ShrubOptions {
  bodyColor: Ink;
  highlightColor: Ink;
  berryColor?: Ink;
  h: number;
  w: number;
  isDead?: boolean;
}

export function createShrubMassing(opts: ShrubOptions): Massing {
  return (w: SolidWriter, v: Variant, _rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    if (opts.isDead) {
      w.shadow(0.2, 0.2, 0.6 * s, 0.6 * s, 0.15);
      w.box(0.35, 0.35, 0.3 * s, 0.3 * s, { color: opts.bodyColor, h: 0.3 * s });
      w.box(0.2, 0.25, 0.25 * s, 0.25 * s, { color: opts.bodyColor, h: 0.4 * s, z: 0.18 * s });
      w.box(0.55, 0.45, 0.25 * s, 0.25 * s, { color: opts.bodyColor, h: 0.45 * s, z: 0.18 * s });
      return;
    }
    w.shadow(0.1, 0.1, (opts.w + 0.1) * s, (opts.w + 0.1) * s, 0.2);
    const offset = (1 - opts.w) * 0.5;
    w.box(offset, offset, opts.w * s, opts.w * s, { color: opts.bodyColor, h: opts.h * s });
    const topW = opts.w * 0.7;
    const topOffset = (1 - topW) * 0.5;
    w.box(topOffset, topOffset, topW * s, topW * s, { color: opts.highlightColor, h: opts.h * 0.65 * s, z: opts.h * 0.8 * s });

    if (v.level > 0 && opts.berryColor) {
      w.box(0.2, 0.3, 0.15, 0.15, { color: opts.berryColor, h: 0.2, z: 0.7 * s });
      w.box(0.6, 0.4, 0.15, 0.15, { color: opts.berryColor, h: 0.2, z: 0.6 * s });
      w.box(0.35, 0.65, 0.15, 0.15, { color: opts.berryColor, h: 0.2, z: 0.65 * s });
    }
  };
}

export interface SucculentOptions {
  bodyColor: Ink;
  height: number;
}

export function createSucculentMassing(opts: SucculentOptions): Massing {
  return (w: SolidWriter, v: Variant, _rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    w.shadow(0.15, 0.15, 0.7 * s, 0.7 * s, 0.25);
    w.box(0.38, 0.38, 0.24 * s, 0.24 * s, { color: opts.bodyColor, h: opts.height * s });
    w.box(0.62, 0.42, 0.22 * s, 0.16 * s, { color: opts.bodyColor, h: 0.18 * s, z: 0.8 * s });
    w.box(0.68, 0.42, 0.16 * s, 0.16 * s, { color: opts.bodyColor, h: 0.85 * s, z: 0.98 * s });
    w.box(0.16, 0.42, 0.22 * s, 0.16 * s, { color: opts.bodyColor, h: 0.18 * s, z: 1.1 * s });
    w.box(0.16, 0.42, 0.16 * s, 0.16 * s, { color: opts.bodyColor, h: 0.75 * s, z: 1.28 * s });
  };
}

export interface RockOptions {
  baseColor: Ink;
  topColor: Ink;
  spireColor?: Ink;
  isSpire?: boolean;
  mossColor?: Ink;
}

export function createRockMassing(opts: RockOptions): Massing {
  return (w: SolidWriter, v: Variant, _rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    if (opts.isSpire) {
      w.shadow(0.05, 0.05, 0.9 * s, 0.9 * s, 0.4);
      w.box(0.15, 0.15, 0.7 * s, 0.7 * s, { color: opts.baseColor, h: 1.0 * s });
      w.box(0.24, 0.24, 0.52 * s, 0.52 * s, { color: opts.topColor, h: 1.1 * s, z: 0.95 * s });
      w.box(0.32, 0.32, 0.36 * s, 0.36 * s, { color: opts.spireColor ?? opts.baseColor, h: 1.2 * s, z: 2.0 * s });
      return;
    }
    w.shadow(0.1, 0.1, 0.8 * s, 0.8 * s, 0.3);
    w.box(0.15, 0.15, 0.7 * s, 0.7 * s, { color: opts.baseColor, h: 0.5 * s });
    w.box(0.25, 0.2, 0.5 * s, 0.5 * s, { color: opts.topColor, h: 0.4 * s, z: 0.4 * s });
    if (v.level > 0 && opts.mossColor) {
      w.box(0.3, 0.3, 0.4 * s, 0.3 * s, { color: opts.mossColor, h: 0.1 * s, z: 0.8 * s });
    }
  };
}

export interface FlowerOptions {
  stemColor: Ink;
  defaultColor: Ink;
  colorVariants?: readonly Ink[];
}

export function createFlowerMassing(opts: FlowerOptions): Massing {
  return (w: SolidWriter, v: Variant, _rng: Rng) => {
    const variants = opts.colorVariants ?? [opts.defaultColor];
    const flowerColor = variants[v.level % variants.length] ?? opts.defaultColor;
    w.shadow(0.2, 0.2, 0.6, 0.6, 0.15);
    w.box(0.25, 0.25, 0.5, 0.5, { color: opts.stemColor, h: 0.15 });
    w.box(0.2, 0.25, 0.2, 0.2, { color: flowerColor, h: 0.25, z: 0.15 });
    w.box(0.55, 0.3, 0.2, 0.2, { color: flowerColor, h: 0.25, z: 0.15 });
    w.box(0.35, 0.6, 0.2, 0.2, { color: flowerColor, h: 0.3, z: 0.15 });
  };
}

export interface FungusOptions {
  stemColor: Ink;
  capColor: Ink;
}

export function createFungusMassing(opts: FungusOptions): Massing {
  return (w: SolidWriter, _v: Variant, _rng: Rng) => {
    w.shadow(0.2, 0.2, 0.6, 0.6, 0.15);
    w.box(0.35, 0.35, 0.15, 0.15, { color: opts.stemColor, h: 0.35 });
    w.box(0.25, 0.25, 0.35, 0.35, { color: opts.capColor, h: 0.2, z: 0.35 });
    w.box(0.65, 0.55, 0.1, 0.1, { color: opts.stemColor, h: 0.2 });
    w.box(0.58, 0.48, 0.22, 0.22, { color: opts.capColor, h: 0.15, z: 0.2 });
  };
}

// ── Built-in Declarative SpriteDefs via Parametric Builders ───────────────────

export const PINE_DEF: SpriteDef = defineSprite({
  id: 'flora_pine',
  w: 1,
  d: 1,
  massing: createConiferMassing({
    trunkColor: WOOD_TRUNK,
    needleColor1: PINE_NEEDLE,
    needleColor2: PINE_NEEDLE2,
    tiers: 3,
    trunkH: 1.4,
    baseW: 0.76,
    tierH: 0.9,
    shadowAlpha: 0.35,
  }),
});

export const SPRUCE_DEF: SpriteDef = defineSprite({
  id: 'flora_spruce',
  w: 1,
  d: 1,
  massing: createConiferMassing({
    trunkColor: SPRUCE_WOOD,
    needleColor1: SPRUCE_NEEDLE,
    needleColor2: SPRUCE_NEEDLE2,
    tiers: 4,
    trunkH: 3.2,
    baseW: 0.8,
    tierH: 0.8,
    shadowAlpha: 0.4,
  }),
});

export const OAK_DEF: SpriteDef = defineSprite({
  id: 'flora_oak',
  w: 1,
  d: 1,
  massing: createBroadleafMassing({
    trunkColor: WOOD_TRUNK,
    leafColor1: OAK_LEAF,
    leafColor2: OAK_LEAF2,
    trunkH: 1.6,
    canopyW: 0.9,
    canopyH: 1.4,
    crownH: 0.9,
  }),
});

export const BIRCH_DEF: SpriteDef = defineSprite({
  id: 'flora_birch',
  w: 1,
  d: 1,
  massing: createBroadleafMassing({
    trunkColor: BIRCH_BARK,
    leafColor1: BIRCH_LEAF,
    leafColor2: BIRCH_LEAF2,
    trunkH: 2.2,
    canopyW: 0.76,
    canopyH: 1.3,
    crownH: 0.9,
    knotColor: BIRCH_KNOT,
    shadowRadius: 1.0,
  }),
});

export const SWAMP_TREE_DEF: SpriteDef = defineSprite({
  id: 'flora_swamp_tree',
  w: 1,
  d: 1,
  massing: createBroadleafMassing({
    trunkColor: SWAMP_WOOD,
    leafColor1: SWAMP_CANOPY,
    leafColor2: SWAMP_CANOPY,
    trunkH: 1.8,
    canopyW: 0.96,
    canopyH: 1.2,
    vines: SWAMP_VINE,
    shadowRadius: 1.4,
  }),
});

export const CACTUS_DEF: SpriteDef = defineSprite({
  id: 'flora_cactus',
  w: 1,
  d: 1,
  massing: createSucculentMassing({
    bodyColor: CACTUS_GREEN,
    height: 2.2,
  }),
});

export const ROCK_SPIRE_DEF: SpriteDef = defineSprite({
  id: 'flora_rock_spire',
  w: 1,
  d: 1,
  massing: createRockMassing({
    baseColor: SPIRE_RED,
    topColor: SPIRE_ORANGE,
    spireColor: SPIRE_RED,
    isSpire: true,
  }),
});

export const DEAD_BUSH_DEF: SpriteDef = defineSprite({
  id: 'flora_dead_bush',
  w: 1,
  d: 1,
  massing: createShrubMassing({
    bodyColor: DEAD_WOOD,
    highlightColor: DEAD_WOOD,
    h: 0.45,
    w: 0.6,
    isDead: true,
  }),
});

export const BUSH_DEF: SpriteDef = defineSprite({
  id: 'flora_bush',
  w: 1,
  d: 1,
  massing: createShrubMassing({
    bodyColor: BUSH_GREEN,
    highlightColor: OAK_LEAF2,
    berryColor: BERRY_RED,
    h: 0.6,
    w: 0.7,
  }),
});

export const FLOWER_DEF: SpriteDef = defineSprite({
  id: 'flora_flowers',
  w: 1,
  d: 1,
  massing: createFlowerMassing({
    stemColor: BUSH_GREEN,
    defaultColor: FLOWER_PETAL,
    colorVariants: [FLOWER_PETAL, FLOWER_BLUE, FLOWER_PURPLE],
  }),
});

export const ROCK_DEF: SpriteDef = defineSprite({
  id: 'flora_rock',
  w: 1,
  d: 1,
  massing: createRockMassing({
    baseColor: ROCK_GRAY,
    topColor: ROCK_DARK,
    mossColor: MOSS_GREEN,
  }),
});

export const MUSHROOM_DEF: SpriteDef = defineSprite({
  id: 'flora_mushroom',
  w: 1,
  d: 1,
  massing: createFungusMassing({
    stemColor: SHROOM_STEM,
    capColor: SHROOM_CAP,
  }),
});

// ── Declarative Flora Registry ────────────────────────────────────────────────

export const FLORA_REGISTRY: Record<FloraKind, FloraDefinition> = {
  pine: {
    kind: 'pine',
    name: 'Pine Tree',
    category: 'tree',
    harvest: { wood: 4 },
    harvestVerb: 'CHOPPED',
    edible: false,
    preferredBiomes: ['alpine', 'taiga', 'meadow'],
    toolMultiplier: { axe: 1.5 },
    spriteDef: PINE_DEF,
  },
  spruce: {
    kind: 'spruce',
    name: 'Tall Spruce',
    category: 'tree',
    harvest: { wood: 7 },
    harvestVerb: 'CHOPPED',
    edible: false,
    preferredBiomes: ['taiga'],
    toolMultiplier: { axe: 1.5 },
    spriteDef: SPRUCE_DEF,
  },
  oak: {
    kind: 'oak',
    name: 'Oak Tree',
    category: 'tree',
    harvest: { wood: 6 },
    harvestVerb: 'CHOPPED',
    edible: false,
    preferredBiomes: ['meadow'],
    toolMultiplier: { axe: 1.5 },
    spriteDef: OAK_DEF,
  },
  birch: {
    kind: 'birch',
    name: 'Birch Tree',
    category: 'tree',
    harvest: { wood: 5 },
    harvestVerb: 'CHOPPED',
    edible: false,
    preferredBiomes: ['meadow'],
    toolMultiplier: { axe: 1.5 },
    spriteDef: BIRCH_DEF,
  },
  swamp_tree: {
    kind: 'swamp_tree',
    name: 'Swamp Willow',
    category: 'tree',
    harvest: { wood: 8, fiber: 3 },
    harvestVerb: 'CHOPPED',
    edible: false,
    preferredBiomes: ['wetlands', 'coastal'],
    toolMultiplier: { axe: 1.5 },
    spriteDef: SWAMP_TREE_DEF,
  },
  cactus: {
    kind: 'cactus',
    name: 'Cactus',
    category: 'plant',
    harvest: { wood: 3, fiber: 2 },
    harvestVerb: 'HARVESTED',
    edible: false,
    preferredBiomes: ['badlands'],
    toolMultiplier: { axe: 1.2 },
    spriteDef: CACTUS_DEF,
  },
  dead_bush: {
    kind: 'dead_bush',
    name: 'Dead Bush',
    category: 'shrub',
    harvest: { wood: 1, fiber: 2 },
    harvestVerb: 'CLEARED',
    edible: false,
    preferredBiomes: ['badlands', 'coastal'],
    toolMultiplier: { axe: 1.2 },
    spriteDef: DEAD_BUSH_DEF,
  },
  rock_spire: {
    kind: 'rock_spire',
    name: 'Rock Spire',
    category: 'rock',
    harvest: { stone: 8 },
    harvestVerb: 'MINED',
    edible: false,
    preferredBiomes: ['alpine', 'badlands', 'coastal'],
    toolMultiplier: { pickaxe: 2.0 },
    spriteDef: ROCK_SPIRE_DEF,
  },
  rock: {
    kind: 'rock',
    name: 'Boulder',
    category: 'rock',
    harvest: { stone: 5 },
    harvestVerb: 'MINED',
    edible: false,
    preferredBiomes: ['alpine', 'taiga', 'meadow', 'badlands', 'coastal'],
    toolMultiplier: { pickaxe: 2.0 },
    spriteDef: ROCK_DEF,
  },
  bush: {
    kind: 'bush',
    name: 'Bush',
    category: 'shrub',
    harvest: { wood: 2, fiber: 2 },
    harvestVerb: 'HARVESTED',
    edible: true,
    preferredBiomes: ['meadow', 'taiga', 'wetlands', 'coastal'],
    toolMultiplier: { axe: 1.2 },
    spriteDef: BUSH_DEF,
  },
  flowers: {
    kind: 'flowers',
    name: 'Flowers',
    category: 'plant',
    harvest: { fiber: 2 },
    harvestVerb: 'GATHERED',
    edible: true,
    preferredBiomes: ['meadow', 'wetlands', 'coastal'],
    toolMultiplier: {},
    spriteDef: FLOWER_DEF,
  },
  mushroom: {
    kind: 'mushroom',
    name: 'Mushroom',
    category: 'fungus',
    harvest: { fiber: 2 },
    harvestVerb: 'FORAGED',
    edible: true,
    preferredBiomes: ['wetlands', 'taiga', 'meadow'],
    toolMultiplier: {},
    spriteDef: MUSHROOM_DEF,
  },
};

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


// ── Declarative Flora Sprite Lookup ───────────────────────────────────────────

export function defForFlora(kind: FloraKind): SpriteDef {
  return FLORA_REGISTRY[kind]?.spriteDef ?? PINE_DEF;
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

/** Populate the massive 640x640 world with organic procedural forest groves, copses, and wildflower glades. */
export function populateFlora(seed: number, world: WorldTerrain): FloraItem[] {
  const rng = createRng(seed ^ 0x5a5a5a5a);
  const items: FloraItem[] = [];

  // Reset spatial index for population collision checks
  FLORA_SPATIAL.clear();

  // Multi-frequency candidate sampling across the continent
  for (let gy = 6; gy < H - 6; gy += 4) {
    for (let gx = 6; gx < W - 6; gx += 4) {
      // Small 3-tile exclusion directly around player spawn centers
      if ((Math.abs(gx - 160) <= 3 && Math.abs(gy - 160) <= 3) ||
          (Math.abs(gx - 480) <= 3 && Math.abs(gy - 160) <= 3)) {
        continue;
      }

      const mat = world.surface.get(gx, gy);
      if (mat === MAT_WATER) continue;

      // Multi-octave forest grove noise: determines dense forest stands vs open glades vs sunny meadows
      const canopyGrove = fbm2(seed ^ 0x2468, gx * 0.016, gy * 0.016, 3) * 0.65 +
                          fbm2(seed ^ 0x9753, gx * 0.045, gy * 0.045, 2) * 0.35;

      const elevation = world.heights.get(gx, gy);
      const blend = getBiomeBlendAt(gx, gy, seed, elevation);

      // Local stand coherence: species naturally group together in tree stands
      const standRoll = fbm2(seed ^ 0x8642, gx * 0.035, gy * 0.035, 2);

      // Organic natural jitter
      const jx = gx + (rng.next() * 2.8 - 1.4);
      const jy = gy + (rng.next() * 2.8 - 1.4);
      const tgx = clamp(Math.floor(jx), 4, W - 5);
      const tgy = clamp(Math.floor(jy), 4, H - 5);

      const tMat = world.surface.get(tgx, tgy);
      if (tMat === MAT_WATER) continue;

      const tElev = world.heights.get(tgx, tgy);

      // Decide if this candidate tile generates a tree, shrub, rock, or flowerbed based on grove canopy
      const roll = rng.next();
      const isDenseGrove = canopyGrove > 0.06;
      const isGlade = canopyGrove >= -0.16 && canopyGrove <= 0.06;
      const isOpenMeadow = canopyGrove < -0.16;

      // Spawn acceptance probability based on landscape structure
      if (isDenseGrove) {
        if (roll > 0.85) continue; // High density in groves
      } else if (isGlade) {
        if (roll > 0.55) continue; // Medium density in glades
      } else if (isOpenMeadow) {
        if (roll > 0.35) continue; // Open meadow scattering
      }


      // Check spatial clearance: maintain natural clearance so trees don't overlap awkwardly
      const minClearance = isDenseGrove ? 1.4 : 1.8;
      if (FLORA_SPATIAL.queryRadius(tgx, tgy, minClearance) > 0) {
        continue;
      }

      // Independent roll for species selection on accepted tiles
      const kindRoll = rng.next();

      // In transition ecotones, seamlessly intermingle species from secondary biome
      const activeKind = (blend.blend > 0.2 && kindRoll < blend.blend * 0.65) ? blend.secondary : blend.primary;

      let kind: FloraKind | undefined = undefined;
      let scale = isDenseGrove ? (1.0 + rng.next() * 0.4) : (0.85 + rng.next() * 0.35);
      let subType = 0;

      // 1. Water shoreline flora (within 1-2 tiles of water level)
      if (tElev <= 2) {
        if (kindRoll < 0.36) {
          kind = 'swamp_tree';
          scale = 1.1 + rng.next() * 0.4;
        } else if (kindRoll < 0.68) {
          kind = 'flowers';
          subType = Math.floor(rng.next() * 3);
        } else if (kindRoll < 0.86) {
          kind = 'bush';
          subType = 1;
        } else {
          kind = 'rock';
          subType = 1;
        }
      }
      // 2. High altitude rocky spires and mountain pines
      else if (tElev >= 13) {
        if (kindRoll < 0.42) {
          kind = 'rock_spire';
          scale = 1.1 + rng.next() * 0.55;
        } else if (kindRoll < 0.78) {
          kind = 'pine';
          scale = 0.95 + rng.next() * 0.4;
        } else {
          kind = 'rock';
          subType = 1;
        }
      }
      // 3. Biome-specific vegetation & stand grouping
      else if (activeKind === 'badlands') {
        if (kindRoll < 0.44) {
          kind = 'cactus';
          scale = 0.95 + rng.next() * 0.5;
        } else if (kindRoll < 0.72) {
          kind = 'rock_spire';
          scale = 1.05 + rng.next() * 0.55;
        } else if (kindRoll < 0.90) {
          kind = 'dead_bush';
          scale = 0.75 + rng.next() * 0.4;
        } else {
          kind = 'rock';
        }
      } else if (activeKind === 'wetlands') {
        if (isDenseGrove && kindRoll < 0.65) {
          kind = 'swamp_tree';
          scale = 1.15 + rng.next() * 0.45;
        } else if (kindRoll < 0.42) {
          kind = 'swamp_tree';
          scale = 1.15 + rng.next() * 0.45;
        } else if (kindRoll < 0.68) {
          kind = 'flowers';
          subType = Math.floor(rng.next() * 3);
        } else if (kindRoll < 0.84) {
          kind = 'mushroom';
        } else {
          kind = 'bush';
          subType = 1;
        }
      } else if (activeKind === 'taiga') {
        // Taiga stand cohesion: spruce stands vs evergreen pine ridges
        const isSpruceStand = standRoll > -0.1;
        if (isDenseGrove && kindRoll < 0.65) {
          kind = isSpruceStand ? 'spruce' : 'pine';
          scale = 1.1 + rng.next() * 0.45;
        } else if (kindRoll < 0.46) {
          kind = isSpruceStand ? 'spruce' : 'pine';
        } else if (kindRoll < 0.68) {
          kind = 'rock';
          subType = 1;
        } else if (kindRoll < 0.84) {
          kind = 'mushroom';
        } else {
          kind = 'bush';
        }
      } else if (activeKind === 'alpine') {
        if (kindRoll < 0.44) {
          kind = 'pine';
          scale = 0.95 + rng.next() * 0.4;
        } else if (kindRoll < 0.75) {
          kind = 'rock_spire';
          scale = 1.1 + rng.next() * 0.55;
        } else {
          kind = 'rock';
        }
      } else if (activeKind === 'coastal') {
        if (kindRoll < 0.35) {
          kind = 'rock_spire';
          scale = 0.85 + rng.next() * 0.4;
        } else if (kindRoll < 0.60) {
          kind = 'dead_bush';
        } else if (kindRoll < 0.80) {
          kind = 'rock';
        } else {
          kind = 'bush';
        }
      } else {
        // Temperate Meadows: Stand clustering between silver birch copses and broadleaf oak groves
        const isBirchGrove = standRoll > 0.05;
        if (isDenseGrove && kindRoll < 0.65) {
          kind = isBirchGrove ? 'birch' : 'oak';
          scale = 1.05 + rng.next() * 0.45;
        } else if (isGlade) {
          if (kindRoll < 0.42) {
            kind = isBirchGrove ? 'birch' : 'oak';
          } else if (kindRoll < 0.68) {
            kind = 'flowers';
            subType = Math.floor(rng.next() * 3);
          } else if (kindRoll < 0.85) {
            kind = 'bush';
            subType = kindRoll > 0.76 ? 1 : 0;
          } else {
            kind = 'mushroom';
          }
        } else {
          // Open meadow
          if (kindRoll < 0.20) {
            kind = 'oak'; // Majestic solitary old-growth oak
            scale = 1.25 + rng.next() * 0.35;
          } else if (kindRoll < 0.62) {
            kind = 'flowers';
            subType = Math.floor(rng.next() * 3);
          } else if (kindRoll < 0.82) {
            kind = 'bush';
          } else if (kindRoll < 0.92) {
            kind = 'mushroom';
          } else {
            kind = 'rock';
          }
        }
      }


      if (kind !== undefined) {
        const itemIdx = items.length;
        const item: FloraItem = {
          id: floraIdSeq++,
          kind,
          gx: tgx,
          gy: tgy,
          w: 1,
          d: 1,
          basePx: 0,
          scale,
          subType,
        };
        items.push(item);
        FLORA_SPATIAL.insert(itemIdx, tgx, tgy);
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
  let index = -1;
  const count = FLORA_SPATIAL.queryRadius(gx, gy, 0.85);
  for (let i = 0; i < count; i++) {
    const idx = FLORA_SPATIAL.queryBuffer[i];
    if (idx !== undefined && flora[idx] !== undefined) {
      const f = flora[idx];
      if (Math.abs(f.gx - gx) <= 0.85 && Math.abs(f.gy - gy) <= 0.85) {
        index = idx;
        break;
      }
    }
  }
  if (index === -1) {
    index = flora.findIndex((f) => Math.abs(f.gx - gx) <= 0.85 && Math.abs(f.gy - gy) <= 0.85);
  }
  if (index === -1) return undefined;
  const item = flora[index];
  if (item === undefined) return undefined;
  flora.splice(index, 1);
  rebuildFloraSpatial(flora);

  const def = FLORA_REGISTRY[item.kind];
  const wood = def.harvest.wood ?? 0;
  const stone = def.harvest.stone ?? 0;
  const fiber = def.harvest.fiber ?? 0;

  const parts: string[] = [];
  if (wood > 0) parts.push(`+${wood} WOOD`);
  if (stone > 0) parts.push(`+${stone} STONE`);
  if (fiber > 0) parts.push(`+${fiber} FIBER`);
  const label = `${parts.join(', ')} (${def.name.toUpperCase()} ${def.harvestVerb})`;

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
      if (!edibleKinds.includes(f.kind) && !FLORA_REGISTRY[f.kind]?.edible) continue;
      const dx = f.gx - fromX;
      const dy = f.gy - fromY;
      const dSq = dx * dx + dy * dy;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closest = f;
      }
    }
    return closest;
  }

  for (let i = 0; i < flora.length; i++) {
    const f = flora[i];
    if (f === undefined) continue;
    if (!edibleKinds.includes(f.kind) && !FLORA_REGISTRY[f.kind]?.edible) continue;
    const dx = f.gx - fromX;
    const dy = f.gy - fromY;
    const dSq = dx * dx + dy * dy;
    if (dSq < minDistSq) {
      minDistSq = dSq;
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


