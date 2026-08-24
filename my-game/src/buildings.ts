/**
 * Buildings: catalogue, massings, placement, costs, and collision logic.
 *
 * A building is a placed structure on a tile. Solid buildings (walls and towers)
 * physically block movement and keep wild animals and predators out of player bases.
 *
 * Sprite massings use `SolidWriter` — the declarative emitter — so the same
 * massing drives both drawing and thumbnail generation.
 */

import {
  defineSprite,
  type SpriteDef,
  type Massing,
  type SolidWriter,
  type Variant,
  hex,
} from '@latticekit/draw';
import { Rng } from '@latticekit/core';
import { footprintBase, type Footprint } from '@latticekit/iso';
import { TIMBER, STONE, TOWER, FLOOR } from './palette.js';
import type { WorldTerrain } from './world.js';
import { W, H, MAT_WATER } from './world.js';

// ── Building Colors ───────────────────────────────────────────────────────────

export const WALL_WOOD    = hex('#795548');
export const WALL_BEAM    = hex('#4e342e');
export const WALL_STONE   = hex('#78909c');
export const STONE_DARK   = hex('#546e7a');
export const ROOF_GOLD    = hex('#f39c12');
export const LANTERN_GLOW = hex('#f1c40f');
export const BANNER_RED   = hex('#e74c3c');
export const BANNER_BLUE  = hex('#3498db');

// ── Building kinds ─────────────────────────────────────────────────────────────

export type BuildingKind = 'wood_wall' | 'stone_wall' | 'wood_tower' | 'stone_tower' | 'floor';

export interface BuildingCost {
  readonly wood: number;
  readonly stone: number;
  readonly fiber?: number;
}

export const BUILDING_COSTS: Record<BuildingKind, BuildingCost> = {
  wood_wall:   { wood: 4,  stone: 0 },
  stone_wall:  { wood: 0,  stone: 4 },
  wood_tower:  { wood: 12, stone: 2 },
  stone_tower: { wood: 6,  stone: 14 },
  floor:       { wood: 2,  stone: 0 },
};

/** A placed structure in the world. */
export interface Building {
  readonly id: number;
  readonly kind: BuildingKind;
  /** Tile position — the north corner of the building's footprint. */
  gx: number;
  gy: number;
  /** Footprint in tiles. */
  readonly w: number;
  readonly d: number;
  /** Ground height under footprint in world pixels. Set at placement. */
  basePx: number;
  /** Hit points — hostile trolls reduce this over time. */
  hp: number;
  readonly maxHp: number;
}

// ── Sprite Definitions ─────────────────────────────────────────────────────────

/** Wood Palisade Wall: Timber stakes with cross-bracing. */
const woodWallMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 1, 1, 0.35);
  // Log base footing
  w.box(0, 0, 1, 1, { color: WALL_BEAM, h: 0.3, outline: false });
  // Main vertical timber posts
  w.box(0.08, 0.08, 0.84, 0.84, { color: WALL_WOOD, h: 1.7, z: 0.3 });
  // Reinforcing horizontal beam
  w.box(0.04, 0.04, 0.92, 0.92, { color: WALL_BEAM, h: 0.22, z: 1.1, outline: false });
  // Sharpened palisade spikes
  w.box(0.08, 0.08, 0.24, 0.24, { color: WALL_BEAM, h: 0.45, z: 2.0 });
  w.box(0.68, 0.08, 0.24, 0.24, { color: WALL_BEAM, h: 0.45, z: 2.0 });
  w.box(0.08, 0.68, 0.24, 0.24, { color: WALL_BEAM, h: 0.45, z: 2.0 });
  w.box(0.68, 0.68, 0.24, 0.24, { color: WALL_BEAM, h: 0.45, z: 2.0 });
};

export const WOOD_WALL_DEF: SpriteDef = defineSprite({ id: 'bld_wood_wall', w: 1, d: 1, massing: woodWallMassing });

/** Stone Masonry Wall: Heavy stone blocks with crenelated cap. */
const stoneWallMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 1, 1, 0.4);
  // Heavy stone foundation
  w.box(0, 0, 1, 1, { color: STONE_DARK, h: 0.5, outline: true });
  // Main dressed stone block body
  w.box(0.05, 0.05, 0.9, 0.9, { color: WALL_STONE, h: 1.4, z: 0.5, outline: true });
  // Stone coping rim
  w.box(0.02, 0.02, 0.96, 0.96, { color: STONE_DARK, h: 0.2, z: 1.9, outline: false });
  // Defensive battlements / merlons
  w.box(0.05, 0.05, 0.35, 0.35, { color: WALL_STONE, h: 0.35, z: 2.1 });
  w.box(0.6, 0.6, 0.35, 0.35, { color: WALL_STONE, h: 0.35, z: 2.1 });
};

