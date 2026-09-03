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
import { findClosestEdibleFlora, consumeFloraItem } from './flora.js';

import type { Building } from './buildings.js';
import { isTileOccupiedBySolidBuilding, isMissionStructure } from './buildings.js';
import { SpatialGrid } from './spatial.js';


// ── Species & Declarative Registry ────────────────────────────────────────────

export type Species = 'rabbit' | 'deer' | 'ibex' | 'fox' | 'wolf' | 'troll' | 'bear' | 'boar' | 'croc' | 'shade' | 'orc' | 'goblin';

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
  /** Population ceiling. `evolveGeneration` will not let a species reproduce past this, so a
   *  high-`fertility` breeder (the hare) can't collapse the whole continent into a monoculture
   *  and pack the spatial grid. The ceilings sum to a little over `MAX_CREATURES`, so species
   *  still compete for the last slots rather than every one sitting at its own cap. */
  readonly maxPopulation: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly noticeRange: number;
  readonly preyTargets: readonly Species[];
  readonly predatorThreats: readonly Species[];
  readonly loot: CreatureLoot;
  readonly fearsFire?: boolean;
  /** Whether this species sieges nearby player structures (see `damageBuildings` call sites in
   *  `creatures.ts` and `main.ts`) in addition to attacking players directly. Trolls always have;
   *  mission-conjured monsters (`shade`) share it so a wizard's minions actually threaten a base,
   *  not just whichever player happens to be standing nearby. */
  readonly attacksBuildings?: boolean;
  /** Whether this species flocks. Herding species (hare, deer, ibex) get a gentle cohesion pull
   *  toward the centroid of nearby same-species animals in `moveWithSeparation` — so a herd reads
   *  as a herd instead of a scattered gas — and they propagate alarm: one member entering `flee`
   *  spooks its herd-mates in `updateOne` even if they never saw the predator themselves. */
  readonly herds?: boolean;
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
    initialSpawnCount: 180,
    minPopulation: 50,
    maxPopulation: 300,
    attackDamage: 0,
    attackRange: 1.0,
    noticeRange: 8,
    preyTargets: [],
    predatorThreats: ['fox', 'wolf', 'croc', 'troll'],
    loot: { fiber: 4 },
    fearsFire: true,
    herds: true,
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
    initialSpawnCount: 100,
    minPopulation: 30,
    maxPopulation: 200,
    attackDamage: 0,
    attackRange: 1.2,
    noticeRange: 8,
    preyTargets: [],
    predatorThreats: ['wolf', 'bear', 'croc', 'troll'],
    loot: { wood: 6, fiber: 8 },
    fearsFire: true,
    herds: true,
  },
  ibex: {
    species: 'ibex',
    name: 'Alpine Ibex',
    icon: '🐐',
    baseHp: 14,
    // The resident grazer of the peaks: without it, wolf / bear / troll all live at high
    // elevation with no prey up there and are forced to descend to the meadows to eat. Wary
    // (high noticeRange), sure-footed, and a herd animal — and hardy meat for a player willing
    // to hunt in troll country (see `FOOD_YIELD` in `food.ts`).
    baseTraits: { speed: 1.5, aggression: 0.12, size: 1.0, fertility: 1.4 },
    diet: 'herbivore',
    behavior: 'skittish',
    preferredBiomes: ['alpine', 'taiga'],
    elevationRange: [12, 24],
    initialSpawnCount: 90,
    minPopulation: 24,
    maxPopulation: 150,
    attackDamage: 0,
    attackRange: 1.2,
    noticeRange: 10,
    preyTargets: [],
    predatorThreats: ['wolf', 'bear', 'troll'],
    loot: { fiber: 8, stone: 4 },
    fearsFire: true,
    herds: true,
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
    initialSpawnCount: 130,
    minPopulation: 32,
    maxPopulation: 205,
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
    initialSpawnCount: 110,
    minPopulation: 28,
    maxPopulation: 160,
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
    initialSpawnCount: 90,
    minPopulation: 20,
    maxPopulation: 120,
    attackDamage: 22,
    attackRange: 1.3,
    noticeRange: 9,
    preyTargets: ['deer', 'rabbit', 'boar', 'ibex'],
    predatorThreats: ['bear', 'troll'],
    loot: { stone: 8, fiber: 10 },
    fearsFire: true,
  },
  croc: {
    species: 'croc',
    name: 'Marsh Crocodile',
    icon: '🐊',
    baseHp: 42,
    // A defensive predator, not a hunter of people: low resting aggression and the `defensive`
    // archetype mean it ignores players entirely — basking, and ambushing only wild prey — until
    // something attacks it. A hit flips `retaliateTimer` on (see `combat.ts`) and for a few
    // seconds it turns and bites back hard before settling again.
    baseTraits: { speed: 1.1, aggression: 0.32, size: 1.35, fertility: 0.8 },
    diet: 'carnivore',
    behavior: 'defensive',
    preferredBiomes: ['wetlands', 'coastal'],
    elevationRange: [1, 5],
    initialSpawnCount: 80,
    minPopulation: 20,
    maxPopulation: 110,
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
    initialSpawnCount: 60,
    minPopulation: 16,
    maxPopulation: 85,
    attackDamage: 44,
    attackRange: 1.7,
    noticeRange: 6,
    preyTargets: ['deer', 'boar', 'wolf', 'ibex'],
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
    initialSpawnCount: 40,
    minPopulation: 12,
    maxPopulation: 55,
    attackDamage: 36,
    attackRange: 2.3,
    noticeRange: 10,
    preyTargets: ['deer', 'wolf', 'bear', 'ibex'],
    predatorThreats: [],
    loot: { wood: 20, stone: 24, fiber: 12 },
    fearsFire: false,
    attacksBuildings: true,
  },
  shade: {
    species: 'shade',
    name: 'Shade',
    icon: '👻',
    baseHp: 5,
    // Aggression pinned at max — a shade never has a "peaceful" reading, unlike wolves/trolls
    // whose hostility ramps with darkness. minPopulation/initialSpawnCount are 0 (below): shades
    // exist only where `missions.ts` conjures them, never from world-gen or evolution.
    baseTraits: { speed: 1.6, aggression: 1.0, size: 0.9, fertility: 0.0 },
    diet: 'carnivore',
    behavior: 'apex',
    preferredBiomes: ['alpine', 'badlands'],
    elevationRange: [0, 24],
    initialSpawnCount: 0,
    minPopulation: 0,
    maxPopulation: 0,
    attackDamage: 14,
    attackRange: 1.2,
    noticeRange: 16,
    preyTargets: [],
    predatorThreats: [],
    loot: { fiber: 3 },
    fearsFire: false,
    attacksBuildings: true,
  },
  orc: {
    species: 'orc',
    name: 'Orc Raider',
    icon: '👺',
    baseHp: 28,
    // Orcs are faster than trolls but far weaker — they make up for low individual threat by
    // charging the player relentlessly. High fixed aggression so they always pursue; no prey
    // targets since their goal is the player, not the ecosystem. Badlands and meadow mid-slopes
    // are their territory — players can't rely on alpine campfires to stay safe from them.
    baseTraits: { speed: 1.9, aggression: 0.92, size: 1.0, fertility: 0.7 },
    diet: 'carnivore',
    behavior: 'apex',
    preferredBiomes: ['badlands', 'meadow', 'taiga'],
    elevationRange: [2, 16],
    initialSpawnCount: 40,
    minPopulation: 10,
    maxPopulation: 60,
    attackDamage: 18,
    attackRange: 1.3,
    noticeRange: 10,
    preyTargets: [],
    predatorThreats: [],
    loot: { stone: 6, fiber: 4 },
    fearsFire: true,
  },
  goblin: {
    species: 'goblin',
    name: 'Goblin',
    icon: '👾',
    baseHp: 8,
    // Goblins are the weakest humanoid — they die in two hits — but are the fastest species in
    // the game and swarm in numbers. About half carry a crude bow (`GOBLIN_BOW_CHANCE`) and will
    // pelt the player from range with inaccurate arrows before closing in. Their low damage means
    // a single arrow is annoying, not fatal, but a volley from three goblins adds up fast.
    // fertility is higher than orcs so a goblin pack replenishes quickly after a fight.
    baseTraits: { speed: 2.1, aggression: 0.88, size: 0.7, fertility: 1.1 },
    diet: 'carnivore',
    behavior: 'apex',
    preferredBiomes: ['meadow', 'wetlands', 'taiga'],
    elevationRange: [2, 14],
    initialSpawnCount: 80,
    minPopulation: 20,
    maxPopulation: 100,
    attackDamage: 6,
    attackRange: 1.1,
    noticeRange: 9,
    preyTargets: [],
    predatorThreats: [],
    loot: { fiber: 3 },
    fearsFire: true,
  },
};

