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

import { Rng, createRng, hash2, clamp } from '@latticekit/core';
import type { WorldTerrain } from './world.js';
import { isWalkable, W, H } from './world.js';
import { damagePlayer, type Player } from './players.js';
import type { FloraItem } from './flora.js';
import { findClosestEdibleFlora } from './flora.js';
import type { Building } from './buildings.js';
import { isTileOccupiedBySolidBuilding } from './buildings.js';

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
export type CreatureState = 'idle' | 'wander' | 'flee' | 'chase' | 'attack' | 'forage' | 'eat';

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
  /** Foraging / eating timer in seconds. */
  eatTimer: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Ticks between generations. 600 ticks ≈ 10 seconds at 60 Hz. */
export const GENERATION_TICKS = 600;

/** Maximum creatures alive at once. */
export const MAX_CREATURES = 180;

/** HP formula: base × size. */
const BASE_HP: Record<Species, number> = {
  rabbit: 4,
  deer:   12,
  fox:    9,
  wolf:   22,
  troll:  55,
};

/** How close (in tiles) a creature must be to attack. */
const ATTACK_RANGE = 1.3;

/** How close (in tiles) a creature notices a threat. */
const NOTICE_RANGE = 8;

/** Mutation magnitude per generation (trait drift). */
const MUTATION = 0.08;

// ── Starting trait templates ───────────────────────────────────────────────────

const BASE_TRAITS: Record<Species, Traits> = {
  rabbit: { speed: 2.0, aggression: 0.05, size: 0.7,  fertility: 2.2 },
  deer:   { speed: 1.4, aggression: 0.10, size: 1.1,  fertility: 1.5 },
  fox:    { speed: 1.7, aggression: 0.55, size: 0.85, fertility: 1.4 },
  wolf:   { speed: 1.75, aggression: 0.75, size: 1.2,  fertility: 0.9 },
  troll:  { speed: 0.8, aggression: 0.90, size: 1.9,  fertility: 0.5 },
};

// ── Spawn ──────────────────────────────────────────────────────────────────────

let nextId = 1;

/** Spawn a creature at (gx, gy) with base traits for its species, mutated by the world seed. */
export function spawnCreature(
  species: Species,
  gx: number,
  gy: number,
  worldSeed: number,
  parentTraits?: Traits,
  parentGen = 0,
): Creature {
  const id  = nextId++;
  const rng = createRng(hash2(worldSeed, id, 0));
  const base = parentTraits ?? BASE_TRAITS[species];
  const traits = mutateTrait(base, rng, parentTraits ? MUTATION : MUTATION * 2);
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
    generation: parentGen,
    eatTimer: 0,
  };
}

/**
 * Populate the world with creatures distributed across the map and elevation zones.
 */
export function populateWorld(worldSeed: number, world: WorldTerrain): Creature[] {
  const creatures: Creature[] = [];
  const rng = createRng(worldSeed ^ 0xdeadbeef);

  const push = (species: Species, count: number, minH: number, maxH: number) => {
    let attempts = count * 15;
    let placed   = 0;
    while (placed < count && attempts-- > 0) {
      const gx = Math.floor(10 + rng.next() * (W - 20));
      const gy = Math.floor(10 + rng.next() * (H - 20));
      if (!isWalkable(world, gx, gy)) continue;
      const h = world.heights.get(gx, gy);
      if (h < minH || h > maxH) continue;
      creatures.push(spawnCreature(species, gx, gy, worldSeed));
      placed++;
    }
  };

  push('rabbit', 50,  2, 14);
  push('deer',   30,  3, 16);
  push('fox',    25,  2, 18);
  push('wolf',   18,  8, 22);
  push('troll',   8, 14, 24);

  return creatures;
}

// ── Update ─────────────────────────────────────────────────────────────────────

export interface CreatureEvents {
  playerAttacked: boolean;
  roarOccurred: boolean;
  howlOccurred: boolean;
}

/**
 * Update all creatures for one simulation tick.
 *
 * Implements active food webs and nocturnal threat behavior:
 * - Herbivores (rabbit, deer) forage for edible plants and flee from predators.
 * - Carnivores (fox, wolf) hunt prey.
 * - At night (darkness > 0), wolves and trolls become nocturnal apex hunters with
 *   expanded detection ranges and aggressive siege attacks.
 * - Solid buildings (walls and towers) physically block and keep out animals.
 */
export function updateCreatures(
  creatures: Creature[],
  world: WorldTerrain,
  players: readonly [Player, Player],
  flora: FloraItem[],
  buildings: Building[],
  darkness: number,
  dt: number,
): CreatureEvents {
  const events: CreatureEvents = { playerAttacked: false, roarOccurred: false, howlOccurred: false };

  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c === undefined || c.hp <= 0) continue;
    updateOne(c, creatures, world, players, flora, buildings, darkness, dt, events);
  }

  return events;
}

