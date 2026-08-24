/**
 * Player state and movement.
 *
 * Two players, each with a tile position, facing, action mode, and HP.
 * Movement is continuous (held-key, polled each update tick) at a fixed speed.
 * Actions (dig, build) fire at the tile the player is currently facing.
 *
 * Players are drawn as isometric capsule sprites colored by their index.
 * HP drains when a hostile creature attacks; it regenerates slowly when safe.
 */

import { clamp } from '@latticekit/core';
import type { WorldTerrain } from './world.js';
import { dig, raise, isWalkable, W, H } from './world.js';
import type { Building } from './buildings.js';
import { placeBuilding, type BuildingKind } from './buildings.js';

// ── Player state ───────────────────────────────────────────────────────────────

export type Facing = 'n' | 's' | 'e' | 'w';
export type PlayerMode = 'move' | 'dig' | 'build';

export interface Player {
  readonly index: 0 | 1;
  /** Current tile position (non-integer while walking). */
  gx: number;
  gy: number;
  /** Which grid direction the player is facing. Affects action target tile. */
  facing: Facing;
  /** What pressing the action key does. */
  mode: PlayerMode;
  /** What to build when mode === 'build'. Cycles with mode switch. */
  buildKind: BuildingKind;
  /** Hit points. 0 → player is knocked down (respawns after 3 s). */
  hp: number;
  /** Respawn timer in seconds. > 0 means knocked down. */
  respawnTimer: number;
  /** Accumulated movement sub-tile distance for smooth stepping. */
  moveAccum: number;
}

/** Tiles per second at normal walk speed. */
const WALK_SPEED = 3.0;

/** Max player HP. */
const MAX_HP = 100;

/** HP regen rate per second when not under attack. */
const REGEN_RATE = 2;

/** Seconds before respawn after reaching 0 HP. */
const RESPAWN_TIME = 3;

const BUILD_KINDS: BuildingKind[] = ['wall', 'floor', 'tower', 'ramp'];

// ── Factory ────────────────────────────────────────────────────────────────────

/** Default spawn positions: player 1 near top-left third, player 2 near top-right third. */
export function createPlayers(): [Player, Player] {
  return [
    makePlayer(0, 32, 32),
    makePlayer(1, 128, 32),
  ];
}

function makePlayer(index: 0 | 1, gx: number, gy: number): Player {
  return {
    index,
    gx,
    gy,
    facing: 's',
    mode:   'move',
    buildKind: 'wall',
    hp:     MAX_HP,
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
function facingTile(player: Player): { gx: number; gy: number } {
  const gx = Math.floor(player.gx);
  const gy = Math.floor(player.gy);
  switch (player.facing) {
    case 'n': return { gx, gy: gy - 1 };
    case 's': return { gx, gy: gy + 1 };
    case 'e': return { gx: gx + 1, gy };
    case 'w': return { gx: gx - 1, gy };
  }
}

/**
 * Perform the player's current mode action on the facing tile.
 *
 * - `dig`:   lowers terrain at the facing tile.
 * - `build`: places the selected building kind at the facing tile.
 * Returns the placed building (if any) so main can add it to the world list.
 */
export function playerAction(
  player: Player,
  world: WorldTerrain,
  buildings: Building[],
): Building | undefined {
  if (player.respawnTimer > 0) return undefined;
  const { gx, gy } = facingTile(player);

  if (player.mode === 'dig') {
    dig(world, gx, gy);
  } else if (player.mode === 'build') {
    return placeBuilding(player.buildKind, gx, gy, world, buildings);
  }
  return undefined;
}

/** Cycle through build kinds or switch between dig/move/build modes. */
export function switchMode(player: Player): void {
  if (player.mode === 'move') {
    player.mode = 'dig';
  } else if (player.mode === 'dig') {
    player.mode = 'build';
  } else {
    // Cycle build kinds, then return to move.
    const idx = BUILD_KINDS.indexOf(player.buildKind);
    if (idx < BUILD_KINDS.length - 1) {
      player.buildKind = BUILD_KINDS[idx + 1] as BuildingKind;
    } else {
      player.buildKind = 'wall';
      player.mode = 'move';
    }
  }
}

// ── HP and respawn ─────────────────────────────────────────────────────────────

/** Update HP regen and respawn timer. Call once per update tick. */
export function tickPlayer(player: Player, dt: number): void {
  if (player.respawnTimer > 0) {
    player.respawnTimer -= dt;
    if (player.respawnTimer <= 0) {
      player.hp = MAX_HP;
      player.respawnTimer = 0;
    }
    return;
  }
  player.hp = Math.min(MAX_HP, player.hp + REGEN_RATE * dt);
}

/** Apply incoming damage. Triggers respawn if HP reaches 0. */
export function damagePlayer(player: Player, amount: number): void {
  if (player.respawnTimer > 0) return;
  player.hp -= amount;
  if (player.hp <= 0) {
    player.hp = 0;
    player.respawnTimer = RESPAWN_TIME;
  }
}

export { MAX_HP };
