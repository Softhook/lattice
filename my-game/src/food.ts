/**
 * Ground item and food drops: carcass meat left by hunted animals, harvested surplus,
 * and resources dropped by players to share with teammates.
 *
 * Why a standalone slot-recycled pool rather than a new `FloraKind`: ground drops are not
 * tool-harvested and never regrows. They are walked over and collected into inventory, and
 * perishable drops (food) rot on a timer if nobody collects them.
 * The pool is fixed size so drops landing mid-session allocate nothing (non-negotiable 7),
 * and it carries no RNG (non-negotiable 1). Bob animation and rot countdown are Tier A arithmetic.
 *
 * Pure logic — no `window`/`document`/timers. Runs unchanged in Node.
 */

import type { Species } from './creatures.js';
import type { Player } from './players.js';

export type DropKind = 'food' | 'wood' | 'stone' | 'fiber' | 'iron' | 'gems';

/**
 * Which species leave meat when killed, and how many food points one carcass yields.
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
  /** What kind of ground resource this drop holds. */
  kind: DropKind;
  /** Quantity of the resource in this drop (e.g. 5 wood or 16 food). */
  count: number;
  /** Species it came from (for animal carcass meat) — drives pickup toast wording and tint. */
  species?: Species | undefined;
  /** Hunger points restored when eaten (equal to count for food). */
  nutrition: number;
  /** Seconds of life left before uncollected items rot or despawn. */
  ttlSec: number;
  /** Continuous [0, 1) bob-animation phase. Visual only — never hashed or persisted. */
  bob: number;
  /** Cooldown timer preventing immediate re-pickup by the player who dropped it. */
  pickupDelaySec: number;
  /** Index of player who dropped this, or undefined if dropped from creature/world. */
  droppedByPlayer?: 0 | 1 | undefined;
}

/** Upper bound on ground items/meat at once. Past this, oldest-style behavior is "no drop" until a slot frees. */
export const MAX_FOOD = 96;

/** Seconds a dropped carcass lasts before rotting. Long enough to fight your way clear and
 *  walk back for it, short enough that the world doesn't fill with permanent meat. */
export const FOOD_ROT_SECONDS = 45;

/** Seconds general non-perishable resource drops last before despawning. */
export const RESOURCE_DESPAWN_SECONDS = 180;

/** A player whose center comes within this many tiles of a drop picks it up. */
export const FOOD_PICKUP_RADIUS = 0.9;

/** Pre-allocated, all-dead pool. Call once at startup and reuse — see `combat.ts`'s FX pool. */
export function createFoodPool(): FoodDrop[] {
  const pool: FoodDrop[] = [];
  for (let i = 0; i < MAX_FOOD; i++) {
    pool.push({
      live: false,
      gx: 0,
      gy: 0,
      kind: 'food',
      count: 0,
      nutrition: 0,
      ttlSec: 0,
      bob: 0,
      pickupDelaySec: 0,
    });
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
      f.kind = 'food';
      f.count = nutrition;
      f.species = species;
      f.nutrition = nutrition;
      f.ttlSec = FOOD_ROT_SECONDS;
      f.bob = 0;
      f.pickupDelaySec = 0;
      f.droppedByPlayer = undefined;
      return true;
    }
  }
  return false;
}

/**
 * Drop any inventory resource (food, wood, stone, fiber, iron, gems) onto the ground at (gx, gy).
 * Returns true if a slot was allocated, false if the pool is full.
 */
export function spawnResourceDrop(
  pool: FoodDrop[],
  gx: number,
  gy: number,
  kind: DropKind,
  count: number,
  droppedByPlayer?: 0 | 1,
): boolean {
  if (count <= 0) return false;
  for (let i = 0; i < pool.length; i++) {
    const f = pool[i];
    if (f !== undefined && !f.live) {
      f.live = true;
      f.gx = gx;
      f.gy = gy;
      f.kind = kind;
      f.count = count;
      f.species = undefined;
      f.nutrition = kind === 'food' ? count : 0;
      f.ttlSec = kind === 'food' ? FOOD_ROT_SECONDS : RESOURCE_DESPAWN_SECONDS;
      f.bob = 0;
      f.pickupDelaySec = droppedByPlayer !== undefined ? 3.0 : 0;
      f.droppedByPlayer = droppedByPlayer;
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

/** Collect a ground drop into a player's inventory and set an action toast. */
export function collectGroundDrop(player: Player, drop: FoodDrop): void {
  if (drop.kind === 'food') {
    player.inventory.food += drop.count;
    const label = drop.species !== undefined ? `${drop.species.toUpperCase()} MEAT` : 'FOOD';
    player.lastActionMsg = `COLLECTED ${label} (+${drop.count})`;
    player.msgTimer = 2.0;
  } else {
    player.inventory[drop.kind] += drop.count;
    player.lastActionMsg = `COLLECTED ${drop.kind.toUpperCase()} (+${drop.count})`;
    player.msgTimer = 2.0;
  }
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
    if (f.pickupDelaySec > 0) {
      f.pickupDelaySec = Math.max(0, f.pickupDelaySec - dt);
    }
    f.bob = (f.bob + dt * 1.6) % 1;

    for (let p = 0; p < players.length; p++) {
      const player = players[p];
      if (player === undefined || !player.active || player.respawnTimer > 0) continue;

      const dx = player.gx - f.gx;
      const dy = player.gy - f.gy;
      const distSq = dx * dx + dy * dy;

      // If dropped by this player, prevent instant self-pickup until they step away or timer clears
      if (f.droppedByPlayer === player.index) {
        if (distSq > 1.6 * 1.6) {
          // Dropping player walked away — re-arm pickup
          f.droppedByPlayer = undefined;
        } else if (f.pickupDelaySec > 0) {
          // Still standing near drop during delay — skip pickup for dropper
          continue;
        }
      }

      if (distSq <= radiusSq) {
        collectGroundDrop(player, f);
        f.live = false;
        out.pickedUp = true;
        break;
      }
    }
  }
}
