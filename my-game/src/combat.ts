/**
 * Combat & Weapon System for Verdant.
 *
 * Implements:
 * - Weapon types: Hands (default), Axe (heavy), Sword (fast), Bow (ranged).
 * - 3D ballistic projectile simulation for arrows (zero heap allocations).
 * - Melee arc and ranged projectile hit detection against creatures.
 * - Knockback physics, damage calculation, and creature loot drops.
 *
 * Fully deterministic: all kinematics are Tier A arithmetic.
 */

import { clamp } from '@latticekit/core';
import { heightAt } from '@latticekit/iso';
import { hex, type Rgba } from '@latticekit/draw';
import type { WorldTerrain } from './world.js';
import { W, H } from './world.js';
import { SPECIES_REGISTRY, type Species, type Creature } from './creatures.js';
import type { Player } from './players.js';
import { facingTile, triggerPlayerAction, isInForwardCone } from './players.js';
import type { Building } from './buildings.js';
import { isMissionStructure, BUILDING_REGISTRY, isTileOccupiedBySolidBuilding } from './buildings.js';

export type WeaponKind = 'hands' | 'axe' | 'sword' | 'bow';

export interface WeaponCost {
  readonly wood: number;
  readonly stone: number;
  readonly fiber: number;
}

export interface WeaponDef {
  readonly kind: WeaponKind;
  readonly name: string;
  readonly icon: string;
  readonly isRanged: boolean;
  readonly damage: number;
  readonly reach: number;
  readonly cooldownSec: number;
  readonly knockback: number;
  readonly cost: WeaponCost;
}

export const WEAPONS: Record<WeaponKind, WeaponDef> = {
  hands: {
    kind: 'hands',
    name: 'Fists',
    icon: '👊',
    isRanged: false,
    damage: 8,
    reach: 1.1,
    cooldownSec: 0.22,
    knockback: 0.4,
    cost: { wood: 0, stone: 0, fiber: 0 },
  },
  axe: {
    kind: 'axe',
    name: 'Woodsman Axe',
    icon: '🪓',
    isRanged: false,
    damage: 28,
    reach: 1.35,
    cooldownSec: 0.38,
    knockback: 1.2,
    cost: { wood: 8, stone: 4, fiber: 0 },
  },
  sword: {
    kind: 'sword',
    name: 'Stone Blade',
    icon: '⚔️',
    isRanged: false,
    damage: 38,
    reach: 1.45,
    cooldownSec: 0.28,
    knockback: 0.8,
    cost: { wood: 6, stone: 10, fiber: 0 },
  },
  bow: {
    kind: 'bow',
    name: 'Hunting Bow',
    icon: '🏹',
    isRanged: true,
    damage: 26,
    reach: 14.0,
    cooldownSec: 0.42,
    knockback: 0.6,
    cost: { wood: 10, stone: 0, fiber: 6 },
  },
};

export const CRAFTABLE_WEAPONS: readonly WeaponKind[] = ['axe', 'sword', 'bow'];

// ── Combat & Harvest Visual FX (Zero Heap Allocation) ───────────────────────────

export type FxKind = 'slash' | 'spark' | 'shockwave' | 'debris';

export interface VisualFx {
  live: boolean;
  kind: FxKind;
  gx: number;
  gy: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  facing: 'n' | 's' | 'e' | 'w';
  color: Rgba;
  size: number;
  lifeSec: number;
  maxLifeSec: number;
}

export const MAX_FX = 256;

/** Fast deterministic linear congruential generator for particle kinematics. */
let fxSeed = 1337;
function fxRand(): number {
  fxSeed = (fxSeed * 1664525 + 1013904223) >>> 0;
  return (fxSeed & 0xffff) / 65536;
}

/** Pre-allocated FX pool for zero per-frame garbage collection allocations. */
export function createFxPool(): VisualFx[] {
  const pool: VisualFx[] = [];
  for (let i = 0; i < MAX_FX; i++) {
    pool.push({
      live: false,
      kind: 'slash',
      gx: 0,
      gy: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      facing: 's',
      color: 0xffffffff,
      size: 1,
      lifeSec: 0,
      maxLifeSec: 0.2,
    });
  }
  return pool;
}

