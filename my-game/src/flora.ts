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
  shade,
} from '@latticekit/draw';
import { Rng, createRng, fbm2, hash2, clamp } from '@latticekit/core';
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
  /** Hunger points restored when this flora is foraged. Never enters inventory — applied
   *  directly to satiety via `feedPlayer` in `interactAtFacing`. */
  readonly food?: number;
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
  /** Seconds a player must hold the Interact action on this item to harvest it bare-handed.
   *  Scaled down by `toolMultiplier` when the right tool is equipped — see `workSecondsFor` in
   *  `players.ts`. Roughly tracks trunk/body size, not just yield, so a squat rock and a towering
   *  spruce don't take the same effort to bring down. */
  readonly workSeconds: number;
  readonly spriteDef: SpriteDef;
}

// ── Per-Instance Variation Helpers ─────────────────────────────────────────────
//
// Every massing below is handed an `rng` stream seeded deterministically from the flora
// instance's own id (Variant.seed) by the kit. Drawing from it here — not just reading
// `v.progress` for uniform scale — is what makes two pines of the same species stand apart:
// a slightly taller trunk, a leaning canopy, a tinted shade of green. Same instance, same
// draw, every time; different instances, different plants.

/** A deterministic offset in [-amount, amount]. */
function jitter(rng: Rng, amount: number): number {
  return (rng.next() * 2 - 1) * amount;
}

/** A deterministic multiplier in [1-amount, 1+amount]. */
function vary(rng: Rng, amount: number): number {
  return 1 + jitter(rng, amount);
}

