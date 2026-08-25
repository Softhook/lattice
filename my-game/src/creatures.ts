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


// ── Species ────────────────────────────────────────────────────────────────────

export type Species = 'rabbit' | 'deer' | 'fox' | 'wolf' | 'troll' | 'bear' | 'boar' | 'croc';

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
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Ticks between generations. 600 ticks ≈ 10 seconds at 60 Hz. */
export const GENERATION_TICKS = 600;

/** Maximum creatures alive at once across the massive continent. */
export const MAX_CREATURES = 600;

/** HP formula: base × size. */
const BASE_HP: Record<Species, number> = {
  rabbit: 4,
  deer:   12,
  fox:    9,
  wolf:   22,
  boar:   26,
  croc:   42,
  bear:   68,
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
  boar:   { speed: 1.5, aggression: 0.45, size: 1.15, fertility: 1.3 },
  croc:   { speed: 1.1, aggression: 0.80, size: 1.35, fertility: 0.8 },
  bear:   { speed: 1.2, aggression: 0.70, size: 1.7,  fertility: 0.7 },
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
  };
}

/**
 * Populate the massive 640x640 world with creatures distributed across biome ecosystems.
 */
export function populateWorld(worldSeed: number, world: WorldTerrain): Creature[] {
  const creatures: Creature[] = [];
  const rng = createRng(worldSeed ^ 0xdeadbeef);

  const push = (species: Species, count: number, minH: number, maxH: number) => {
    let attempts = count * 25;
    let placed   = 0;
    while (placed < count && attempts-- > 0) {
      const gx = Math.floor(16 + rng.next() * (W - 32));
      const gy = Math.floor(16 + rng.next() * (H - 32));
      if (!isWalkable(world, gx, gy)) continue;
      const h = world.heights.get(gx, gy);
      if (h < minH || h > maxH) continue;
      const biome = getBiomeAt(gx, gy, worldSeed, h);

      // Biome affinity checks
      if (species === 'troll' && biome.kind !== 'alpine' && h < 14) continue;
      if (species === 'bear' && biome.kind !== 'alpine' && biome.kind !== 'taiga') continue;
      if (species === 'wolf' && biome.kind !== 'taiga' && biome.kind !== 'alpine') continue;
      if (species === 'croc' && biome.kind !== 'wetlands' && biome.kind !== 'coastal' && h > 4) continue;
      if (species === 'boar' && biome.kind !== 'meadow' && biome.kind !== 'wetlands') continue;
      if (species === 'deer' && biome.kind !== 'meadow' && biome.kind !== 'wetlands') continue;
      if (species === 'rabbit' && biome.kind !== 'meadow' && biome.kind !== 'wetlands' && biome.kind !== 'taiga') continue;
      if (species === 'fox' && biome.kind === 'alpine') continue;

      creatures.push(spawnCreature(species, gx, gy, worldSeed));
      placed++;
    }
  };

  push('rabbit', 120,  2, 16);
  push('deer',    75,  3, 16);
  push('boar',    65,  2, 14);
  push('fox',     55,  2, 18);
  push('wolf',    45,  6, 22);
  push('croc',    40,  1,  5);
  push('bear',    30,  7, 22);
  push('troll',   20, 14, 24);

  return creatures;
}



// ── Update ─────────────────────────────────────────────────────────────────────

// ── Shared Spatial Grids for Simulation & Viewport Culling (Zero-Allocation) ───

