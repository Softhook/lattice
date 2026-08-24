/**
 * Player state, inventory, movement, and actions.
 *
 * Two players, each with tile position, facing, action mode, HP, and Inventory.
 * Movement is continuous at fixed speed, blocked by water and solid buildings (walls, towers).
 * Actions (harvest, build, dig) fire at the tile the player is currently facing.
 *
 * Chopping trees and mining rocks adds Wood and Stone to inventory.
 * Placing buildings consumes Wood and Stone according to building costs.
 */

import { clamp } from '@latticekit/core';
import type { WorldTerrain } from './world.js';
import { dig, raise, isWalkable, W, H } from './world.js';
import type { Building, BuildingKind } from './buildings.js';
import { placeBuilding, isTileOccupiedBySolidBuilding, BUILDING_COSTS } from './buildings.js';
import type { FloraItem } from './flora.js';
import { harvestFloraAt } from './flora.js';
import type { WeaponKind } from './combat.js';
import { WEAPONS, CRAFTABLE_WEAPONS } from './combat.js';

// ── Player state ───────────────────────────────────────────────────────────────

export type Facing = 'n' | 's' | 'e' | 'w';

export type PlayerMode = 'move' | BuildingKind;

export interface Inventory {
  wood: number;
  stone: number;
  fiber: number;
}

export interface Player {
  readonly index: 0 | 1;
  /** Current tile position (non-integer while walking). */
  gx: number;
  gy: number;
  /** Which grid direction the player is facing. Affects action target tile. */
  facing: Facing;
  /** Current active tool/mode. Defaults to 'move'. */
  mode: PlayerMode;
  /** What to build when pressing build action key. */
  buildKind: BuildingKind;
  /** Currently equipped weapon for attacks. */
  weapon: WeaponKind;
  /** List of weapons already unlocked/crafted. */
  craftedWeapons: WeaponKind[];
  /** Seconds remaining before next attack is ready. */
  attackCooldown: number;
  /** Resource inventory: wood, stone, fiber. */
  inventory: Inventory;
  /** Hit points. 0 → player is knocked down (respawns after 3 s). */
  hp: number;
  /** Seconds remaining before HP regen resumes. Set on taking damage. */
  combatCooldown: number;
  /** Seconds remaining for red damage flash indicator. */
  hurtFlash: number;
  /** Respawn timer in seconds. > 0 means knocked down. */
  respawnTimer: number;
  /** Accumulated movement distance for footstep sound cadence. */
  moveAccum: number;
  /** Floating action notification string. */
  lastActionMsg: string;
  /** Message display timer in seconds. */
  msgTimer: number;
}

/** Tiles per second at normal walk speed. */
const WALK_SPEED = 3.2;

/** Max player HP. */
const MAX_HP = 100;

/** HP regen rate per second when out of combat. */
const REGEN_RATE = 4;

/** Seconds before respawn after reaching 0 HP. */
const RESPAWN_TIME = 3;

export const PLAYER_MODES: readonly PlayerMode[] = [
  'move',
  'wood_wall',
  'stone_wall',
  'wood_tower',
  'stone_tower',
  'floor',
];

export const BUILD_KINDS: readonly BuildingKind[] = [
  'wood_wall',
  'stone_wall',
  'wood_tower',
  'stone_tower',
  'floor',
];

// ── Factory ────────────────────────────────────────────────────────────────────

/** Default spawn positions for 200x200 world: player 1 top-left, player 2 top-right. */
export function createPlayers(): [Player, Player] {
  return [
    makePlayer(0, 40, 40),
    makePlayer(1, 160, 40),
  ];
}

