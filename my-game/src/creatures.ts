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
import { isWalkable, W, H, getBiomeAt } from './world.js';
import { damagePlayer, type Player } from './players.js';
import type { FloraItem } from './flora.js';
import { findClosestEdibleFlora, rebuildFloraSpatial } from './flora.js';

import type { Building } from './buildings.js';
import { isTileOccupiedBySolidBuilding } from './buildings.js';
import { SpatialGrid } from './spatial.js';


// ── Species & Declarative Registry ────────────────────────────────────────────

export type Species = 'rabbit' | 'deer' | 'fox' | 'wolf' | 'troll' | 'bear' | 'boar' | 'croc';

export type DietType = 'herbivore' | 'carnivore' | 'omnivore';
export type BehaviorArchetype = 'skittish' | 'defensive' | 'territorial' | 'ambush' | 'apex';

export interface CreatureLoot {
  readonly wood?: number;
  readonly stone?: number;
  readonly fiber?: number;
}

export interface SpeciesDefinition {
  readonly species: Species;
  readonly name: string;
  readonly icon: string;
  readonly baseHp: number;
  readonly baseTraits: Traits;
  readonly diet: DietType;
  readonly behavior: BehaviorArchetype;
  readonly preferredBiomes: readonly ('alpine' | 'taiga' | 'meadow' | 'badlands' | 'wetlands' | 'coastal')[];
  readonly elevationRange: readonly [number, number];
  readonly initialSpawnCount: number;
  readonly minPopulation: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly noticeRange: number;
  readonly preyTargets: readonly Species[];
  readonly predatorThreats: readonly Species[];
  readonly loot: CreatureLoot;
  readonly fearsFire?: boolean;
}

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