export const STONE_WALL_DEF: SpriteDef = defineSprite({ id: 'bld_stone_wall', w: 1, d: 1, massing: stoneWallMassing });

/** Wood Watchtower: 2x2 Timber lookout tower with lantern beacon. */
const woodTowerMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 2, 2, 0.45);
  // Log Corner Posts
  w.box(0.1, 0.1, 0.35, 0.35, { color: WALL_BEAM, h: 4.2 });
  w.box(1.55, 0.1, 0.35, 0.35, { color: WALL_BEAM, h: 4.2 });
  w.box(0.1, 1.55, 0.35, 0.35, { color: WALL_BEAM, h: 4.2 });
  w.box(1.55, 1.55, 0.35, 0.35, { color: WALL_BEAM, h: 4.2 });
  // Diagonal cross-trusses
  w.box(0.2, 0.2, 1.6, 1.6, { color: WALL_WOOD, h: 0.25, z: 1.8, outline: false });
  w.box(0.2, 0.2, 1.6, 1.6, { color: WALL_WOOD, h: 0.25, z: 3.4, outline: false });
  // Lookout Platform Decking
  w.box(0, 0, 2, 2, { color: FLOOR, h: 0.3, z: 4.2 });
  // Guard railings
  w.box(0.05, 0.05, 1.9, 1.9, { color: WALL_BEAM, h: 0.6, z: 4.5, outline: false });
  // Central beacon lantern post
  w.post(0.95, 0.95, 4.5, 0.9, WALL_BEAM, 0.08);
  // Warm Lantern Beacon
  w.box(0.85, 0.85, 0.3, 0.3, { color: LANTERN_GLOW, h: 0.35, z: 5.4 });
  // Pennant
  w.box(0.96, 0.96, 0.08, 0.5, { color: BANNER_BLUE, h: 0.25, z: 5.2 });
};

export const WOOD_TOWER_DEF: SpriteDef = defineSprite({ id: 'bld_wood_tower', w: 2, d: 2, massing: woodTowerMassing });

/** Stone Fortress Tower: 2x2 Heavy fortress tower with battlements and beacon. */
const stoneTowerMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 2, 2, 0.55);
  // Stone Fortress Base
  w.box(0, 0, 2, 2, { color: STONE_DARK, h: 1.2, outline: true });
  // Main Fortress Shaft
  w.box(0.15, 0.15, 1.7, 1.7, { color: TOWER, h: 3.4, z: 1.2, outline: true });
  // Corbelled parapet overhang
  w.box(0.05, 0.05, 1.9, 1.9, { color: STONE_DARK, h: 0.35, z: 4.6, outline: false });
  // Archer Lookout Platform & Battlements
  w.box(0, 0, 2, 2, { color: WALL_STONE, h: 0.7, z: 4.95 });
  // Corner battlement merlons
  w.box(0.02, 0.02, 0.45, 0.45, { color: WALL_STONE, h: 0.55, z: 5.65 });
  w.box(1.53, 0.02, 0.45, 0.45, { color: WALL_STONE, h: 0.55, z: 5.65 });
  w.box(0.02, 1.53, 0.45, 0.45, { color: WALL_STONE, h: 0.55, z: 5.65 });
  w.box(1.53, 1.53, 0.45, 0.45, { color: WALL_STONE, h: 0.55, z: 5.65 });
  // Central Beacon Lantern Post
  w.post(0.95, 0.95, 5.65, 0.95, WALL_BEAM, 0.08);
  // Warm Lantern Beacon
  w.box(0.85, 0.85, 0.3, 0.3, { color: LANTERN_GLOW, h: 0.35, z: 6.6 });
  // Heraldic Pennant Banner
  w.box(0.96, 0.96, 0.08, 0.55, { color: BANNER_RED, h: 0.3, z: 6.3 });
};

export const STONE_TOWER_DEF: SpriteDef = defineSprite({ id: 'bld_stone_tower', w: 2, d: 2, massing: stoneTowerMassing });

