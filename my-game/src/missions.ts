/**
 * Missions: expandable scripted encounters — enemy structures a player discovers, which
 * announce themselves and spawn hostile creatures until destroyed.
 *
 * Deliberately built on top of the two substrates the game already has rather than a parallel
 * "enemy" system: a mission's structure is a `Building` (so it gets depth-sorted rendering, HP,
 * destruction, and player-blocking collision for free — see the note on `wizard_tower` in
 * `buildings.ts`), and its monsters are ordinary `Creature`s of a hostile `Species` (so they get
 * the full chase/attack/siege AI in `creatures.ts`, melee/ranged hit detection in `combat.ts`,
 * and depth-sorted rendering in `render.ts` for free too). This module only owns *when* those
 * things appear: site selection, the trigger, the announcement, and the spawn cadence.
 *
 * To add a new mission: add a `MissionKind`, a `MissionDefinition` in `MISSION_REGISTRY`, a
 * matching `BuildingKind` (its structure) and `Species` (its monster), and nothing else in this
 * file needs to change — `updateMissions` is written entirely against the registry.
 *
 * Mission *sites* are deterministic from the world seed (same `placeMissionSites` call every
 * load), so only a mission's `state` needs to survive a save — see `extractSavedMissions` /
 * `restoreMissions` and the `missions` field on `VerdantSaveV1` in `storage.ts`.
 */

import { createRng, hash2 } from '@latticekit/core';
import type { WorldTerrain, BiomeKind } from './world.js';
import { W, H, isWalkable, getBiomeAt } from './world.js';
import type { Building, BuildingKind } from './buildings.js';
import { restoreBuilding, hpFor } from './buildings.js';
import type { Creature, Species } from './creatures.js';
import { spawnCreature } from './creatures.js';
import type { Player } from './players.js';

// ── Declarative Registry ─────────────────────────────────────────────────────

export type MissionKind = 'wizard_tower';

export type MissionState = 'dormant' | 'announced' | 'active' | 'complete';

export interface MissionDefinition {
  readonly kind: MissionKind;
  readonly name: string;
  /** `BuildingKind` raised at the mission site once triggered. */
  readonly towerKind: BuildingKind;
  /** `Species` spawned periodically while the mission is active. */
  readonly monsterSpecies: Species;
  /** Banner text shown the moment a player triggers the mission. */
  readonly announceText: string;
  readonly announceSubtext: string;
  /** Tile radius from the site center that triggers discovery. */
  readonly triggerRadius: number;
  /** Seconds the announcement banner stays on screen. */
  readonly announceSeconds: number;
  /** Live monster cap — spawning pauses at this count. */
  readonly maxActiveMonsters: number;
  readonly spawnIntervalSec: number;
  readonly spawnBatch: number;
  /** Tiles from the site center that a spawned batch scatters across. */
  readonly spawnRadius: number;
  /** Biomes the site-selection search accepts — thematic (a wizard's tower on a foreboding
   *  peak or mesa), not a gameplay requirement. */
  readonly preferredBiomes: readonly BiomeKind[];
}

export const MISSION_REGISTRY: Record<MissionKind, MissionDefinition> = {
  wizard_tower: {
    kind: 'wizard_tower',
    name: 'The Wizard Tower',
    towerKind: 'wizard_tower',
    monsterSpecies: 'shade',
    announceText: 'A WIZARD TOWER HAS BEEN DISCOVERED',
    announceSubtext: 'Shades pour from its crown — destroy the tower to stop them',
    triggerRadius: 26,
    announceSeconds: 5,
    maxActiveMonsters: 6,
    spawnIntervalSec: 9,
    spawnBatch: 2,
    spawnRadius: 3.5,
    preferredBiomes: ['alpine', 'badlands'],
  },
};

// ── State ──────────────────────────────────────────────────────────────────────

export interface Mission {
  readonly id: number;
  readonly kind: MissionKind;
  /** Site center — the tower's footprint corner, matching what `restoreBuilding` is given. */
  readonly gx: number;
  readonly gy: number;
  state: MissionState;
  /** id of the raised tower `Building`, once one exists; -1 until then. Buildings mint fresh
   *  ids every session (see `buildings.ts`'s `nextId`), so this is never itself persisted —
   *  `restoreMissions` re-links it by kind+position against the already-restored buildings. */
  towerBuildingId: number;
  announceTimer: number;
  spawnTimer: number;
  /** ids of currently-tracked live monsters, pruned as they die — bounds `maxActiveMonsters`. */
  readonly monsterIds: number[];
}