/** A small deterministic per-instance tint, so no two plants of a kind are painted identically. */
function varyColor(color: Ink, factor: number): Ink {
  return typeof color === 'number' ? shade(color, factor) : color;
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
  return (w: SolidWriter, v: Variant, rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    const trunkH = opts.trunkH * vary(rng, 0.15);
    const baseW = opts.baseW * vary(rng, 0.12);
    const tierH = opts.tierH * vary(rng, 0.14);
    const tierBias = rng.next();
    const tiers = clamp(opts.tiers + (tierBias < 0.2 ? -1 : tierBias > 0.85 ? 1 : 0), 2, opts.tiers + 1);
    const lean = jitter(rng, 0.05);
    const tintFactor = 0.85 + rng.next() * 0.3;
    const needle1 = varyColor(opts.needleColor1, tintFactor);
    const needle2 = varyColor(opts.needleColor2, tintFactor);

    w.shadow(0.1, 0.1, baseW * s, baseW * s, opts.shadowAlpha ?? 0.35);
    w.box(0.38, 0.38, 0.24 * s, 0.24 * s, { color: opts.trunkColor, h: trunkH * s });
    for (let t = 0; t < tiers; t++) {
      const frac = (tiers - 1 - t) / tiers;
      const tierW = (0.34 + frac * (baseW - 0.34)) * s;
      const tierOffset = (1 - tierW) * 0.5;
      const tierLean = lean * (1 - frac);
      const color = t % 2 === 0 ? needle1 : needle2;
      const z = (0.8 + t * tierH * 0.9) * s;
      w.box(tierOffset + tierLean, tierOffset + tierLean, tierW, tierW, { color, h: tierH * s, z });
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
  return (w: SolidWriter, v: Variant, rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    const trunkH = opts.trunkH * vary(rng, 0.14);
    const canopyW = opts.canopyW * vary(rng, 0.16);
    const canopyH = opts.canopyH * vary(rng, 0.18);
    const crownH = (opts.crownH ?? 0.85) * vary(rng, 0.2);
    const lean = jitter(rng, 0.09);
    const tintFactor = 0.85 + rng.next() * 0.3;
    const leaf1 = varyColor(opts.leafColor1, tintFactor);
    const leaf2 = varyColor(opts.leafColor2, tintFactor);

    w.shadow(0, 0, (opts.shadowRadius ?? 1.2) * s, (opts.shadowRadius ?? 1.2) * s, 0.4);
    const trunkW = (opts.vines ? 0.3 : 0.26) * s;
    const trunkOffset = (1 - trunkW) * 0.5;
    if (opts.vines) {
      w.box(0.25, 0.25, 0.5 * s, 0.5 * s, { color: opts.trunkColor, h: 0.6 * s });
      w.box(trunkOffset, trunkOffset, trunkW, trunkW, { color: opts.trunkColor, h: trunkH * s, z: 0.5 * s });
    } else {
      w.box(trunkOffset, trunkOffset, trunkW, trunkW, { color: opts.trunkColor, h: trunkH * s });
    }

    if (opts.knotColor) {
      w.box(trunkOffset - 0.02, trunkOffset - 0.02, trunkW + 0.04, 0.08 * s, { color: opts.knotColor, h: 0.08 * s, z: 0.7 * s });
      w.box(trunkOffset - 0.02, trunkOffset - 0.02, 0.08 * s, trunkW + 0.04, { color: opts.knotColor, h: 0.08 * s, z: 1.3 * s });
    }

    const canopyOffset = (1 - canopyW) * 0.5 + lean;
    const canopyZ = trunkH * 0.7 * s;
    w.box(canopyOffset, canopyOffset, canopyW * s, canopyW * s, {
      color: leaf1,
      h: canopyH * s,
      z: canopyZ,
    });

    const crownW = canopyW * 0.7;
    const crownOffset = (1 - crownW) * 0.5 + lean * 1.6;
    w.box(crownOffset, crownOffset, crownW * s, crownW * s, {
      color: leaf2,
      h: crownH * s,
      z: canopyZ + canopyH * 0.7 * s,
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
  return (w: SolidWriter, v: Variant, rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    const tintFactor = 0.85 + rng.next() * 0.3;
    const bodyColor = varyColor(opts.bodyColor, tintFactor);
    if (opts.isDead) {
      const lean = jitter(rng, 0.05);
      w.shadow(0.2, 0.2, 0.6 * s, 0.6 * s, 0.15);
      w.box(0.35, 0.35, 0.3 * s, 0.3 * s, { color: bodyColor, h: 0.3 * s * vary(rng, 0.2) });
      w.box(0.2 + lean, 0.25 + lean, 0.25 * s, 0.25 * s, { color: bodyColor, h: 0.4 * s * vary(rng, 0.25), z: 0.18 * s });
      w.box(0.55 - lean, 0.45 - lean, 0.25 * s, 0.25 * s, { color: bodyColor, h: 0.45 * s * vary(rng, 0.25), z: 0.18 * s });
      return;
    }
    const highlightColor = varyColor(opts.highlightColor, tintFactor);
    const shrubW = opts.w * vary(rng, 0.15);
    const shrubH = opts.h * vary(rng, 0.2);
    const lean = jitter(rng, 0.06);

    w.shadow(0.1, 0.1, (shrubW + 0.1) * s, (shrubW + 0.1) * s, 0.2);
    const offset = (1 - shrubW) * 0.5;
    w.box(offset, offset, shrubW * s, shrubW * s, { color: bodyColor, h: shrubH * s });
    const topW = shrubW * 0.7;
    const topOffset = (1 - topW) * 0.5 + lean;
    w.box(topOffset, topOffset, topW * s, topW * s, { color: highlightColor, h: shrubH * 0.65 * s, z: shrubH * 0.8 * s });

    if (v.level > 0 && opts.berryColor) {
      const berries: readonly [number, number, number][] = [
        [0.2, 0.3, 0.7],
        [0.6, 0.4, 0.6],
        [0.35, 0.65, 0.65],
      ];
      for (const [bx, by, bz] of berries) {
        if (rng.next() < 0.15) continue; // not every bush fruits fully
        w.box(bx + jitter(rng, 0.05), by + jitter(rng, 0.05), 0.15, 0.15, { color: opts.berryColor, h: 0.2, z: bz * s });
      }
    }
  };
}

export interface SucculentOptions {
  bodyColor: Ink;
  height: number;
}

export function createSucculentMassing(opts: SucculentOptions): Massing {
  return (w: SolidWriter, v: Variant, rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    const bodyColor = varyColor(opts.bodyColor, 0.85 + rng.next() * 0.3);
    const height = opts.height * vary(rng, 0.15);
    const hasRightArm = rng.next() > 0.15;
    const hasLeftArm = rng.next() > 0.15;
    const armZ = 0.65 + rng.next() * 0.3;

    w.shadow(0.15, 0.15, 0.7 * s, 0.7 * s, 0.25);
    w.box(0.38, 0.38, 0.24 * s, 0.24 * s, { color: bodyColor, h: height * s });
    if (hasRightArm) {
      const armH = 0.85 * vary(rng, 0.2);
      w.box(0.62, 0.42, 0.22 * s, 0.16 * s, { color: bodyColor, h: 0.18 * s, z: armZ * s });
      w.box(0.68, 0.42, 0.16 * s, 0.16 * s, { color: bodyColor, h: armH * s, z: (armZ + 0.18) * s });
    }
    if (hasLeftArm) {
      const armH = 0.75 * vary(rng, 0.2);
      const armZ2 = 0.95 + rng.next() * 0.3;
      w.box(0.16, 0.42, 0.22 * s, 0.16 * s, { color: bodyColor, h: 0.18 * s, z: armZ2 * s });
      w.box(0.16, 0.42, 0.16 * s, 0.16 * s, { color: bodyColor, h: armH * s, z: (armZ2 + 0.18) * s });
    }
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
  return (w: SolidWriter, v: Variant, rng: Rng) => {
    const s = v.progress > 0 ? v.progress : 1.0;
    const tintFactor = 0.85 + rng.next() * 0.3;
    const baseColor = varyColor(opts.baseColor, tintFactor);
    const topColor = varyColor(opts.topColor, tintFactor);
    const lean = jitter(rng, 0.06);
    if (opts.isSpire) {
      const h1 = 1.0 * vary(rng, 0.2);
      const h2 = 1.1 * vary(rng, 0.2);
      const h3 = 1.2 * vary(rng, 0.25);
      w.shadow(0.05, 0.05, 0.9 * s, 0.9 * s, 0.4);
      w.box(0.15, 0.15, 0.7 * s, 0.7 * s, { color: baseColor, h: h1 * s });
      w.box(0.24 + lean, 0.24 + lean, 0.52 * s, 0.52 * s, { color: topColor, h: h2 * s, z: 0.95 * s });
      w.box(0.32 + lean * 2, 0.32 + lean * 2, 0.36 * s, 0.36 * s, { color: varyColor(opts.spireColor ?? opts.baseColor, tintFactor), h: h3 * s, z: 2.0 * s });
      return;
    }
    const h1 = 0.5 * vary(rng, 0.25);
    const h2 = 0.4 * vary(rng, 0.25);
    w.shadow(0.1, 0.1, 0.8 * s, 0.8 * s, 0.3);
    w.box(0.15, 0.15, 0.7 * s, 0.7 * s, { color: baseColor, h: h1 * s });
    w.box(0.25 + lean, 0.2 + lean, 0.5 * s, 0.5 * s, { color: topColor, h: h2 * s, z: 0.4 * s });
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
  return (w: SolidWriter, v: Variant, rng: Rng) => {
    const variants = opts.colorVariants ?? [opts.defaultColor];
    const flowerColor = varyColor(variants[v.level % variants.length] ?? opts.defaultColor, 0.9 + rng.next() * 0.2);
    const stemH = 0.15 * vary(rng, 0.3);
    const blooms: readonly [number, number, number][] = [
      [0.2, 0.25, 0.25],
      [0.55, 0.3, 0.25],
      [0.35, 0.6, 0.3],
    ];
    w.shadow(0.2, 0.2, 0.6, 0.6, 0.15);
    w.box(0.25, 0.25, 0.5, 0.5, { color: opts.stemColor, h: stemH });
    for (const [bx, by, bh] of blooms) {
      w.box(bx + jitter(rng, 0.05), by + jitter(rng, 0.05), 0.2 * vary(rng, 0.2), 0.2 * vary(rng, 0.2), {
        color: flowerColor,
        h: bh * vary(rng, 0.2),
        z: stemH,
      });
    }
  };
}

export interface FungusOptions {
  stemColor: Ink;
  capColor: Ink;
}

export function createFungusMassing(opts: FungusOptions): Massing {
  return (w: SolidWriter, _v: Variant, rng: Rng) => {
    const capColor = varyColor(opts.capColor, 0.85 + rng.next() * 0.3);
    const bigStemH = 0.35 * vary(rng, 0.3);
    const bigCapW = 0.35 * vary(rng, 0.25);
    const hasSmallCap = rng.next() > 0.1;
    w.shadow(0.2, 0.2, 0.6, 0.6, 0.15);
    w.box(0.35, 0.35, 0.15, 0.15, { color: opts.stemColor, h: bigStemH });
    w.box(0.25, 0.25, bigCapW, bigCapW, { color: capColor, h: 0.2 * vary(rng, 0.2), z: bigStemH });
    if (hasSmallCap) {
      const smallStemH = 0.2 * vary(rng, 0.3);
      const smallCapW = 0.22 * vary(rng, 0.3);
      w.box(0.65 + jitter(rng, 0.06), 0.55 + jitter(rng, 0.06), 0.1, 0.1, { color: opts.stemColor, h: smallStemH });
      w.box(0.58 + jitter(rng, 0.06), 0.48 + jitter(rng, 0.06), smallCapW, smallCapW, { color: capColor, h: 0.15, z: smallStemH });
    }
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
    workSeconds: 1.2,
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
    workSeconds: 1.8,
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
    workSeconds: 1.5,
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
    workSeconds: 1.1,
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
    workSeconds: 2.0,
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
    workSeconds: 0.6,
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
    workSeconds: 0.4,
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
    workSeconds: 2.0,
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
    workSeconds: 1.4,
    spriteDef: ROCK_DEF,
  },
  bush: {
    kind: 'bush',
    name: 'Berry Bush',
    category: 'shrub',
    harvest: { wood: 2, fiber: 1, food: 8 },
    harvestVerb: 'PICKED',
    edible: true,
    preferredBiomes: ['meadow', 'taiga', 'wetlands', 'coastal'],
    toolMultiplier: { axe: 1.2 },
    workSeconds: 0.5,
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
    workSeconds: 0.3,
    spriteDef: FLOWER_DEF,
  },
  mushroom: {
    kind: 'mushroom',
    name: 'Mushroom',
    category: 'fungus',
    harvest: { food: 12 },
    harvestVerb: 'FORAGED',
    edible: true,
    preferredBiomes: ['wetlands', 'taiga', 'meadow'],
    toolMultiplier: {},
    workSeconds: 0.35,
    spriteDef: MUSHROOM_DEF,
  },
};

export interface FloraItem {
  readonly id: number;
  readonly kind: FloraKind;
  gx: number;
  gy: number;
  readonly w: number;
  readonly d: number;
  basePx: number;
  /** The plant's mature footprint scale. Set once; `growth` scales the *rendered* size below it. */
  scale: number;
  subType: number;
  /** Maturity in [0, 1]. Omitted / `1` for anything from world-gen or a save — those are
   *  full-grown. A regrown seedling starts near 0 and is eased up to 1 over `GROWTH_SECONDS`
   *  by `tickFloraRegrowth`; `floraVariant` renders it at `scale * maturityScale(growth)` so it
   *  sprouts small and fills out rather than popping in at full size. */
  growth?: number;
}

export interface SavedFlora {
  readonly kind: FloraKind;
  readonly gx: number;
  readonly gy: number;
  readonly scale: number;
  readonly subType: number;
  /** Present only for a seedling saved mid-growth; absent means fully grown. */
  readonly growth?: number;
}


import { SpatialGrid, MAX_SPATIAL_ENTITIES } from './spatial.js';


export const FLORA_SPATIAL = new SpatialGrid();

// ── Regrowth & maturation state ──────────────────────────────────────────────
//
// Soft plants (flowers, bushes, mushrooms) trickle back after grazing. Two rules keep it from
// reading as "plants blinked in everywhere at once":
//  1. Seedlings are dripped in one at a time on a fractional accumulator whose rate tapers to
//     zero as the meadow refills — never a synchronized batch on a 5-second metronome.
//  2. Each seedling sprouts at `growth ≈ 0` and is eased to full size over `GROWTH_SECONDS`;
//     `growing` holds just the handful still maturing so the per-tick cost is trivial.
// Module state resets naturally on a new world (the page reloads — see `createNewWorld`).

/** Density the ecosystem recovers toward — roughly the natural populated count from
 *  `populateFlora`. Regrowth tapers off as `flora.length` approaches this. */
const FLORA_SOFT_CAP = 14000;
/** Seedlings per second when the meadow is completely barren; scales linearly down with how
 *  full it is, so a devastated area recovers visibly while a near-full one barely seeds. */
const SEED_RATE_MAX = 3.0;
/** Seconds for a seedling to grow from sprout to full size. */
const GROWTH_SECONDS = 70;

let regrowthAccum = 0;
/** Plants still maturing (`growth < 1`). Small — bounded by `SEED_RATE_MAX * GROWTH_SECONDS`. */
const growing: FloraItem[] = [];

/** Rebuild the spatial grid index across all flora items. Use for a bulk (re)load; for removing
 *  a single plant on the hot path use `removeFloraAt` / `consumeFloraItem` instead — a full
 *  rebuild over ~14k plants is ~0.2 ms and a grazing herd can trigger a dozen removals per tick. */
export function rebuildFloraSpatial(flora: readonly FloraItem[]): void {
  FLORA_SPATIAL.clear();
  for (let i = 0; i < flora.length; i++) {
    const f = flora[i];
    if (f !== undefined) {
      FLORA_SPATIAL.insert(i, f.gx, f.gy);
    }
  }
}

/**
 * Remove the flora item at array index `idx` without an O(n) re-index. The last item is swapped
 * into the hole (`pop` then costs nothing) and the spatial grid is patched in place: the dead
 * slot is unlinked, and the moved item is re-keyed from its old index to `idx`. Order within
 * `flora` is not preserved — nothing depends on it (saves, rendering and queries all key by the
 * live index, which stays in sync here).
 */
export function removeFloraAt(flora: FloraItem[], idx: number): void {
  const last = flora.length - 1;
  if (idx < 0 || idx > last) return;

  FLORA_SPATIAL.remove(idx);
  if (idx !== last) {
    const moved = flora[last];
    if (moved !== undefined) {
      flora[idx] = moved;
      FLORA_SPATIAL.remove(last);
      FLORA_SPATIAL.insert(idx, moved.gx, moved.gy);
    }
  }
  flora.pop();
}

/**
 * Remove a specific flora `item` (e.g. the plant a herbivore just finished eating). Locates it
 * through the spatial index at its own position — O(cell) — and falls back to a linear scan
 * only if it isn't where the index thinks it is. Returns false if it was already gone.
 */
export function consumeFloraItem(flora: FloraItem[], item: FloraItem): boolean {
  const count = FLORA_SPATIAL.queryRadius(item.gx, item.gy, 0.1);
  for (let i = 0; i < count; i++) {
    const idx = FLORA_SPATIAL.queryBuffer[i];
    if (idx !== undefined && flora[idx] === item) {
      removeFloraAt(flora, idx);
      return true;
    }
  }
  const idx = flora.indexOf(item);
  if (idx === -1) return false;
  removeFloraAt(flora, idx);
  return true;
}

/** Extract current living flora items for persistence. `growth` is written only for the rare
 *  still-maturing seedling — a full-grown plant (the overwhelming majority) omits it and reloads
 *  as mature. */
export function extractSavedFlora(flora: readonly FloraItem[]): SavedFlora[] {
  return flora.map((f) => ({
    kind: f.kind,
    gx: f.gx,
    gy: f.gy,
    scale: f.scale,
    subType: f.subType,
    ...(f.growth !== undefined && f.growth < 1 ? { growth: f.growth } : {}),
  }));
}

/** Reconstruct flora items from saved state. Any plant saved mid-growth resumes maturing. */
export function restoreFlora(saved: readonly SavedFlora[]): FloraItem[] {
  let seq = 1;
  growing.length = 0;
  regrowthAccum = 0;
  const items: FloraItem[] = saved.map((s) => ({
    id: seq++,
    kind: s.kind,
    gx: s.gx,
    gy: s.gy,
    w: 1,
    d: 1,
    basePx: 0,
    scale: s.scale,
    subType: s.subType,
    growth: s.growth ?? 1,
  }));
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it !== undefined && (it.growth ?? 1) < 1) growing.push(it);
  }
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
 * Rendered-size multiplier for a plant's maturity: a fresh seedling shows at ~18% of its mature
 * footprint and eases (smoothstep) up to full size as `growth` runs 0 → 1. Pure Tier-A
 * arithmetic and cosmetic only — it feeds the sprite `progress`, never a hash or a save.
 */
export function maturityScale(growth: number): number {
  const g = growth < 0 ? 0 : growth > 1 ? 1 : growth;
  return 0.18 + 0.82 * (g * g * (3 - 2 * g));
}

/**
 * Return the visual Variant for a flora item.
 * Reuses an internal scratch variant to guarantee zero heap allocation.
 */
export function floraVariant(f: FloraItem): Variant {
  FLORA_VARIANT_SCRATCH.seed = f.id;
  FLORA_VARIANT_SCRATCH.flags = 0;
  FLORA_VARIANT_SCRATCH.level = f.subType;
  FLORA_VARIANT_SCRATCH.progress = f.scale * maturityScale(f.growth ?? 1);
  FLORA_VARIANT_SCRATCH.label = '';
  return FLORA_VARIANT_SCRATCH;
}

// ── Populate World with Flora ─────────────────────────────────────────────────

let floraIdSeq = 1;

/** Populate the massive 640x640 world with organic procedural forest groves, copses, and wildflower glades. */
export function populateFlora(seed: number, world: WorldTerrain): FloraItem[] {
  const rng = createRng(seed ^ 0x5a5a5a5a);
  const items: FloraItem[] = [];

  // Reset spatial index for population collision checks, and the regrowth/maturation state
  // (a fresh world has nothing sprouting and no accumulated seed budget).
  FLORA_SPATIAL.clear();
  growing.length = 0;
  regrowthAccum = 0;

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
          growth: 1, // world-gen flora is fully grown
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
  readonly food: number;
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
  removeFloraAt(flora, index);

  const def = FLORA_REGISTRY[item.kind];
  const wood = def.harvest.wood ?? 0;
  const stone = def.harvest.stone ?? 0;
  const fiber = def.harvest.fiber ?? 0;
  const food = def.harvest.food ?? 0;

  const parts: string[] = [];
  if (wood > 0) parts.push(`+${wood} WOOD`);
  if (stone > 0) parts.push(`+${stone} STONE`);
  if (fiber > 0) parts.push(`+${fiber} FIBER`);
  if (food > 0) parts.push(`+${food} FOOD`);
  const label = `${parts.join(', ')} (${def.name.toUpperCase()} ${def.harvestVerb})`;

  return { item, wood, stone, fiber, food, label };
}

const DEFAULT_EDIBLE_KINDS: readonly FloraKind[] = ['flowers', 'bush', 'mushroom'];

/** Below this maturity a plant is a bare sprout — herbivores don't bother with it, which gives
 *  regrowth a foothold in grazed areas instead of every seedling being eaten the moment it shows. */
const FORAGE_MIN_GROWTH = 0.35;

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
      if ((f.growth ?? 1) < FORAGE_MIN_GROWTH) continue;
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
    if ((f.growth ?? 1) < FORAGE_MIN_GROWTH) continue;
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

/**
 * The only flora kinds that ever come back. Rocks and stone are deliberately excluded
 * and must never be added here: boulders and rock spires are a finite resource — once
 * mined they are gone for good, so the world slowly, permanently runs out of stone.
 */
const REGROWABLE_KINDS = ['flowers', 'bush', 'mushroom'] as const;

/** Pick a random regrowable plant to sprout beside, so patches spread outward instead of
 *  seedlings appearing at scattered empty tiles across the whole map. Samples a few entries and
 *  returns the first soft plant; `undefined` if the meadow has none left (fall back to open ground). */
function pickRegrowParent(flora: readonly FloraItem[], rng: Rng): FloraItem | undefined {
  if (flora.length === 0) return undefined;
  for (let tries = 0; tries < 8; tries++) {
    const f = flora[Math.floor(rng.next() * flora.length)];
    if (f !== undefined && (f.kind === 'flowers' || f.kind === 'bush' || f.kind === 'mushroom')) {
      return f;
    }
  }
  return undefined;
}

/**
 * Ecosystem tick for soft flora: (1) ease every still-maturing seedling toward full size, and
 * (2) drip in at most one new seedling, on a fractional accumulator whose rate falls to zero as
 * the meadow refills toward `FLORA_SOFT_CAP`. New plants sprout small (`growth ≈ 0`) next to an
 * existing patch, not at full size in a random empty field — so recovery reads as growth, not as
 * plants blinking into existence everywhere at once. Trees and rocks never regrow.
 */
export function tickFloraRegrowth(
  seed: number,
  flora: FloraItem[],
  world: WorldTerrain,
  dt: number,
): void {
  // 1. Maturation — only the handful of plants still growing, so this is a few iterations.
  if (growing.length > 0) {
    const inc = dt / GROWTH_SECONDS;
    for (let i = growing.length - 1; i >= 0; i--) {
      const f = growing[i];
      if (f === undefined) { growing.splice(i, 1); continue; }
      const g = (f.growth ?? 1) + inc;
      if (g >= 1) {
        f.growth = 1;
        growing.splice(i, 1);
      } else {
        f.growth = g;
      }
    }
  }

  // 2. Seeding — rate tapers to zero as the population approaches its natural density.
  if (flora.length >= FLORA_SOFT_CAP || flora.length >= MAX_SPATIAL_ENTITIES - 256) return;
  const deficit = (FLORA_SOFT_CAP - flora.length) / FLORA_SOFT_CAP; // 1 = barren, 0 = full
  regrowthAccum += SEED_RATE_MAX * deficit * dt;
  if (regrowthAccum < 1) return;
  regrowthAccum -= 1;

  const rng = createRng(hash2(seed ^ 0xabcdef, floraIdSeq, flora.length));

  let gx: number;
  let gy: number;
  const parent = pickRegrowParent(flora, rng);
  if (parent !== undefined) {
    // A ring 2–6 tiles out from the parent on each axis (random sign) — far enough to clear the
    // parent's own tile, close enough that patches visibly spread outward. Pure Tier-A (no trig)
    // so the saved seedling position stays bit-reproducible.
    const ox = (2 + Math.floor(rng.next() * 5)) * (rng.next() < 0.5 ? -1 : 1);
    const oy = (2 + Math.floor(rng.next() * 5)) * (rng.next() < 0.5 ? -1 : 1);
    gx = parent.gx + ox;
    gy = parent.gy + oy;
  } else {
    gx = Math.floor(4 + rng.next() * (W - 8));
    gy = Math.floor(4 + rng.next() * (H - 8));
  }

  if (gx < 4 || gy < 4 || gx >= W - 4 || gy >= H - 4) return;
  if (world.surface.get(gx, gy) !== MAT_GRASS) return;
  if (FLORA_SPATIAL.queryRadius(gx, gy, 0.9) > 0) return;

  const roll = rng.next();
  const kind: FloraKind = roll < 0.5 ? REGROWABLE_KINDS[0] : roll < 0.8 ? REGROWABLE_KINDS[1] : REGROWABLE_KINDS[2];

  const newIdx = flora.length;
  const seedling: FloraItem = {
    id: floraIdSeq++,
    kind,
    gx,
    gy,
    w: 1,
    d: 1,
    basePx: 0,
    scale: 0.8 + rng.next() * 0.3, // mature target — rendered size is this × maturityScale(growth)
    subType: Math.floor(rng.next() * 3),
    growth: 0.03,
  };
  flora.push(seedling);
  FLORA_SPATIAL.insert(newIdx, gx, gy);
  growing.push(seedling);
}