/** Timber Decking / Floor: Walkable platform. */
const floorMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 1, 1, 0.12);
  w.box(0, 0, 1, 1, { color: FLOOR, h: 0.22 });
  w.box(0.15, 0.05, 0.7, 0.9, { color: WALL_WOOD, h: 0.08, z: 0.22, outline: false });
};

export const FLOOR_DEF: SpriteDef = defineSprite({ id: 'bld_floor', w: 1, d: 1, massing: floorMassing });

// ── Building Lookup & Placement ────────────────────────────────────────────────

export function defFor(kind: BuildingKind): SpriteDef {
  switch (kind) {
    case 'wood_wall':   return WOOD_WALL_DEF;
    case 'stone_wall':  return STONE_WALL_DEF;
    case 'wood_tower':  return WOOD_TOWER_DEF;
    case 'stone_tower': return STONE_TOWER_DEF;
    case 'floor':       return FLOOR_DEF;
  }
}

export function hpFor(kind: BuildingKind): number {
  switch (kind) {
    case 'wood_wall':   return 180;
    case 'stone_wall':  return 360;
    case 'wood_tower':  return 380;
    case 'stone_tower': return 750;
    case 'floor':       return 80;
  }
}

/** Whether a building kind is a solid barrier that blocks movement. */
export function isBuildingSolid(kind: BuildingKind): boolean {
  return kind !== 'floor';
}

/** Check if any active solid building occupies tile (gx, gy). */
export function isTileOccupiedBySolidBuilding(
  gx: number,
  gy: number,
  buildings: readonly Building[],
): boolean {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0 || !isBuildingSolid(b.kind)) continue;
    if (gx >= b.gx && gx < b.gx + b.w && gy >= b.gy && gy < b.gy + b.d) {
      return true;
    }
  }
  return false;
}

let nextId = 1;

/**
 * Attempt to place a building at (gx, gy).
 *
 * Fails if any footprint tile is water, or is already occupied by another active building.
 */
export function placeBuilding(
  kind: BuildingKind,
  gx: number,
  gy: number,
  world: WorldTerrain,
  existing: Building[],
): Building | undefined {
  const def = defFor(kind);
  const { w, d } = def;

  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return undefined;
      if (world.surface.get(tx, ty) === MAT_WATER) return undefined;
      for (const b of existing) {
        if (b.hp > 0 && tx >= b.gx && tx < b.gx + b.w && ty >= b.gy && ty < b.gy + b.d) {
          return undefined;
        }
      }
    }
  }

  const fp: Footprint = { gx, gy, w, d };
  const basePx        = footprintBase(world.field, fp);
  const maxHp         = hpFor(kind);

  return {
    id:    nextId++,
    kind,
    gx,
    gy,
    w,
    d,
    basePx,
    hp:    maxHp,
    maxHp,
  };
}

/** Reconstruct a saved building into live simulation state. */
export function restoreBuilding(
  kind: BuildingKind,
  gx: number,
  gy: number,
  hp: number,
  maxHp: number,
  world: WorldTerrain,
): Building {
  const def    = defFor(kind);
  const fp: Footprint = { gx, gy, w: def.w, d: def.d };
  const basePx = footprintBase(world.field, fp);

  return {
    id:    nextId++,
    kind,
    gx,
    gy,
    w:     def.w,
    d:     def.d,
    basePx,
    hp,
    maxHp,
  };
}

/** Check if a building can be legally placed at (gx, gy). */
export function canPlaceBuilding(
  kind: BuildingKind,
  gx: number,
  gy: number,
  world: WorldTerrain,
  existing: readonly Building[],
): boolean {
  const def = defFor(kind);
  const { w, d } = def;

  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
      if (world.surface.get(tx, ty) === MAT_WATER) return false;
      for (const b of existing) {
        if (b.hp > 0 && tx >= b.gx && tx < b.gx + b.w && ty >= b.gy && ty < b.gy + b.d) {
          return false;
        }
      }
    }
  }
  return true;
}

/** Apply troll / monster damage to buildings within 1.5 tiles. Returns true if any building was hit. */
export function damageBuildings(
  buildings: Building[],
  trollX: number,
  trollY: number,
  dmgPerTick: number,
): boolean {
  let hit = false;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0) continue;
    const dx = Math.abs(trollX - (b.gx + b.w * 0.5));
    const dy = Math.abs(trollY - (b.gy + b.d * 0.5));
    if (dx < 1.4 + b.w * 0.5 && dy < 1.4 + b.d * 0.5) {
      b.hp -= dmgPerTick;
      hit = true;
    }
  }
  return hit;
}
