/**
 * Buildings: catalogue and placement logic.
 *
 * A building is a placed structure on a tile. It has a footprint, a height, a material,
 * and an HP pool. Trolls damage buildings they stand adjacent to.
 *
 * Sprite massings use `SolidWriter` — the declarative emitter — not `Pen`, so the same
 * massing drives both drawing and thumbnail generation from one body of code.
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
import { MAT_WATER } from './world.js';

// ── Building Colors ───────────────────────────────────────────────────────────

export const WALL_WOOD    = hex('#795548');
export const WALL_BEAM    = hex('#4e342e');
export const WALL_STONE   = hex('#78909c');
export const ROOF_GOLD    = hex('#f39c12');
export const LANTERN_GLOW = hex('#f1c40f');
export const BANNER_RED   = hex('#e74c3c');
export const RAMP_TIMBER  = hex('#8d6e63');

// ── Building kinds ─────────────────────────────────────────────────────────────

export type BuildingKind = 'wall' | 'floor' | 'tower' | 'ramp';

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
  /** Hit points — trolls reduce this over time. */
  hp: number;
  readonly maxHp: number;
}

// ── Sprite definitions ─────────────────────────────────────────────────────────

/** Palisade fortification with stone footings and timber posts. */
const wallMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 1, 1, 0.4);
  // Stone foundation footing
  w.box(0, 0, 1, 1, { color: WALL_STONE, h: 0.35, outline: false });
  // Main timber palisade body
  w.box(0.08, 0.08, 0.84, 0.84, { color: WALL_WOOD, h: 1.8, z: 0.35 });
  // Reinforcing cross-beams
  w.box(0.04, 0.04, 0.92, 0.92, { color: WALL_BEAM, h: 0.25, z: 1.2, outline: false });
  // Corner palisade stakes jutting up
  w.box(0.06, 0.06, 0.22, 0.22, { color: WALL_BEAM, h: 0.45, z: 2.15 });
  w.box(0.72, 0.06, 0.22, 0.22, { color: WALL_BEAM, h: 0.45, z: 2.15 });
  w.box(0.06, 0.72, 0.22, 0.22, { color: WALL_BEAM, h: 0.45, z: 2.15 });
  w.box(0.72, 0.72, 0.22, 0.22, { color: WALL_BEAM, h: 0.45, z: 2.15 });
};

/** Decking and floor tiles with timber planks and corner brass rivets. */
const floorMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 1, 1, 0.15);
  // Floor plank platform
  w.box(0, 0, 1, 1, { color: FLOOR, h: 0.25 });
  // Inner plank lines
  w.box(0.15, 0.05, 0.7, 0.9, { color: WALL_WOOD, h: 0.08, z: 0.25, outline: false });
  // Corner rivets
  w.box(0.04, 0.04, 0.1, 0.1, { color: WALL_STONE, h: 0.12, z: 0.25, outline: false });
  w.box(0.86, 0.04, 0.1, 0.1, { color: WALL_STONE, h: 0.12, z: 0.25, outline: false });
  w.box(0.04, 0.86, 0.1, 0.1, { color: WALL_STONE, h: 0.12, z: 0.25, outline: false });
  w.box(0.86, 0.86, 0.1, 0.1, { color: WALL_STONE, h: 0.12, z: 0.25, outline: false });
};

/** Fortified Watchtower with stone foundation, archer platform, lantern beacon, and waving banner. */
const towerMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 2, 2, 0.5);
  // Stone Fortress Base
  w.box(0, 0, 2, 2, { color: WALL_STONE, h: 1.2, outline: true });
  // Shaft
  w.box(0.15, 0.15, 1.7, 1.7, { color: TOWER, h: 3.2, z: 1.2, outline: true });
  // Timber corbels
  w.box(0.05, 0.05, 1.9, 1.9, { color: WALL_BEAM, h: 0.35, z: 4.4, outline: false });
  // Archer Lookout Platform & Battlements
  w.box(0, 0, 2, 2, { color: WALL_STONE, h: 0.7, z: 4.75 });
  // Arrow slit embrasures
  w.box(0.2, 0.2, 1.6, 1.6, { color: FLOOR, h: 0.1, z: 4.9, outline: false });
  // Corner battlement merlons
  w.box(0.02, 0.02, 0.45, 0.45, { color: WALL_STONE, h: 0.5, z: 5.45 });
  w.box(1.53, 0.02, 0.45, 0.45, { color: WALL_STONE, h: 0.5, z: 5.45 });
  w.box(0.02, 1.53, 0.45, 0.45, { color: WALL_STONE, h: 0.5, z: 5.45 });
  w.box(1.53, 1.53, 0.45, 0.45, { color: WALL_STONE, h: 0.5, z: 5.45 });

  // Central Beacon Lantern Post
  w.post(0.95, 0.95, 5.45, 0.95, WALL_BEAM, 0.08);
  // Warm Lantern Beacon
  w.box(0.85, 0.85, 0.3, 0.3, { color: LANTERN_GLOW, h: 0.35, z: 6.4 });
  // Heraldic Pennant Banner
  w.box(0.96, 0.96, 0.08, 0.55, { color: BANNER_RED, h: 0.3, z: 6.1 });
};

