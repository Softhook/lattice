/**
 * Player state and movement.
 *
 * Two players, each with a tile position, facing, action mode, and HP.
 * Movement is continuous (held-key, polled each update tick) at a fixed speed.
 * Actions (dig, build) fire at the tile the player is currently facing.
 *
 * Players are drawn as isometric explorer sprites colored by their index.
 * HP drains when a hostile creature attacks; it regenerates slowly when safe.
 */

import { clamp } from '@latticekit/core';
import type { WorldTerrain } from './world.js';
import { dig, raise, isWalkable, W, H } from './world.js';
import type { Building } from './buildings.js';
import { placeBuilding, type BuildingKind } from './buildings.js';
import type { FloraItem } from './flora.js';
import { harvestFloraAt } from './flora.js';

// ── Player state ───────────────────────────────────────────────────────────────

export type Facing = 'n' | 's' | 'e' | 'w';

export type PlayerMode = 'move' | BuildingKind;

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
  /** Hit points. 0 → player is knocked down (respawns after 3 s). */
  hp: number;
  /** Seconds remaining before HP regen resumes. Set on taking damage. */
  combatCooldown: number;
  /** Seconds remaining for red damage flash indicator. */
  hurtFlash: number;
  /** Respawn timer in seconds. > 0 means knocked down. */
  respawnTimer: number;
  /** Accumulated movement sub-tile distance for smooth stepping. */
  moveAccum: number;
}

/** Tiles per second at normal walk speed. */
const WALK_SPEED = 3.2;

/** Max player HP. */
const MAX_HP = 100;

/** HP regen rate per second when out of combat. */
const REGEN_RATE = 4;

/** Seconds before respawn after reaching 0 HP. */
const RESPAWN_TIME = 3;

export const PLAYER_MODES: readonly PlayerMode[] = ['move', 'wall', 'floor', 'tower', 'ramp'];
export const BUILD_KINDS: readonly BuildingKind[] = ['wall', 'floor', 'tower', 'ramp'];

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
    buildKind: 'wall',
    hp: MAX_HP,
    combatCooldown: 0,
    hurtFlash: 0,
    respawnTimer: 0,
    moveAccum: 0,
  };
}

// ── Movement ───────────────────────────────────────────────────────────────────

/**
 * Move a player by (dx, dy) grid directions this tick.
 *
 * `dx` and `dy` are each −1, 0, or +1 from held-key polling.
 * The player can only step into walkable tiles.
 */
export function movePlayer(
  player: Player,
  dx: number,
  dy: number,
  world: WorldTerrain,
  dt: number,
): void {
  if (player.respawnTimer > 0) return;
  if (dx === 0 && dy === 0) return;

  // Update facing from movement direction.
  if      (dy < 0) player.facing = 'n';
  else if (dy > 0) player.facing = 's';
  else if (dx < 0) player.facing = 'w';
  else             player.facing = 'e';

  const speed  = WALK_SPEED * dt;
  const mag    = dx !== 0 && dy !== 0 ? 0.7071 : 1; // diagonal normalisation
  const nx     = player.gx + dx * speed * mag;
  const ny     = player.gy + dy * speed * mag;

  // Check walkability for the destination tile.
  const tileX  = clamp(Math.floor(nx), 0, W - 1);
  const tileY  = clamp(Math.floor(ny), 0, H - 1);

  if (isWalkable(world, tileX, tileY)) {
    player.gx = clamp(nx, 0, W - 1);
    player.gy = clamp(ny, 0, H - 1);
  }
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

/** Build the currently selected structure at the player's facing tile. Only active in build mode. */
export function buildAtFacing(
  player: Player,
  world: WorldTerrain,
  buildings: Building[],
): Building | undefined {
  if (player.respawnTimer > 0 || player.mode === 'move') return undefined;
  const { gx, gy } = facingTile(player);
  return placeBuilding(player.mode, gx, gy, world, buildings);
}

/**
 * Interact / Chop / Harvest / Mine at the player's facing tile.
 *
 * - Chops down trees (pine, oak)
 * - Gathers flowers, bushes, and mushrooms
 * - Mines rocks/boulders
 * - Repairs damaged buildings
 */
export function interactAtFacing(
  player: Player,
  world: WorldTerrain,
  flora: FloraItem[],
  buildings: Building[],
): string | undefined {
  if (player.respawnTimer > 0) return undefined;
  const { gx, gy } = facingTile(player);

  // 1. Check for flora at the facing tile
  const harvested = harvestFloraAt(flora, gx, gy);
  if (harvested !== undefined) {
    player.hurtFlash = 0.15;
    switch (harvested.kind) {
      case 'pine':
      case 'oak':
        return `CHOPPED ${harvested.kind.toUpperCase()} TREE`;
      case 'flowers':
        return 'GATHERED WILDFLOWERS';
      case 'bush':
        return 'HARVESTED BERRIES';
      case 'mushroom':
        return 'FORAGED MUSHROOM';
      case 'rock':
        return 'MINED BOULDER';
    }
  }

  // 2. Check if facing a building (can repair building if damaged)
  for (const b of buildings) {
    if (gx >= b.gx && gx < b.gx + b.w && gy >= b.gy && gy < b.gy + b.d) {
      if (b.hp < b.maxHp) {
        b.hp = Math.min(b.maxHp, b.hp + 30);
        player.hurtFlash = 0.1;
        return `REPAIRED ${b.kind.toUpperCase()}`;
      }
      return `${b.kind.toUpperCase()} (HP: ${Math.round(b.hp)}/${b.maxHp})`;
    }
  }

  return undefined;
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

/** Cycle through player modes: move -> wall -> floor -> tower -> ramp -> move. */
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

/** Update HP regen, damage flash, and respawn timer. Call once per update tick. */
export function tickPlayer(player: Player, dt: number): void {
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
    }
    return;
  }
  if (player.combatCooldown > 0) {
    player.combatCooldown = Math.max(0, player.combatCooldown - dt);
  } else if (player.hp < MAX_HP) {
    player.hp = Math.min(MAX_HP, player.hp + REGEN_RATE * dt);
  }
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
