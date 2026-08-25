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
import { placeBuilding, isTileOccupiedBySolidBuilding, BUILDING_COSTS } from './buildings.js';
import type { FloraItem } from './flora.js';
import { harvestFloraAt, FLORA_REGISTRY } from './flora.js';
import type { WeaponKind } from './combat.js';
import { WEAPONS, CRAFTABLE_WEAPONS } from './combat.js';
import type { Creature } from './creatures.js';

// ── Player state ───────────────────────────────────────────────────────────────

export type Facing = 'n' | 's' | 'e' | 'w';

export type PlayerMode = 'move' | BuildingKind;

export type PlayerActionType =
  | 'none'
  | 'sword_slash'
  | 'axe_chop'
  | 'fist_punch'
  | 'bow_draw'
  | 'chop'
  | 'mine'
  | 'forage'
  | 'repair'
  | 'dig'
  | 'raise';

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
  /** Integer isometric tile coordinate targeted directly in front of player on the grid. */
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
  /** Active combat or interaction animation type. */
  actionType: PlayerActionType;
  /** Seconds remaining in the current active action animation. */
  actionTimer: number;
  /** Total duration in seconds of the current action animation for normalized phase calculations. */
  actionDuration: number;
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

/** Trigger an articulated action or combat animation on a player. */
export function triggerPlayerAction(player: Player, type: PlayerActionType, durationSec = 0.25): void {
  player.actionType = type;
  player.actionTimer = durationSec;
  player.actionDuration = durationSec;
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
    actionType: 'none',
    actionTimer: 0,
    actionDuration: 0.25,
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

/** Whether `player`'s current inventory covers `kind`'s crafting cost — the check `craftWeapon`
 *  and the HUD's afford-highlight both need before they touch inventory state. */
export function canAffordWeapon(player: Player, kind: WeaponKind): boolean {
  const cost = WEAPONS[kind].cost;
  return (
    player.inventory.wood >= cost.wood &&
    player.inventory.stone >= cost.stone &&
    player.inventory.fiber >= cost.fiber
  );
}

/**
 * Craft-or-equip: if `kind` is already unlocked this just re-equips it for free, otherwise it
 * deducts the cost and unlocks it. One entry point for both cases so callers (the craft-key
 * handler in `main.ts`) never have to branch on "have I already got this."
 */
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

/**
 * The single craft-key action: unlock the next weapon in `CRAFTABLE_WEAPONS` the player
 * doesn't have yet, or once every craftable is owned, fall back to cycling equipped weapons
 * so the key never goes dead once a player has crafted everything.
 */
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

/** Equip the next weapon in `player.craftedWeapons`, wrapping around. Only ever cycles among
 *  weapons already unlocked — it never grants a new one. */
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

  // @tier-b — speed magnitude, drives isMoving/walkCycle only; position integration below is Tier A
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

  // Cursor position directly tracks the facing tile on the integer isometric grid
  facingTileInto(player, MOVE_FACING_SCRATCH);
  player.cursorGx = MOVE_FACING_SCRATCH.gx;
  player.cursorGy = MOVE_FACING_SCRATCH.gy;

  return stepped;
}

// ── Actions ────────────────────────────────────────────────────────────────────

export interface TileCoord {
  gx: number;
  gy: number;
}

const MOVE_FACING_SCRATCH: TileCoord = { gx: 0, gy: 0 };

/**
 * Write the tile immediately in front of the player into `out`. Zero allocation —
 * use this on any path that runs every tick or every render frame; `facingTile`
 * below is a convenience wrapper for the rare, input-triggered call sites only.
 */
export function facingTileInto(player: Player, out: TileCoord): void {
  // Use the tile the player is centered over to prevent off-to-the-side cursor parallax
  const curGx = Math.round(player.gx);
  const curGy = Math.round(player.gy);
  let targetGx = curGx;
  let targetGy = curGy;
  switch (player.facing) {
    case 'n': targetGy -= 1; break;
    case 's': targetGy += 1; break;
    case 'e': targetGx += 1; break;
    case 'w': targetGx -= 1; break;
  }
  out.gx = clamp(targetGx, 0, W - 1);
  out.gy = clamp(targetGy, 0, H - 1);
}

/**
 * The exact tile immediately in front of the player on the isometric grid.
 * Allocates a fresh object — fine for edge-triggered action handlers (build,
 * dig, attack), never for a per-tick or per-frame path. Use `facingTileInto` there.
 */