/** AI behavior state. */
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
  /** Smoothed *visible* heading (unit-ish vector), turn-rate-limited in every state — not just
   *  while fleeing, the way `fleeDir` is. The discrete `facing` snaps off this eased vector
   *  rather than the raw per-tick steering direction, so a burst of steering noise (a Boid
   *  shove, a forage target a tile off the last one) no longer spins the sprite through a 90°
   *  flip. `+ - *` only, so it stays safe to feed `facing`, which is sim state. */
  faceDirX: number;
  faceDirY: number;
  /** Seconds remaining to keep fleeing after the last threat was seen, so brief dips out of noticeRange don't flip the state every tick. */
  fleeSpookTimer: number;
  /** Seconds this animal will keep broadcasting alarm to its herd. Set only when it detects a
   *  *real* threat itself (predator, player, fire) — never by catching a herd-mate's alarm. That
   *  asymmetry is what stops two spooked deer re-triggering each other's panic forever: the
   *  herd calms within ~a second of the predator actually leaving. Herding species only. */
  alarmTimer: number;
  /** Seconds a normally player-indifferent `defensive` predator (the crocodile) stays provoked
   *  and will chase and bite the player who attacked it. Set by `executeAttack` /
   *  `stepProjectiles` on a player hit, counted down in `updateOne`. 0 = back to basking and
   *  ignoring players. Unused by every other archetype. */
  retaliateTimer: number;
  /** Whether this goblin carries a bow. Seeded from the creature id at spawn so each individual
   *  is permanently an archer or a melee fighter — not toggling randomly. False for all non-goblin
   *  species so the field costs nothing outside goblin logic. */
  readonly hasBow: boolean;
  /** Seconds until this goblin-archer may fire its next arrow. Counts down in `updateOne` whenever
   *  the goblin is in chase/attack state and a player is in range. When it hits 0 the goblin flags
   *  intent via `wantsToShoot`; `main.ts` reads that flag and calls `launchEnemyArrow`. Using a
   *  flag instead of launching directly inside `updateOne` keeps `creatures.ts` free of any
   *  import from `combat.ts` — the two modules must not cycle (see DAG in `AGENTS.md`). */
  bowCooldown: number;
  /** Set by `updateOne` when a bow-carrying goblin is in range and ready to fire. `main.ts`
   *  reads this once per tick, calls `launchEnemyArrow` if true, then clears it. The shoot target
   *  is whichever player triggered the flag (stored below). */
  wantsToShoot: boolean;
  /** Tile coordinates of the player this goblin wants to shoot. Valid only when `wantsToShoot`
   *  is true; `main.ts` clears `wantsToShoot` after reading these. */
  shootTargetGx: number;
  shootTargetGy: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Ticks between generations. 600 ticks ≈ 10 seconds at 60 Hz. */
