/**
 * Creatures: types, state machines, AI movement, and evolution.
 *
 * Every creature has a `Traits` vector. Each generation (every GENERATION_TICKS simulation
 * ticks), survivors reproduce and trait values drift by a small seeded-RNG mutation. Dead
 * lineages are replaced by fresh spawns at world edges.
 *
 * **Hostile criteria**: wolves and trolls with `aggression > 0.65` chase players.
 * Trolls also damage buildings they stand adjacent to.
 *
 * All randomness comes from the per-creature seeded `Rng`, forked from the world seed at
 * spawn. No `Math.random()` — determinism is the whole point.
 */

import { Rng, createRng, hash2, toUnit, clamp, moveTowards } from '@latticekit/core';
import type { WorldTerrain } from './world.js';
import { isWalkable, W, H } from './world.js';
import type { Player } from './players.js';

// ── Species ────────────────────────────────────────────────────────────────────

export type Species = 'rabbit' | 'deer' | 'fox' | 'wolf' | 'troll';

/** Trait vector. These are the "genes" that evolve each generation. */
export interface Traits {
  /** Move speed in tiles per second. Range [0.4, 3.5]. */
  readonly speed: number;
  /** 0 = always flees players, 1 = always charges. Wolves/trolls start higher. */
  readonly aggression: number;
  /** Affects sprite scale and hit points. Range [0.5, 2.0]. */
  readonly size: number;
  /** Offspring count multiplier per generation. Range [0.5, 2.5]. */
  readonly fertility: number;
}

/** AI behaviour state. */
export type CreatureState = 'idle' | 'wander' | 'flee' | 'chase' | 'attack';