export function facingTile(player: Player): TileCoord {
  const out: TileCoord = { gx: 0, gy: 0 };
  facingTileInto(player, out);
  return out;
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
  * Interact / Harvest / Mine / Repair / Stoke at the player's focused target.
  * Uses the unified `getTargetContext` system so the action executed matches the visual highlight.
  */
export function interactAtFacing(
  player: Player,
  world: WorldTerrain,
  flora: FloraItem[],
  buildings: Building[],
): InteractResult {
  if (player.respawnTimer > 0) return { type: 'none', label: '' };

  const target = getTargetContext(player, world, flora, [], buildings);

  // 1. Harvest flora
  if (target.kind === 'flora') {
    const harvest = harvestFloraAt(flora, target.gx, target.gy);
    if (harvest !== undefined) {
      const def = FLORA_REGISTRY[harvest.item.kind];
      const isTree = def.category === 'tree';
      const isRock = def.category === 'rock';
      const axeBonus = (player.weapon === 'axe' && isTree) ? 2 : 0;

      player.hurtFlash = 0.12;
      player.inventory.wood += harvest.wood + axeBonus;
      player.inventory.stone += harvest.stone;
      player.inventory.fiber += harvest.fiber;

      triggerPlayerAction(player, isTree ? 'chop' : isRock ? 'mine' : 'forage', isTree ? 0.32 : isRock ? 0.35 : 0.28);

      const label = axeBonus > 0 ? `${harvest.label} (+2 AXE BONUS)` : harvest.label;
      player.lastActionMsg = label;
      player.msgTimer = 2.2;

      const soundType: InteractType = isTree ? 'chop' : isRock ? 'mine' : 'forage';
      return { type: soundType, label };
    }
  }

  // 2. Campfire stoking
  if (target.kind === 'campfire') {
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b !== undefined && b.kind === 'campfire' && target.gx >= b.gx && target.gx < b.gx + b.w && target.gy >= b.gy && target.gy < b.gy + b.d) {
        if (player.inventory.wood > 0 && b.hp < b.maxHp) {
          player.inventory.wood -= 1;
          b.hp = Math.min(b.maxHp, b.hp + 40);
          player.hurtFlash = 0.08;
          triggerPlayerAction(player, 'repair', 0.28);
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
    }
  }

  // 3. Building repair
  if (target.kind === 'repair') {
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b !== undefined && b.hp > 0 && b.hp < b.maxHp && target.gx >= b.gx && target.gx < b.gx + b.w && target.gy >= b.gy && target.gy < b.gy + b.d) {
        if (player.inventory.wood > 0 || player.inventory.stone > 0) {
          if (b.kind.includes('stone') && player.inventory.stone > 0) {
            player.inventory.stone -= 1;
          } else if (player.inventory.wood > 0) {
            player.inventory.wood -= 1;
          }
          b.hp = Math.min(b.maxHp, b.hp + 40);
          player.hurtFlash = 0.1;
          triggerPlayerAction(player, 'repair', 0.3);
          const msg = `REPAIRED ${b.kind.replace('_', ' ').toUpperCase()} (+40 HP)`;
          player.lastActionMsg = msg;
          player.msgTimer = 2.0;
          return { type: 'repair', label: msg };
        }
      }
    }
  }

  return { type: 'none', label: '' };
}

/** Dig (lower ground) at the player's facing tile. */
export function digAtFacing(player: Player, world: WorldTerrain): boolean {
  if (player.respawnTimer > 0) return false;
  const { gx, gy } = facingTile(player);
  const ok = dig(world, gx, gy);
  if (ok) {
    triggerPlayerAction(player, 'dig', 0.32);
  }
  return ok;
}