/** Spawn an animated curved crescent slash arc in front of the attacker. */
export function spawnSlashFx(
  pool: VisualFx[],
  gx: number,
  gy: number,
  z: number,
  facing: 'n' | 's' | 'e' | 'w',
  color: Rgba = 0xffffffff,
  size = 1.1,
): void {
  for (let i = 0; i < pool.length; i++) {
    const fx = pool[i];
    if (fx !== undefined && !fx.live) {
      fx.live = true;
      fx.kind = 'slash';
      fx.gx = gx;
      fx.gy = gy;
      fx.z = z;
      fx.vx = 0;
      fx.vy = 0;
      fx.vz = 0;
      fx.facing = facing;
      fx.color = color;
      fx.size = size;
      fx.lifeSec = 0.18;
      fx.maxLifeSec = 0.18;
      return;
    }
  }
}

/** Spawn bright directional impact sparks on strike contact. */
export function spawnHitSparks(
  pool: VisualFx[],
  gx: number,
  gy: number,
  z: number,
  color: Rgba = hex('#ffcc00'),
  count = 6,
): void {
  let spawned = 0;
  for (let i = 0; i < pool.length && spawned < count; i++) {
    const fx = pool[i];
    if (fx !== undefined && !fx.live) {
      fx.live = true;
      fx.kind = 'spark';
      fx.gx = gx + (fxRand() - 0.5) * 0.3;
      fx.gy = gy + (fxRand() - 0.5) * 0.3;
      fx.z = z + (fxRand() - 0.5) * 8;
      fx.vx = (fxRand() - 0.5) * 5;
      fx.vy = (fxRand() - 0.5) * 5;
      fx.vz = 35 + fxRand() * 35;
      fx.facing = 's';
      fx.color = color;
      fx.size = 2.2;
      fx.lifeSec = 0.22;
      fx.maxLifeSec = 0.22;
      spawned++;
    }
  }
}

/** Spawn an expanding ground shockwave ring. */
export function spawnShockwave(
  pool: VisualFx[],
  gx: number,
  gy: number,
  z: number,
  color: Rgba = hex('#bdc3c7'),
  size = 2.4,
): void {
  for (let i = 0; i < pool.length; i++) {
    const fx = pool[i];
    if (fx !== undefined && !fx.live) {
      fx.live = true;
      fx.kind = 'shockwave';
      fx.gx = gx;
      fx.gy = gy;
      fx.z = z;
      fx.vx = 0;
      fx.vy = 0;
      fx.vz = 0;
      fx.facing = 's';
      fx.color = color;
      fx.size = size;
      fx.lifeSec = 0.36;
      fx.maxLifeSec = 0.36;
      return;
    }
  }
}

/** Spawn flying harvest splinters, stone chips, petals, or dirt debris. */
export function spawnHarvestDebris(
  pool: VisualFx[],
  gx: number,
  gy: number,
  z: number,
  color: Rgba,
  count = 6,
): void {
  let spawned = 0;
  for (let i = 0; i < pool.length && spawned < count; i++) {
    const fx = pool[i];
    if (fx !== undefined && !fx.live) {
      fx.live = true;
      fx.kind = 'debris';
      fx.gx = gx + (fxRand() - 0.5) * 0.35;
      fx.gy = gy + (fxRand() - 0.5) * 0.35;
      fx.z = z + 4 + fxRand() * 8;
      fx.vx = (fxRand() - 0.5) * 4;
      fx.vy = (fxRand() - 0.5) * 4;
      fx.vz = 25 + fxRand() * 30;
      fx.facing = 's';
      fx.color = color;
      fx.size = 2.4;
      fx.lifeSec = 0.32;
      fx.maxLifeSec = 0.32;
      spawned++;
    }
  }
}

/** Step all active FX particles and update lifecycles. */
export function stepFx(pool: VisualFx[], dt: number): void {
  for (let i = 0; i < pool.length; i++) {
    const fx = pool[i];
    if (fx === undefined || !fx.live) continue;
    fx.lifeSec -= dt;
    if (fx.lifeSec <= 0) {
      fx.live = false;
      continue;
    }
    if (fx.kind === 'spark' || fx.kind === 'debris') {
      fx.gx += fx.vx * dt;
      fx.gy += fx.vy * dt;
      fx.vz -= 280 * dt; // gravity
      fx.z += fx.vz * dt;
    }
  }
}

// ── 3D Ballistic Projectiles (Arrows) ───────────────────────────────────────────

export const MAX_PROJECTILES = 64;

