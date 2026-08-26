/**
 * Player state, inventory, movement, and actions.
 *
 * Two players, each with tile position, facing, action mode, HP, and Inventory.
 * Movement is continuous at fixed speed, blocked by water and walls. Towers and gates let a
 * player through (climbing onto a tower's lookout platform, or through a gate's archway) even
 * though they block wild animals — see `buildings.ts`.
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
import { placeBuilding, isTileOccupiedBySolidBuilding, BUILDING_COSTS, BUILD_WORK_SECONDS, findTowerAt, towerPlatformPx, isMissionStructure } from './buildings.js';
import type { FloraItem } from './flora.js';
import { harvestFloraAt, FLORA_REGISTRY, FLORA_SPATIAL } from './flora.js';
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

/** Sustained (hold-to-complete) actions — see the `work*` fields on `Player`. */
export type WorkKind = 'chop' | 'mine' | 'forage' | 'stoke' | 'repair' | 'build' | 'dig' | 'raise' | 'none';

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
  /** World-pixel height standing above the tower footprint they're currently on, 0 at ground
   *  level. Extends bow arrow range (fired from higher up) and personal torchlight radius. */
  elevationPx: number;
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
  /** Whether this player is present in the session. False while a co-op player has been hidden
   *  (single-player view toggle) — frozen out of simulation, world rendering, and creature threat
   *  perception until switched back on, but retains position/inventory/gear to resume with. */
  active: boolean;
  /** Whether the full-viewport Inventory overlay is open. While open, movement input is ignored
   *  (see `main.ts`) and the movement keys instead navigate the overlay — see `inventoryNav`. */
  invOpen: boolean;
  /** Which half of the Inventory overlay is showing: unlockable/equippable weapons, or armable
   *  build kinds. */
  invTab: 'items' | 'craft';
  /** Index of the highlighted row within the active tab's list. Clamped by `inventoryNav`. */
  invCursor: number;
  /** What sustained action is currently being channeled (chop/mine/forage/stoke/repair/build/
   *  dig/raise), or 'none' when idle. Progress accumulates in `workProgress` only while the
   *  action key stays held on the same target tile — see `progressWork` and its call site in
   *  `main.ts`'s `runPlayerActions`. */
  workKind: WorkKind;
  /** Tile the current work is targeting. Progress resets to 0 the moment this no longer matches
   *  the player's live target (they moved, released the key, or re-aimed elsewhere). */
  workGx: number;
  workGy: number;
  /** Seconds accumulated toward `workRequired` for the current `workKind`. */
  workProgress: number;
  /** Seconds of held Interact needed to complete the current `workKind`. */
  workRequired: number;
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
  'palisade',
  'wood_wall',
  'stone_wall',
  'wood_tower',
  'stone_tower',
  'floor',
  'gate',
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
    elevationPx: 0,
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
    active: true,
    invOpen: false,
    invTab: 'items',
    invCursor: 0,
    workKind: 'none',
    workGx: gx,
    workGy: gy,
    workProgress: 0,
    workRequired: 0,
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

// ── Inventory Overlay ──────────────────────────────────────────────────────────
//
// The full-viewport Inventory (opened with C/V or ,/.) is the single place weapon and build-kind
// selection happen, so that Space/N never has to double as "place" and stays free to always mean
// interact-or-attack — see the key layout note atop `input.ts`.

/** Selectable rows of the Inventory's "items" tab, in display order — fists first (always owned,
 *  free to re-equip), then every craftable weapon. */
export const INVENTORY_ITEMS_ORDER: readonly WeaponKind[] = ['hands', ...CRAFTABLE_WEAPONS];

/** Selectable rows of the Inventory's "craft" tab, in display order. */
export const INVENTORY_CRAFT_ORDER: readonly BuildingKind[] = PLAYER_MODES.filter(
  (m): m is BuildingKind => m !== 'move',
);

/** Open (or close) the Inventory overlay. On open, the cursor jumps to whatever is currently
 *  equipped/armed on the active tab, so re-opening it lands on where the player left off. */