/** Sturdy inclined staircase / ramp connecting elevation levels. */
const rampMassing: Massing = (w: SolidWriter, _v: Variant, _rng: Rng) => {
  w.shadow(0, 0, 1, 2, 0.3);
  // Lower step
  w.box(0, 1.0, 1.0, 1.0, { color: RAMP_TIMBER, h: 0.45 });
  // Middle step
  w.box(0, 0.5, 1.0, 1.0, { color: RAMP_TIMBER, h: 0.9, z: 0.45, outline: false });
  // Top step
  w.box(0, 0, 1.0, 1.0, { color: RAMP_TIMBER, h: 1.35, z: 0.9, outline: true });
  // Side guard rails
  w.box(0.04, 0, 0.12, 2.0, { color: WALL_BEAM, h: 0.3, z: 1.35, outline: false });
  w.box(0.84, 0, 0.12, 2.0, { color: WALL_BEAM, h: 0.3, z: 1.35, outline: false });
};

export const WALL_DEF: SpriteDef  = defineSprite({ id: 'wall',  w: 1, d: 1, massing: wallMassing });
export const FLOOR_DEF: SpriteDef = defineSprite({ id: 'floor', w: 1, d: 1, massing: floorMassing });
export const TOWER_DEF: SpriteDef = defineSprite({ id: 'tower', w: 2, d: 2, massing: towerMassing });
export const RAMP_DEF: SpriteDef  = defineSprite({ id: 'ramp',  w: 1, d: 2, massing: rampMassing });

/** Map a kind to its SpriteDef. */
export function defFor(kind: BuildingKind): SpriteDef {
  switch (kind) {
    case 'wall':  return WALL_DEF;
    case 'floor': return FLOOR_DEF;
    case 'tower': return TOWER_DEF;
    case 'ramp':  return RAMP_DEF;
  }
}

/** Map a kind to HP. */
function hpFor(kind: BuildingKind): number {
  switch (kind) {
    case 'wall':  return 40;
    case 'floor': return 25;
    case 'tower': return 100;
    case 'ramp':  return 35;
  }
}

// ── Placement ──────────────────────────────────────────────────────────────────

let nextId = 1;

/**
 * Try to place a building at (gx, gy). Returns the new Building on success, undefined on failure.
 *
 * Fails if any footprint tile is water, or is already occupied by another building.
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
      if (tx < 0 || ty < 0 || tx >= 160 || ty >= 160) return undefined;
      if (world.surface.get(tx, ty) === MAT_WATER) return undefined;
      for (const b of existing) {
        if (tx >= b.gx && tx < b.gx + b.w &&
            ty >= b.gy && ty < b.gy + b.d) return undefined;
      }
    }
  }

  const fp: Footprint    = { gx, gy, w, d };
  const basePx           = footprintBase(world.field, fp);
  const maxHp            = hpFor(kind);

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

/** Check if a building can be legally placed at (gx, gy). */
export function canPlaceBuilding(
  kind: BuildingKind,
  gx: number,
  gy: number,
  world: WorldTerrain,
  existing: Building[],
): boolean {
  const def = defFor(kind);
  const { w, d } = def;

  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < d; dy++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || ty < 0 || tx >= 160 || ty >= 160) return false;
      if (world.surface.get(tx, ty) === MAT_WATER) return false;
      for (const b of existing) {
        if (tx >= b.gx && tx < b.gx + b.w &&
            ty >= b.gy && ty < b.gy + b.d) return false;
      }
    }
  }
  return true;
}

/** Apply troll damage to buildings within 1.5 tiles. Called each update tick. */
export function damageBuildings(
  buildings: Building[],
  trollX: number,
  trollY: number,
  dmgPerTick: number,
): void {
  for (const b of buildings) {
    const dx = Math.abs(trollX - (b.gx + b.w * 0.5));
    const dy = Math.abs(trollY - (b.gy + b.d * 0.5));
    if (dx < 1.5 && dy < 1.5) {
      b.hp -= dmgPerTick;
    }
  }
}