function makePlayer(index: 0 | 1, gx: number, gy: number): Player {
  return {
    index,
    gx,
    gy,
    facing: 's',
    mode: 'move',
    buildKind: 'wood_wall',
    weapon: 'hands',
    craftedWeapons: ['hands'],
    attackCooldown: 0,
    inventory: {
      wood: 12,
      stone: 8,
      fiber: 4,
    },
    hp: MAX_HP,
    combatCooldown: 0,
    hurtFlash: 0,
    respawnTimer: 0,
    moveAccum: 0,
    lastActionMsg: '',
    msgTimer: 0,
  };
}

// ── Weapon Crafting & Equipment ────────────────────────────────────────────────

export function canAffordWeapon(player: Player, kind: WeaponKind): boolean {
  const cost = WEAPONS[kind].cost;
  return (
    player.inventory.wood >= cost.wood &&
    player.inventory.stone >= cost.stone &&
    player.inventory.fiber >= cost.fiber
  );
}

export function craftWeapon(player: Player, kind: WeaponKind): boolean {
  if (player.respawnTimer > 0) return false;
  if (player.craftedWeapons.includes(kind)) {
    player.weapon = kind;
    player.lastActionMsg = `EQUIPPED ${WEAPONS[kind].name.toUpperCase()}`;
    player.msgTimer = 2.0;
    return true;
  }
  const def = WEAPONS[kind];
  if (!canAffordWeapon(player, kind)) {
    player.lastActionMsg = `NEED ${def.cost.wood}W ${def.cost.stone}S ${def.cost.fiber}F`;
    player.msgTimer = 2.5;
    return false;
  }
  player.inventory.wood -= def.cost.wood;
  player.inventory.stone -= def.cost.stone;
  player.inventory.fiber -= def.cost.fiber;
  player.craftedWeapons.push(kind);
  player.weapon = kind;
  player.lastActionMsg = `CRAFTED ${def.name.toUpperCase()}!`;
  player.msgTimer = 2.5;
  return true;
}

export function craftNextAvailable(player: Player): { crafted: boolean; kind?: WeaponKind } {
  for (const k of CRAFTABLE_WEAPONS) {
    if (!player.craftedWeapons.includes(k)) {
      const ok = craftWeapon(player, k);
      return { crafted: ok, kind: k };
    }
  }
  // All crafted — cycle equipped
  cycleWeapon(player);
  return { crafted: false };
}

export function cycleWeapon(player: Player): WeaponKind {
  const currentIdx = player.craftedWeapons.indexOf(player.weapon);
  const nextIdx = (currentIdx + 1) % player.craftedWeapons.length;
  player.weapon = player.craftedWeapons[nextIdx] ?? 'hands';
  player.lastActionMsg = `EQUIPPED ${WEAPONS[player.weapon].name.toUpperCase()}`;
  player.msgTimer = 1.8;
  return player.weapon;
}

// ── Affordability Check ────────────────────────────────────────────────────────

/** Returns true if player has enough materials for the specified building kind. */
export function canAffordBuilding(player: Player, kind: BuildingKind): boolean {
  const cost = BUILDING_COSTS[kind];
  if (cost === undefined) return false;
  return (
    player.inventory.wood >= cost.wood &&
    player.inventory.stone >= cost.stone &&
    (cost.fiber === undefined || player.inventory.fiber >= cost.fiber)
  );
}

// ── Movement ───────────────────────────────────────────────────────────────────

export interface MoveResult {
  stepped: boolean;
  footstep: boolean;
}

/**
 * Move a player by (dx, dy) grid directions this tick.
 * Returns true if footstep trigger fired.
 */