function updateOne(
  c: Creature,
  allCreatures: Creature[],
  world: WorldTerrain,
  players: readonly [Player, Player],
  flora: FloraItem[],
  buildings: Building[],
  darkness: number,
  dt: number,
  events: CreatureEvents,
): void {
  const speed = c.traits.speed;
  // Nighttime increases predator hunting speed and perception range
  const isApex = c.species === 'wolf' || c.species === 'troll';
  const nightAggressionBonus = isApex && darkness > 0.1 ? darkness * 0.4 : 0;
  const effectiveAggression = c.traits.aggression + nightAggressionBonus;
  const isCreatureHostile = isApex && effectiveAggression > 0.55;
  const huntSpeed = isApex ? speed * (1.3 + darkness * 0.35) : speed * 1.3;
  const noticeRange = NOTICE_RANGE + (isApex ? darkness * 10 : 0);

  // 1. Check for immediate predator threats to flee from
  let threatDx = 0;
  let threatDy = 0;
  let threatCount = 0;

  if (!isCreatureHostile) {
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p === undefined || p.respawnTimer > 0) continue;
      const dx = p.gx - c.gx;
      const dy = p.gy - c.gy;
      const dSq = dx * dx + dy * dy;
      if (dSq < noticeRange * noticeRange) {
        threatDx += dx;
        threatDy += dy;
        threatCount++;
      }
    }
  }

  // Check predator creatures (e.g. wolves hunt deer/rabbits/foxes; foxes hunt rabbits)
  if (c.species === 'rabbit' || c.species === 'deer' || c.species === 'fox') {
    for (let i = 0; i < allCreatures.length; i++) {
      const other = allCreatures[i];
      if (other === undefined || other.hp <= 0 || other.id === c.id) continue;
      const isPredator =
        (c.species === 'rabbit' && (other.species === 'fox' || other.species === 'wolf' || other.species === 'troll')) ||
        (c.species === 'deer' && (other.species === 'wolf' || other.species === 'troll')) ||
        (c.species === 'fox' && (other.species === 'wolf' || other.species === 'troll'));

      if (isPredator) {
        const dx = other.gx - c.gx;
        const dy = other.gy - c.gy;
        const dSq = dx * dx + dy * dy;
        if (dSq < noticeRange * noticeRange) {
          threatDx += dx;
          threatDy += dy;
          threatCount++;
        }
      }
    }
  }

  // If threatened, scatter and FLEE!
  if (threatCount > 0) {
    c.state = 'flee';
    c.eatTimer = 0;
    const jitterAngle = (c.rng.next() - 0.5) * 0.8;
    const baseAngle = Math.atan2(-threatDy, -threatDx) + jitterAngle; // @tier-b — flee scatter angle, pixels only
    const fleeDx = Math.cos(baseAngle); // @tier-b
    const fleeDy = Math.sin(baseAngle); // @tier-b
    moveWithSeparation(c, c.gx + fleeDx * 6, c.gy + fleeDy * 6, speed * 1.45, dt, world, allCreatures, buildings);
    return;
  }

  // 2. Carnivore Hunting (Foxes hunt rabbits; Wolves hunt deer/rabbits/players; Trolls siege buildings/players)
  if (c.species === 'fox' || c.species === 'wolf' || c.species === 'troll') {
    let bestTarget: {
      gx: number;
      gy: number;
      dist: number;
      targetRef?: Creature | Player;
      buildingRef?: Building;
    } | undefined;
    let minDist = 12 + (darkness > 0 ? darkness * 10 : 0);

    // Check prey creatures
    for (let i = 0; i < allCreatures.length; i++) {
      const other = allCreatures[i];
      if (other === undefined || other.hp <= 0 || other.id === c.id) continue;
      const isPrey =
        (c.species === 'fox' && other.species === 'rabbit') ||
        (c.species === 'wolf' && (other.species === 'deer' || other.species === 'rabbit'));

      if (isPrey) {
        const dx = other.gx - c.gx;
        const dy = other.gy - c.gy;
        const d = Math.sqrt(dx * dx + dy * dy); // @tier-b — hunt distance check, pixels only
        if (d < minDist) {
          minDist = d;
          bestTarget = { gx: other.gx, gy: other.gy, dist: d, targetRef: other };
        }
      }
    }

    // Hostile wolves and trolls also target nearby active players
    if (isCreatureHostile) {
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p === undefined || p.respawnTimer > 0) continue;
        const dx = p.gx - c.gx;
        const dy = p.gy - c.gy;
        const d = Math.sqrt(dx * dx + dy * dy); // @tier-b — player chase distance, pixels only
        if (d < minDist) {
          minDist = d;
          bestTarget = { gx: p.gx, gy: p.gy, dist: d, targetRef: p };
        }
      }

      // Trolls also target player structures (towers, walls)
      if (c.species === 'troll') {
        for (let i = 0; i < buildings.length; i++) {
          const b = buildings[i];
          if (b === undefined || b.hp <= 0) continue;
          const bx = b.gx + b.w * 0.5;
          const by = b.gy + b.d * 0.5;
          const dx = bx - c.gx;
          const dy = by - c.gy;
          const d = Math.sqrt(dx * dx + dy * dy); // @tier-b
          if (d < minDist) {
            minDist = d;
            bestTarget = { gx: bx, gy: by, dist: d, buildingRef: b };
          }
        }
      }
    }

    if (bestTarget !== undefined) {
      if (bestTarget.dist < ATTACK_RANGE + (bestTarget.buildingRef ? 1.0 : 0)) {
        c.state = 'attack';

        if (bestTarget.targetRef !== undefined) {
          if ('respawnTimer' in bestTarget.targetRef) {
            // Target is a player
            const baseDmg = c.species === 'troll' ? 36 : 22;
            const nightDmg = baseDmg * (1 + darkness * 0.4);
            damagePlayer(bestTarget.targetRef, dt * nightDmg * c.traits.size);
            events.playerAttacked = true;
            if (c.species === 'troll') events.roarOccurred = true;
            if (c.species === 'wolf' && darkness > 0.3) events.howlOccurred = true;
          } else {
            // Target is a prey animal
            bestTarget.targetRef.hp -= dt * 18 * c.traits.size;
            if (bestTarget.targetRef.hp <= 0) {
              c.hp = Math.min(c.maxHp, c.hp + 6); // Carnivore heals from kill
            }
          }
        } else if (bestTarget.buildingRef !== undefined) {
          // Attacking building / wall
          bestTarget.buildingRef.hp -= dt * 32 * c.traits.size;
        }
      } else {
        c.state = 'chase';
        moveWithSeparation(c, bestTarget.gx, bestTarget.gy, huntSpeed, dt, world, allCreatures, buildings);
      }
      return;
    }
  }

  // 3. Herbivore Plant Foraging (Rabbits & Deer seek out and eat flora)
  if (c.species === 'rabbit' || c.species === 'deer') {
    const edible = findClosestEdibleFlora(flora, c.gx, c.gy, 8);
    if (edible !== undefined) {
      const dx = edible.gx - c.gx;
      const dy = edible.gy - c.gy;
      const dist = Math.sqrt(dx * dx + dy * dy); // @tier-b — flora forage distance, pixels only

      if (dist < 0.9) {
        // In range to nibble / eat plant
        c.state = 'eat';
        c.eatTimer += dt;
        if (c.eatTimer >= 1.8) {
          // Finished eating plant — remove consumed flora item and heal
          const fIdx = flora.indexOf(edible);
          if (fIdx !== -1) flora.splice(fIdx, 1);
          c.hp = Math.min(c.maxHp, c.hp + 5);
          c.eatTimer = 0;
          c.targetGx = NaN;
          c.targetGy = NaN;
        }
        return;
      } else {
        c.state = 'forage';
        moveWithSeparation(c, edible.gx, edible.gy, speed * 0.75, dt, world, allCreatures, buildings);
        return;
      }
    }
  }

  // 4. Default Peaceful Wander
  c.state = 'wander';
  c.eatTimer = 0;
  c.idleTimer -= dt;
  if (c.idleTimer <= 0 || isNaN(c.targetGx)) {
    // Pick a new random wander target nearby
    const angle = c.rng.next() * 6.28318; // @tier-b — wander angle, pixels only
    const dist  = 3 + c.rng.next() * 5;
    c.targetGx  = clamp(Math.round(c.gx + Math.cos(angle) * dist), 8, W - 9); // @tier-b
    c.targetGy  = clamp(Math.round(c.gy + Math.sin(angle) * dist), 8, H - 9); // @tier-b
    c.idleTimer = 2.5 + c.rng.next() * 4;
  }
  moveWithSeparation(c, c.targetGx, c.targetGy, speed * 0.55, dt, world, allCreatures, buildings);
}