export function toggleInventory(player: Player): void {
  player.invOpen = !player.invOpen;
  if (!player.invOpen) return;
  if (player.invTab === 'items') {
    const idx = INVENTORY_ITEMS_ORDER.indexOf(player.weapon);
    player.invCursor = idx >= 0 ? idx : 0;
  } else {
    const idx = INVENTORY_CRAFT_ORDER.indexOf(player.mode as BuildingKind);
    player.invCursor = idx >= 0 ? idx : 0;
  }
}

/** Number of selectable rows in the Inventory's currently active tab. */
export function inventoryTabLength(player: Player): number {
  return player.invTab === 'items' ? INVENTORY_ITEMS_ORDER.length : INVENTORY_CRAFT_ORDER.length;
}

/**
 * Navigate the open Inventory overlay: `dx` switches tabs (left/right), `dy` moves the row
 * cursor (up/down). Only one axis is expected to be non-zero per call — callers feed this from
 * edge-triggered movement-key presses one direction at a time.
 */
export function inventoryNav(player: Player, dx: number, dy: number): void {
  if (dx !== 0) {
    player.invTab = player.invTab === 'items' ? 'craft' : 'items';
    player.invCursor = 0;
    return;
  }
  if (dy !== 0) {
    const len = inventoryTabLength(player);
    player.invCursor = clamp(player.invCursor + dy, 0, Math.max(0, len - 1));
  }
}

/** What activating the Inventory's highlighted row actually did — drives the sound effect and
 *  whether the overlay auto-closes. */
export interface InventoryActivateResult {
  ok: boolean;
  action: 'equip' | 'craft' | 'arm' | 'disarm' | 'deny';
}

/**
 * Activate (Space/N) the currently highlighted Inventory row: on the items tab, equips an
 * already-unlocked weapon or crafts-and-equips a new one; on the craft tab, arms the highlighted
 * build kind (or disarms it if it's already armed). Once armed, Space/N places it at the
 * player's facing tile instead of interacting/attacking — see `main.ts` and `buildAtFacing`,
 * which disarms back to 'move' the instant it lands so Space/N is immediately interact-or-attack
 * again; building a second one means a deliberate trip back to the Inventory. Closes the overlay
 * on any successful selection so the player lands straight back in the world; stays open on a
 * denied (unaffordable) pick.
 */