export interface Projectile {
  x: number;
  y: number;
  /** Height in world pixels above ground. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  shooterIndex: 0 | 1;
  lifeSec: number;
  live: boolean;
}

/** Pre-allocated projectile pool for zero-allocation simulation. */
export function createProjectilePool(): Projectile[] {
  const pool: Projectile[] = [];
  for (let i = 0; i < MAX_PROJECTILES; i++) {
    pool.push({
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      damage: 0,
      shooterIndex: 0,
      lifeSec: 0,
      live: false,
    });
  }
  return pool;
}

/** Gravity in world pixels per second squared for ballistic arcs. */
const GRAVITY_PX = 460;

/** Launch an arrow from player position in facing direction. */
export function launchArrow(
  pool: Projectile[],
  player: Player,
  baseHeightPx: number,
): boolean {
  let p: Projectile | undefined;
  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    if (item !== undefined && !item.live) {
      p = item;
      break;
    }
  }
  if (p === undefined) return false;

  let dirX = 0;
  let dirY = 0;
  switch (player.facing) {
    case 'n': dirY = -1; break;
    case 's': dirY = 1;  break;
    case 'e': dirX = 1;  break;
    case 'w': dirX = -1; break;
  }

  const speed = 15.0; // tiles per second
  p.x = player.gx + dirX * 0.4;
  p.y = player.gy + dirY * 0.4;
  p.z = baseHeightPx + 16;
  p.vx = dirX * speed;
  p.vy = dirY * speed;
  p.vz = 55; // upward initial loft
  p.damage = WEAPONS.bow.damage;
  p.shooterIndex = player.index;
  p.lifeSec = 1.6;
  p.live = true;

  return true;
}

export interface AttackResult {
  hit: boolean;
  damageDealt: number;
  creatureDefeated: boolean;
  creatureSpecies?: string;
  isRanged: boolean;
  msg: string;
}

/** Knockback substep count. A hit weapon's knockback (axe: 1.2 tiles) can exceed a wall's own
 *  1-tile thickness, so a single unchecked displacement can shove a creature standing next to a
 *  wall straight through it — the bug this function exists to close. Sweeping in fixed
 *  substeps, each checked against building collision, catches both a knockback landing *inside*
 *  a wall tile and one strong enough to clear a thin wall in a single hop; a plain "check only
 *  the final tile" version would miss the second case. */
const KNOCKBACK_STEPS = 8;

/** Displace a creature by (dx, dy) tiles in place, stopping at the last substep that doesn't
 *  land on a solid building. See `KNOCKBACK_STEPS`'s doc comment for why this isn't a single
 *  clamped jump. */
function applyKnockback(c: Creature, dx: number, dy: number, buildings: readonly Building[]): void {
  for (let i = 0; i < KNOCKBACK_STEPS; i++) {
    const nx = clamp(c.gx + dx / KNOCKBACK_STEPS, 2, W - 3);
    const ny = clamp(c.gy + dy / KNOCKBACK_STEPS, 2, H - 3);
    if (isTileOccupiedBySolidBuilding(Math.floor(nx), Math.floor(ny), buildings, 'animal')) break;
    c.gx = nx;
    c.gy = ny;
  }
}

/** Perform an attack with the player's equipped weapon and trigger animations & effects.
 *  `buildings` defaults to empty — callers that only exercise creature combat (most of the unit
 *  suite) don't need to know mission structures exist. */