/** Move a creature with soft Boid separation, map margin avoidance, and solid building barrier collision. */
function moveWithSeparation(
  c: Creature,
  tx: number,
  ty: number,
  speed: number,
  dt: number,
  world: WorldTerrain,
  allCreatures: Creature[],
  buildings: readonly Building[],
): void {
  let dx = tx - c.gx;
  let dy = ty - c.gy;
  const d = Math.sqrt(dx * dx + dy * dy); // @tier-b — movement distance, pixels only
  if (d > 0.01) {
    dx /= d;
    dy /= d;
  }

  // 1. Soft Boid Separation force to prevent stacking and conga lines
  let sepX = 0;
  let sepY = 0;
  for (let i = 0; i < allCreatures.length; i++) {
    const other = allCreatures[i];
    if (other === undefined || other.id === c.id || other.hp <= 0) continue;
    const ox = c.gx - other.gx;
    const oy = c.gy - other.gy;
    const distSq = ox * ox + oy * oy;
    if (distSq < 2.0 && distSq > 0.0001) {
      const dist = Math.sqrt(distSq); // @tier-b
      const strength = (1.4 - dist) / 1.4;
      sepX += (ox / dist) * strength * 0.8;
      sepY += (oy / dist) * strength * 0.8;
    }
  }

  // 2. Soft Map Margin Avoidance (keep creatures dispersed in open world)
  const MARGIN = 10;
  if (c.gx < MARGIN) sepX += (MARGIN - c.gx) * 0.2;
  if (c.gx > W - MARGIN) sepX -= (c.gx - (W - MARGIN)) * 0.2;
  if (c.gy < MARGIN) sepY += (MARGIN - c.gy) * 0.2;
  if (c.gy > H - MARGIN) sepY -= (c.gy - (H - MARGIN)) * 0.2;

  const moveX = dx + sepX;
  const moveY = dy + sepY;
  const moveLen = Math.sqrt(moveX * moveX + moveY * moveY); // @tier-b
  if (moveLen < 0.01) return;

  const step = speed * dt;
  const nx = c.gx + (moveX / moveLen) * step;
  const ny = c.gy + (moveY / moveLen) * step;

  const tileX = Math.floor(nx);
  const tileY = Math.floor(ny);
  // Ensure solid buildings (walls, towers) physically keep out animals
  if (isWalkable(world, tileX, tileY) && !isTileOccupiedBySolidBuilding(tileX, tileY, buildings)) {
    c.gx = clamp(nx, 2, W - 3);
    c.gy = clamp(ny, 2, H - 3);
  } else {
    c.targetGx = NaN;
    c.targetGy = NaN;
  }
}

