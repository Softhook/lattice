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
import type { WorldTerrain } from './world.js';
import { W, H } from './world.js';
import type { Creature } from './creatures.js';
import type { Player } from './players.js';
import { facingTile } from './players.js';

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

/** Perform an attack with the player's equipped weapon. */
export function executeAttack(
  player: Player,
  creatures: Creature[],
  projectiles: Projectile[],
  baseHeightPx: number,
): AttackResult {
  const weapon = WEAPONS[player.weapon];

  if (weapon.isRanged) {
    const fired = launchArrow(projectiles, player, baseHeightPx);
    player.attackCooldown = weapon.cooldownSec;
    return {
      hit: fired,
      damageDealt: 0,
      creatureDefeated: false,
      isRanged: true,
      msg: fired ? 'SHOT ARROW' : '',
    };
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
    const dist = Math.sqrt(dx * dx + dy * dy);
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

    // Apply knockback
    let kx = 0;
    let ky = 0;
    switch (player.facing) {
      case 'n': ky = -weapon.knockback; break;
      case 's': ky = weapon.knockback;  break;
      case 'e': kx = weapon.knockback;  break;
      case 'w': kx = -weapon.knockback; break;
    }
    targetCreature.gx = clamp(targetCreature.gx + kx, 2, W - 3);
    targetCreature.gy = clamp(targetCreature.gy + ky, 2, H - 3);
    targetCreature.idleTimer = 0.4;
    targetCreature.state = targetCreature.species === 'troll' || targetCreature.species === 'wolf' ? 'chase' : 'flee';

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

  return {
    hit: false,
    damageDealt: 0,
    creatureDefeated: false,
    isRanged: false,
    msg: `SWUNG ${weapon.name.toUpperCase()}`,
  };
}

/** Step active projectiles, checking collision against creatures and world boundaries. */
export function stepProjectiles(
  projectiles: Projectile[],
  creatures: Creature[],
  players: readonly [Player, Player],
  world: WorldTerrain,
  dt: number,
): AttackResult[] {
  const events: AttackResult[] = [];

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

    const groundH = world.heights.get(Math.floor(p.x), Math.floor(p.y)) * 8;
    if (p.z <= groundH) {
      // Landed on ground
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
        // Knockback along projectile vector
        const mag = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
        c.gx = clamp(c.gx + (p.vx / mag) * 0.6, 2, W - 3);
        c.gy = clamp(c.gy + (p.vy / mag) * 0.6, 2, H - 3);
        c.idleTimer = 0.3;
        c.state = c.species === 'troll' || c.species === 'wolf' ? 'chase' : 'flee';

        const killed = c.hp <= 0;
        const shooter = players[p.shooterIndex];
        if (killed && shooter !== undefined) {
          dropCreatureLoot(shooter, c.species);
        }

        events.push({
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
  }

  return events;
}

/** Drop material rewards directly into player inventory upon creature defeat. */
function dropCreatureLoot(player: Player, species: string): void {
  switch (species) {
    case 'rabbit':
      player.inventory.fiber += 4;
      break;
    case 'deer':
      player.inventory.wood += 6;
      player.inventory.fiber += 8;
      break;
    case 'fox':
      player.inventory.fiber += 6;
      player.inventory.stone += 4;
      break;
    case 'wolf':
      player.inventory.stone += 8;
      player.inventory.fiber += 10;
      break;
    case 'troll':
      player.inventory.wood += 20;
      player.inventory.stone += 24;
      player.inventory.fiber += 12;
      break;
  }
}

export { canAffordWeapon, craftWeapon, craftNextAvailable, cycleWeapon } from './players.js';