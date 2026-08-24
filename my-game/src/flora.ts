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
  VARIANT_ZERO,
  type SpriteDef,
  type Massing,
  type SolidWriter,
  type Variant,
  type Ink,
} from '@latticekit/draw';
import { Rng, createRng, fbm2, hash2, toUnit } from '@latticekit/core';
import { hex } from '@latticekit/draw';
import { W, H, MAT_WATER, MAT_SAND, MAT_SNOW, MAT_ROCK, MAT_GRASS, type WorldTerrain } from './world.js';

// ── Colors for Flora ──────────────────────────────────────────────────────────

export const PINE_NEEDLE  = hex('#1b3d22');
export const PINE_NEEDLE2 = hex('#25522e');
export const OAK_LEAF     = hex('#3c6b2e');
export const OAK_LEAF2    = hex('#4d8239');
export const WOOD_TRUNK   = hex('#4a2f1b');
export const BIRCH_TRUNK  = hex('#d2c8b8');
export const BUSH_GREEN   = hex('#357335');
export const BERRY_RED    = hex('#d9383a');
export const FLOWER_PETAL = hex('#f2d649');
export const FLOWER_BLUE  = hex('#5689db');
export const FLOWER_PURPLE= hex('#9b59b6');
export const ROCK_GRAY    = hex('#6e7370');
export const ROCK_DARK    = hex('#4f5451');
export const MOSS_GREEN   = hex('#4f7832');
export const SHROOM_CAP   = hex('#c0392b');
export const SHROOM_STEM  = hex('#e8dfd8');

// ── Flora Kinds & Definitions ─────────────────────────────────────────────────

export type FloraKind = 'pine' | 'oak' | 'bush' | 'flowers' | 'rock' | 'mushroom';

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

// ── Pine Tree Massing ─────────────────────────────────────────────────────────

const pineMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0.1, 0.1, 0.8 * s, 0.8 * s, 0.35);
  // Trunk
  w.box(0.4, 0.4, 0.2 * s, 0.2 * s, { color: WOOD_TRUNK, h: 1.2 * s });
  // Tier 1 bottom foliage
  w.box(0.15, 0.15, 0.7 * s, 0.7 * s, { color: PINE_NEEDLE, h: 0.9 * s, z: 0.8 * s });
  // Tier 2 middle foliage
  w.box(0.25, 0.25, 0.5 * s, 0.5 * s, { color: PINE_NEEDLE2, h: 0.9 * s, z: 1.5 * s });
  // Tier 3 top peak
  w.box(0.35, 0.35, 0.3 * s, 0.3 * s, { color: PINE_NEEDLE, h: 0.8 * s, z: 2.2 * s });
};

export const PINE_DEF: SpriteDef = defineSprite({ id: 'flora_pine', w: 1, d: 1, massing: pineMassing });

// ── Oak Tree Massing ──────────────────────────────────────────────────────────

const oakMassing: Massing = (w: SolidWriter, v: Variant, _rng: Rng) => {
  const s = v.progress > 0 ? v.progress : 1.0;
  w.shadow(0, 0, 1.2 * s, 1.2 * s, 0.4);
  // Sturdy trunk
  w.box(0.35, 0.35, 0.3 * s, 0.3 * s, { color: WOOD_TRUNK, h: 1.5 * s });
  // Main lush canopy
  w.box(0.1, 0.1, 0.8 * s, 0.8 * s, { color: OAK_LEAF, h: 1.4 * s, z: 1.2 * s });
  // Crown highlight
  w.box(0.2, 0.2, 0.6 * s, 0.6 * s, { color: OAK_LEAF2, h: 0.8 * s, z: 2.3 * s });
};

export const OAK_DEF: SpriteDef = defineSprite({ id: 'flora_oak', w: 1, d: 1, massing: oakMassing });

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
    case 'pine':     return PINE_DEF;
    case 'oak':      return OAK_DEF;
    case 'bush':     return BUSH_DEF;
    case 'flowers':  return FLOWER_DEF;
    case 'rock':     return ROCK_DEF;
    case 'mushroom': return MUSHROOM_DEF;
  }
}

export function floraVariant(f: FloraItem): Variant {
  return {
    seed:     f.id,
    flags:    0,
    level:    f.subType,
    progress: f.scale,
    label:    '',
  };
}

// ── Populate World with Flora ─────────────────────────────────────────────────

let floraIdSeq = 1;