export interface MissionEvents {
  /** The mission that just transitioned dormant → announced this tick, or undefined. */
  announced: Mission | undefined;
  /** The mission that just transitioned → complete this tick, or undefined. */
  completed: Mission | undefined;
}

/** A fresh, all-undefined `MissionEvents` bag — call once and reuse as `updateMissions`'s
 *  out-parameter, same convention as `creatures.ts`'s `createCreatureEvents`. */
export function createMissionEvents(): MissionEvents {
  return { announced: undefined, completed: undefined };
}

let nextMissionId = 1;
/** Salts each spawned batch's seed so consecutive spawn waves (which share `mission.id`) don't
 *  scatter identically. Session-local like every other `nextId` counter in this codebase —
 *  monsters are never persisted, so it doesn't need to survive a reload. */
let spawnCounter = 1;

// ── Site selection ────────────────────────────────────────────────────────────

/** Player spawn points sit near the world's northwest corner (see `createPlayers`); mission
 *  sites are searched for well outside that box so a tower is always something a player
 *  travels to discover, never something sitting on top of their base. */
const SPAWN_EXCLUSION = 90;

/**
 * Choose one deterministic site per registered mission kind, searched from the world seed so
 * every load of the same world places the same tower in the same spot. A kind that can't find a
 * suitable site within its search budget simply doesn't spawn this world — quietly skipped
 * rather than falling back to an unsuitable tile.
 */
export function placeMissionSites(worldSeed: number, world: WorldTerrain): Mission[] {
  const missions: Mission[] = [];
  const defs = Object.values(MISSION_REGISTRY);

  for (let k = 0; k < defs.length; k++) {
    const def = defs[k];
    if (def === undefined) continue;
    const rng = createRng(hash2(worldSeed, 0xf00d, k));
    let gx = -1;
    let gy = -1;
    let attempts = 4000;

    while (attempts-- > 0) {
      const cx = Math.floor(20 + rng.next() * (W - 40));
      const cy = Math.floor(20 + rng.next() * (H - 40));
      if (cx < SPAWN_EXCLUSION && cy < SPAWN_EXCLUSION) continue;
      if (!isWalkable(world, cx, cy) || !isWalkable(world, cx + 1, cy) ||
          !isWalkable(world, cx, cy + 1) || !isWalkable(world, cx + 1, cy + 1)) continue;

      const h = world.heights.get(cx, cy);
      const biome = getBiomeAt(cx, cy, worldSeed, h);
      if (!def.preferredBiomes.includes(biome.kind)) continue;

      gx = cx;
      gy = cy;
      break;
    }

    if (gx < 0) continue;
    missions.push({
      id: nextMissionId++,
      kind: def.kind,
      gx,
      gy,
      state: 'dormant',
      towerBuildingId: -1,
      announceTimer: 0,
      spawnTimer: 0,
      monsterIds: [],
    });
  }

  return missions;
}

// ── Persistence ────────────────────────────────────────────────────────────────

export interface SavedMission {
  readonly kind: MissionKind;
  readonly state: MissionState;
}

/** Serialize mission progress. Site coordinates aren't included — they're re-derived
 *  deterministically by `placeMissionSites` from the world seed on every load. */
export function extractSavedMissions(missions: readonly Mission[]): SavedMission[] {
  return missions.map((m) => ({ kind: m.kind, state: m.state }));
}

/**
 * Apply saved mission progress onto a freshly-placed `missions` array (from
 * `placeMissionSites`), re-linking each restored 'active' mission to its already-restored tower
 * `Building` by kind + position. A saved 'announced' mission resumes as 'active' outright rather
 * than replaying its announcement banner — that already played once this playthrough.
 *
 * If a mission's tower can't be found among the restored buildings (save edited by hand, or a
 * player finished demolishing it in the same session as the last autosave), the mission is
 * demoted to 'dormant' so it can trigger cleanly again rather than getting stuck active with no
 * tower to destroy.
 */
export function restoreMissions(missions: Mission[], saved: readonly SavedMission[], buildings: readonly Building[]): void {
  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    if (m === undefined) continue;
    const s = saved.find((entry) => entry.kind === m.kind);
    if (s === undefined) continue;

    if (s.state === 'dormant' || s.state === 'complete') {
      m.state = s.state;
      continue;
    }

    const def = MISSION_REGISTRY[m.kind];
    const tower = buildings.find((b) => b.kind === def.towerKind && b.gx === m.gx && b.gy === m.gy && b.hp > 0);
    if (tower === undefined) {
      m.state = 'dormant';
      continue;
    }
    m.state = 'active';
    m.towerBuildingId = tower.id;
  }
}