export const GENERATION_TICKS = 600;

/** Maximum creatures alive at once across the massive continent. */
export const MAX_CREATURES = 1200;

/** Per-creature spatial-query result caps. A radius query in a dense herd/warren can otherwise
 *  return hundreds of entities, and these loops run once (or twice) per creature per tick. The
 *  hits kept are the first the cell walk reaches, which is good enough for an averaged flee
 *  heading, "some nearby prey", or a crowd-separation push. */
const THREAT_SCAN_CAP = 20;
const PREY_SCAN_CAP = 24;
const BOID_SCAN_CAP = 12;

/** Mutation magnitude per generation (trait drift). */
const MUTATION = 0.08;

/** How fast a fleeing creature's heading turns to face away from a threat, in full-turns/sec equivalent. Lower = smoother but laggier escapes. */
const FLEE_TURN_RATE = 6.0;

/** How fast a creature's smoothed heading (`faceDir`) rotates toward the direction it currently
 *  wants to go, in the same units as `FLEE_TURN_RATE`. Derived from behaviour archetype and
 *  body size rather than stored as an evolving gene: a skittish hare pivots almost instantly, a
 *  lumbering apex bear swings round slowly, and a larger individual of any species carries more
 *  rotational inertia. `/` and comparison only — Tier-A, safe to reach `facing`. */
function headingTurnRate(c: Creature): number {
  const base =
    SPECIES_REGISTRY[c.species].behavior === 'skittish'    ? 11 :
    SPECIES_REGISTRY[c.species].behavior === 'ambush'      ? 8  :
    SPECIES_REGISTRY[c.species].behavior === 'defensive'   ? 6  :
    SPECIES_REGISTRY[c.species].behavior === 'territorial' ? 5  :
    /* apex */                                               4;
  return base / (c.traits.size > 0.6 ? c.traits.size : 0.6);
}

/** Seconds a creature keeps fleeing after its last threat sighting, so brushing the edge of noticeRange doesn't flicker the state. */
const FLEE_SPOOK_DURATION = 0.6;

/** Half-width, in radians, of the fixed per-animal fan added to a flee heading (~46°). Without
 *  it every animal spooked by the same predator computes a near-identical away-vector and the
 *  whole herd sprints off as one clump; with it each animal peels off at its own stable angle,
 *  so a fleeing pack splits into diverging paths. Derived from the creature id (not its RNG
 *  stream), so a given animal always breaks the same way instead of jittering frame to frame,
 *  and never so wide that it turns back toward the threat. */
const FLEE_SCATTER_RADIANS = 0.8;

/** Seconds a herd animal keeps raising the alarm to nearby herd-mates after it last saw a real
 *  threat itself. Slightly longer than `FLEE_SPOOK_DURATION` so the alarm outlives one animal's
 *  own flee window and the panic reliably reaches the rest of the herd, but short enough that
 *  the whole group settles about a second after the predator actually clears out. */
const ALARM_BROADCAST_SECONDS = 1.1;

/** Weight of a herd-mate's alarm in the flee-heading average, in the same units as a real
 *  threat's distance vector — roughly "a predator this many tiles away". Enough to trip the
 *  flee state and turn a startled few into a stampede, not so much that it buries a real,
 *  closer sighting the animal can see for itself. */
const ALARM_CONTAGION_WEIGHT = 4.0;

/** Seconds a provoked `defensive` predator (crocodile) stays locked onto the player who hit it.
 *  Long enough that a single arrow means a real fight, short enough that backing off ends it. */
export const RETALIATE_SECONDS = 7;

/** Fraction of goblins that carry a bow. Seeded per creature from `hash2(id, 0xb0b, 0)` so each
 *  individual's archer status is deterministic and stable across ticks — no random toggling. */
export const GOBLIN_BOW_CHANCE = 0.45;

/** Seconds between goblin arrow shots. Deliberately slow — goblins are bad shots, not machine
 *  guns; the gap lets a player close the distance or dodge before the next volley. */
const GOBLIN_BOW_COOLDOWN = 2.8;

/** Maximum distance in tiles at which a goblin archer will try to shoot. Just inside their
 *  noticeRange so melee goblins and archers both need the same proximity to notice a player. */
