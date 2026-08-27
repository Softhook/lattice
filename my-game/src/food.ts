/**
 * Food drops: the meat a hunted animal leaves on the ground, and the pickup that refills a
 * player's hunger bar.
 *
 * Why a standalone slot-recycled pool rather than a new `FloraKind`: food is not tool-harvested
 * and never regrows. It is walked over and consumed, and it rots on a timer if nobody collects
 * it — none of which the flora registry/regrowth machinery models. The pool is fixed size so a
 * kill landing mid-combat allocates nothing (non-negotiable 7), and it carries no RNG: a carcass
 * drops its meat on the exact tile it died on, so a seed + input log still replays to the same
 * pixel (non-negotiable 1). Bob animation and rot countdown are Tier A arithmetic.
 *
 * Pure logic — no `window`/`document`/timers. Runs unchanged in Node.
 */

import type { Species } from './creatures.js';
import { feedPlayer, type Player } from './players.js';

/**
 * Which species leave meat when killed, and how many hunger points one carcass restores.
 * Only the huntable game animals are here — predators (wolf, bear, croc…) and the conjured
 * `shade` are not food. A species absent from this map produces no drop, so `spawnFoodDrop`
 * is safe to call unconditionally on any kill.
 */
export const FOOD_YIELD: Partial<Record<Species, number>> = {
  rabbit: 16,
  deer: 42,
  ibex: 38,
  boar: 48,
};

export interface FoodDrop {
  live: boolean;
  gx: number;
  gy: number;
  /** Species it came from — drives the pickup toast wording and the drop's tint. */
  species: Species;
  /** Hunger points restored when a player collects it. */
  nutrition: number;
  /** Seconds of life left before uncollected meat rots away. */
  ttlSec: number;
  /** Continuous [0, 1) bob-animation phase. Visual only — never hashed or persisted. */
  bob: number;
}

/** Upper bound on meat on the ground at once. A hunt rarely litters more than a handful of
 *  tiles; past this, the oldest-style behavior is simply "no drop" until a slot frees. */
export const MAX_FOOD = 96;

/** Seconds a dropped carcass lasts before rotting. Long enough to fight your way clear and
 *  walk back for it, short enough that the world doesn't fill with permanent meat. */
export const FOOD_ROT_SECONDS = 45;

/** A player whose center comes within this many tiles of a drop picks it up. */
export const FOOD_PICKUP_RADIUS = 0.9;

/** Pre-allocated, all-dead pool. Call once at startup and reuse — see `combat.ts`'s FX pool. */
export function createFoodPool(): FoodDrop[] {
  const pool: FoodDrop[] = [];
  for (let i = 0; i < MAX_FOOD; i++) {
    pool.push({ live: false, gx: 0, gy: 0, species: 'rabbit', nutrition: 0, ttlSec: 0, bob: 0 });
  }
  return pool;
}

/** True if killing this species drops meat (i.e. it appears in `FOOD_YIELD`). */
export function isEdibleSpecies(species: Species): boolean {
  return FOOD_YIELD[species] !== undefined;
}

/**
 * Drop a carcass's meat at (gx, gy). No-op (returns false) when the species isn't game or the
 * pool is momentarily full. Called from the kill sites in `combat.ts`, which already hold the
 * creature's position, so no world lookup happens here.
 */
export function spawnFoodDrop(pool: FoodDrop[], gx: number, gy: number, species: Species): boolean {
  const nutrition = FOOD_YIELD[species];
  if (nutrition === undefined) return false;
  for (let i = 0; i < pool.length; i++) {
    const f = pool[i];
    if (f !== undefined && !f.live) {
      f.live = true;
      f.gx = gx;
      f.gy = gy;
      f.species = species;
      f.nutrition = nutrition;
      f.ttlSec = FOOD_ROT_SECONDS;
      f.bob = 0;
      return true;
    }
  }
  return false;
}

export interface FoodEvents {
  /** At least one drop was collected by a player this tick — drives the pickup chime. */
  pickedUp: boolean;
}

/** A fresh, all-false `FoodEvents` bag. Allocate once and reuse as `updateFoodDrops`'s
 *  out-parameter, same contract as `createCreatureEvents`. */
export function createFoodEvents(): FoodEvents {
  return { pickedUp: false };
}

/**
 * Advance every live drop by `dt`: rot its timer down (freeing the slot at zero), bob it, and
 * hand it to the first active, upright player standing on it. `out` is cleared and written in
 * place — the caller owns it, so this allocates nothing on the tick.
 */
export function updateFoodDrops(
  pool: FoodDrop[],
  players: readonly [Player, Player],
  dt: number,
  out: FoodEvents,
): void {
  out.pickedUp = false;

  const radiusSq = FOOD_PICKUP_RADIUS * FOOD_PICKUP_RADIUS;

  for (let i = 0; i < pool.length; i++) {
    const f = pool[i];
    if (f === undefined || !f.live) continue;

    f.ttlSec -= dt;
    if (f.ttlSec <= 0) {
      f.live = false;
      continue;
    }
    f.bob = (f.bob + dt * 1.6) % 1;

    for (let p = 0; p < players.length; p++) {
      const player = players[p];
      if (player === undefined || !player.active || player.respawnTimer > 0) continue;
      const dx = player.gx - f.gx;
      const dy = player.gy - f.gy;
      if (dx * dx + dy * dy <= radiusSq) {
        feedPlayer(player, f.nutrition, f.species);
        f.live = false;
        out.pickedUp = true;
        break;
      }
    }
  }
}
