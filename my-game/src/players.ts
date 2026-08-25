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
import { heightAt } from '@latticekit/iso';
import { hex, type Rgba } from '@latticekit/draw';
import type { WorldTerrain } from './world.js';
import { dig, raise, isWalkable, W, H } from './world.js';
import type { Building, BuildingKind } from './buildings.js';
import { placeBuilding, isTileOccupiedBySolidBuilding, BUILDING_COSTS, BUILDING_REGISTRY } from './buildings.js';
import type { FloraItem } from './flora.js';
import { harvestFloraAt, FLORA_REGISTRY } from './flora.js';
import type { WeaponKind } from './combat.js';
import { WEAPONS, CRAFTABLE_WEAPONS } from './combat.js';
import type { Creature } from './creatures.js';

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
  /** Current smoothed velocity vector for tactile physics momentum. */
  vx: number;
  vy: number;
  /** Smoothed visual cursor tile position (eliminates jitter on rapid turns). */
  cursorGx: number;
  cursorGy: number;
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
  /** Walk animation phase [0, 1) for continuous leg swing. */
  walkCycle: number;
  /** Whether the player was moving this tick. */
  isMoving: boolean;
  /** Floating action notification string. */
  lastActionMsg: string;
  /** Message display timer in seconds. */
  msgTimer: number;
}

/** Max tiles per second at normal walk speed. */
const MAX_WALK_SPEED = 3.3;

/** Acceleration rate in tiles/sec^2 for smooth movement weight. */
const ACCEL = 22.0;

/** Deceleration/friction rate when releasing keys. */
const FRICTION = 16.0;

/** Max player HP. */
const MAX_HP = 100;

/** HP regen rate per second when out of combat. */
const REGEN_RATE = 4;

/** Seconds before respawn after reaching 0 HP. */
const RESPAWN_TIME = 3;

export const PLAYER_MODES: readonly PlayerMode[] = [
  'move',
  'campfire',
  'wood_wall',
  'stone_wall',
  'wood_tower',
  'stone_tower',
  'floor',
];

export const BUILD_KINDS: readonly BuildingKind[] = [
  'campfire',
  'wood_wall',
  'stone_wall',
  'wood_tower',
  'stone_tower',
  'floor',
];

// ── Factory ────────────────────────────────────────────────────────────────────

/** Default spawn positions for 640x640 world: player 1 northwest, player 2 northeast. */
export function createPlayers(): [Player, Player] {
  return [
    makePlayer(0, 160, 160),
    makePlayer(1, 480, 160),
  ];
}