export interface Creature {
  readonly id: number;
  readonly species: Species;
  traits: Traits;
  /** Current tile position (non-integer during movement). */
  gx: number;
  gy: number;
  /** Move target. NaN means idle. */
  targetGx: number;
  targetGy: number;
  /** Seconds until next target is picked. */
  idleTimer: number;
  state: CreatureState;
  hp: number;
  readonly maxHp: number;
  /** Per-instance Rng stream, forked from world seed + id. */
  readonly rng: Rng;
  /** How many generations this lineage has survived. */
  generation: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Ticks between generations. 600 ticks ≈ 10 seconds at 60 Hz. */
export const GENERATION_TICKS = 600;

/** Maximum creatures alive at once. */
export const MAX_CREATURES = 120;

/** HP formula: base × size. */
const BASE_HP: Record<Species, number> = {
  rabbit: 3,
  deer:   8,
  fox:    6,
  wolf:   15,
  troll:  40,
};

/** How close (in tiles) a creature must be to attack a player. */
const ATTACK_RANGE = 1.5;

/** How close (in tiles) a creature notices a player. */
const NOTICE_RANGE = 8;

/** Mutation magnitude per generation (trait drift). */
const MUTATION = 0.08;

// ── Starting trait templates ───────────────────────────────────────────────────

const BASE_TRAITS: Record<Species, Traits> = {
  rabbit: { speed: 1.8, aggression: 0.05, size: 0.7,  fertility: 2.2 },
  deer:   { speed: 1.2, aggression: 0.10, size: 1.0,  fertility: 1.5 },
  fox:    { speed: 1.5, aggression: 0.40, size: 0.85, fertility: 1.4 },
  wolf:   { speed: 1.6, aggression: 0.72, size: 1.1,  fertility: 0.9 },
  troll:  { speed: 0.7, aggression: 0.85, size: 1.8,  fertility: 0.5 },
};

// ── Spawn ──────────────────────────────────────────────────────────────────────

let nextId = 1;

/** Spawn a creature at (gx, gy) with base traits for its species, mutated by the world seed. */
export function spawnCreature(
  species: Species,
  gx: number,
  gy: number,
  worldSeed: number,
): Creature {
  const id  = nextId++;
  const rng = createRng(hash2(worldSeed, id, 0));
  const base = BASE_TRAITS[species];
  const traits = mutateTrait(base, rng, MUTATION * 2);  // initial variation
  const maxHp  = Math.round(BASE_HP[species] * traits.size * 4);

  return {
    id,
    species,
    traits,
    gx,
    gy,
    targetGx: NaN,
    targetGy: NaN,
    idleTimer: rng.next() * 3,
    state: 'idle',
    hp: maxHp,
    maxHp,
    rng,
    generation: 0,
  };
}

/**
 * Populate the initial world with creatures distributed across the map.
 *
 * Rabbits and deer everywhere. Wolves on mid-to-high ground. Trolls on ridges only.
 */
export function populateWorld(worldSeed: number, world: WorldTerrain): Creature[] {
  const creatures: Creature[] = [];
  const rng = createRng(worldSeed ^ 0xdeadbeef);

  const push = (species: Species, count: number, minH: number, maxH: number) => {
    let attempts = count * 8;
    let placed   = 0;
    while (placed < count && attempts-- > 0) {
      const gx = Math.floor(rng.next() * W);
      const gy = Math.floor(rng.next() * H);
      if (!isWalkable(world, gx, gy)) continue;
      const h = world.heights.get(gx, gy);
      if (h < minH || h > maxH) continue;
      creatures.push(spawnCreature(species, gx, gy, worldSeed));
      placed++;
    }
  };

  push('rabbit', 30,  1,  7);
  push('deer',   20,  2,  8);
  push('fox',    15,  1,  8);
  push('wolf',   10,  4, 12);
  push('troll',   5,  7, 12);

  return creatures;
}

// ── Update ─────────────────────────────────────────────────────────────────────

/**
 * Update all creatures for one simulation tick.
 *
 * `dt` is always 1/60 s (fixed step). Players are needed for chase/flee decisions.
 */
export function updateCreatures(
  creatures: Creature[],
  world: WorldTerrain,
  players: Player[],
  dt: number,
): void {
  for (const c of creatures) {
    if (c.hp <= 0) continue;
    updateOne(c, world, players, dt);
  }
}

function updateOne(c: Creature, world: WorldTerrain, players: Player[], dt: number): void {
  const speed = c.traits.speed;

  // Find nearest player.
  let nearestDist = Infinity;
  let nearestPlayer: Player | undefined;
  for (const p of players) {
    const dx = p.gx - c.gx;
    const dy = p.gy - c.gy;
    const d  = Math.sqrt(dx * dx + dy * dy);  // @tier-b — distance check, pixels only
    if (d < nearestDist) {
      nearestDist = d;
      nearestPlayer = p;
    }
  }

  // State machine.
  const isHostile = (c.species === 'wolf' || c.species === 'troll') && c.traits.aggression > 0.65;

  if (nearestPlayer !== undefined && nearestDist < NOTICE_RANGE) {
    if (isHostile) {
      if (nearestDist < ATTACK_RANGE) {
        c.state = 'attack';
        nearestPlayer.hp -= dt * 2 * c.traits.size;
      } else {
        c.state = 'chase';
        moveTowardsTile(c, nearestPlayer.gx, nearestPlayer.gy, speed, dt, world);
      }
    } else {
      // Prey flees from players.
      c.state = 'flee';
      const fleeGx = c.gx + (c.gx - nearestPlayer.gx);
      const fleeGy = c.gy + (c.gy - nearestPlayer.gy);
      moveTowardsTile(c, fleeGx, fleeGy, speed * 1.5, dt, world);
    }
    return;
  }

  // No player nearby — wander.
  c.state = 'wander';
  c.idleTimer -= dt;
  if (c.idleTimer <= 0 || isNaN(c.targetGx)) {
    // Pick a new random wander target nearby.
    const angle = c.rng.next() * 6.28318;   // @tier-b — angle for wander direction, pixels only
    const dist  = 3 + c.rng.next() * 5;
    c.targetGx  = clamp(Math.round(c.gx + Math.cos(angle) * dist), 0, W - 1);  // @tier-b
    c.targetGy  = clamp(Math.round(c.gy + Math.sin(angle) * dist), 0, H - 1);  // @tier-b
    c.idleTimer = 2 + c.rng.next() * 4;
  }
  moveTowardsTile(c, c.targetGx, c.targetGy, speed * 0.6, dt, world);
}

/** Move a creature one step toward (tx, ty) at the given speed. */
function moveTowardsTile(
  c: Creature,
  tx: number,
  ty: number,
  speed: number,
  dt: number,
  world: WorldTerrain,
): void {
  const dx = tx - c.gx;
  const dy = ty - c.gy;
  const d  = Math.sqrt(dx * dx + dy * dy);  // @tier-b — movement distance, pixels only
  if (d < 0.05) return;
  const step = speed * dt;
  const nx   = c.gx + (dx / d) * step;
  const ny   = c.gy + (dy / d) * step;
  // Simple walkability check: only move if the destination tile is walkable.
  const tileX = Math.floor(nx);
  const tileY = Math.floor(ny);
  if (isWalkable(world, tileX, tileY)) {
    c.gx = nx;
    c.gy = ny;
  } else {
    // Blocked — pick a new target next idle.
    c.targetGx = NaN;
    c.targetGy = NaN;
  }
}

// ── Evolution ──────────────────────────────────────────────────────────────────

/**
 * Evolve the population. Called every GENERATION_TICKS ticks.
 *
 * Survivors reproduce; dead lineages are replaced. Traits drift by MUTATION each generation.
 * The world seed is not involved here — each creature's own `rng` drives mutation, so
 * evolution is deterministic from the creature's identity.
 */
export function evolveGeneration(
  creatures: Creature[],
  worldSeed: number,
  world: WorldTerrain,
): void {
  // Remove dead creatures.
  let i = creatures.length;
  while (i--) {
    if ((creatures[i] as Creature).hp <= 0) {
      creatures.splice(i, 1);
    }
  }

  // Survivors reproduce: each creature with fertility > 1.0 spawns a child (up to cap).
  const toAdd: Creature[] = [];
  for (const c of creatures) {
    if (creatures.length + toAdd.length >= MAX_CREATURES) break;
    if (c.traits.fertility > 1.0 && c.rng.next() < (c.traits.fertility - 1.0) * 0.5) {
      const child = spawnCreature(c.species, c.gx, c.gy, worldSeed);
      // Child inherits parent traits with a mutation.
      (child as { traits: Traits }).traits = mutateTrait(c.traits, child.rng, MUTATION);
      (child as { generation: number }).generation = c.generation + 1;
      toAdd.push(child);
    }
  }

  // Replenish extinct species.
  const counts: Partial<Record<Species, number>> = {};
  for (const c of creatures) counts[c.species] = (counts[c.species] ?? 0) + 1;
  const minima: Record<Species, number> = { rabbit: 5, deer: 3, fox: 2, wolf: 2, troll: 1 };
  for (const [species, min] of Object.entries(minima) as [Species, number][]) {
    const current = counts[species] ?? 0;
    for (let n = current; n < min && creatures.length + toAdd.length < MAX_CREATURES; n++) {
      const gx = Math.floor(2 + (worldSeed ^ n) % (W - 4));
      const gy = Math.floor(2 + (worldSeed ^ (n * 7)) % (H - 4));
      if (isWalkable(world, gx, gy)) {
        toAdd.push(spawnCreature(species, gx, gy, worldSeed));
      }
    }
  }

  for (const c of toAdd) creatures.push(c);
}

/** Apply a mutation to a trait vector using the creature's own RNG stream. */
function mutateTrait(base: Traits, rng: Rng, magnitude: number): Traits {
  const m = (v: number, lo: number, hi: number) =>
    clamp(v + (rng.next() - 0.5) * 2 * magnitude, lo, hi);
  return {
    speed:      m(base.speed,      0.4, 3.5),
    aggression: m(base.aggression, 0.0, 1.0),
    size:       m(base.size,       0.5, 2.0),
    fertility:  m(base.fertility,  0.3, 2.5),
  };
}

/** Damage a creature (e.g. from a player action). */
export function damageCreature(c: Creature, amount: number): void {
  c.hp -= amount;
}

/** True if a creature is hostile and will attack players. */
export function isHostile(c: Creature): boolean {
  return (c.species === 'wolf' || c.species === 'troll') && c.traits.aggression > 0.65;
}