export function movePlayer(
  player: Player,
  dx: number,
  dy: number,
  world: WorldTerrain,
  buildings: readonly Building[],
  dt: number,
): boolean {
  if (player.respawnTimer > 0) return false;
  if (dx === 0 && dy === 0) return false;

  // Update facing from movement direction
  if      (dy < 0) player.facing = 'n';
  else if (dy > 0) player.facing = 's';
  else if (dx < 0) player.facing = 'w';
  else             player.facing = 'e';

  const speed  = WALK_SPEED * dt;
  const mag    = dx !== 0 && dy !== 0 ? 0.7071 : 1; // diagonal normalisation
  const nx     = player.gx + dx * speed * mag;
  const ny     = player.gy + dy * speed * mag;

  // Check walkability and solid building obstacles for the destination tile
  const tileX  = clamp(Math.floor(nx), 0, W - 1);
  const tileY  = clamp(Math.floor(ny), 0, H - 1);

  if (isWalkable(world, tileX, tileY) && !isTileOccupiedBySolidBuilding(tileX, tileY, buildings)) {
    player.gx = clamp(nx, 0, W - 1);
    player.gy = clamp(ny, 0, H - 1);

    player.moveAccum += speed * mag;
    if (player.moveAccum >= 0.85) {
      player.moveAccum = 0;
      return true; // Footstep sound trigger
    }
  }

  return false;
}

// ── Actions ────────────────────────────────────────────────────────────────────

/** The tile the player is facing — where their action lands. */
export function facingTile(player: Player): { gx: number; gy: number } {
  const gx = Math.floor(player.gx);
  const gy = Math.floor(player.gy);
  switch (player.facing) {
    case 'n': return { gx, gy: Math.max(0, gy - 1) };
    case 's': return { gx, gy: Math.min(H - 1, gy + 1) };
    case 'e': return { gx: Math.min(W - 1, gx + 1), gy };
    case 'w': return { gx: Math.max(0, gx - 1), gy };
  }
}

/** Build the currently selected structure at the player's facing tile if affordable. */
export function buildAtFacing(
  player: Player,
  world: WorldTerrain,
  buildings: Building[],
): Building | undefined {
  if (player.respawnTimer > 0 || player.mode === 'move') return undefined;
  const kind = player.mode;
  const cost = BUILDING_COSTS[kind];

  if (!canAffordBuilding(player, kind)) {
    player.lastActionMsg = `NEED ${cost.wood}W ${cost.stone}S (HAVE: ${player.inventory.wood}W ${player.inventory.stone}S)`;
    player.msgTimer = 2.5;
    return undefined;
  }

  const { gx, gy } = facingTile(player);
  const placed = placeBuilding(kind, gx, gy, world, buildings);

  if (placed !== undefined) {
    // Deduct materials
    player.inventory.wood -= cost.wood;
    player.inventory.stone -= cost.stone;
    if (cost.fiber !== undefined) player.inventory.fiber -= cost.fiber;

    player.lastActionMsg = `BUILT ${kind.replace('_', ' ').toUpperCase()}`;
    player.msgTimer = 2.0;
  }

  return placed;
}

export type InteractType = 'chop' | 'mine' | 'forage' | 'repair' | 'none';

export interface InteractResult {
  type: InteractType;
  label: string;
}

/**
 * Interact / Harvest / Mine / Repair at the player's facing tile.
 *
 * - Chops down trees (yields Wood)
 * - Mines boulders (yields Stone)
 * - Gathers bushes & flowers (yields Wood / Fiber)
 * - Repairs damaged buildings
 */