export const CREATURE_SPATIAL = new SpatialGrid();
import { FLORA_SPATIAL } from './flora.js';

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
 *
 * Accelerated via SpatialGrid to eliminate $O(N^2)$ brute-force distance checks.
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
  // Slow natural idle/breathing cadence
  const idleRate = c.species === 'rabbit' ? 0.15 : c.species === 'croc' ? 0.08 : 0.3;
  c.walkCycle = (c.walkCycle + dt * idleRate) % 1;

  const speed = c.traits.speed;
  // Nighttime increases predator hunting speed and perception range
  const isApex = c.species === 'wolf' || c.species === 'troll' || c.species === 'bear' || c.species === 'croc';
  const nightAggressionBonus = isApex && darkness > 0.1 ? darkness * 0.4 : 0;
  const effectiveAggression = c.traits.aggression + nightAggressionBonus;
  const isCreatureHostile = (c.species === 'wolf' || c.species === 'troll' || c.species === 'bear' || c.species === 'croc') && effectiveAggression > 0.55;
  const huntSpeed = isApex ? speed * (1.3 + darkness * 0.35) : speed * 1.3;
  const noticeRange = NOTICE_RANGE + (isApex ? darkness * 8 : 0);

  // 1. Check for immediate predator threats to flee from
  let threatDx = 0;
  let threatDy = 0;
  let threatCount = 0;

  const shouldFleeFromPlayers = !isCreatureHostile && c.species !== 'bear' && c.species !== 'troll' && c.species !== 'croc';
  if (shouldFleeFromPlayers) {
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

  // Check predator creatures via spatial query
  if (c.species === 'rabbit' || c.species === 'deer' || c.species === 'fox' || (c.species === 'boar' && c.hp < 12)) {
    const nearbyCount = CREATURE_SPATIAL.queryRadius(c.gx, c.gy, noticeRange);
    for (let q = 0; q < nearbyCount; q++) {
      const otherIdx = CREATURE_SPATIAL.queryBuffer[q];
      if (otherIdx === undefined) continue;
      const other = allCreatures[otherIdx];
      if (other === undefined || other.hp <= 0 || other.id === c.id) continue;
      const isPredator =
        (c.species === 'rabbit' && (other.species === 'fox' || other.species === 'wolf' || other.species === 'croc' || other.species === 'troll')) ||
        (c.species === 'deer' && (other.species === 'wolf' || other.species === 'bear' || other.species === 'croc' || other.species === 'troll')) ||
        (c.species === 'fox' && (other.species === 'wolf' || other.species === 'bear' || other.species === 'troll')) ||
        (c.species === 'boar' && (other.species === 'bear' || other.species === 'troll' || other.species === 'wolf'));

      if (isPredator) {
        const dx = other.gx - c.gx;
        const dy = other.gy - c.gy;
        threatDx += dx;
        threatDy += dy;
        threatCount++;
      }
    }
  }

  // If threatened, scatter and FLEE!
  if (threatCount > 0) {
    c.state = 'flee';
    c.eatTimer = 0;
    // Flee smoothly away from the threat center of mass
    const avgThreatDx = threatDx / threatCount;
    const avgThreatDy = threatDy / threatCount;
    const threatDist = Math.sqrt(avgThreatDx * avgThreatDx + avgThreatDy * avgThreatDy); // @tier-b
    if (threatDist > 0.01) {
      const fleeDx = -avgThreatDx / threatDist;
      const fleeDy = -avgThreatDy / threatDist;
      moveWithSeparation(c, c.gx + fleeDx * 8, c.gy + fleeDy * 8, speed * 1.4, dt, world, allCreatures, buildings);
    }
    return;
  }

  // 2. Carnivore & Predator Hunting / Ambush / Territorial Defense
  if (c.species === 'fox' || c.species === 'wolf' || c.species === 'troll' || c.species === 'bear' || c.species === 'croc' || (c.species === 'boar' && c.traits.aggression > 0.5)) {
    let bestTargetGx = 0;
    let bestTargetGy = 0;
    let bestDist = 12 + (darkness > 0 ? darkness * 8 : 0);
    let targetType: 'none' | 'creature' | 'player' | 'building' = 'none';
    let targetCreature: Creature | undefined = undefined;
    let targetPlayer: Player | undefined = undefined;
    let targetBuilding: Building | undefined = undefined;

    // Check prey creatures via spatial neighborhood query
    const nearbyCount = CREATURE_SPATIAL.queryRadius(c.gx, c.gy, bestDist);
    for (let q = 0; q < nearbyCount; q++) {
      const otherIdx = CREATURE_SPATIAL.queryBuffer[q];
      if (otherIdx === undefined) continue;
      const other = allCreatures[otherIdx];
      if (other === undefined || other.hp <= 0 || other.id === c.id) continue;
      const isPrey =
        (c.species === 'fox' && other.species === 'rabbit') ||
        (c.species === 'wolf' && (other.species === 'deer' || other.species === 'rabbit' || other.species === 'boar')) ||
        (c.species === 'croc' && (other.species === 'deer' || other.species === 'rabbit' || other.species === 'boar')) ||
        (c.species === 'bear' && (other.species === 'deer' || other.species === 'boar' || other.species === 'wolf')) ||
        (c.species === 'boar' && other.species === 'wolf'); // Boar counter-attacks aggressive wolves

      if (isPrey) {
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

    // Hostile apex predators and territorial beasts target nearby active players
    if (isCreatureHostile || c.species === 'bear') {
      const playerDetectRange = c.species === 'bear' ? 5.5 : bestDist;
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p === undefined || p.respawnTimer > 0) continue;
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
      const attackRangeThreshold = ATTACK_RANGE + (targetType === 'building' ? 1.0 : c.species === 'bear' ? 0.4 : 0);
      if (bestDist < attackRangeThreshold) {
        c.state = 'attack';

        if (targetType === 'player' && targetPlayer !== undefined) {
          const baseDmg = c.species === 'bear' ? 44 : c.species === 'troll' ? 36 : c.species === 'croc' ? 32 : c.species === 'boar' ? 24 : 22;
          const nightDmg = baseDmg * (1 + darkness * 0.4);
          damagePlayer(targetPlayer, dt * nightDmg * c.traits.size);
          events.playerAttacked = true;
          if (c.species === 'troll' || c.species === 'bear') events.roarOccurred = true;
          if (c.species === 'wolf' && darkness > 0.3) events.howlOccurred = true;
        } else if (targetType === 'creature' && targetCreature !== undefined) {
          const huntDmg = c.species === 'bear' ? 36 : c.species === 'croc' ? 30 : 18;
          targetCreature.hp -= dt * huntDmg * c.traits.size;
          if (targetCreature.hp <= 0) {
            c.hp = Math.min(c.maxHp, c.hp + 8); // Predator heals from kill
          }
        } else if (targetType === 'building' && targetBuilding !== undefined) {
          targetBuilding.hp -= dt * 32 * c.traits.size;
        }
      } else {
        c.state = 'chase';
        const attackRunSpeed = c.species === 'croc' ? huntSpeed * 1.5 : c.species === 'bear' ? huntSpeed * 1.15 : huntSpeed;
        moveWithSeparation(c, bestTargetGx, bestTargetGy, attackRunSpeed, dt, world, allCreatures, buildings);
      }
      return;
    }
  }

  // 3. Herbivore & Omnivore Plant Foraging (Rabbits, Deer, Boars & Bears forage for plants)
  if (c.species === 'rabbit' || c.species === 'deer' || c.species === 'boar' || c.species === 'bear') {
    const edible = findClosestEdibleFlora(flora, c.gx, c.gy, 8, undefined, FLORA_SPATIAL);
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
    c.targetGx  = clamp(Math.round(c.gx + Math.cos(angle) * dist), 8, W - 9); // @tier-b
    c.targetGy  = clamp(Math.round(c.gy + Math.sin(angle) * dist), 8, H - 9); // @tier-b
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
  if (isWalkable(world, tileX, tileY) && !isTileOccupiedBySolidBuilding(tileX, tileY, buildings)) {
    c.gx = clamp(nx, 2, W - 3);
    c.gy = clamp(ny, 2, H - 3);
  } else {
    // Try sliding along X axis
    const curTileY = Math.floor(c.gy);
    if (isWalkable(world, tileX, curTileY) && !isTileOccupiedBySolidBuilding(tileX, curTileY, buildings)) {
      c.gx = clamp(nx, 2, W - 3);
    } else {
      // Try sliding along Y axis
      const curTileX = Math.floor(c.gx);
      if (isWalkable(world, curTileX, tileY) && !isTileOccupiedBySolidBuilding(curTileX, tileY, buildings)) {
        c.gy = clamp(ny, 2, H - 3);
      } else {
        c.targetGx = NaN;
        c.targetGy = NaN;
      }
    }
  }
}

// ── Evolution ──────────────────────────────────────────────────────────────────

const SPECIES_MINIMA: readonly { species: Species; min: number }[] = [
  { species: 'rabbit', min: 30 },
  { species: 'deer', min: 20 },
  { species: 'boar', min: 16 },
  { species: 'fox', min: 14 },
  { species: 'wolf', min: 10 },
  { species: 'croc', min: 10 },
  { species: 'bear', min: 8 },
  { species: 'troll', min: 6 },
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
  return (c.species === 'wolf' || c.species === 'troll' || c.species === 'bear' || c.species === 'croc') && c.traits.aggression > 0.65;
}