// ── Update ─────────────────────────────────────────────────────────────────────

function findBuildingById(buildings: readonly Building[], id: number): Building | undefined {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b !== undefined && b.id === id) return b;
  }
  return undefined;
}

function findCreatureById(creatures: readonly Creature[], id: number): Creature | undefined {
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c !== undefined && c.id === id) return c;
  }
  return undefined;
}

/**
 * Advance every mission by one tick: checks the dormant → announced trigger, counts down the
 * announcement, and — while active — keeps its monster population topped up until its tower's
 * hp reaches 0. `creatures` and `buildings` are mutated in place (new monsters pushed, dead ones
 * pruned from tracking); `out` is cleared and written like `creatures.ts`'s `CreatureEvents` so
 * this allocates nothing per tick beyond the rare new-monster spawn.
 */
export function updateMissions(
  missions: Mission[],
  players: readonly [Player, Player],
  creatures: Creature[],
  buildings: Building[],
  world: WorldTerrain,
  worldSeed: number,
  dt: number,
  out: MissionEvents,
): void {
  out.announced = undefined;
  out.completed = undefined;

  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    if (m === undefined) continue;
    const def = MISSION_REGISTRY[m.kind];

    if (m.state === 'dormant') {
      const cx = m.gx + 1;
      const cy = m.gy + 1;
      let triggered = false;
      for (let pi = 0; pi < players.length; pi++) {
        const p = players[pi];
        if (p === undefined || !p.active || p.respawnTimer > 0) continue;
        const dx = p.gx - cx;
        const dy = p.gy - cy;
        if (dx * dx + dy * dy < def.triggerRadius * def.triggerRadius) { triggered = true; break; }
      }
      if (!triggered) continue;

      const maxHp = hpFor(def.towerKind);
      const tower = restoreBuilding(def.towerKind, m.gx, m.gy, maxHp, maxHp, world);
      buildings.push(tower);
      m.towerBuildingId = tower.id;
      m.state = 'announced';
      m.announceTimer = def.announceSeconds;
      out.announced = m;
      continue;
    }

    if (m.state === 'announced') {
      m.announceTimer -= dt;
      if (m.announceTimer <= 0) {
        m.state = 'active';
        m.spawnTimer = 0; // spawn the first wave immediately on activation
      }
      continue;
    }

    if (m.state === 'active') {
      const tower = findBuildingById(buildings, m.towerBuildingId);
      if (tower === undefined || tower.hp <= 0) {
        m.state = 'complete';
        m.monsterIds.length = 0;
        out.completed = m;
        continue;
      }

      let alive = 0;
      for (let j = m.monsterIds.length - 1; j >= 0; j--) {
        const id = m.monsterIds[j];
        if (id === undefined) continue;
        const c = findCreatureById(creatures, id);
        if (c === undefined || c.hp <= 0) {
          m.monsterIds.splice(j, 1);
        } else {
          alive++;
        }
      }

      if (alive >= def.maxActiveMonsters) continue;

      m.spawnTimer -= dt;
      if (m.spawnTimer > 0) continue;
      m.spawnTimer = def.spawnIntervalSec;

      const batch = Math.min(def.spawnBatch, def.maxActiveMonsters - alive);
      const cx = m.gx + 1;
      const cy = m.gy + 1;
      for (let b = 0; b < batch; b++) {
        const rng = createRng(hash2(worldSeed, m.id * 7919 + spawnCounter, b));
        spawnCounter++;
        const angle = rng.next() * 6.28318; // @tier-b — spawn scatter angle, pixels only
        // 2.2 tiles clears the tower's own 2x2 footprint (half-diagonal ~1.41) with margin, so a
        // freshly spawned monster never starts inside blocked ground it can't path out of.
        const dist = 2.2 + rng.next() * def.spawnRadius;
        const sx = Math.min(W - 3, Math.max(2, cx + Math.cos(angle) * dist)); // @tier-b
        const sy = Math.min(H - 3, Math.max(2, cy + Math.sin(angle) * dist)); // @tier-b
        const monster = spawnCreature(def.monsterSpecies, sx, sy, worldSeed);
        creatures.push(monster);
        m.monsterIds.push(monster.id);
      }
    }
  }
}
