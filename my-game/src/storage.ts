/**
 * Versioned persistence for Verdant using @latticekit/persist.
 *
 * Saves player inventories, health, active structures, and terrain mutations
 * so players can refresh or resume without losing progress.
 */

import { expectObject, asEpochMillis, type EpochMillis } from '@latticekit/core';
import {
  migrations,
  createStore,
  browserStorage,
  type Store,
  type Recognize,
} from '@latticekit/persist';
import type { Building, BuildingKind } from './buildings.js';
import type { Player } from './players.js';
import type { WeaponKind } from './combat.js';
import {
  extractTerrainDeltas,
  type SavedVertexDelta,
  type SavedSurfaceDelta,
  type WorldTerrain,
} from './world.js';
import {
  extractSavedFlora,
  type SavedFlora,
  type FloraItem,
  type FloraKind,
} from './flora.js';

export interface SavedBuilding {
  readonly kind: BuildingKind;
  readonly gx: number;
  readonly gy: number;
  readonly hp: number;
  readonly maxHp: number;
}

export interface SavedPlayer {
  readonly wood: number;
  readonly stone: number;
  readonly fiber: number;
  readonly hp: number;
  readonly mode: string;
  readonly weapon: WeaponKind;
  readonly craftedWeapons: readonly WeaponKind[];
  readonly gx: number;
  readonly gy: number;
}

export interface VerdantSaveV1 {
  readonly version: 1;
  readonly seed: number;
  readonly p1: SavedPlayer;
  readonly p2: SavedPlayer;
  readonly buildings: readonly SavedBuilding[];
  readonly terrainHeights?: readonly SavedVertexDelta[];
  readonly terrainSurfaces?: readonly SavedSurfaceDelta[];
  readonly flora?: readonly SavedFlora[];
}

function recognizePlayer(v: unknown, label: string, defaultGx: number, defaultGy: number): SavedPlayer {
  const o = expectObject(v, label);
  const wood = typeof o['wood'] === 'number' ? o['wood'] : 0;
  const stone = typeof o['stone'] === 'number' ? o['stone'] : 0;
  const fiber = typeof o['fiber'] === 'number' ? o['fiber'] : 0;
  const hp = typeof o['hp'] === 'number' ? o['hp'] : 100;
  const mode = typeof o['mode'] === 'string' ? o['mode'] : 'move';
  const weapon = (typeof o['weapon'] === 'string' ? o['weapon'] : 'hands') as WeaponKind;
  const rawCrafted = Array.isArray(o['craftedWeapons']) ? (o['craftedWeapons'] as WeaponKind[]) : [];
  const craftedWeapons = rawCrafted.length > 0 ? rawCrafted : (['hands', weapon].filter((w, idx, arr) => arr.indexOf(w) === idx) as WeaponKind[]);
  const gx = typeof o['gx'] === 'number' ? o['gx'] : defaultGx;
  const gy = typeof o['gy'] === 'number' ? o['gy'] : defaultGy;

  return { wood, stone, fiber, hp, mode, weapon, craftedWeapons, gx, gy };
}

function recognizeBuilding(v: unknown, index: number): SavedBuilding {
  const o = expectObject(v, `save.buildings[${index}]`);
  const kind = typeof o['kind'] === 'string' ? (o['kind'] as BuildingKind) : 'wood_wall';
  const gx = typeof o['gx'] === 'number' ? o['gx'] : 0;
  const gy = typeof o['gy'] === 'number' ? o['gy'] : 0;
  const hp = typeof o['hp'] === 'number' ? o['hp'] : 100;
  const maxHp = typeof o['maxHp'] === 'number' ? o['maxHp'] : 100;
  return { kind, gx, gy, hp, maxHp };
}

function recognizeFlora(v: unknown, index: number): SavedFlora {
  const o = expectObject(v, `save.flora[${index}]`);
  const kind = typeof o['kind'] === 'string' ? (o['kind'] as FloraKind) : 'bush';
  const gx = typeof o['gx'] === 'number' ? o['gx'] : 0;
  const gy = typeof o['gy'] === 'number' ? o['gy'] : 0;
  const scale = typeof o['scale'] === 'number' ? o['scale'] : 1.0;
  const subType = typeof o['subType'] === 'number' ? o['subType'] : 0;
  return { kind, gx, gy, scale, subType };
}