export const SPECIES_REGISTRY: Record<Species, SpeciesDefinition> = {
  rabbit: {
    species: 'rabbit',
    name: 'Hare',
    icon: '🐇',
    baseHp: 4,
    baseTraits: { speed: 2.0, aggression: 0.05, size: 0.7, fertility: 2.2 },
    diet: 'herbivore',
    behavior: 'skittish',
    preferredBiomes: ['meadow', 'wetlands', 'taiga'],
    elevationRange: [2, 16],
    initialSpawnCount: 120,
    minPopulation: 30,
    attackDamage: 0,
    attackRange: 1.0,
    noticeRange: 8,
    preyTargets: [],
    predatorThreats: ['fox', 'wolf', 'croc', 'troll'],
    loot: { fiber: 4 },
    fearsFire: true,
  },
  deer: {
    species: 'deer',
    name: 'Forest Stag',
    icon: '🦌',
    baseHp: 12,
    baseTraits: { speed: 1.4, aggression: 0.10, size: 1.1, fertility: 1.5 },
    diet: 'herbivore',
    behavior: 'skittish',
    preferredBiomes: ['meadow', 'wetlands'],
    elevationRange: [3, 16],
    initialSpawnCount: 75,
    minPopulation: 20,
    attackDamage: 0,
    attackRange: 1.2,
    noticeRange: 8,
    preyTargets: [],
    predatorThreats: ['wolf', 'bear', 'croc', 'troll'],
    loot: { wood: 6, fiber: 8 },
    fearsFire: true,
  },
  boar: {
    species: 'boar',
    name: 'Wild Boar',
    icon: '🐗',
    baseHp: 26,
    baseTraits: { speed: 1.5, aggression: 0.45, size: 1.15, fertility: 1.3 },
    diet: 'omnivore',
    behavior: 'defensive',
    preferredBiomes: ['meadow', 'wetlands'],
    elevationRange: [2, 14],
    initialSpawnCount: 65,
    minPopulation: 16,
    attackDamage: 24,
    attackRange: 1.3,
    noticeRange: 7,
    preyTargets: ['wolf'],
    predatorThreats: ['bear', 'troll', 'wolf'],
    loot: { wood: 8, fiber: 10 },
    fearsFire: true,
  },
  fox: {
    species: 'fox',
    name: 'Red Fox',
    icon: '🦊',
    baseHp: 9,
    baseTraits: { speed: 1.7, aggression: 0.55, size: 0.85, fertility: 1.4 },
    diet: 'carnivore',
    behavior: 'skittish',
    preferredBiomes: ['meadow', 'taiga', 'badlands', 'wetlands', 'coastal'],
    elevationRange: [2, 18],
    initialSpawnCount: 55,
    minPopulation: 14,
    attackDamage: 18,
    attackRange: 1.3,
    noticeRange: 8,
    preyTargets: ['rabbit'],
    predatorThreats: ['wolf', 'bear', 'troll'],
    loot: { fiber: 6, stone: 4 },
    fearsFire: true,
  },
  wolf: {
    species: 'wolf',
    name: 'Timber Wolf',
    icon: '🐺',
    baseHp: 22,
    baseTraits: { speed: 1.75, aggression: 0.75, size: 1.2, fertility: 0.9 },
    diet: 'carnivore',
    behavior: 'apex',
    preferredBiomes: ['taiga', 'alpine'],
    elevationRange: [6, 22],
    initialSpawnCount: 45,
    minPopulation: 10,
    attackDamage: 22,
    attackRange: 1.3,
    noticeRange: 9,
    preyTargets: ['deer', 'rabbit', 'boar'],
    predatorThreats: ['bear', 'troll'],
    loot: { stone: 8, fiber: 10 },
    fearsFire: true,
  },
  croc: {
    species: 'croc',
    name: 'Marsh Crocodile',
    icon: '🐊',
    baseHp: 42,
    baseTraits: { speed: 1.1, aggression: 0.80, size: 1.35, fertility: 0.8 },
    diet: 'carnivore',
    behavior: 'ambush',
    preferredBiomes: ['wetlands', 'coastal'],
    elevationRange: [1, 5],
    initialSpawnCount: 40,
    minPopulation: 10,
    attackDamage: 32,
    attackRange: 1.3,
    noticeRange: 7,
    preyTargets: ['deer', 'rabbit', 'boar'],
    predatorThreats: [],
    loot: { stone: 14, fiber: 12 },
    fearsFire: true,
  },
  bear: {
    species: 'bear',
    name: 'Grizzly Bear',
    icon: '🐻',
    baseHp: 68,
    baseTraits: { speed: 1.2, aggression: 0.70, size: 1.7, fertility: 0.7 },
    diet: 'omnivore',
    behavior: 'territorial',
    preferredBiomes: ['alpine', 'taiga'],
    elevationRange: [7, 22],
    initialSpawnCount: 30,
    minPopulation: 8,
    attackDamage: 44,
    attackRange: 1.7,
    noticeRange: 6,
    preyTargets: ['deer', 'boar', 'wolf'],
    predatorThreats: [],
    loot: { wood: 16, stone: 18, fiber: 16 },
    fearsFire: true,
  },
  troll: {
    species: 'troll',
    name: 'Mountain Troll',
    icon: '👹',
    baseHp: 55,
    baseTraits: { speed: 0.8, aggression: 0.90, size: 1.9, fertility: 0.5 },
    diet: 'carnivore',
    behavior: 'apex',
    preferredBiomes: ['alpine'],
    elevationRange: [14, 24],
    initialSpawnCount: 20,
    minPopulation: 6,
    attackDamage: 36,
    attackRange: 2.3,
    noticeRange: 10,
    preyTargets: ['deer', 'wolf', 'bear'],
    predatorThreats: [],
    loot: { wood: 20, stone: 24, fiber: 12 },
    fearsFire: false,
  },
};

/** AI behaviour state. */
export type CreatureState = 'idle' | 'wander' | 'flee' | 'chase' | 'attack' | 'forage' | 'eat';

export interface Creature {
  readonly id: number;
  readonly species: Species;
  traits: Traits;
  /** Current tile position (non-integer during movement). */
  gx: number;
  gy: number;
  /** Facing direction ('n', 's', 'e', 'w'). */
  facing: 'n' | 's' | 'e' | 'w';
  /** Continuous walk/bob cycle [0, 1) for live animations. */
  walkCycle: number;
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
  /** Attack animation timer in seconds. */
  attackAnimTimer: number;
  /** Damage reaction flinch timer in seconds. */
  hurtTimer: number;
  /** Locked foraging target; kept until eaten or gone so the creature doesn't flicker between equidistant plants. */
  forageTarget: FloraItem | undefined;
  /** Smoothed flee heading (unit vector), turn-rate-limited so escape direction doesn't snap frame to frame. */
  fleeDirX: number;
  fleeDirY: number;
  /** Seconds remaining to keep fleeing after the last threat was seen, so brief dips out of noticeRange don't flip the state every tick. */
  fleeSpookTimer: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Ticks between generations. 600 ticks ≈ 10 seconds at 60 Hz. */
export const GENERATION_TICKS = 600;

/** Maximum creatures alive at once across the massive continent. */
export const MAX_CREATURES = 600;

/** Mutation magnitude per generation (trait drift). */
const MUTATION = 0.08;

/** How fast a fleeing creature's heading turns to face away from a threat, in full-turns/sec equivalent. Lower = smoother but laggier escapes. */
const FLEE_TURN_RATE = 6.0;

/** Seconds a creature keeps fleeing after its last threat sighting, so brushing the edge of noticeRange doesn't flicker the state. */
const FLEE_SPOOK_DURATION = 0.6;

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
  const def = SPECIES_REGISTRY[species];
  const base = parentTraits ?? def.baseTraits;
  const traits = mutateTrait(base, rng, parentTraits ? MUTATION : MUTATION * 2);
  const maxHp  = Math.round(def.baseHp * traits.size * 4);