function makePlayer(index: 0 | 1, gx: number, gy: number): Player {
  return {
    index,
    gx,
    gy,
    vx: 0,
    vy: 0,
    cursorGx: gx,
    cursorGy: gy + 1,
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
    walkCycle: 0,
    isMoving: false,
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
 * Move a player with tactile momentum physics, stable turn hysteresis, and smooth cursor interpolation.
 * Returns true if footstep trigger fired.
 */
export function movePlayer(
  player: Player,
  inputDx: number,
  inputDy: number,
  world: WorldTerrain,
  buildings: readonly Building[],
  dt: number,
): boolean {
  if (player.respawnTimer > 0) {
    player.isMoving = false;
    player.vx = 0;
    player.vy = 0;
    return false;
  }

  // Target input velocity
  let targetVx = 0;
  let targetVy = 0;

  if (inputDx !== 0 || inputDy !== 0) {
    const mag = inputDx !== 0 && inputDy !== 0 ? 0.7071 : 1.0;
    targetVx = inputDx * MAX_WALK_SPEED * mag;
    targetVy = inputDy * MAX_WALK_SPEED * mag;

    // Stable turning with directional hysteresis (prevents rapid/glitchy flipping)
    const absX = Math.abs(inputDx);
    const absY = Math.abs(inputDy);
    if (absX > absY * 1.25) {
      player.facing = inputDx > 0 ? 'e' : 'w';
    } else if (absY > absX * 1.25) {
      player.facing = inputDy > 0 ? 's' : 'n';
    } else {
      // Near-equal diagonal: preserve current axis if still holding that direction
      if (player.facing === 'n' && inputDy < 0) { /* keep n */ }
      else if (player.facing === 's' && inputDy > 0) { /* keep s */ }
      else if (player.facing === 'e' && inputDx > 0) { /* keep e */ }
      else if (player.facing === 'w' && inputDx < 0) { /* keep w */ }
      else if (absY >= absX) {
        player.facing = inputDy > 0 ? 's' : 'n';
      } else {
        player.facing = inputDx > 0 ? 'e' : 'w';
      }
    }
  }

  // Smooth acceleration & deceleration (adds tactile weight)
  const accelRate = (inputDx !== 0 || inputDy !== 0) ? ACCEL : FRICTION;
  player.vx += (targetVx - player.vx) * Math.min(1.0, accelRate * dt);
  player.vy += (targetVy - player.vy) * Math.min(1.0, accelRate * dt);

  // Velocity deadzone
  if (Math.abs(player.vx) < 0.01 && inputDx === 0) player.vx = 0;
  if (Math.abs(player.vy) < 0.01 && inputDy === 0) player.vy = 0;

  const currentSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
  player.isMoving = currentSpeed > 0.08;

  if (player.isMoving) {
    player.walkCycle = (player.walkCycle + currentSpeed * dt * 0.9) % 1;
  } else {
    player.walkCycle = 0;
  }

  // Position integration
  const nx = player.gx + player.vx * dt;
  const ny = player.gy + player.vy * dt;

  const tileX = clamp(Math.floor(nx), 0, W - 1);
  const tileY = clamp(Math.floor(ny), 0, H - 1);

  let stepped = false;
  if (isWalkable(world, tileX, tileY) && !isTileOccupiedBySolidBuilding(tileX, tileY, buildings)) {
    player.gx = clamp(nx, 0, W - 1);
    player.gy = clamp(ny, 0, H - 1);

    player.moveAccum += currentSpeed * dt;
    if (player.moveAccum >= 0.85) {
      player.moveAccum = 0;
      stepped = true;
    }
  } else {
    // Collision slide along one axis if possible
    const curTileX = clamp(Math.floor(player.gx), 0, W - 1);
    const curTileY = clamp(Math.floor(player.gy), 0, H - 1);

    if (isWalkable(world, curTileX, tileY) && !isTileOccupiedBySolidBuilding(curTileX, tileY, buildings)) {
      player.gy = clamp(ny, 0, H - 1);
      player.vx = 0;
    } else if (isWalkable(world, tileX, curTileY) && !isTileOccupiedBySolidBuilding(tileX, curTileY, buildings)) {
      player.gx = clamp(nx, 0, W - 1);
      player.vy = 0;
    } else {
      player.vx = 0;
      player.vy = 0;
    }
  }

  // Smooth cursor tracking with exponential damp (eliminates snappy cursor glitches)
  const targetTilePos = facingTile(player);
  player.cursorGx += (targetTilePos.gx - player.cursorGx) * Math.min(1.0, dt * 18.0);
  player.cursorGy += (targetTilePos.gy - player.cursorGy) * Math.min(1.0, dt * 18.0);

  return stepped;
}

// ── Actions ────────────────────────────────────────────────────────────────────

/** The tile immediately in front of the player (an additional square ahead so it is clearly in front of the character model). */
export function facingTile(player: Player, dist = 1.6): { gx: number; gy: number } {
  let targetGx = player.gx;
  let targetGy = player.gy;
  switch (player.facing) {
    case 'n': targetGy -= dist; break;
    case 's': targetGy += dist; break;
    case 'e': targetGx += dist; break;
    case 'w': targetGx -= dist; break;
  }
  return {
    gx: clamp(Math.round(targetGx), 0, W - 1),
    gy: clamp(Math.round(targetGy), 0, H - 1),
  };
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

    player.lastActionMsg = `PLACED ${kind.replace('_', ' ').toUpperCase()}!`;
    player.msgTimer = 2.0;
  }

  return placed;
}

export type InteractType = 'chop' | 'mine' | 'forage' | 'repair' | 'stoke' | 'none';

export interface InteractResult {
  type: InteractType;
  label: string;
}

/**
  * Interact / Harvest / Mine / Repair / Stoke at the player's facing tile.
  *
  * - Chops down trees (yields Wood)
  * - Mines boulders (yields Stone)
  * - Gathers bushes & flowers (yields Wood / Fiber)
  * - Stokes campfire with wood (+40s fuel)
  * - Repairs damaged buildings
  */
export function interactAtFacing(
  player: Player,
  world: WorldTerrain,
  flora: FloraItem[],
  buildings: Building[],
): InteractResult {
  if (player.respawnTimer > 0) return { type: 'none', label: '' };

  const primary = facingTile(player, 1.6);
  const close = facingTile(player, 0.9);
  const candidates = [primary, close];

  for (let ci = 0; ci < candidates.length; ci++) {
    const tile = candidates[ci];
    if (tile === undefined) continue;
    const { gx, gy } = tile;

    // 1. Check for flora at the tile to harvest
    const harvest = harvestFloraAt(flora, gx, gy);
    if (harvest !== undefined) {
      const def = FLORA_REGISTRY[harvest.item.kind];
      const isTree = def.category === 'tree';
      const isRock = def.category === 'rock';
      const axeBonus = (player.weapon === 'axe' && isTree) ? 2 : 0;

      player.hurtFlash = 0.12;
      player.inventory.wood += harvest.wood + axeBonus;
      player.inventory.stone += harvest.stone;
      player.inventory.fiber += harvest.fiber;

      const label = axeBonus > 0 ? `${harvest.label} (+2 AXE BONUS)` : harvest.label;
      player.lastActionMsg = label;
      player.msgTimer = 2.2;

      const soundType: InteractType =
        isTree ? 'chop' :
        isRock ? 'mine' : 'forage';

      return { type: soundType, label };
    }

    // 2. Check for buildings / campfires at the tile to repair / stoke
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b === undefined || b.hp <= 0) continue;
      if (gx >= b.gx && gx < b.gx + b.w && gy >= b.gy && gy < b.gy + b.d) {
        if (b.kind === 'campfire') {
          if (player.inventory.wood > 0 && b.hp < b.maxHp) {
            player.inventory.wood -= 1;
            b.hp = Math.min(b.maxHp, b.hp + 40);
            player.hurtFlash = 0.08;
            const msg = 'STOKED FIRE (+40s FUEL)';
            player.lastActionMsg = msg;
            player.msgTimer = 2.0;
            return { type: 'stoke', label: msg };
          }
          const statusMsg = `CAMPFIRE (${Math.round(b.hp)}s FUEL)`;
          player.lastActionMsg = statusMsg;
          player.msgTimer = 1.5;
          return { type: 'none', label: statusMsg };
        }

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

/**
 * Cycle through available player build/craft modes that the player can actually afford.
 * Skips options the player does not have materials for.
 * If no crafting options are affordable, stays in 'move' mode.
 */
export function cycleBuildKind(player: Player): PlayerMode {
  const currentIdx = PLAYER_MODES.indexOf(player.mode);
  const total = PLAYER_MODES.length;

  for (let offset = 1; offset <= total; offset++) {
    const candidate = PLAYER_MODES[(currentIdx + offset) % total] as PlayerMode;
    if (candidate === 'move') {
      player.mode = 'move';
      return 'move';
    }
    if (canAffordBuilding(player, candidate)) {
      player.mode = candidate;
      player.buildKind = candidate;
      return candidate;
    }
  }

  player.mode = 'move';
  player.lastActionMsg = 'NO MATERIALS TO BUILD (GATHER WOOD/STONE/FIBER)';
  player.msgTimer = 2.0;
  return 'move';
}

// ── Target & Context Cursor ───────────────────────────────────────────────────

export type TargetContextKind = 'creature' | 'flora' | 'campfire' | 'repair' | 'building' | 'build' | 'terrain' | 'none';

export interface TargetContext {
  kind: TargetContextKind;
  gx: number;
  gy: number;
  basePx: number;
  actionKey: string;
  actionLabel: string;
  subLabel: string;
  color: Rgba;
}

const TARGET_SCRATCH: TargetContext = {
  kind: 'none',
  gx: 0,
  gy: 0,
  basePx: 0,
  actionKey: '[Space]',
  actionLabel: '',
  subLabel: '',
  color: 0xffffffff,
};

/**
 * Compute what the player is currently facing and targeting in the world.
 * Checks target tile situated an additional square ahead in front of character model.
 * Zero heap allocations on the 60 Hz frame path.
 */
export function getTargetContext(
  player: Player,
  world: WorldTerrain,
  flora: readonly FloraItem[],
  creatures: readonly Creature[],
  buildings: readonly Building[],
): TargetContext {
  const actKey = player.index === 0 ? '[Space]' : '[N]';

  if (player.respawnTimer > 0) {
    TARGET_SCRATCH.kind = 'none';
    TARGET_SCRATCH.actionLabel = '';
    TARGET_SCRATCH.subLabel = '';
    return TARGET_SCRATCH;
  }

  const primary = facingTile(player, 1.6);
  const close = facingTile(player, 0.9);
  const candidates = [primary, close];

  // 1. Build mode active: target is the placement ghost tile (visual ghost rendered without redundant text)
  if (player.mode !== 'move') {
    TARGET_SCRATCH.kind = 'build';
    TARGET_SCRATCH.gx = primary.gx;
    TARGET_SCRATCH.gy = primary.gy;
    TARGET_SCRATCH.basePx = heightAt(world.field, primary.gx, primary.gy);
    TARGET_SCRATCH.actionKey = actKey;
    TARGET_SCRATCH.actionLabel = '';
    TARGET_SCRATCH.subLabel = '';
    TARGET_SCRATCH.color = hex('#f1c40f');
    return TARGET_SCRATCH;
  }

  // 2. Combat: check if a living creature is in melee attack reach & facing cone
  const weapon = WEAPONS[player.weapon];
  if (!weapon.isRanged) {
    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      if (c === undefined || c.hp <= 0) continue;
      const dx = c.gx - player.gx;
      const dy = c.gy - player.gy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= weapon.reach) {
        let inCone = false;
        switch (player.facing) {
          case 'n': inCone = dy < 0 && Math.abs(dx) < 1.1; break;
          case 's': inCone = dy > 0 && Math.abs(dx) < 1.1; break;
          case 'e': inCone = dx > 0 && Math.abs(dy) < 1.1; break;
          case 'w': inCone = dx < 0 && Math.abs(dy) < 1.1; break;
        }
        if (inCone) {
          TARGET_SCRATCH.kind = 'creature';
          TARGET_SCRATCH.gx = c.gx;
          TARGET_SCRATCH.gy = c.gy;
          TARGET_SCRATCH.basePx = heightAt(world.field, c.gx, c.gy);
          TARGET_SCRATCH.actionKey = actKey;
          TARGET_SCRATCH.actionLabel = `ATTACK ${c.species.toUpperCase()}`;
          TARGET_SCRATCH.subLabel = `HP: ${Math.round(c.hp)}`;
          TARGET_SCRATCH.color = hex('#e74c3c');
          return TARGET_SCRATCH;
        }
      }
    }
  }

  // 3. Flora at target or adjacent tile
  for (let ci = 0; ci < candidates.length; ci++) {
    const tile = candidates[ci];
    if (tile === undefined) continue;
    for (let i = 0; i < flora.length; i++) {
      const f = flora[i];
      if (f !== undefined && f.gx === tile.gx && f.gy === tile.gy) {
        const fDef = FLORA_REGISTRY[f.kind];
        const isTree = fDef.category === 'tree';
        const isRock = fDef.category === 'rock';
        TARGET_SCRATCH.kind = 'flora';
        TARGET_SCRATCH.gx = tile.gx;
        TARGET_SCRATCH.gy = tile.gy;
        TARGET_SCRATCH.basePx = heightAt(world.field, tile.gx, tile.gy);
        TARGET_SCRATCH.actionKey = actKey;
        TARGET_SCRATCH.actionLabel = isTree ? 'CHOP' : isRock ? 'MINE' : 'FORAGE';
        TARGET_SCRATCH.subLabel = fDef.name.toUpperCase();
        TARGET_SCRATCH.color = isTree ? hex('#d4a373') : isRock ? hex('#b0bec5') : hex('#2ecc71');
        return TARGET_SCRATCH;
      }
    }
  }

  // 4. Buildings at target or adjacent tile
  for (let ci = 0; ci < candidates.length; ci++) {
    const tile = candidates[ci];
    if (tile === undefined) continue;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b === undefined || b.hp <= 0) continue;
      if (tile.gx >= b.gx && tile.gx < b.gx + b.w && tile.gy >= b.gy && tile.gy < b.gy + b.d) {
        if (b.kind === 'campfire') {
          TARGET_SCRATCH.kind = 'campfire';
          TARGET_SCRATCH.gx = b.gx;
          TARGET_SCRATCH.gy = b.gy;
          TARGET_SCRATCH.basePx = b.basePx;
          TARGET_SCRATCH.actionKey = actKey;
          TARGET_SCRATCH.actionLabel = player.inventory.wood > 0 && b.hp < b.maxHp ? 'STOKE FIRE' : 'CAMPFIRE';
          TARGET_SCRATCH.subLabel = `${Math.round(b.hp)}s FUEL`;
          TARGET_SCRATCH.color = hex('#ff9f43');
          return TARGET_SCRATCH;
        }
        if (b.hp < b.maxHp) {
          TARGET_SCRATCH.kind = 'repair';
          TARGET_SCRATCH.gx = b.gx;
          TARGET_SCRATCH.gy = b.gy;
          TARGET_SCRATCH.basePx = b.basePx;
          TARGET_SCRATCH.actionKey = actKey;
          TARGET_SCRATCH.actionLabel = `REPAIR (+40 HP)`;
          TARGET_SCRATCH.subLabel = `${b.kind.replace('_', ' ').toUpperCase()} (${Math.round(b.hp)}/${b.maxHp})`;
          TARGET_SCRATCH.color = hex('#3498db');
          return TARGET_SCRATCH;
        }
        // Full health buildings are static props (not interactable with action key)
        TARGET_SCRATCH.kind = 'building';
        TARGET_SCRATCH.gx = b.gx;
        TARGET_SCRATCH.gy = b.gy;
        TARGET_SCRATCH.basePx = b.basePx;
        TARGET_SCRATCH.actionKey = actKey;
        TARGET_SCRATCH.actionLabel = '';
        TARGET_SCRATCH.subLabel = '';
        TARGET_SCRATCH.color = hex('#78909c');
        return TARGET_SCRATCH;
      }
    }
  }

  // 5. Open ground / Terrain (no interactive object under focus)
  TARGET_SCRATCH.kind = 'terrain';
  TARGET_SCRATCH.gx = primary.gx;
  TARGET_SCRATCH.gy = primary.gy;
  TARGET_SCRATCH.basePx = heightAt(world.field, primary.gx, primary.gy);
  TARGET_SCRATCH.actionKey = actKey;
  TARGET_SCRATCH.actionLabel = '';
  TARGET_SCRATCH.subLabel = '';
  TARGET_SCRATCH.color = hex('#95a5a6');
  return TARGET_SCRATCH;
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