/** Raise (mound ground) at the player's facing tile. */
export function raiseAtFacing(player: Player, world: WorldTerrain): boolean {
  if (player.respawnTimer > 0) return false;
  const { gx, gy } = facingTile(player);
  const ok = raise(world, gx, gy);
  if (ok) {
    triggerPlayerAction(player, 'raise', 0.32);
  }
  return ok;
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

/** Scratch tile for `getTargetContext`'s internal facing-tile lookup. Zero allocation. */
const TARGET_TILE_SCRATCH: TileCoord = { gx: 0, gy: 0 };

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
 * Evaluates if relative delta (dx, dy) falls within the player's forward interaction cone.
 * `spreadRatio` controls the lateral tolerance (1.0 = strict 45 deg, 1.25 = generous forward arc).
 */
export function isInForwardCone(
  facing: Facing,
  dx: number,
  dy: number,
  spreadRatio = 1.25,
): boolean {
  switch (facing) {
    case 'n': return dy < 0 && Math.abs(dx) <= -dy * spreadRatio;
    case 's': return dy > 0 && Math.abs(dx) <= dy * spreadRatio;
    case 'e': return dx > 0 && Math.abs(dy) <= dx * spreadRatio;
    case 'w': return dx < 0 && Math.abs(dy) <= -dx * spreadRatio;
  }
}

/** Resolves melee combat targets within the weapon's strike arc. Returns true if acquired. */
function resolveCreatureTarget(
  player: Player,
  creatures: readonly Creature[],
  world: WorldTerrain,
  actKey: string,
): boolean {
  const weapon = WEAPONS[player.weapon];
  if (weapon.isRanged) return false;

  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c === undefined || c.hp <= 0) continue;
    const dx = c.gx - player.gx;
    const dy = c.gy - player.gy;
    const dist = Math.sqrt(dx * dx + dy * dy); // @tier-b — melee target-lock distance
    if (dist <= weapon.reach && isInForwardCone(player.facing, dx, dy, 1.1)) {
      TARGET_SCRATCH.kind = 'creature';
      TARGET_SCRATCH.gx = Math.round(c.gx);
      TARGET_SCRATCH.gy = Math.round(c.gy);
      TARGET_SCRATCH.basePx = heightAt(world.field, TARGET_SCRATCH.gx, TARGET_SCRATCH.gy);
      TARGET_SCRATCH.actionKey = actKey;
      TARGET_SCRATCH.actionLabel = `ATTACK ${c.species.toUpperCase()}`;
      TARGET_SCRATCH.subLabel = `HP: ${Math.round(c.hp)}`;
      TARGET_SCRATCH.color = hex('#e74c3c');
      return true;
    }
  }
  return false;
}

/** Resolves harvestable flora, checking the direct facing tile first and soft-locking adjacent forward plants. */
function resolveFloraTarget(
  player: Player,
  targetTile: { gx: number; gy: number },
  flora: readonly FloraItem[],
  world: WorldTerrain,
  actKey: string,
): boolean {
  let targetFlora: FloraItem | undefined;

  // Direct facing tile has first priority
  for (let i = 0; i < flora.length; i++) {
    const f = flora[i];
    if (f !== undefined && f.gx === targetTile.gx && f.gy === targetTile.gy) {
      targetFlora = f;
      break;
    }
  }

  // Forward-cone magnetic soft-lock when direct tile is clear
  if (targetFlora === undefined) {
    let closestDist = 1.6;
    for (let i = 0; i < flora.length; i++) {
      const f = flora[i];
      if (f === undefined) continue;
      const dx = f.gx - player.gx;
      const dy = f.gy - player.gy;
      const dist = Math.sqrt(dx * dx + dy * dy); // @tier-b — soft-lock focus distance
      if (dist <= closestDist && isInForwardCone(player.facing, dx, dy, 1.25)) {
        closestDist = dist;
        targetFlora = f;
      }
    }
  }

  if (targetFlora !== undefined) {
    const fDef = FLORA_REGISTRY[targetFlora.kind];
    const isTree = fDef.category === 'tree';
    const isRock = fDef.category === 'rock';
    TARGET_SCRATCH.kind = 'flora';
    TARGET_SCRATCH.gx = targetFlora.gx;
    TARGET_SCRATCH.gy = targetFlora.gy;
    TARGET_SCRATCH.basePx = heightAt(world.field, targetFlora.gx, targetFlora.gy);
    TARGET_SCRATCH.actionKey = actKey;
    TARGET_SCRATCH.actionLabel = isTree ? 'CHOP' : isRock ? 'MINE' : 'FORAGE';
    TARGET_SCRATCH.subLabel = fDef.name.toUpperCase();
    TARGET_SCRATCH.color = isTree ? hex('#d4a373') : isRock ? hex('#b0bec5') : hex('#2ecc71');
    return true;
  }
  return false;
}