  return {
    id,
    species,
    traits,
    gx,
    gy,
    facing: rng.next() > 0.5 ? 's' : 'e',
    walkCycle: rng.next(),
    targetGx: NaN,
    targetGy: NaN,
    idleTimer: rng.next() * 3,
    state: 'idle',
    hp: maxHp,
    maxHp,
    rng,
    generation: parentGen,
    eatTimer: 0,
    attackAnimTimer: 0,
    hurtTimer: 0,
    forageTarget: undefined,
    fleeDirX: 0,
    fleeDirY: 0,
    fleeSpookTimer: 0,
  };
}

/**
 * Populate the massive 640x640 world with creatures distributed across biome ecosystems.
 */
export function populateWorld(worldSeed: number, world: WorldTerrain): Creature[] {
  const creatures: Creature[] = [];
  const rng = createRng(worldSeed ^ 0xdeadbeef);

  const defs = Object.values(SPECIES_REGISTRY);
  for (let s = 0; s < defs.length; s++) {
    const def = defs[s];
    if (def === undefined) continue;
    let attempts = def.initialSpawnCount * 25;
    let placed   = 0;
    const [minH, maxH] = def.elevationRange;

    while (placed < def.initialSpawnCount && attempts-- > 0) {
      const gx = Math.floor(16 + rng.next() * (W - 32));
      const gy = Math.floor(16 + rng.next() * (H - 32));
      if (!isWalkable(world, gx, gy)) continue;
      const h = world.heights.get(gx, gy);
      if (h < minH || h > maxH) continue;
      const biome = getBiomeAt(gx, gy, worldSeed, h);

      if (!def.preferredBiomes.includes(biome.kind)) continue;

      creatures.push(spawnCreature(def.species, gx, gy, worldSeed));
      placed++;
    }
  }

  return creatures;
}

// ── Update ─────────────────────────────────────────────────────────────────────

// ── Shared Spatial Grids for Simulation & Viewport Culling (Zero-Allocation) ───

export const CREATURE_SPATIAL = new SpatialGrid();
import { FLORA_SPATIAL } from './flora.js';

/** Radii for fire & light warding in tiles. */
export const FIRE_WARD_RADIUS = 9.0;
export const FIRE_SAFE_ZONE_RADIUS = 7.5;
export const FIRE_BURN_RADIUS = 0.9;

/**
 * Returns true if (gx, gy) is within the safe sanctuary radius of any active fire
 * (e.g. campfire) or lit beacon at night.
 */
export function isNearActiveFireOrLight(
  gx: number,
  gy: number,
  buildings: readonly Building[],
  darkness = 0,
  safeRadius = FIRE_SAFE_ZONE_RADIUS,
): boolean {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0) continue;

    let rad = 0;
    if (b.kind === 'campfire') {
      rad = safeRadius;
    } else if (darkness > 0.2) {
      if (b.kind === 'wood_tower') rad = safeRadius * 0.7;
      else if (b.kind === 'stone_tower') rad = safeRadius * 0.85;
    }

    if (rad > 0) {
      const bx = b.gx + b.w * 0.5;
      const by = b.gy + b.d * 0.5;
      const dx = gx - bx;
      const dy = gy - by;
      if (dx * dx + dy * dy <= rad * rad) {
        return true;
      }
    }
  }
  return false;
}

export interface CreatureEvents {
  playerAttacked: boolean;
  roarOccurred: boolean;
  howlOccurred: boolean;
  wardOccurred?: boolean;
}