export function activateInventorySelection(player: Player): InventoryActivateResult {
  if (player.respawnTimer > 0) return { ok: false, action: 'deny' };

  if (player.invTab === 'items') {
    const kind = INVENTORY_ITEMS_ORDER[player.invCursor];
    if (kind === undefined) return { ok: false, action: 'deny' };
    const wasAlreadyOwned = player.craftedWeapons.includes(kind);
    const ok = craftWeapon(player, kind);
    if (!ok) return { ok: false, action: 'deny' };
    player.invOpen = false;
    return { ok: true, action: wasAlreadyOwned ? 'equip' : 'craft' };
  }

  const kind = INVENTORY_CRAFT_ORDER[player.invCursor];
  if (kind === undefined) return { ok: false, action: 'deny' };

  if (player.mode === kind) {
    player.mode = 'move';
    player.lastActionMsg = 'BUILD MODE OFF';
    player.msgTimer = 1.5;
    player.invOpen = false;
    return { ok: true, action: 'disarm' };
  }

  if (!canAffordBuilding(player, kind)) {
    const cost = BUILDING_COSTS[kind];
    const fiberCost = cost.fiber ? ` ${cost.fiber}F` : '';
    player.lastActionMsg = `NEED ${cost.wood}W ${cost.stone}S${fiberCost}`;
    player.msgTimer = 2.0;
    return { ok: false, action: 'deny' };
  }

  player.mode = kind;
  player.buildKind = kind;
  const placeKey = player.index === 0 ? '[Space]' : '[N]';
  player.lastActionMsg = `ARMED ${kind.replace('_', ' ').toUpperCase()} — ${placeKey} TO PLACE`;
  player.msgTimer = 2.5;
  player.invOpen = false;
  return { ok: true, action: 'arm' };
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

  if (player.workKind !== 'none') {
    if (inputDx !== 0 || inputDy !== 0) {
      // Pressing a movement key mid-chop/mine/dig/build abandons it — a player under attack
      // needs to be able to run, not finish the swing first. See the sustained-work section
      // below for `workKind`/`clearWork`. Falls through to normal movement this same tick.
      clearWork(player);
    } else {
      // Standing still is what lets the channel keep running: with no movement input this tick
      // is a no-op anyway, but skipping the physics below also means `facing` can't drift, so
      // `facingTile(player)` at completion is guaranteed to be the same tile the channel started
      // on — nothing here reads the target tile back out mid-channel to double check it.
      player.isMoving = false;
      player.vx = 0;
      player.vy = 0;
      return false;
    }
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

  // Tier A: sqrt is exact per spec — speed magnitude, drives isMoving/walkCycle only; position integration below is Tier A
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
  const curTileX = clamp(Math.floor(player.gx), 0, W - 1);
  const curTileY = clamp(Math.floor(player.gy), 0, H - 1);

  // A building can end up occupying the player's own tile (e.g. placed just as they stood on
  // it). Buildings must never be able to trap a player, so once that's happened, ignore
  // building collision entirely for this tick — terrain walkability still applies — until
  // they've stepped off it.
  const escapingOwnBuilding = isTileOccupiedBySolidBuilding(curTileX, curTileY, buildings);
  const blockedByBuilding = (gx: number, gy: number): boolean =>
    !escapingOwnBuilding && isTileOccupiedBySolidBuilding(gx, gy, buildings);

  // Two buildings placed diagonally from each other (corner-to-corner) share only a point,
  // not an edge, so per-tile checks alone would let a player cut straight through that gap
  // when moving diagonally. Block the corner cut explicitly.
  const cuttingBlockedCorner =
    tileX !== curTileX && tileY !== curTileY &&
    blockedByBuilding(tileX, curTileY) && blockedByBuilding(curTileX, tileY);

  let stepped = false;
  if (!cuttingBlockedCorner && isWalkable(world, tileX, tileY) && !blockedByBuilding(tileX, tileY)) {
    player.gx = clamp(nx, 0, W - 1);
    player.gy = clamp(ny, 0, H - 1);

    player.moveAccum += currentSpeed * dt;
    if (player.moveAccum >= 0.85) {
      player.moveAccum = 0;
      stepped = true;
    }
  } else {
    // Collision slide along one axis if possible
    if (isWalkable(world, curTileX, tileY) && !blockedByBuilding(curTileX, tileY)) {
      player.gy = clamp(ny, 0, H - 1);
      player.vx = 0;
    } else if (isWalkable(world, tileX, curTileY) && !blockedByBuilding(tileX, curTileY)) {
      player.gx = clamp(nx, 0, W - 1);
      player.vy = 0;
    } else {
      player.vx = 0;
      player.vy = 0;
    }
  }

  // Standing on a tower's footprint climbs onto its lookout platform — recomputed every tick
  // so walking off the edge drops the player back to ground level immediately.
  const standTileX = clamp(Math.floor(player.gx), 0, W - 1);
  const standTileY = clamp(Math.floor(player.gy), 0, H - 1);
  const tower = findTowerAt(standTileX, standTileY, buildings);
  player.elevationPx = tower !== undefined ? towerPlatformPx(tower.kind) : 0;

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

    // Placing is one-shot: disarm back to 'move' so Space/N is immediately interact-or-attack
    // again, and building a second one is a deliberate trip back to the Inventory.
    player.mode = 'move';

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
    const dist = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — melee target-lock distance
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
      const dist = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — soft-lock focus distance
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

  // Direct tile match. Mission structures (the wizard tower) are excluded here — they're a
  // combat-only target (see `executeAttack`'s own building-hit check in `combat.ts`), never a
  // repair/campfire/landmark one. Without this exclusion, a player standing at a damaged wizard
  // tower would have every subsequent Space press resolve to *repairing* it instead of attacking
  // it — `resolveWork`'s `target.kind === 'repair'` branch doesn't know or care whose building
  // it's looking at.
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0 || isMissionStructure(b.kind)) continue;
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
      if (b === undefined || b.hp <= 0 || isMissionStructure(b.kind)) continue;
      const bcx = b.gx + b.w * 0.5;
      const bcy = b.gy + b.d * 0.5;
      const dx = bcx - player.gx;
      const dy = bcy - player.gy;
      const dist = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — building soft-lock distance
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

// ── Sustained (hold-to-complete) actions ────────────────────────────────────────
//
// Harvesting, mining, repairing, stoking, building, and terraforming all take real time now — a
// single keypress commits the player to `workKind` and it plays out on its own over
// `workRequired` seconds, no need to hold or repeat the key. `movePlayer` keeps the player
// standing still for the duration as long as they don't touch a movement key (see its own
// `workKind` guard), which is also what keeps the target tile from going stale mid-channel — but
// pressing a movement key abandons the channel outright so the player can run from danger instead
// of finishing the swing first; see `clearWork`'s call site there. `resolveWork` decides what a
// fresh press starts and how long it takes (reading duration data out of the flora/building
// registries so this file doesn't hardcode per-species numbers); `startWork`/`advanceWork`/
// `clearWork` manage the timer. The caller in `main.ts` is responsible for invoking the
// underlying instant-resolution function
// (`interactAtFacing`, `buildAtFacing`, `digAtFacing`, `raiseAtFacing`) exactly once, on the tick
// `advanceWork` returns true.

/** Fixed channel time for actions with no per-item registry (stoking a fire, repairing a wall,
 *  digging, raising). Flora and buildings look their own durations up instead — see below. */
const STOKE_WORK_SECONDS = 0.5;
const REPAIR_WORK_SECONDS = 0.6;
export const DIG_WORK_SECONDS = 0.45;
export const RAISE_WORK_SECONDS = 0.45;

/**
 * How long the player must hold Interact to complete the given target, in seconds. Returns 0 for
 * targets that resolve instantly or aren't "work" at all (creature combat, a full-health
 * building, empty ground) — the `kind` field comes back `'none'` for those, and callers treat
 * that as "not a sustained action." Reused across ticks — copy fields out before calling again.
 */
const WORK_RESOLVE_SCRATCH: { kind: WorkKind; seconds: number } = { kind: 'none', seconds: 0 };

export function resolveWork(
  player: Player,
  target: TargetContext,
  flora: readonly FloraItem[],
  buildings: readonly Building[],
): { kind: WorkKind; seconds: number } {
  WORK_RESOLVE_SCRATCH.kind = 'none';
  WORK_RESOLVE_SCRATCH.seconds = 0;

  if (player.mode !== 'move' && target.kind === 'build') {
    WORK_RESOLVE_SCRATCH.kind = 'build';
    WORK_RESOLVE_SCRATCH.seconds = BUILD_WORK_SECONDS[player.mode];
    return WORK_RESOLVE_SCRATCH;
  }

  if (target.kind === 'flora') {
    const count = FLORA_SPATIAL.queryRadius(target.gx, target.gy, 0.85);
    for (let i = 0; i < count; i++) {
      const idx = FLORA_SPATIAL.queryBuffer[i];
      const f = idx !== undefined ? flora[idx] : undefined;
      if (f !== undefined && f.gx === target.gx && f.gy === target.gy) {
        const def = FLORA_REGISTRY[f.kind];
        const toolBonus = player.weapon === 'axe' && def.toolMultiplier.axe !== undefined ? def.toolMultiplier.axe : 1;
        WORK_RESOLVE_SCRATCH.kind = def.category === 'tree' ? 'chop' : def.category === 'rock' ? 'mine' : 'forage';
        WORK_RESOLVE_SCRATCH.seconds = def.workSeconds / toolBonus;
        return WORK_RESOLVE_SCRATCH;
      }
    }
    return WORK_RESOLVE_SCRATCH;
  }

  if (target.kind === 'campfire') {
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b !== undefined && b.kind === 'campfire' && target.gx >= b.gx && target.gx < b.gx + b.w && target.gy >= b.gy && target.gy < b.gy + b.d) {
        if (player.inventory.wood > 0 && b.hp < b.maxHp) {
          WORK_RESOLVE_SCRATCH.kind = 'stoke';
          WORK_RESOLVE_SCRATCH.seconds = STOKE_WORK_SECONDS;
        }
        return WORK_RESOLVE_SCRATCH;
      }
    }
    return WORK_RESOLVE_SCRATCH;
  }

  if (target.kind === 'repair' && (player.inventory.wood > 0 || player.inventory.stone > 0)) {
    WORK_RESOLVE_SCRATCH.kind = 'repair';
    WORK_RESOLVE_SCRATCH.seconds = REPAIR_WORK_SECONDS;
    return WORK_RESOLVE_SCRATCH;
  }

  return WORK_RESOLVE_SCRATCH;
}