function recognizeVertexDelta(v: unknown, index: number): SavedVertexDelta {
  const o = expectObject(v, `save.terrainHeights[${index}]`);
  const x = typeof o['x'] === 'number' ? o['x'] : 0;
  const y = typeof o['y'] === 'number' ? o['y'] : 0;
  const h = typeof o['h'] === 'number' ? o['h'] : 0;
  return { x, y, h };
}

function recognizeSurfaceDelta(v: unknown, index: number): SavedSurfaceDelta {
  const o = expectObject(v, `save.terrainSurfaces[${index}]`);
  const x = typeof o['x'] === 'number' ? o['x'] : 0;
  const y = typeof o['y'] === 'number' ? o['y'] : 0;
  const mat = typeof o['mat'] === 'number' ? o['mat'] : 0;
  return { x, y, mat };
}

export const recognizeVerdantSaveV1: Recognize<VerdantSaveV1> = (value: unknown): VerdantSaveV1 => {
  const o = expectObject(value, 'save.v1');
  const seed = typeof o['seed'] === 'number' ? o['seed'] : 0;
  const p1 = recognizePlayer(o['p1'], 'save.v1.p1', 28, 28);
  const p2 = recognizePlayer(o['p2'], 'save.v1.p2', 36, 36);
  const rawBuildings = Array.isArray(o['buildings']) ? o['buildings'] : [];
  const buildings = rawBuildings.map((b, i) => recognizeBuilding(b, i));

  const rawHeights = Array.isArray(o['terrainHeights']) ? o['terrainHeights'] : [];
  const terrainHeights = rawHeights.map((h, i) => recognizeVertexDelta(h, i));

  const rawSurfaces = Array.isArray(o['terrainSurfaces']) ? o['terrainSurfaces'] : [];
  const terrainSurfaces = rawSurfaces.map((s, i) => recognizeSurfaceDelta(s, i));

  const rawFlora = Array.isArray(o['flora']) ? o['flora'] : undefined;
  const flora = rawFlora ? rawFlora.map((f, i) => recognizeFlora(f, i)) : undefined;

  return {
    version: 1,
    seed,
    p1,
    p2,
    buildings,
    terrainHeights,
    terrainSurfaces,
    ...(flora ? { flora } : {}),
  };
};

export const VERDANT_MIGRATIONS = migrations(1, recognizeVerdantSaveV1).seal();

export type VerdantStore = Store<VerdantSaveV1>;

/** Initialize the persistent store. */
export function createVerdantStore(seed: number, defaultSave: () => VerdantSaveV1): VerdantStore {
  return createStore<1, VerdantSaveV1>({
    key: `verdant-save-${seed}`,
    chain: VERDANT_MIGRATIONS,
    adapter: browserStorage(),
    fresh: defaultSave,
    now: () => asEpochMillis(Date.now(), 'createVerdantStore'),
  });
}

/** Serialize current live game state to save payload. */
export function extractSaveState(
  seed: number,
  players: readonly [Player, Player],
  buildings: readonly Building[],
  world?: WorldTerrain,
  flora?: readonly FloraItem[],
): VerdantSaveV1 {
  const [p1, p2] = players;
  const terrain = world ? extractTerrainDeltas(world) : undefined;
  const savedFlora = flora ? extractSavedFlora(flora) : undefined;

  return {
    version: 1,
    seed,
    p1: {
      wood: p1.inventory.wood,
      stone: p1.inventory.stone,
      fiber: p1.inventory.fiber,
      hp: p1.hp,
      mode: p1.mode,
      weapon: p1.weapon,
      craftedWeapons: [...p1.craftedWeapons],
      gx: p1.gx,
      gy: p1.gy,
    },
    p2: {
      wood: p2.inventory.wood,
      stone: p2.inventory.stone,
      fiber: p2.inventory.fiber,
      hp: p2.hp,
      mode: p2.mode,
      weapon: p2.weapon,
      craftedWeapons: [...p2.craftedWeapons],
      gx: p2.gx,
      gy: p2.gy,
    },
    buildings: buildings.filter((b) => b.hp > 0).map((b) => ({
      kind: b.kind,
      gx: b.gx,
      gy: b.gy,
      hp: b.hp,
      maxHp: b.maxHp,
    })),
    terrainHeights: terrain ? terrain.heights : [],
    terrainSurfaces: terrain ? terrain.surfaces : [],
    ...(savedFlora ? { flora: savedFlora } : {}),
  };
}