export function executeAttack(
  player: Player,
  creatures: Creature[],
  projectiles: Projectile[],
  baseHeightPx: number,
  fxPool?: VisualFx[],
  buildings: readonly Building[] = [],
): AttackResult {
  const weapon = WEAPONS[player.weapon];

  if (weapon.isRanged) {
    const fired = launchArrow(projectiles, player, baseHeightPx);
    player.attackCooldown = weapon.cooldownSec;
    triggerPlayerAction(player, 'bow_draw', 0.35);
    return {
      hit: fired,
      damageDealt: 0,
      creatureDefeated: false,
      isRanged: true,
      msg: fired ? 'SHOT ARROW' : '',
    };
  }

  // Trigger articulated weapon strike animation
  if (player.weapon === 'sword') {
    triggerPlayerAction(player, 'sword_slash', 0.24);
  } else if (player.weapon === 'axe') {
    triggerPlayerAction(player, 'axe_chop', 0.32);
  } else {
    triggerPlayerAction(player, 'fist_punch', 0.20);
  }

  // Spawn visual slash arc in front of player
  if (fxPool !== undefined && (player.weapon === 'sword' || player.weapon === 'axe')) {
    const fTile = facingTile(player);
    spawnSlashFx(
      fxPool,
      fTile.gx,
      fTile.gy,
      baseHeightPx + 14,
      player.facing,
      player.weapon === 'sword' ? hex('#81ecec') : hex('#fab1a0'),
      player.weapon === 'axe' ? 1.4 : 1.2,
    );
  }

  // Melee attack: check creatures in facing direction cone
  player.attackCooldown = weapon.cooldownSec;
  let bestDist = weapon.reach;
  let targetCreature: Creature | undefined;

  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c === undefined || c.hp <= 0) continue;
    const dx = c.gx - player.gx;
    const dy = c.gy - player.gy;
    const dist = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — melee hit-check distance
    if (dist <= weapon.reach) {
      // Check facing alignment
      let inCone = false;
      switch (player.facing) {
        case 'n': inCone = dy < 0 && Math.abs(dx) < 1.0; break;
        case 's': inCone = dy > 0 && Math.abs(dx) < 1.0; break;
        case 'e': inCone = dx > 0 && Math.abs(dy) < 1.0; break;
        case 'w': inCone = dx < 0 && Math.abs(dy) < 1.0; break;
      }
      if (inCone && dist < bestDist) {
        bestDist = dist;
        targetCreature = c;
      }
    }
  }

  if (targetCreature !== undefined) {
    const dmg = weapon.damage;
    targetCreature.hp -= dmg;
    targetCreature.hurtTimer = 0.25; // Trigger creature damage flinch

    // Apply knockback
    let kx = 0;
    let ky = 0;
    switch (player.facing) {
      case 'n': ky = -weapon.knockback; break;
      case 's': ky = weapon.knockback;  break;
      case 'e': kx = weapon.knockback;  break;
      case 'w': kx = -weapon.knockback; break;
    }
    applyKnockback(targetCreature, kx, ky, buildings);
    targetCreature.idleTimer = 0.4;
    targetCreature.state = SPECIES_REGISTRY[targetCreature.species].behavior === 'apex' ? 'chase' : 'flee';

    // Spawn impact hit sparks
    if (fxPool !== undefined) {
      spawnHitSparks(fxPool, targetCreature.gx, targetCreature.gy, baseHeightPx + 12, hex('#ff7675'), 8);
    }

    const killed = targetCreature.hp <= 0;
    if (killed) {
      dropCreatureLoot(player, targetCreature.species);
    }

    const label = killed
      ? `SLAIN ${targetCreature.species.toUpperCase()} (+${dmg} DMG)`
      : `HIT ${targetCreature.species.toUpperCase()} (-${dmg} HP)`;

    return {
      hit: true,
      damageDealt: dmg,
      creatureDefeated: killed,
      creatureSpecies: targetCreature.species,
      isRanged: false,
      msg: label,
    };
  }

  // No creature in range — check mission structures (the wizard tower). Ordinary player-built
  // structures are never a valid melee target here (see `isMissionStructure`'s doc comment):
  // repairing, not attacking, is how a player restores their own building's hp.
  let targetBuilding: Building | undefined;
  let bestBDist = weapon.reach;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0 || !isMissionStructure(b.kind)) continue;
    const bcx = b.gx + b.w * 0.5;
    const bcy = b.gy + b.d * 0.5;
    const dx = bcx - player.gx;
    const dy = bcy - player.gy;
    const dist = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — melee hit-check distance
    if (dist <= bestBDist && isInForwardCone(player.facing, dx, dy, 1.25)) {
      bestBDist = dist;
      targetBuilding = b;
    }
  }

  if (targetBuilding !== undefined) {
    const dmg = weapon.damage;
    targetBuilding.hp -= dmg;
    const name = BUILDING_REGISTRY[targetBuilding.kind].name.toUpperCase();

    if (fxPool !== undefined) {
      spawnHitSparks(fxPool, targetBuilding.gx + targetBuilding.w * 0.5, targetBuilding.gy + targetBuilding.d * 0.5, baseHeightPx + 30, hex('#a55eea'), 8);
    }

    const destroyed = targetBuilding.hp <= 0;
    return {
      hit: true,
      damageDealt: dmg,
      creatureDefeated: false,
      isRanged: false,
      msg: destroyed ? `DESTROYED ${name}!` : `HIT ${name} (-${dmg} HP)`,
    };
  }

  return {
    hit: false,
    damageDealt: 0,
    creatureDefeated: false,
    isRanged: false,
    msg: `SWUNG ${weapon.name.toUpperCase()}`,
  };
}