const GOBLIN_SHOOT_RANGE = 8.0;

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
  const facing: Creature['facing'] = rng.next() > 0.5 ? 's' : 'e';

  return {
    id,
    species,
    traits,
    gx,
    gy,
    facing,
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
    faceDirX: facing === 'e' ? 1 : 0,
    faceDirY: facing === 's' ? 1 : 0,
    fleeSpookTimer: 0,
    alarmTimer: 0,
    retaliateTimer: 0,
    // Goblin bow — stable per-creature via hash of id, not the RNG stream (which is consumed
    // by trait mutation above). A goblin that rolls under GOBLIN_BOW_CHANCE is an archer for
    // its entire lifetime. Non-goblins always get false — no runtime branching on species needed.
    hasBow: species === 'goblin'
      ? ((hash2(id, 0xb0b, 0) >>> 0) / 4294967296) < GOBLIN_BOW_CHANCE
      : false,
    bowCooldown: 0,
    wantsToShoot: false,
    shootTargetGx: 0,
    shootTargetGy: 0,
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

// ── Per-tick ward-source cache ────────────────────────────────────────────────
//
// Campfires and (after dark) lit towers are the only buildings that ward predators or shelter
// prey — walls, floors, gates and daytime towers never do. Every fire-fearing creature tests
// them each tick, and hunters test them again for every prey candidate and player, so walking
// the whole `buildings` list per creature is pure waste once a player has built a base. Instead
// `updateCreatures` distills the list into this small fixed cache once per tick and `updateOne`
// reads it. Objects are reused across ticks — the array only ever grows.

interface WardSource {
  cx: number;
  cy: number;
  /** Predator flee radius in tiles (explicit per building kind). */
  wardR: number;
  /** Multiplier applied to a caller's base sanctuary radius: 1 for a campfire, 0.7 / 0.85 for a
   *  wood / stone tower. A creature-targeting check inside this radius treats its target as safe. */
  sanctuaryScale: number;
  /** Campfire only — the ward that also singes a creature standing in the flames. */
  isFire: boolean;
}

const WARD_SOURCES: WardSource[] = [];
let wardSourceCount = 0;

/** Refresh `WARD_SOURCES` from the live building list for this tick. */
function rebuildWardSources(buildings: readonly Building[], darkness: number): void {
  wardSourceCount = 0;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0) continue;

    let wardR = 0;
    let sanctuaryScale = 0;
    if (b.kind === 'campfire') {
      wardR = FIRE_WARD_RADIUS;
      sanctuaryScale = 1;
    } else if (darkness > 0.2 && b.kind === 'wood_tower') {
      wardR = 6.0;
      sanctuaryScale = 0.7;
    } else if (darkness > 0.2 && b.kind === 'stone_tower') {
      wardR = 7.5;
      sanctuaryScale = 0.85;
    } else {
      continue;
    }

    let s = WARD_SOURCES[wardSourceCount];
    if (s === undefined) {
      s = { cx: 0, cy: 0, wardR: 0, sanctuaryScale: 0, isFire: false };
      WARD_SOURCES[wardSourceCount] = s;
    }
    s.cx = b.gx + b.w * 0.5;
    s.cy = b.gy + b.d * 0.5;
    s.wardR = wardR;
    s.sanctuaryScale = sanctuaryScale;
    s.isFire = b.kind === 'campfire';
    wardSourceCount++;
  }
}

/** True if (x, y) sits inside any cached ward source's sanctuary, scaled from `baseRadius`. The
 *  cache-backed fast path for the predator-targeting checks in `updateOne`; `isNearActiveFireOrLight`
 *  is the equivalent that walks the raw building list, kept for external callers and the wander
 *  check's custom radius. */