/** Populate the world with lush procedural trees, bushes, flowers, and stones. */
export function populateFlora(seed: number, world: WorldTerrain): FloraItem[] {
  const rng = createRng(seed ^ 0x5a5a5a5a);
  const items: FloraItem[] = [];

  for (let gy = 4; gy < H - 4; gy += 2) {
    for (let gx = 4; gx < W - 4; gx += 2) {
      // Don't spawn on spawn zones for players
      if ((gx >= 36 && gx <= 44 && gy >= 36 && gy <= 44) ||
          (gx >= 156 && gx <= 164 && gy >= 36 && gy <= 44)) {
        continue;
      }

      const mat = world.surface.get(gx, gy);
      if (mat === MAT_WATER) continue;

      const jitterX = gx + (rng.next() * 1.6 - 0.8);
      const jitterY = gy + (rng.next() * 1.6 - 0.8);
      const tgx = Math.floor(jitterX);
      const tgy = Math.floor(jitterY);
      if (tgx < 0 || tgy < 0 || tgx >= W || tgy >= H) continue;

      const tMat = world.surface.get(tgx, tgy);
      if (tMat === MAT_WATER) continue;

      // Use noise density to create organic clusters / forest groves
      const density = fbm2(seed ^ 0x3333, tgx * 0.04, tgy * 0.04, 3);
      const roll = rng.next();

      let kind: FloraKind | undefined = undefined;
      let scale = 0.85 + rng.next() * 0.35;
      let subType = 0;

      if (tMat === MAT_SNOW) {
        // High altitude: pine trees and rugged rocks
        if (density > 0.1 && roll < 0.45) {
          kind = 'pine';
          scale = 0.9 + rng.next() * 0.4;
        } else if (roll < 0.25) {
          kind = 'rock';
          subType = roll < 0.1 ? 1 : 0;
        }
      } else if (tMat === MAT_ROCK) {
        // Mountain slopes
        if (roll < 0.35) {
          kind = 'rock';
          subType = roll < 0.15 ? 1 : 0;
        } else if (density > 0.2 && roll < 0.6) {
          kind = 'pine';
        }
      } else if (tMat === MAT_SAND) {
        // Coastal sands: occasional driftwood / rock
        if (roll < 0.1) {
          kind = 'rock';
        }
      } else if (tMat === MAT_GRASS) {
        // Meadows and lush forests
        if (density > 0.25) {
          // Dense forest zone
          if (roll < 0.5) {
            kind = 'oak';
            scale = 0.9 + rng.next() * 0.35;
          } else if (roll < 0.75) {
            kind = 'pine';
          } else if (roll < 0.88) {
            kind = 'mushroom';
          } else {
            kind = 'bush';
            subType = roll > 0.94 ? 1 : 0;
          }
        } else if (density > -0.15) {
          // Pleasant meadow
          if (roll < 0.3) {
            kind = 'flowers';
            subType = Math.floor(rng.next() * 3);
          } else if (roll < 0.45) {
            kind = 'bush';
            subType = roll > 0.35 ? 1 : 0;
          } else if (roll < 0.55) {
            kind = 'oak';
          }
        } else {
          // Open plains / clearing
          if (roll < 0.25) {
            kind = 'flowers';
            subType = Math.floor(rng.next() * 3);
          } else if (roll < 0.35) {
            kind = 'rock';
          }
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
          basePx: 0, // calculated before render
          scale,
          subType,
        });
      }
    }
  }

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

  let wood = 0;
  let stone = 0;
  let fiber = 0;
  let label = '';

  switch (item.kind) {
    case 'pine':
      wood = 4;
      label = '+4 WOOD (PINE CHOPPED)';
      break;
    case 'oak':
      wood = 6;
      label = '+6 WOOD (OAK CHOPPED)';
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

/** Find the closest edible flora within radius for herbivores. */
export function findClosestEdibleFlora(
  flora: FloraItem[],
  fromX: number,
  fromY: number,
  radius: number,
  edibleKinds: readonly FloraKind[] = ['flowers', 'bush', 'mushroom'],
): FloraItem | undefined {
  let closest: FloraItem | undefined = undefined;
  let minDistSq = radius * radius;

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

  if (flora.length >= 1200) return; // Ecosystem capacity

  const rng = createRng((seed + flora.length * 31) ^ 0xabcdef);
  const gx = Math.floor(4 + rng.next() * (W - 8));
  const gy = Math.floor(4 + rng.next() * (H - 8));

  const mat = world.surface.get(gx, gy);
  if (mat !== MAT_GRASS) return;

  // Check if tile already has flora
  const existing = flora.some((f) => f.gx === gx && f.gy === gy);
  if (existing) return;

  const roll = rng.next();
  const kind: FloraKind = roll < 0.5 ? 'flowers' : roll < 0.8 ? 'bush' : 'mushroom';

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
}