const HIT_EVENTS_SCRATCH: AttackResult[] = [];

/** Step active projectiles, checking collision against creatures and world boundaries.
 *  `buildings` defaults to empty — see the note on `executeAttack`. */
export function stepProjectiles(
  projectiles: Projectile[],
  creatures: Creature[],
  players: readonly [Player, Player],
  world: WorldTerrain,
  dt: number,
  fxPool?: VisualFx[],
  buildings: readonly Building[] = [],
): readonly AttackResult[] {
  HIT_EVENTS_SCRATCH.length = 0;

  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (p === undefined || !p.live) continue;

    p.lifeSec -= dt;
    if (p.lifeSec <= 0) {
      p.live = false;
      continue;
    }

    // Kinematics
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vz -= GRAVITY_PX * dt;
    p.z += p.vz * dt;

    if (p.x < 1 || p.y < 1 || p.x >= W - 1 || p.y >= H - 1) {
      p.live = false;
      continue;
    }

    const groundH = heightAt(world.field, p.x, p.y);
    if (p.z <= groundH) {
      // Landed on ground — spawn a few subtle dust particles
      if (fxPool !== undefined) {
        spawnHarvestDebris(fxPool, p.x, p.y, groundH, hex('#8d6e63'), 3);
      }
      p.live = false;
      continue;
    }

    // Check hit against creatures
    for (let ci = 0; ci < creatures.length; ci++) {
      const c = creatures[ci];
      if (c === undefined || c.hp <= 0) continue;

      const dx = c.gx - p.x;
      const dy = c.gy - p.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < 0.75 * 0.75) {
        c.hp -= p.damage;
        c.hurtTimer = 0.25; // Trigger hit flinch
        // Knockback along projectile vector
        const mag = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1; // Tier A: sqrt is exact per spec
        applyKnockback(c, (p.vx / mag) * 0.6, (p.vy / mag) * 0.6, buildings);
        c.idleTimer = 0.3;
        c.state = SPECIES_REGISTRY[c.species].behavior === 'apex' ? 'chase' : 'flee';

        if (fxPool !== undefined) {
          spawnHitSparks(fxPool, c.gx, c.gy, p.z, hex('#ff7675'), 8);
        }

        const killed = c.hp <= 0;
        const shooter = players[p.shooterIndex];
        if (killed && shooter !== undefined) {
          dropCreatureLoot(shooter, c.species);
        }

        HIT_EVENTS_SCRATCH.push({
          hit: true,
          damageDealt: p.damage,
          creatureDefeated: killed,
          creatureSpecies: c.species,
          isRanged: true,
          msg: killed ? `ARROW SLAIN ${c.species.toUpperCase()}` : `ARROW HIT ${c.species.toUpperCase()}`,
        });

        p.live = false;
        break;
      }
    }
    if (!p.live) continue;

    // Check hit against mission structures (the wizard tower) — same restriction as melee's
    // building branch: ordinary player-built structures are never a valid arrow target.
    for (let bi = 0; bi < buildings.length; bi++) {
      const b = buildings[bi];
      if (b === undefined || b.hp <= 0 || !isMissionStructure(b.kind)) continue;
      if (p.x < b.gx || p.x >= b.gx + b.w || p.y < b.gy || p.y >= b.gy + b.d) continue;

      b.hp -= p.damage;
      const name = BUILDING_REGISTRY[b.kind].name.toUpperCase();

      if (fxPool !== undefined) {
        spawnHitSparks(fxPool, p.x, p.y, p.z, hex('#a55eea'), 8);
      }

      HIT_EVENTS_SCRATCH.push({
        hit: true,
        damageDealt: p.damage,
        creatureDefeated: false,
        isRanged: true,
        msg: b.hp <= 0 ? `DESTROYED ${name}!` : `ARROW HIT ${name}`,
      });

      p.live = false;
      break;
    }
  }

  return HIT_EVENTS_SCRATCH;
}


/** Drop material rewards directly into player inventory upon creature defeat. */
function dropCreatureLoot(player: Player, species: string): void {
  const spec = SPECIES_REGISTRY[species as Species];
  if (spec === undefined) return;
  if (spec.loot.wood) player.inventory.wood += spec.loot.wood;
  if (spec.loot.stone) player.inventory.stone += spec.loot.stone;
  if (spec.loot.fiber) player.inventory.fiber += spec.loot.fiber;
}



export { canAffordWeapon, craftWeapon, craftNextAvailable, cycleWeapon } from './players.js';