/** The articulated swing/dig/hammer animation each `WorkKind` plays, repeated back-to-back for
 *  the whole channel — see `playWorkAnim` — so a two-second chop reads as several real swings
 *  landing on the tree, not one animation frozen for two seconds. */
const WORK_ANIM: Partial<Record<WorkKind, { type: PlayerActionType; duration: number }>> = {
  chop:   { type: 'chop',   duration: 0.32 },
  mine:   { type: 'mine',   duration: 0.35 },
  forage: { type: 'forage', duration: 0.28 },
  repair: { type: 'repair', duration: 0.3 },
  stoke:  { type: 'repair', duration: 0.28 },
  build:  { type: 'repair', duration: 0.3 },
  dig:    { type: 'dig',    duration: 0.32 },
  raise:  { type: 'raise',  duration: 0.32 },
};

/** (Re)start the swing/dig/hammer animation for `kind` once the previous cycle has finished
 *  playing out, so it visibly repeats for as long as the channel runs. */
function playWorkAnim(player: Player, kind: WorkKind): void {
  const anim = WORK_ANIM[kind];
  if (anim !== undefined && player.actionTimer <= 0) {
    triggerPlayerAction(player, anim.type, anim.duration);
  }
}

/**
 * Commit the player to a sustained action: one keypress starts it, and it plays out on its own
 * over `required` seconds — `advanceWork` below is what actually ticks it forward every frame
 * without any further input. `movePlayer` roots the player while `workKind !== 'none'`, so the
 * target tile this captures can't go stale.
 */