/** Resolves interactive buildings (campfires, repairs, static structures). Returns true if acquired. */
function resolveBuildingTarget(
  player: Player,
  targetTile: { gx: number; gy: number },
  buildings: readonly Building[],
  actKey: string,
): boolean {
  let targetBuilding: Building | undefined;

  // Direct tile match
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0) continue;
    if (targetTile.gx >= b.gx && targetTile.gx < b.gx + b.w && targetTile.gy >= b.gy && targetTile.gy < b.gy + b.d) {
      targetBuilding = b;
      break;
    }
  }

  // Forward-cone soft-lock
  if (targetBuilding === undefined) {
    let closestDist = 1.6;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b === undefined || b.hp <= 0) continue;
      const bcx = b.gx + b.w * 0.5;
      const bcy = b.gy + b.d * 0.5;
      const dx = bcx - player.gx;
      const dy = bcy - player.gy;
      const dist = Math.sqrt(dx * dx + dy * dy); // @tier-b — building soft-lock distance
      if (dist <= closestDist && isInForwardCone(player.facing, dx, dy, 1.25)) {
        closestDist = dist;
        targetBuilding = b;
      }
    }
  }

  if (targetBuilding !== undefined) {
    const b = targetBuilding;
    if (b.kind === 'campfire') {
      TARGET_SCRATCH.kind = 'campfire';
      TARGET_SCRATCH.gx = b.gx;
      TARGET_SCRATCH.gy = b.gy;
      TARGET_SCRATCH.basePx = b.basePx;
      TARGET_SCRATCH.actionKey = actKey;
      TARGET_SCRATCH.actionLabel = player.inventory.wood > 0 && b.hp < b.maxHp ? 'STOKE FIRE' : 'CAMPFIRE';
      TARGET_SCRATCH.subLabel = `${Math.round(b.hp)}s FUEL`;
      TARGET_SCRATCH.color = hex('#ff9f43');
      return true;
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
      return true;
    }
    // Full-health structures (static landmarks)
    TARGET_SCRATCH.kind = 'building';
    TARGET_SCRATCH.gx = b.gx;
    TARGET_SCRATCH.gy = b.gy;
    TARGET_SCRATCH.basePx = b.basePx;
    TARGET_SCRATCH.actionKey = actKey;
    TARGET_SCRATCH.actionLabel = '';
    TARGET_SCRATCH.subLabel = '';
    TARGET_SCRATCH.color = hex('#78909c');
    return true;
  }
  return false;
}

/**
 * Compute what the player is currently facing and targeting in the world.
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

  facingTileInto(player, TARGET_TILE_SCRATCH);
  const targetTile = TARGET_TILE_SCRATCH;

  // 1. Build mode active: target is the placement ghost tile
  if (player.mode !== 'move') {
    TARGET_SCRATCH.kind = 'build';
    TARGET_SCRATCH.gx = targetTile.gx;
    TARGET_SCRATCH.gy = targetTile.gy;
    TARGET_SCRATCH.basePx = heightAt(world.field, targetTile.gx, targetTile.gy);
    TARGET_SCRATCH.actionKey = actKey;
    TARGET_SCRATCH.actionLabel = '';
    TARGET_SCRATCH.subLabel = '';
    TARGET_SCRATCH.color = hex('#f1c40f');
    return TARGET_SCRATCH;
  }

  // 2. Creature melee combat
  if (resolveCreatureTarget(player, creatures, world, actKey)) {
    return TARGET_SCRATCH;
  }

  // 3. Flora harvesting / foraging
  if (resolveFloraTarget(player, targetTile, flora, world, actKey)) {
    return TARGET_SCRATCH;
  }

  // 4. Buildings & Campfires
  if (resolveBuildingTarget(player, targetTile, buildings, actKey)) {
    return TARGET_SCRATCH;
  }

  // 5. Open ground / Terrain (default when no entity or structure is focused)
  TARGET_SCRATCH.kind = 'terrain';
  TARGET_SCRATCH.gx = targetTile.gx;
  TARGET_SCRATCH.gy = targetTile.gy;
  TARGET_SCRATCH.basePx = heightAt(world.field, targetTile.gx, targetTile.gy);
  TARGET_SCRATCH.actionKey = actKey;
  TARGET_SCRATCH.actionLabel = '';
  TARGET_SCRATCH.subLabel = '';
  TARGET_SCRATCH.color = hex('#95a5a6');
  return TARGET_SCRATCH;
}

// ── HP and respawn ─────────────────────────────────────────────────────────────

/** Update HP regen, damage flash, message timer, action animation timer, and respawn timer. Returns true if player just respawned. */
export function tickPlayer(player: Player, dt: number): boolean {
  if (player.actionTimer > 0) {
    player.actionTimer = Math.max(0, player.actionTimer - dt);
    if (player.actionTimer <= 0) {
      player.actionType = 'none';
    }
  }
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
      player.actionType = 'none';
      player.actionTimer = 0;
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