/** A fresh, all-false `CreatureEvents` bag. Call once and reuse it as `updateCreatures`'s
 *  out-parameter — allocating one per tick would put a per-frame allocation back in the
 *  hottest loop in the game. */
export function createCreatureEvents(): CreatureEvents {
  return { playerAttacked: false, roarOccurred: false, howlOccurred: false, wardOccurred: false };
}

/**
 * Update all creatures for one simulation tick.
 *
 * Implements data-driven active food webs and nocturnal threat behavior:
 * - Herbivores and omnivores forage for edible plants and flee from predators.
 * - Carnivores and apex predators hunt prey defined in their species registry.
 * - At night (darkness > 0), apex hunters gain expanded detection ranges and aggressive siege attacks.
 * - Fire and light sources (campfires, towers) ward off predators like wolves.
 * - Solid buildings (walls and towers) physically block and keep out animals.
 *
 * Accelerated via SpatialGrid to eliminate $O(N^2)$ brute-force distance checks.
 *
 * `out` is cleared and written in place — the caller owns it (see `createCreatureEvents`) so
 * this, the top of the 60 Hz tick, allocates nothing.
 */
export function updateCreatures(
  creatures: Creature[],
  world: WorldTerrain,
  players: readonly [Player, Player],
  flora: FloraItem[],
  buildings: Building[],
  darkness: number,
  dt: number,
  out: CreatureEvents,
): void {
  out.playerAttacked = false;
  out.roarOccurred = false;
  out.howlOccurred = false;
  out.wardOccurred = false;

  // 1. Build spatial index for live creatures
  CREATURE_SPATIAL.clear();
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c !== undefined && c.hp > 0) {
      CREATURE_SPATIAL.insert(i, c.gx, c.gy);
    }
  }

  // 2. Update all live creatures
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c === undefined || c.hp <= 0) continue;
    updateOne(c, creatures, world, players, flora, buildings, darkness, dt, out);
  }
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
  const def = SPECIES_REGISTRY[c.species];

  if (c.attackAnimTimer > 0) {
    c.attackAnimTimer = Math.max(0, c.attackAnimTimer - dt);
  }
  if (c.hurtTimer > 0) {
    c.hurtTimer = Math.max(0, c.hurtTimer - dt);
  }

  // Slow natural idle/breathing cadence
  const idleRate = c.species === 'rabbit' ? 0.15 : c.species === 'croc' ? 0.08 : 0.3;
  c.walkCycle = (c.walkCycle + dt * idleRate) % 1;

  const speed = c.traits.speed;
  const isApexOrHostileArchetype = def.behavior === 'apex' || def.behavior === 'territorial' || def.behavior === 'ambush';
  const nightAggressionBonus = isApexOrHostileArchetype && darkness > 0.1 ? darkness * 0.4 : 0;
  const effectiveAggression = c.traits.aggression + nightAggressionBonus;
  const isCreatureHostile = isApexOrHostileArchetype && effectiveAggression > 0.55;
  const huntSpeed = isApexOrHostileArchetype ? speed * (1.3 + darkness * 0.35) : speed * 1.3;
  const noticeRange = def.noticeRange + (isApexOrHostileArchetype ? darkness * 8 : 0);

  // 1. Check for immediate fire/light & predator threats to flee from
  let threatDx = 0;
  let threatDy = 0;
  let threatCount = 0;

  // Fire / Light warding: basic predators (wolves, foxes, etc.) and wild beasts are warded off by campfires and bright beacons
  const fearsFire = def.fearsFire ?? true;
  if (fearsFire) {
    for (let bi = 0; bi < buildings.length; bi++) {
      const b = buildings[bi];
      if (b === undefined || b.hp <= 0) continue;

      let wardRadius = 0;
      if (b.kind === 'campfire') {
        wardRadius = FIRE_WARD_RADIUS;
      } else if (darkness > 0.2) {
        if (b.kind === 'wood_tower') wardRadius = 6.0;
        else if (b.kind === 'stone_tower') wardRadius = 7.5;
      }

      if (wardRadius > 0) {
        const fireX = b.gx + b.w * 0.5;
        const fireY = b.gy + b.d * 0.5;
        const dx = fireX - c.gx;
        const dy = fireY - c.gy;
        const dSq = dx * dx + dy * dy;
        if (dSq < wardRadius * wardRadius) {
          const d = Math.sqrt(dSq); // @tier-b — distance to fire, pixels only
          const weight = (wardRadius - d) / wardRadius * 2.5;
          if (d > 0.01) {
            threatDx += (dx / d) * weight;
            threatDy += (dy / d) * weight;
            threatCount++;
          }
          // Immediate singe / burn damage if touching campfire flames directly
          if (b.kind === 'campfire' && d < FIRE_BURN_RADIUS) {
            c.hp -= 15 * dt;
            c.hurtTimer = 0.35;
          }
          events.wardOccurred = true;
        }
      }
    }
  }

  const shouldFleeFromPlayers = !isCreatureHostile && def.behavior === 'skittish';
  if (shouldFleeFromPlayers) {
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p === undefined || p.respawnTimer > 0 || !p.active) continue;
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

  // Check predator threats via spatial query (defensive creatures flee only when wounded)
  const shouldCheckPredatorThreats = def.behavior === 'skittish' || (def.behavior === 'defensive' && c.hp < c.maxHp * 0.4);
  if (shouldCheckPredatorThreats && def.predatorThreats.length > 0) {
    const nearbyCount = CREATURE_SPATIAL.queryRadius(c.gx, c.gy, noticeRange);
    for (let q = 0; q < nearbyCount; q++) {
      const otherIdx = CREATURE_SPATIAL.queryBuffer[q];
      if (otherIdx === undefined) continue;
      const other = allCreatures[otherIdx];
      if (other === undefined || other.hp <= 0 || other.id === c.id) continue;

      if (def.predatorThreats.includes(other.species)) {
        const dx = other.gx - c.gx;
        const dy = other.gy - c.gy;
        threatDx += dx;
        threatDy += dy;
        threatCount++;
      }
    }
  }

  // If threatened, scatter and FLEE!
  //
  // The raw away-from-threat vector is recomputed from instantaneous relative position every
  // tick. Steering straight at that raw vector (as this used to do) makes the heading swing
  // wildly frame to frame — small position deltas produce large angle swings when a threat is
  // close, and threats crossing the noticeRange edge pop in/out of the average abruptly. Both
  // read as glitchy direction-snapping. So: turn-rate-limit the heading toward the raw vector
  // instead of snapping to it, and hold the flee state for a short "spooked" window after the
  // last threat sighting so the state itself doesn't flicker at the detection boundary.
  if (threatCount > 0) {
    const avgThreatDx = threatDx / threatCount;
    const avgThreatDy = threatDy / threatCount;
    const threatDist = Math.sqrt(avgThreatDx * avgThreatDx + avgThreatDy * avgThreatDy); // @tier-b
    if (threatDist > 0.01) {
      const rawFleeDx = -avgThreatDx / threatDist;
      const rawFleeDy = -avgThreatDy / threatDist;
      const turn = Math.min(1, FLEE_TURN_RATE * dt);
      c.fleeDirX += (rawFleeDx - c.fleeDirX) * turn;
      c.fleeDirY += (rawFleeDy - c.fleeDirY) * turn;
      const len = Math.sqrt(c.fleeDirX * c.fleeDirX + c.fleeDirY * c.fleeDirY); // @tier-b
      if (len > 0.01) {
        c.fleeDirX /= len;
        c.fleeDirY /= len;
      }
    }
    c.fleeSpookTimer = FLEE_SPOOK_DURATION;
  }

  if (c.fleeSpookTimer > 0) {
    c.fleeSpookTimer = Math.max(0, c.fleeSpookTimer - dt);
    c.state = 'flee';
    c.eatTimer = 0;
    moveWithSeparation(c, c.gx + c.fleeDirX * 8, c.gy + c.fleeDirY * 8, speed * 1.4, dt, world, allCreatures, buildings);
    return;
  }

  // 2. Carnivore & Predator Hunting / Ambush / Territorial Defense
  if (def.diet !== 'herbivore' || (def.behavior === 'defensive' && c.traits.aggression > 0.45)) {
    let bestTargetGx = 0;
    let bestTargetGy = 0;
    let bestDist = 12 + (darkness > 0 ? darkness * 8 : 0);
    let targetType: 'none' | 'creature' | 'player' | 'building' = 'none';
    let targetCreature: Creature | undefined = undefined;
    let targetPlayer: Player | undefined = undefined;
    let targetBuilding: Building | undefined = undefined;

    // Check prey creatures via spatial neighborhood query
    if (def.preyTargets.length > 0) {
      const nearbyCount = CREATURE_SPATIAL.queryRadius(c.gx, c.gy, bestDist);
      for (let q = 0; q < nearbyCount; q++) {
        const otherIdx = CREATURE_SPATIAL.queryBuffer[q];
        if (otherIdx === undefined) continue;
        const other = allCreatures[otherIdx];
        if (other === undefined || other.hp <= 0 || other.id === c.id) continue;

        if (def.preyTargets.includes(other.species)) {
          // Prey protected by fire/light sanctuary is ignored
          if (fearsFire && isNearActiveFireOrLight(other.gx, other.gy, buildings, darkness)) {
            continue;
          }
          const dx = other.gx - c.gx;
          const dy = other.gy - c.gy;
          const d = Math.sqrt(dx * dx + dy * dy); // @tier-b — hunt distance check, pixels only
          if (d < bestDist) {
            bestDist = d;
            bestTargetGx = other.gx;
            bestTargetGy = other.gy;
            targetType = 'creature';
            targetCreature = other;
          }
        }
      }
    }

    // Hostile apex predators and territorial beasts target nearby active players
    if (isCreatureHostile || def.behavior === 'territorial') {
      const playerDetectRange = def.behavior === 'territorial' ? 5.5 : bestDist;
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p === undefined || p.respawnTimer > 0 || !p.active) continue;
        // A player standing on a tower's lookout platform is out of every ground predator's
        // reach — no animal can climb up after them, so none can target or strike them there.
        if (p.elevationPx > 0) continue;
        // Player protected inside campfire or beacon sanctuary is safe
        if (fearsFire && isNearActiveFireOrLight(p.gx, p.gy, buildings, darkness)) {
          continue;
        }
        const dx = p.gx - c.gx;
        const dy = p.gy - c.gy;
        const d = Math.sqrt(dx * dx + dy * dy); // @tier-b — player chase distance, pixels only
        if (d < playerDetectRange && d < bestDist) {
          bestDist = d;
          bestTargetGx = p.gx;
          bestTargetGy = p.gy;
          targetType = 'player';
          targetPlayer = p;
        }
      }

      // Trolls siege player structures (towers, walls)
      if (c.species === 'troll') {
        for (let i = 0; i < buildings.length; i++) {
          const b = buildings[i];
          if (b === undefined || b.hp <= 0) continue;
          const bx = b.gx + b.w * 0.5;
          const by = b.gy + b.d * 0.5;
          const dx = bx - c.gx;
          const dy = by - c.gy;
          const d = Math.sqrt(dx * dx + dy * dy); // @tier-b
          if (d < bestDist) {
            bestDist = d;
            bestTargetGx = bx;
            bestTargetGy = by;
            targetType = 'building';
            targetBuilding = b;
          }
        }
      }
    }

    if (targetType !== 'none') {
      const attackRangeThreshold = def.attackRange + (targetType === 'building' ? 1.0 : 0);
      if (bestDist < attackRangeThreshold) {
        c.state = 'attack';

        // Face towards target when attacking
        const tdx = bestTargetGx - c.gx;
        const tdy = bestTargetGy - c.gy;
        if (Math.abs(tdx) > Math.abs(tdy)) {
          c.facing = tdx > 0 ? 'e' : 'w';
        } else {
          c.facing = tdy > 0 ? 's' : 'n';
        }

        // Trigger discrete attack strike if not currently mid-animation
        if (c.attackAnimTimer <= 0) {
          c.attackAnimTimer = 0.55;

          if (targetType === 'player' && targetPlayer !== undefined) {
            const baseDmg = def.attackDamage;
            const nightDmg = baseDmg * (1 + darkness * 0.4);
            damagePlayer(targetPlayer, nightDmg * c.traits.size * 0.35);
            events.playerAttacked = true;
            if (c.species === 'troll' || c.species === 'bear') events.roarOccurred = true;
            if (c.species === 'wolf' && darkness > 0.3) events.howlOccurred = true;
          } else if (targetType === 'creature' && targetCreature !== undefined) {
            const huntDmg = def.attackDamage;
            targetCreature.hp -= huntDmg * c.traits.size * 0.35;
            targetCreature.hurtTimer = 0.35;
            if (targetCreature.hp <= 0) {
              c.hp = Math.min(c.maxHp, c.hp + 8); // Predator heals from kill
            }
          } else if (targetType === 'building' && targetBuilding !== undefined) {
            targetBuilding.hp -= 12 * c.traits.size;
          }
        }
      } else if (c.attackAnimTimer > 0) {
        // Continue finishing attack animation swing if mid-strike
        c.state = 'attack';
      } else {
        c.state = 'chase';
        const attackRunSpeed = def.behavior === 'ambush' ? huntSpeed * 1.5 : def.behavior === 'territorial' ? huntSpeed * 1.15 : huntSpeed;
        moveWithSeparation(c, bestTargetGx, bestTargetGy, attackRunSpeed, dt, world, allCreatures, buildings);
      }
      return;
    }
  }

  // 3. Herbivore & Omnivore Plant Foraging
  if (def.diet !== 'carnivore') {
    // Keep pursuing a previously locked plant until it's eaten or gone, rather than
    // re-picking the "closest" one every tick — that flip-flops rapidly between near-equidistant
    // plants (especially with other creatures' separation nudges) and looks like jittery indecision.
    if (c.forageTarget !== undefined && !isFloraStillPresent(c.forageTarget, flora)) {
      c.forageTarget = undefined;
    }
    if (c.forageTarget === undefined) {
      c.forageTarget = findClosestEdibleFlora(flora, c.gx, c.gy, 8, undefined, FLORA_SPATIAL);
    }
    const edible = c.forageTarget;
    if (edible !== undefined) {
      const dx = edible.gx - c.gx;
      const dy = edible.gy - c.gy;
      const dist = Math.sqrt(dx * dx + dy * dy); // @tier-b — flora forage distance, pixels only

      if (dist < 0.9) {
        c.state = 'eat';
        c.eatTimer += dt;
        if (c.eatTimer >= 1.8) {
          const fIdx = flora.indexOf(edible);
          if (fIdx !== -1) {
            flora.splice(fIdx, 1);
            rebuildFloraSpatial(flora);
          }
          c.hp = Math.min(c.maxHp, c.hp + 6);
          c.eatTimer = 0;
          c.targetGx = NaN;
          c.targetGy = NaN;
          c.forageTarget = undefined;
        }

        return;
      } else {
        c.state = 'forage';
        moveWithSeparation(c, edible.gx, edible.gy, speed * 0.75, dt, world, allCreatures, buildings);
        return;
      }
    }
  }

  // 4. Default Peaceful Wander with Waypoint Rest
  c.idleTimer -= dt;
  if (c.idleTimer <= 0 || isNaN(c.targetGx)) {
    const angle = c.rng.next() * 6.28318; // @tier-b — wander angle, pixels only
    const dist  = 3 + c.rng.next() * 5;
    const candGx = clamp(Math.round(c.gx + Math.cos(angle) * dist), 8, W - 9); // @tier-b
    const candGy = clamp(Math.round(c.gy + Math.sin(angle) * dist), 8, H - 9); // @tier-b
    if (!fearsFire || !isNearActiveFireOrLight(candGx, candGy, buildings, darkness, 4.0)) {
      c.targetGx  = candGx;
      c.targetGy  = candGy;
    }
    c.idleTimer = 3.5 + c.rng.next() * 3.5;
  }

  const distToTargetSq = (c.targetGx - c.gx) ** 2 + (c.targetGy - c.gy) ** 2;
  if (distToTargetSq > 0.36) {
    c.state = 'wander';
    moveWithSeparation(c, c.targetGx, c.targetGy, speed * 0.55, dt, world, allCreatures, buildings);
  } else {
    c.state = 'idle';
  }
}