export function startWork(player: Player, kind: WorkKind, gx: number, gy: number, required: number): void {
  player.workKind = kind;
  player.workGx = gx;
  player.workGy = gy;
  player.workProgress = 0;
  player.workRequired = required;
  playWorkAnim(player, kind);
}

/**
 * Advance the player's in-progress work by `dt`, replaying the swing animation as each cycle
 * finishes. Returns true on the tick progress reaches `workRequired` — the caller resolves the
 * actual harvest/build/dig/raise then, via `facingTile`, which is still valid because the player
 * has stood still the whole channel: `movePlayer` cancels (`clearWork`) the instant a movement key
 * is pressed, so this only ever gets to run to completion when they haven't moved. No-op (returns
 * false) when nothing is in progress.
 */
export function advanceWork(player: Player, dt: number): boolean {
  if (player.workKind === 'none') return false;
  player.workProgress += dt;
  playWorkAnim(player, player.workKind);
  if (player.workProgress >= player.workRequired) {
    player.workKind = 'none';
    player.workProgress = 0;
    return true;
  }
  return false;
}

/** Abandon any in-progress sustained work (target lost, respawned, etc). */
export function clearWork(player: Player): void {
  if (player.workKind !== 'none') {
    player.workKind = 'none';
    player.workProgress = 0;
  }
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