// ── Evolution ──────────────────────────────────────────────────────────────────

const SPECIES_MINIMA: readonly { species: Species; min: number }[] = [
  { species: 'rabbit', min: 10 },
  { species: 'deer', min: 6 },
  { species: 'fox', min: 4 },
  { species: 'wolf', min: 3 },
  { species: 'troll', min: 2 },
];

/**
 * Evolve the population. Called every GENERATION_TICKS ticks.
 *
 * Survivors reproduce; dead lineages are replaced uniformly across the world.
 */
export function evolveGeneration(
  creatures: Creature[],
  worldSeed: number,
  world: WorldTerrain,
): void {
  // Remove dead creatures
  let i = creatures.length;
  while (i--) {
    const c = creatures[i];
    if (c !== undefined && c.hp <= 0) {
      creatures.splice(i, 1);
    }
  }

  // Survivors reproduce: each creature with fertility > 1.0 spawns a child (up to cap)
  const toAdd: Creature[] = [];
  for (let ci = 0; ci < creatures.length; ci++) {
    const c = creatures[ci];
    if (c === undefined) continue;
    if (creatures.length + toAdd.length >= MAX_CREATURES) break;
    if (c.traits.fertility > 1.0 && c.rng.next() < (c.traits.fertility - 1.0) * 0.5) {
      const child = spawnCreature(c.species, c.gx, c.gy, worldSeed, c.traits, c.generation + 1);
      toAdd.push(child);
    }
  }

  // Replenish extinct species with uniform spatial distribution across the world
  const counts: Partial<Record<Species, number>> = {};
  for (let ci = 0; ci < creatures.length; ci++) {
    const c = creatures[ci];
    if (c !== undefined) {
      counts[c.species] = (counts[c.species] ?? 0) + 1;
    }
  }

  for (let mi = 0; mi < SPECIES_MINIMA.length; mi++) {
    const item = SPECIES_MINIMA[mi];
    if (item === undefined) continue;
    const { species, min } = item;
    const current = counts[species] ?? 0;
    for (let n = current; n < min && creatures.length + toAdd.length < MAX_CREATURES; n++) {
      const rng = createRng(hash2(worldSeed, n + 1, current * 17 + 5));
      const gx = Math.floor(12 + rng.next() * (W - 24));
      const gy = Math.floor(12 + rng.next() * (H - 24));
      if (isWalkable(world, gx, gy)) {
        toAdd.push(spawnCreature(species, gx, gy, worldSeed));
      }
    }
  }

  for (let ai = 0; ai < toAdd.length; ai++) {
    const item = toAdd[ai];
    if (item !== undefined) creatures.push(item);
  }
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
