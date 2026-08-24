/**
 * Buildings: catalogue and placement logic.
 *
 * A building is a placed structure on a tile. It has a footprint, a height, a material,
 * and an HP pool. Trolls damage buildings they stand adjacent to.
 *
 * Sprite massings use `SolidWriter` — the declarative emitter — not `Pen`, so the same
 * massing drives both drawing and thumbnail generation from one body of code.
 *
 * Placement rules:
 * - Cannot place on a water tile.
 * - Cannot overlap another building's footprint.
 */

import {
  LEVEL_H,
  defineSprite,
  spriteHeightPx,
  VARIANT_ZERO,
  type SpriteDef,
  type Massing,
  type SolidWriter,
  type Variant,
} from '@latticekit/draw';
import { footprintBase, type Footprint } from '@latticekit/iso';
import { TIMBER, STONE, TOWER, FLOOR } from './palette.js';
import type { WorldTerrain } from './world.js';
import { MAT_WATER } from './world.js';

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

const wallMassing: Massing = (w: SolidWriter) => {
  w.shadow(0, 0, 1, 1, 0.35);
  w.box(0, 0, 1, 1, { color: TIMBER, h: 2 });
};

const floorMassing: Massing = (w: SolidWriter) => {
  w.box(0, 0, 1, 1, { color: FLOOR, h: 0.4 });
};

const towerMassing: Massing = (w: SolidWriter, _v: Variant, _rng: import('@latticekit/core').Rng) => {
  w.shadow(0, 0, 2, 2, 0.4);
  // Base.
  w.box(0, 0, 2, 2, { color: STONE, h: 1, outline: false });
  // Shaft.
  w.box(0.1, 0.1, 1.8, 1.8, { color: TOWER, h: 4, z: 1, outline: false });
  // Parapet.
  w.box(0, 0, 2, 2, { color: STONE, h: 0.5, z: 5 });
  // Flag — using a post; motion is added via the animate hook.
  w.post(0.9, 0.9, 5.6, 0.08, TOWER, 0.06);
};

const rampMassing: Massing = (w: SolidWriter) => {
  w.box(0, 0, 1, 2, { color: TIMBER, h: 0.5 });
  w.box(0, 0, 1, 1, { color: TIMBER, h: 1, z: 0.5, outline: false });
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
    case 'wall':  return 20;
    case 'floor': return 10;
    case 'tower': return 50;
    case 'ramp':  return 15;
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