/** Check whether a locked forage target is still a live entry in the flora array (i.e. not yet eaten). */
function isFloraStillPresent(target: FloraItem, flora: readonly FloraItem[]): boolean {
  const count = FLORA_SPATIAL.queryRadius(target.gx, target.gy, 0.1);
  for (let i = 0; i < count; i++) {
    const idx = FLORA_SPATIAL.queryBuffer[i];
    if (idx !== undefined && flora[idx] === target) return true;
  }
  return false;
}

/** Move a creature with soft Boid separation, map margin avoidance, facing hysteresis, and solid barrier sliding. */
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

  // 1. Soft Boid Separation force (accelerated via local spatial query)
  let sepX = 0;
  let sepY = 0;
  const nearbyBoids = CREATURE_SPATIAL.queryRadius(c.gx, c.gy, 1.2);
  for (let q = 0; q < nearbyBoids; q++) {
    const otherIdx = CREATURE_SPATIAL.queryBuffer[q];
    if (otherIdx === undefined) continue;
    const other = allCreatures[otherIdx];
    if (other === undefined || other.id === c.id || other.hp <= 0) continue;
    const ox = c.gx - other.gx;
    const oy = c.gy - other.gy;
    const distSq = ox * ox + oy * oy;
    if (distSq < 1.44 && distSq > 0.0001) {
      const dist = Math.sqrt(distSq); // @tier-b
      const strength = (1.2 - dist) / 1.2;
      sepX += (ox / dist) * strength * 0.35;
      sepY += (oy / dist) * strength * 0.35;
    }
  }

  // 2. Soft Map Margin Avoidance
  const MARGIN = 10;
  if (c.gx < MARGIN) sepX += (MARGIN - c.gx) * 0.2;
  if (c.gx > W - MARGIN) sepX -= (c.gx - (W - MARGIN)) * 0.2;
  if (c.gy < MARGIN) sepY += (MARGIN - c.gy) * 0.2;
  if (c.gy > H - MARGIN) sepY -= (c.gy - (H - MARGIN)) * 0.2;

  const moveX = dx + sepX;
  const moveY = dy + sepY;
  const moveLen = Math.sqrt(moveX * moveX + moveY * moveY); // @tier-b
  if (moveLen < 0.01) return;

  const dirX = moveX / moveLen;
  const dirY = moveY / moveLen;

  // 3. Directional Hysteresis: prevent rapid facing oscillation along diagonal movement
  const isCurrentlyHorizontal = c.facing === 'e' || c.facing === 'w';
  if (isCurrentlyHorizontal) {
    if (Math.abs(dirY) > Math.abs(dirX) * 1.35 && Math.abs(dirY) > 0.15) {
      c.facing = dirY > 0 ? 's' : 'n';
    } else if (Math.abs(dirX) > 0.1) {
      c.facing = dirX > 0 ? 'e' : 'w';
    }
  } else {
    if (Math.abs(dirX) > Math.abs(dirY) * 1.35 && Math.abs(dirX) > 0.15) {
      c.facing = dirX > 0 ? 'e' : 'w';
    } else if (Math.abs(dirY) > 0.1) {
      c.facing = dirY > 0 ? 's' : 'n';
    }
  }

  const step = speed * dt;
  const cycleSpeed = c.species === 'troll' || c.species === 'bear' ? 0.6 : c.species === 'rabbit' ? 0.45 : 0.9;
  c.walkCycle = (c.walkCycle + step * cycleSpeed) % 1;

  const nx = c.gx + dirX * step;
  const ny = c.gy + dirY * step;

  const tileX = Math.floor(nx);
  const tileY = Math.floor(ny);

  // 4. Smooth movement with axis-aligned obstacle sliding
  if (isWalkable(world, tileX, tileY) && !isTileOccupiedBySolidBuilding(tileX, tileY, buildings, 'animal')) {
    c.gx = clamp(nx, 2, W - 3);
    c.gy = clamp(ny, 2, H - 3);
  } else {
    // Try sliding along X axis
    const curTileY = Math.floor(c.gy);
    if (isWalkable(world, tileX, curTileY) && !isTileOccupiedBySolidBuilding(tileX, curTileY, buildings, 'animal')) {
      c.gx = clamp(nx, 2, W - 3);
    } else {
      // Try sliding along Y axis
      const curTileX = Math.floor(c.gx);
      if (isWalkable(world, curTileX, tileY) && !isTileOccupiedBySolidBuilding(curTileX, tileY, buildings, 'animal')) {
        c.gy = clamp(ny, 2, H - 3);
      } else {
        c.targetGx = NaN;
        c.targetGy = NaN;
      }
    }
  }
}

// ── Evolution ──────────────────────────────────────────────────────────────────

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

  const defs = Object.values(SPECIES_REGISTRY);
  for (let mi = 0; mi < defs.length; mi++) {
    const def = defs[mi];
    if (def === undefined) continue;
    const current = counts[def.species] ?? 0;
    for (let n = current; n < def.minPopulation && creatures.length + toAdd.length < MAX_CREATURES; n++) {
      const rng = createRng(hash2(worldSeed, n + 1, current * 17 + 5));
      const gx = Math.floor(12 + rng.next() * (W - 24));
      const gy = Math.floor(12 + rng.next() * (H - 24));
      if (isWalkable(world, gx, gy)) {
        toAdd.push(spawnCreature(def.species, gx, gy, worldSeed));
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