function isInsideWardSanctuary(x: number, y: number, baseRadius: number): boolean {
  for (let wi = 0; wi < wardSourceCount; wi++) {
    const w = WARD_SOURCES[wi];
    if (w === undefined || w.sanctuaryScale <= 0) continue;
    const r = w.sanctuaryScale * baseRadius;
    const dx = x - w.cx;
    const dy = y - w.cy;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

export interface CreatureEvents {
  playerAttacked: boolean;
  roarOccurred: boolean;
  howlOccurred: boolean;
  wardOccurred?: boolean;
  /** True if any goblin-archer fired this tick — lets `main.ts` play the shot audio without
   *  walking the creature list a second time. */
  goblinShotOccurred: boolean;
}

/** A fresh, all-false `CreatureEvents` bag. Call once and reuse it as `updateCreatures`'s
 *  out-parameter — allocating one per tick would put a per-frame allocation back in the
 *  hottest loop in the game. */
export function createCreatureEvents(): CreatureEvents {
  return { playerAttacked: false, roarOccurred: false, howlOccurred: false, wardOccurred: false, goblinShotOccurred: false };
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
  out.goblinShotOccurred = false;

  // 0. Distill campfires / lit towers into the per-tick ward cache (see `WARD_SOURCES`).
  rebuildWardSources(buildings, darkness);

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
  if (c.retaliateTimer > 0) {
    c.retaliateTimer = Math.max(0, c.retaliateTimer - dt);
  }
  if (c.alarmTimer > 0) {
    c.alarmTimer = Math.max(0, c.alarmTimer - dt);
  }
  if (c.bowCooldown > 0) {
    c.bowCooldown = Math.max(0, c.bowCooldown - dt);
  }
  // Goblin archers flag their shoot intent here; main.ts reads the flag and calls launchEnemyArrow
  // once per tick, then clears wantsToShoot. Keeping the launch out of this file preserves the
  // DAG: creatures.ts must not import combat.ts (see AGENTS.md).
  c.wantsToShoot = false;

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
  // True once this animal detects a threat *itself* (fire, player, predator) — as opposed to
  // only catching a herd-mate's alarm. Gates `alarmTimer` so panic doesn't echo around a herd
  // indefinitely (see `ALARM_BROADCAST_SECONDS`).
  let sawRealThreat = false;

  // Fire / Light warding: basic predators (wolves, foxes, etc.) and wild beasts are warded off by
  // campfires and bright beacons. Reads the per-tick `WARD_SOURCES` cache, not the raw building list.
  const fearsFire = def.fearsFire ?? true;
  if (fearsFire) {
    for (let wi = 0; wi < wardSourceCount; wi++) {
      const src = WARD_SOURCES[wi];
      if (src === undefined) continue;
      const wardRadius = src.wardR;
      const dx = src.cx - c.gx;
      const dy = src.cy - c.gy;
      const dSq = dx * dx + dy * dy;
      if (dSq < wardRadius * wardRadius) {
        const d = Math.sqrt(dSq); // Tier A: sqrt is exact per spec — distance to fire, pixels only
        const weight = (wardRadius - d) / wardRadius * 2.5;
        if (d > 0.01) {
          threatDx += (dx / d) * weight;
          threatDy += (dy / d) * weight;
          threatCount++;
          sawRealThreat = true;
        }
        // Immediate singe / burn damage if touching campfire flames directly
        if (src.isFire && d < FIRE_BURN_RADIUS) {
          c.hp -= 15 * dt;
          c.hurtTimer = 0.35;
        }
        events.wardOccurred = true;
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
        sawRealThreat = true;
      }
    }
  }

  // Check predator threats via spatial query (defensive creatures flee only when wounded)
  const shouldCheckPredatorThreats = def.behavior === 'skittish' || (def.behavior === 'defensive' && c.hp < c.maxHp * 0.4);
  // Herd-mates' alarm, accumulated separately from first-hand threats: it's only folded into the
  // flee heading below if this animal saw nothing itself. An animal that *can* see the predator
  // flees from what it sees (plus its own scatter fan) and ignores the peer pressure — otherwise
  // every rabbit in a warren copies the herd-average vector and they clump into one blob instead
  // of splitting up.
  let alarmDx = 0;
  let alarmDy = 0;
  let alarmCount = 0;
  if (shouldCheckPredatorThreats && def.predatorThreats.length > 0) {
    // Cap the scan: the flee heading is an average of threat vectors, so a handful of the
    // nearest predators settles it — no need to walk every animal in a packed warren.
    const nearbyCount = CREATURE_SPATIAL.queryRadius(c.gx, c.gy, noticeRange, THREAT_SCAN_CAP);
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
        sawRealThreat = true;
      } else if (def.herds && other.species === c.species && other.alarmTimer > 0) {
        // A herd-mate that saw a real threat is raising the alarm. `-fleeDir` so this animal
        // would run the same way the alarmed one is running. Gated on `alarmTimer` (set only by
        // a first-hand sighting), so second-hand panic can't loop back and self-sustain.
        alarmDx -= other.fleeDirX;
        alarmDy -= other.fleeDirY;
        alarmCount++;
      }
    }
  }

  // Fold the herd alarm in only for an animal with no threat of its own to run from.
  if (alarmCount > 0 && !sawRealThreat) {
    threatDx += (alarmDx / alarmCount) * ALARM_CONTAGION_WEIGHT;
    threatDy += (alarmDy / alarmCount) * ALARM_CONTAGION_WEIGHT;
    threatCount++;
  }

  // A first-hand threat sighting arms this herd animal as an alarm source for the next second
  // or so; herd-mates read `alarmTimer` above. Only real sightings set it — contagion never
  // does — so the alarm dies out shortly after the threat itself is gone.
  if (sawRealThreat && def.herds) {
    c.alarmTimer = ALARM_BROADCAST_SECONDS;
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
    const threatDist = Math.sqrt(avgThreatDx * avgThreatDx + avgThreatDy * avgThreatDy); // Tier A: sqrt is exact per spec
    if (threatDist > 0.01) {
      const awayX = -avgThreatDx / threatDist;
      const awayY = -avgThreatDy / threatDist;
      // Fan the pack out: rotate this animal's escape heading by a fixed offset unique to it
      // (hashed from its id, so it's stable across ticks) so a fleeing herd diverges instead of
      // clumping into a single sprinting blob. @tier-b — heading rotation, no sim-state hash.
      const scatter = ((hash2(c.id, 0x5ca77e, 0) >>> 0) / 4294967296 - 0.5) * 2 * FLEE_SCATTER_RADIANS;
      const cs = Math.cos(scatter);
      const sn = Math.sin(scatter);
      const rawFleeDx = awayX * cs - awayY * sn;
      const rawFleeDy = awayX * sn + awayY * cs;
      const turn = Math.min(1, FLEE_TURN_RATE * dt);
      c.fleeDirX += (rawFleeDx - c.fleeDirX) * turn;
      c.fleeDirY += (rawFleeDy - c.fleeDirY) * turn;
      const len = Math.sqrt(c.fleeDirX * c.fleeDirX + c.fleeDirY * c.fleeDirY); // Tier A: sqrt is exact per spec
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

    // Check prey creatures via spatial neighborhood query (capped — a predator only needs
    // *a* nearby target, and the first ones the cell walk reaches are already close).
    if (def.preyTargets.length > 0) {
      const nearbyCount = CREATURE_SPATIAL.queryRadius(c.gx, c.gy, bestDist, PREY_SCAN_CAP);
      for (let q = 0; q < nearbyCount; q++) {
        const otherIdx = CREATURE_SPATIAL.queryBuffer[q];
        if (otherIdx === undefined) continue;
        const other = allCreatures[otherIdx];
        if (other === undefined || other.hp <= 0 || other.id === c.id) continue;

        if (def.preyTargets.includes(other.species)) {
          // Prey protected by fire/light sanctuary is ignored
          if (fearsFire && isInsideWardSanctuary(other.gx, other.gy, FIRE_SAFE_ZONE_RADIUS)) {
            continue;
          }
          const dx = other.gx - c.gx;
          const dy = other.gy - c.gy;
          const d = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — hunt distance check, pixels only
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

    // Hostile apex predators and territorial beasts target nearby active players. A `defensive`
    // predator (the crocodile) is deliberately not on that list — it never picks a player as
    // prey — but once provoked (`retaliateTimer`, set on a player hit in `combat.ts`) it hunts
    // the offender for a few seconds within a moderate radius, then goes back to ignoring them.
    const provoked = def.behavior === 'defensive' && c.retaliateTimer > 0;
    if (isCreatureHostile || def.behavior === 'territorial' || provoked) {
      const playerDetectRange = def.behavior === 'territorial' ? 5.5 : provoked ? 7.0 : bestDist;
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p === undefined || p.respawnTimer > 0 || !p.active) continue;
        // A player standing on a tower's lookout platform is out of every ground predator's
        // reach — no animal can climb up after them, so none can target or strike them there.
        if (p.elevationPx > 0) continue;
        // Player protected inside campfire or beacon sanctuary is safe
        if (fearsFire && isInsideWardSanctuary(p.gx, p.gy, FIRE_SAFE_ZONE_RADIUS)) {
          continue;
        }
        const dx = p.gx - c.gx;
        const dy = p.gy - c.gy;
        const d = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — player chase distance, pixels only
        if (d < playerDetectRange && d < bestDist) {
          bestDist = d;
          bestTargetGx = p.gx;
          bestTargetGy = p.gy;
          targetType = 'player';
          targetPlayer = p;
        }
      }

      // Building-siege archetypes (trolls, mission-conjured monsters) target player structures too.
      if (def.attacksBuildings) {
        for (let i = 0; i < buildings.length; i++) {
          const b = buildings[i];
          // A mission's own tower is never a valid siege target — see `isMissionStructure`'s doc
          // comment: without this, a shade spawned beside its conjuring tower would immediately
          // destroy it instead of threatening a player's base.
          if (b === undefined || b.hp <= 0 || isMissionStructure(b.kind)) continue;
          const bx = b.gx + b.w * 0.5;
          const by = b.gy + b.d * 0.5;
          const dx = bx - c.gx;
          const dy = by - c.gy;
          const d = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec
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
      // Goblin-archer special case: if in shoot range and cooled down, flag intent for main.ts
      // to call launchEnemyArrow. The goblin still chases if out of shoot range so it closes in
      // before committing to bow fire. The check happens before the melee-range block so an archer
      // inside melee range still punches (melee path below) rather than trying to shoot at
      // point-blank range, which would look weird and skip the attack animation.
      if (c.species === 'goblin' && c.hasBow && targetType === 'player' && bestDist > def.attackRange && bestDist <= GOBLIN_SHOOT_RANGE && c.bowCooldown <= 0) {
        c.wantsToShoot = true;
        c.shootTargetGx = bestTargetGx;
        c.shootTargetGy = bestTargetGy;
        c.bowCooldown = GOBLIN_BOW_COOLDOWN;
        c.state = 'attack'; // use attack state so the sprite draws the bow-raised pose
        events.goblinShotOccurred = true;
        // Face the player while shooting
        const sdx = bestTargetGx - c.gx;
        const sdy = bestTargetGy - c.gy;
        if (Math.abs(sdx) > Math.abs(sdy)) {
          c.facing = sdx > 0 ? 'e' : 'w';
        } else {
          c.facing = sdy > 0 ? 's' : 'n';
        }
        return;
      }

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
      const dist = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — flora forage distance, pixels only

      if (dist < 0.9) {
        c.state = 'eat';
        c.eatTimer += dt;
        if (c.eatTimer >= 1.8) {
          consumeFloraItem(flora, edible);
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
    let candGx = clamp(Math.round(c.gx + Math.cos(angle) * dist), 8, W - 9); // @tier-b
    let candGy = clamp(Math.round(c.gy + Math.sin(angle) * dist), 8, H - 9); // @tier-b

    // Herd cohesion, waypoint half: a herding animal picking its next wander target biases it
    // toward the centre of the same-species animals around it. The per-tick force in
    // `moveWithSeparation` keeps spacing tidy; this is what actually stops a straggler wandering
    // off for good. The query only runs on a waypoint change (every few seconds per creature),
    // so it's off the hot path.
    if (SPECIES_REGISTRY[c.species].herds === true) {
      const hc = CREATURE_SPATIAL.queryRadius(c.gx, c.gy, 12, 16);
      let hx = 0;
      let hy = 0;
      let hn = 0;
      for (let q = 0; q < hc; q++) {
        const oi = CREATURE_SPATIAL.queryBuffer[q];
        if (oi === undefined) continue;
        const o = allCreatures[oi];
        if (o === undefined || o.hp <= 0 || o.id === c.id || o.species !== c.species) continue;
        hx += o.gx;
        hy += o.gy;
        hn++;
      }
      if (hn > 0) {
        candGx = clamp(Math.round(candGx + (hx / hn - candGx) * 0.5), 8, W - 9);
        candGy = clamp(Math.round(candGy + (hy / hn - candGy) * 0.5), 8, H - 9);
      }
    }

    if (!fearsFire || !isInsideWardSanctuary(candGx, candGy, 4.0)) {
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
  const d = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — movement distance, pixels only
  if (d > 0.01) {
    dx /= d;
    dy /= d;
  }

  // 1. Soft Boid Separation force (accelerated via local spatial query, capped — a dozen of the
  //    closest neighbors is more than enough to push out of a crowd, and this loop runs for
  //    every moving creature every tick). For a herding species that ISN'T currently fleeing the
  //    same neighbor walk also accumulates the centroid of nearby same-species animals, so a
  //    gentle cohesion pull can be applied below — one query does both, and the radius is
  //    widened past the tight separation band so cohesion can see the rest of the herd.
  //
  //    Cohesion is deliberately off during flee: the herd centroid usually sits *between* a
  //    fleeing animal and the threat it's running from, so pulling toward it fights the escape
  //    and, in a packed warren, momentarily swings the movement vector backward — which reads
  //    as the animal jerkily "looking back" mid-sprint. A fleeing herd stays together anyway
  //    because its members all get near-identical threat vectors.
  const cohesion = SPECIES_REGISTRY[c.species].herds === true && c.state !== 'flee';
  let sepX = 0;
  let sepY = 0;
  let cohX = 0;
  let cohY = 0;
  let herdN = 0;
  const nearbyBoids = CREATURE_SPATIAL.queryRadius(c.gx, c.gy, cohesion ? 4.0 : 1.2, BOID_SCAN_CAP);
  for (let q = 0; q < nearbyBoids; q++) {
    const otherIdx = CREATURE_SPATIAL.queryBuffer[q];
    if (otherIdx === undefined) continue;
    const other = allCreatures[otherIdx];
    if (other === undefined || other.id === c.id || other.hp <= 0) continue;
    const ox = c.gx - other.gx;
    const oy = c.gy - other.gy;
    const distSq = ox * ox + oy * oy;
    if (distSq < 1.44 && distSq > 0.0001) {
      const dist = Math.sqrt(distSq); // Tier A: sqrt is exact per spec
      const strength = (1.2 - dist) / 1.2;
      sepX += (ox / dist) * strength * 0.35;
      sepY += (oy / dist) * strength * 0.35;
    }
    if (cohesion && other.species === c.species) {
      cohX += other.gx;
      cohY += other.gy;
      herdN++;
    }
  }

  // 1b. Herd cohesion: steer toward the centroid of nearby herd-mates, but only once this
  //     animal has drifted a couple of tiles clear of it — inside a tight cluster cohesion and
  //     separation would just fight. Gentle relative to the unit target vector it's added to,
  //     so it biases a wander or forage path back toward the group without ever pinning the
  //     animal to a single plant. (Never runs while fleeing — see `cohesion` above.)
  if (herdN > 0) {
    const hx = cohX / herdN - c.gx;
    const hy = cohY / herdN - c.gy;
    const hd = Math.sqrt(hx * hx + hy * hy); // Tier A: sqrt is exact per spec
    if (hd > 1.5) {
      // Ramp with distance: a gentle bias while loosely grouped, firming up to roughly the
      // strength of the target vector itself once an animal is a long way out, so a genuinely
      // separated herd-mate hurries back rather than trickling.
      const pull = Math.min(1.1, (hd - 1.5) * 0.18);
      sepX += (hx / hd) * pull;
      sepY += (hy / hd) * pull;
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
  const moveLen = Math.sqrt(moveX * moveX + moveY * moveY); // Tier A: sqrt is exact per spec
  if (moveLen < 0.01) return;

  const dirX = moveX / moveLen;
  const dirY = moveY / moveLen;

  // 3. Directional Hysteresis: prevent rapid facing oscillation along diagonal movement.
  //    While fleeing, face the smoothed flee heading (`fleeDir`) rather than the actual movement
  //    vector: in a packed warren the separation shove between fleeing animals can briefly point
  //    `dir` back toward the threat, which showed up as a jerky "look back" mid-sprint. `fleeDir`
  //    is already turn-rate-limited and scatter-fanned, so facing off it stays smooth and still
  //    matches the direction the animal is actually escaping.
  // Turn-rate-limit the heading the sprite turns through. `dirX/dirY` is where the creature
  // wants to point *this* tick; `faceDir` eases toward it so steering noise — a separation
  // shove, a forage target a tile off the last one — doesn't spin the sprite, and the discrete
  // `facing` below snaps off the eased vector so it commits through a turn instead of
  // flip-flopping on the raw one. Exponential approach, `+ - *` only (Tier-A). While fleeing,
  // `fleeDir` is *already* turn-rate-limited, so track it directly rather than easing an eased
  // vector. Attack aims `facing` straight at the target elsewhere, so a lunging creature still
  // faces its prey with no lag.
  if (c.state === 'flee' && (c.fleeDirX !== 0 || c.fleeDirY !== 0)) {
    c.faceDirX = c.fleeDirX;
    c.faceDirY = c.fleeDirY;
  } else {
    const turnBlend = Math.min(1, headingTurnRate(c) * dt);
    c.faceDirX += (dirX - c.faceDirX) * turnBlend;
    c.faceDirY += (dirY - c.faceDirY) * turnBlend;
  }
  const faceX = c.faceDirX;
  const faceY = c.faceDirY;
  const isCurrentlyHorizontal = c.facing === 'e' || c.facing === 'w';
  if (isCurrentlyHorizontal) {
    if (Math.abs(faceY) > Math.abs(faceX) * 1.35 && Math.abs(faceY) > 0.15) {
      c.facing = faceY > 0 ? 's' : 'n';
    } else if (Math.abs(faceX) > 0.1) {
      c.facing = faceX > 0 ? 'e' : 'w';
    }
  } else {
    if (Math.abs(faceX) > Math.abs(faceY) * 1.35 && Math.abs(faceX) > 0.15) {
      c.facing = faceX > 0 ? 'e' : 'w';
    } else if (Math.abs(faceY) > 0.1) {
      c.facing = faceY > 0 ? 's' : 'n';
    }
  }

  const step = speed * dt;
  const cycleSpeed =
    c.species === 'troll' || c.species === 'bear' ? 0.6 :
    c.species === 'rabbit' ? 0.45 :
    c.species === 'goblin' ? 1.1 :   // fast scurrying legs
    c.species === 'orc'    ? 0.75 :  // heavy loping stride
    0.9;
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

/**
 * Nudge a creature clear of solid buildings, searching outward in expanding square rings for
 * the nearest open tile. A one-off relocation, not part of the hot 60 Hz path — `main.ts` calls
 * this once per creature right after restoring a save's buildings, because creatures are never
 * persisted (see `storage.ts`): they're re-derived from `worldSeed` alone on every load, at fixed
 * deterministic tiles, *before* that save's buildings are restored on top of them. Without this,
 * a creature whose deterministic spawn tile coincides with a wall the player built last session
 * reappears standing inside that wall on every single load of the save, not just once.
 */
export function relocateClearOfBuildings(c: Creature, buildings: readonly Building[], world: WorldTerrain): void {
  const startX = Math.floor(c.gx);
  const startY = Math.floor(c.gy);
  if (isWalkable(world, startX, startY) && !isTileOccupiedBySolidBuilding(startX, startY, buildings, 'animal')) return;

  const MAX_RADIUS = 12;
  for (let r = 1; r <= MAX_RADIUS; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // only this ring's perimeter
        const gx = startX + dx;
        const gy = startY + dy;
        if (gx < 2 || gy < 2 || gx >= W - 2 || gy >= H - 2) continue;
        if (isWalkable(world, gx, gy) && !isTileOccupiedBySolidBuilding(gx, gy, buildings, 'animal')) {
          c.gx = gx + 0.5;
          c.gy = gy + 0.5;
          return;
        }
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
  buildings: readonly Building[],
): void {
  // Remove dead creatures — single-pass compaction (order-preserving), not a splice per corpse,
  // which is O(n) each and quadratic when a whole lineage dies off between generations.
  let write = 0;
  for (let read = 0; read < creatures.length; read++) {
    const c = creatures[read];
    if (c !== undefined && c.hp > 0) {
      if (write !== read) creatures[write] = c;
      write++;
    }
  }
  creatures.length = write;

  // Live population by species — built up front now, because reproduction below reads it to
  // enforce each species' `maxPopulation` ceiling, and increments it as children are queued.
  const counts: Partial<Record<Species, number>> = {};
  for (let ci = 0; ci < creatures.length; ci++) {
    const c = creatures[ci];
    if (c !== undefined) {
      counts[c.species] = (counts[c.species] ?? 0) + 1;
    }
  }

  // Survivors reproduce: each creature with fertility > 1.0 spawns a child — unless its species
  // is already at `maxPopulation` (which is what stops the fertility-2.2 hare from taking over
  // the whole 1200-slot continent and packing the spatial grid into a hot mess).
  const toAdd: Creature[] = [];
  for (let ci = 0; ci < creatures.length; ci++) {
    const c = creatures[ci];
    if (c === undefined) continue;
    if (creatures.length + toAdd.length >= MAX_CREATURES) break;
    if ((counts[c.species] ?? 0) >= SPECIES_REGISTRY[c.species].maxPopulation) continue;
    if (c.traits.fertility > 1.0 && c.rng.next() < (c.traits.fertility - 1.0) * 0.5) {
      const child = spawnCreature(c.species, c.gx, c.gy, worldSeed, c.traits, c.generation + 1);
      toAdd.push(child);
      counts[c.species] = (counts[c.species] ?? 0) + 1;
    }
  }

  // Replenish species below their population floor, spread uniformly across the world.
  const defs = Object.values(SPECIES_REGISTRY);
  for (let mi = 0; mi < defs.length; mi++) {
    const def = defs[mi];
    if (def === undefined) continue;
    const current = counts[def.species] ?? 0;
    for (let n = current; n < def.minPopulation && creatures.length + toAdd.length < MAX_CREATURES; n++) {
      const rng = createRng(hash2(worldSeed, n + 1, current * 17 + 5));
      const gx = Math.floor(12 + rng.next() * (W - 24));
      const gy = Math.floor(12 + rng.next() * (H - 24));
      // Population-floor replenishment runs continuously during real play, when a player's
      // buildings already exist — without the occupancy check, a species dipping below its
      // floor could materialize a fresh rabbit/wolf/whatever directly inside a walled base. No
      // wall was ever crossed, but from the player's side of it that's indistinguishable from
      // "a creature just walked through my wall."
      if (isWalkable(world, gx, gy) && !isTileOccupiedBySolidBuilding(gx, gy, buildings, 'animal')) {
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