export function interactAtFacing(
  player: Player,
  world: WorldTerrain,
  flora: FloraItem[],
  buildings: Building[],
): InteractResult {
  if (player.respawnTimer > 0) return { type: 'none', label: '' };
  const { gx, gy } = facingTile(player);

  // 1. Check for flora at the facing tile to harvest
  const harvest = harvestFloraAt(flora, gx, gy);
  if (harvest !== undefined) {
    player.hurtFlash = 0.12;
    player.inventory.wood += harvest.wood;
    player.inventory.stone += harvest.stone;
    player.inventory.fiber += harvest.fiber;

    player.lastActionMsg = harvest.label;
    player.msgTimer = 2.2;

    const kind = harvest.item.kind;
    const soundType: InteractType =
      kind === 'pine' || kind === 'oak' ? 'chop' :
      kind === 'rock' ? 'mine' : 'forage';

    return { type: soundType, label: harvest.label };
  }

  // 2. Check if facing a building (can repair building if damaged)
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0) continue;
    if (gx >= b.gx && gx < b.gx + b.w && gy >= b.gy && gy < b.gy + b.d) {
      if (b.hp < b.maxHp) {
        if (player.inventory.wood > 0 || player.inventory.stone > 0) {
          if (b.kind.includes('stone') && player.inventory.stone > 0) {
            player.inventory.stone -= 1;
          } else if (player.inventory.wood > 0) {
            player.inventory.wood -= 1;
          }
          b.hp = Math.min(b.maxHp, b.hp + 40);
          player.hurtFlash = 0.1;
          const msg = `REPAIRED ${b.kind.replace('_', ' ').toUpperCase()} (+40 HP)`;
          player.lastActionMsg = msg;
          player.msgTimer = 2.0;
          return { type: 'repair', label: msg };
        }
      }
      const statusMsg = `${b.kind.replace('_', ' ').toUpperCase()} (HP: ${Math.round(b.hp)}/${b.maxHp})`;
      player.lastActionMsg = statusMsg;
      player.msgTimer = 1.5;
      return { type: 'none', label: statusMsg };
    }
  }

  return { type: 'none', label: '' };
}

/** Dig (lower ground) at the player's facing tile. */
export function digAtFacing(player: Player, world: WorldTerrain): boolean {
  if (player.respawnTimer > 0) return false;
  const { gx, gy } = facingTile(player);
  return dig(world, gx, gy);
}

/** Raise (mound ground) at the player's facing tile. */
export function raiseAtFacing(player: Player, world: WorldTerrain): boolean {
  if (player.respawnTimer > 0) return false;
  const { gx, gy } = facingTile(player);
  return raise(world, gx, gy);
}

/** Cycle through player modes: move -> wood_wall -> stone_wall -> wood_tower -> stone_tower -> floor -> move. */
export function cycleBuildKind(player: Player): PlayerMode {
  const idx = PLAYER_MODES.indexOf(player.mode);
  const nextMode = PLAYER_MODES[(idx + 1) % PLAYER_MODES.length] as PlayerMode;
  player.mode = nextMode;
  if (nextMode !== 'move') {
    player.buildKind = nextMode;
  }
  return player.mode;
}

// ── HP and respawn ─────────────────────────────────────────────────────────────

/** Update HP regen, damage flash, message timer, and respawn timer. Returns true if player just respawned. */
export function tickPlayer(player: Player, dt: number): boolean {
  if (player.attackCooldown > 0) {
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
  }
  if (player.msgTimer > 0) {
    player.msgTimer = Math.max(0, player.msgTimer - dt);
    if (player.msgTimer === 0) player.lastActionMsg = '';
  }
  if (player.hurtFlash > 0) {
    player.hurtFlash = Math.max(0, player.hurtFlash - dt);
  }
  if (player.respawnTimer > 0) {
    player.respawnTimer -= dt;
    if (player.respawnTimer <= 0) {
      player.hp = MAX_HP;
      player.respawnTimer = 0;
      player.combatCooldown = 0;
      player.hurtFlash = 0;
      return true; // Respawned!
    }
    return false;
  }
  if (player.combatCooldown > 0) {
    player.combatCooldown = Math.max(0, player.combatCooldown - dt);
  } else if (player.hp < MAX_HP) {
    player.hp = Math.min(MAX_HP, player.hp + REGEN_RATE * dt);
  }
  return false;
}

/** Apply incoming damage. Triggers respawn if HP reaches 0. */
export function damagePlayer(player: Player, amount: number): void {
  if (player.respawnTimer > 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.combatCooldown = 3.0;
  player.hurtFlash = 0.35;
  if (player.hp <= 0) {
    player.hp = 0;
    player.respawnTimer = RESPAWN_TIME;
  }
}

export { MAX_HP };
