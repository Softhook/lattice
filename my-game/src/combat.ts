/**
 * Combat & Weapon System for Verdant.
 *
 * Implements:
 * - Weapon types: Hands (default), Axe (heavy), Sword (fast), Bow (ranged).
 * - 3D ballistic projectile simulation for arrows (zero heap allocations).
 * - Melee arc and ranged projectile hit detection against creatures.
 * - Knockback physics, damage calculation, and creature loot drops.
 * - Enemy projectile pool: goblin arrows fired at players, separate from the
 *   player-fired pool so damage direction is always unambiguous.
 *
 * Fully deterministic: all kinematics are Tier A arithmetic.
 */

import { clamp } from '@latticekit/core';
import { heightAt } from '@latticekit/iso';
import { hex, type Rgba } from '@latticekit/draw';
import type { WorldTerrain } from './world.js';
import { W, H } from './world.js';
import { SPECIES_REGISTRY, RETALIATE_SECONDS, type Species, type Creature } from './creatures.js';
import type { Player, AimDir } from './players.js';
import { triggerPlayerAction, aimDirFromVec } from './players.js';
import type { Building } from './buildings.js';
import { isMissionStructure, BUILDING_REGISTRY, isTileOccupiedBySolidBuilding } from './buildings.js';
import { spawnFoodDrop, type FoodDrop } from './food.js';

export type WeaponKind = 'hands' | 'axe' | 'sword' | 'bow';

export interface WeaponCost {
  readonly wood: number;
  readonly stone: number;
  readonly fiber: number;
  /** Iron ore — only the sword needs it, and it is the one material you cannot gather on the
   *  surface, so a blade is a reward for digging deep. */
  readonly iron: number;
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
    cost: { wood: 0, stone: 0, fiber: 0, iron: 0 },
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
    cost: { wood: 8, stone: 4, fiber: 0, iron: 0 },
  },
  sword: {
    kind: 'sword',
    name: 'Iron Sword',
    icon: '⚔️',
    isRanged: false,
    damage: 38,
    reach: 1.45,
    cooldownSec: 0.28,
    knockback: 0.8,
    cost: { wood: 4, stone: 0, fiber: 0, iron: 3 },
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
    cost: { wood: 10, stone: 0, fiber: 6, iron: 0 },
  },
};

export const CRAFTABLE_WEAPONS: readonly WeaponKind[] = ['axe', 'sword', 'bow'];

/** A melee swing connects with anything within reach whose bearing is within ~50° of the aim
 *  line (`cos 50° ≈ 0.64`) — a 100°-wide arc, wide enough that the eight aim directions overlap
 *  slightly instead of leaving un-hittable wedges between them. */
const MELEE_CONE_COS = 0.64;

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
  /** For `slash` FX: the eight-way direction the blade arc sweeps. Other FX kinds leave this at
   *  its default and never read it. */
  facing: AimDir;
  color: Rgba;
  size: number;
  lifeSec: number;
  maxLifeSec: number;
}

export const MAX_FX = 256;

/** Screen-space sweep angle for a slash arc per aim direction — the stylized mapping the FX
 *  renderer expects (east = 0, south = +π/2, clockwise), extended from the original four axes to
 *  all eight compass points. Render-only (feeds `Math.cos`/`Math.sin` for pixels), never hashed.
 *  Shared with `render.ts`. */
export const AIM_ARC_ANGLE: Readonly<Record<AimDir, number>> = {
  e: 0,
  se: Math.PI * 0.25,
  s: Math.PI * 0.5,
  sw: Math.PI * 0.75,
  w: Math.PI,
  nw: -Math.PI * 0.75,
  n: -Math.PI * 0.5,
  ne: -Math.PI * 0.25,
};

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
  facing: AimDir,
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

/** Common ballistic state for physical projectiles flying through the air (player & enemy arrows). */
export interface BallisticProjectile {
  x: number;
  y: number;
  /** Height in world pixels above ground. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  lifeSec: number;
  live: boolean;
}

export interface Projectile extends BallisticProjectile {
  damage: number;
  shooterIndex: 0 | 1;
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

/**
 * Step standard ballistic projectile motion: lifespan decay, velocity integration,
 * gravity, world boundaries, and terrain collision. Returns true if projectile remains
 * active in-flight, or false if it expired, fell out-of-bounds, or impacted the ground.
 */
export function stepBallisticMotion(
  p: BallisticProjectile,
  world: WorldTerrain,
  dt: number,
  fxPool?: VisualFx[],
  debrisColor: Rgba | number = hex('#8d6e63'),
): boolean {
  p.lifeSec -= dt;
  if (p.lifeSec <= 0) {
    p.live = false;
    return false;
  }

  // Kinematics — Tier A arithmetic per spec (+, -, *, /)
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vz -= GRAVITY_PX * dt;
  p.z += p.vz * dt;

  if (p.x < 1 || p.y < 1 || p.x >= W - 1 || p.y >= H - 1) {
    p.live = false;
    return false;
  }

  const groundH = heightAt(world.field, p.x, p.y);
  if (p.z <= groundH) {
    // Landed on ground — spawn subtle impact dust
    if (fxPool !== undefined) {
      spawnHarvestDebris(fxPool, p.x, p.y, groundH, debrisColor, 3);
    }
    p.live = false;
    return false;
  }

  return true;
}

/** Reusable target for `aimComponents` — combat resolves an aim direction at most once per
 *  attack, on the input thread, so a shared scratch is safe. */
const AIM_SCRATCH: { x: number; y: number } = { x: 0, y: 0 };

/** Resolve the unit-ish direction this attack fires along. Uses the eight-way `player.aim*` set
 *  by `setAttackAim`, falling back to the 4-way `facing` when aim was never set (unit tests, or
 *  the very first frame). Writes into `AIM_SCRATCH` and returns it — zero allocation. */
function aimComponents(player: Player): { x: number; y: number } {
  let x = player.aimX;
  let y = player.aimY;
  if (x === 0 && y === 0) {
    switch (player.facing) {
      case 'n': y = -1; break;
      case 's': y = 1;  break;
      case 'e': x = 1;  break;
      case 'w': x = -1; break;
    }
  }
  AIM_SCRATCH.x = x;
  AIM_SCRATCH.y = y;
  return AIM_SCRATCH;
}

/** Launch an arrow from player position in the current aim direction (eight-way). */
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

  const aim = aimComponents(player);
  const dirX = aim.x;
  const dirY = aim.y;

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
 *  suite) don't need to know mission structures exist. `foodPool`, likewise optional, is where a
 *  slain game animal's meat is dropped (see `food.ts`); omit it and kills simply drop no food. */
export function executeAttack(
  player: Player,
  creatures: Creature[],
  projectiles: Projectile[],
  baseHeightPx: number,
  fxPool?: VisualFx[],
  buildings: readonly Building[] = [],
  foodPool?: FoodDrop[],
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

  // Eight-way aim for this swing: melee arc, knockback and the slash FX all read it.
  const aim = aimComponents(player);
  const aimX = aim.x;
  const aimY = aim.y;

  // Spawn visual slash arc in front of player, sweeping along the aim direction.
  if (fxPool !== undefined && (player.weapon === 'sword' || player.weapon === 'axe')) {
    spawnSlashFx(
      fxPool,
      player.gx + aimX * 0.7,
      player.gy + aimY * 0.7,
      baseHeightPx + 14,
      aimDirFromVec(aimX, aimY),
      player.weapon === 'sword' ? hex('#81ecec') : hex('#fab1a0'),
      player.weapon === 'axe' ? 1.4 : 1.2,
    );
  }

  // Melee attack: a creature counts as struck when it's within reach and within ~50° of the aim
  // line (cos 0.64). A 100°-wide arc leaves a little forgiving overlap between the eight aim
  // directions rather than a dead wedge between them.
  player.attackCooldown = weapon.cooldownSec;
  let bestDist = weapon.reach;
  let targetCreature: Creature | undefined;

  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c === undefined || c.hp <= 0) continue;
    const dx = c.gx - player.gx;
    const dy = c.gy - player.gy;
    const dist = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt is exact per spec — melee hit-check distance
    // `bestDist` starts at the weapon's reach and only shrinks, so `dist < bestDist` subsumes the
    // reach test; `dist > 0` guards the divide against a creature sharing the player's tile.
    if (dist > 0 && dist < bestDist) {
      const alignment = (dx * aimX + dy * aimY) / dist; // cos of angle between target bearing and aim
      if (alignment >= MELEE_CONE_COS) {
        bestDist = dist;
        targetCreature = c;
      }
    }
  }

  if (targetCreature !== undefined) {
    const dmg = weapon.damage;
    targetCreature.hp -= dmg;
    targetCreature.hurtTimer = 0.25; // Trigger creature damage flinch

    // Apply knockback along the aim line
    applyKnockback(targetCreature, aimX * weapon.knockback, aimY * weapon.knockback, buildings);
    targetCreature.idleTimer = 0.4;
    // A defensive predator (crocodile) doesn't flee a hit like other non-apex animals — it turns
    // and fights back, and stays provoked for `RETALIATE_SECONDS` (see `updateOne` in
    // `creatures.ts`).
    const hitBehavior = SPECIES_REGISTRY[targetCreature.species].behavior;
    if (hitBehavior === 'defensive') {
      targetCreature.state = 'chase';
      targetCreature.retaliateTimer = RETALIATE_SECONDS;
    } else {
      targetCreature.state = hitBehavior === 'apex' ? 'chase' : 'flee';
    }

    // Spawn impact hit sparks
    if (fxPool !== undefined) {
      spawnHitSparks(fxPool, targetCreature.gx, targetCreature.gy, baseHeightPx + 12, hex('#ff7675'), 8);
    }

    const killed = targetCreature.hp <= 0;
    if (killed) {
      dropCreatureLoot(player, targetCreature.species);
      if (foodPool !== undefined) {
        spawnFoodDrop(foodPool, targetCreature.gx, targetCreature.gy, targetCreature.species);
      }
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
    if (dist <= bestBDist && dist > 0 && (dx * aimX + dy * aimY) / dist >= MELEE_CONE_COS) {
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
  foodPool?: FoodDrop[],
): readonly AttackResult[] {
  HIT_EVENTS_SCRATCH.length = 0;

  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (p === undefined || !p.live) continue;

    if (!stepBallisticMotion(p, world, dt, fxPool, hex('#8d6e63'))) {
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
        // Defensive predators (crocodile) retaliate on a hit rather than flee — same rule as the
        // melee path in `executeAttack`.
        const hitBehavior = SPECIES_REGISTRY[c.species].behavior;
        if (hitBehavior === 'defensive') {
          c.state = 'chase';
          c.retaliateTimer = RETALIATE_SECONDS;
        } else {
          c.state = hitBehavior === 'apex' ? 'chase' : 'flee';
        }

        if (fxPool !== undefined) {
          spawnHitSparks(fxPool, c.gx, c.gy, p.z, hex('#ff7675'), 8);
        }

        const killed = c.hp <= 0;
        const shooter = players[p.shooterIndex];
        if (killed && shooter !== undefined) {
          dropCreatureLoot(shooter, c.species);
        }
        if (killed && foodPool !== undefined) {
          spawnFoodDrop(foodPool, c.gx, c.gy, c.species);
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


// ── Enemy Projectiles (Goblin Arrows) ───────────────────────────────────────────
//
// A separate pool from the player-fired `Projectile` pool so damage direction is unambiguous:
// `EnemyProjectile` hits players; `Projectile` hits creatures. Neither type hits the same faction
// as its shooter. The pool is pre-allocated (zero heap on the hot path) and sized for the
// realistic maximum of simultaneous goblin-archers on screen, not the entire species population.

/** Maximum simultaneous enemy arrows (goblin volleys) in flight. Sized for the realistic on-screen
 *  goblin count — goblins fire slowly (GOBLIN_BOW_COOLDOWN ≈ 2.8 s) so this never fills in practice,
 *  but the hard cap prevents a stack of goblins overwhelming the pool on a very bad frame. */
export const MAX_ENEMY_PROJECTILES = 32;

/** An arrow shot by a goblin archer at a player. Kinematics are identical to player arrows;
 *  only the hit target and tint differ. */
export interface EnemyProjectile extends BallisticProjectile {
  damage: number;
}

/** Pre-allocate the enemy projectile pool for zero per-frame garbage. */
export function createEnemyProjectilePool(): EnemyProjectile[] {
  const pool: EnemyProjectile[] = [];
  for (let i = 0; i < MAX_ENEMY_PROJECTILES; i++) {
    pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, damage: 0, lifeSec: 0, live: false });
  }
  return pool;
}

/** Goblin arrow damage per hit. Low enough that a single shot is annoying, not devastating;
 *  a volley of three goblins is actually dangerous. Night darkness bonus applied at launch. */
const GOBLIN_ARROW_DAMAGE = 8;

/** Arrow flight speed in tiles per second — same as player arrows for fair visual parity. */
const ENEMY_ARROW_SPEED = 12.0;

/**
 * Launch a goblin arrow from (fromGx, fromGy) toward (targetGx, targetGy), with a random
 * angular scatter baked in at launch time so the shot is permanently off-course rather than
 * correcting each tick.
 *
 * `aimScatterRads` is the magnitude of the error in radians; its sign comes from the goblin's
 * own Rng so each goblin has a stable "aim bias" — one always overshoots left, another always
 * undershoots right — rather than spraying randomly each shot. @tier-b annotation on the
 * cos/sin rotation: scatter is presentation-only and never reaches a hash or save file.
 */
export function launchEnemyArrow(
  pool: EnemyProjectile[],
  fromGx: number,
  fromGy: number,
  baseHeightPx: number,
  targetGx: number,
  targetGy: number,
  aimScatterRads: number,
  darkness: number,
): boolean {
  let p: EnemyProjectile | undefined;
  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    if (item !== undefined && !item.live) { p = item; break; }
  }
  if (p === undefined) return false;

  const dx = targetGx - fromGx;
  const dy = targetGy - fromGy;
  const dist = Math.sqrt(dx * dx + dy * dy); // Tier A: sqrt exact per spec — aim setup, pixels only
  if (dist < 0.01) return false;

  // Apply scatter: rotate the aim vector by aimScatterRads. @tier-b — rotation for pixels only.
  const cs = Math.cos(aimScatterRads);
  const sn = Math.sin(aimScatterRads);
  const dirX = (dx / dist) * cs - (dy / dist) * sn;
  const dirY = (dx / dist) * sn + (dy / dist) * cs;

  p.x = fromGx + dirX * 0.5;
  p.y = fromGy + dirY * 0.5;
  p.z = baseHeightPx + 12;
  p.vx = dirX * ENEMY_ARROW_SPEED;
  p.vy = dirY * ENEMY_ARROW_SPEED;
  p.vz = 40;
  p.damage = GOBLIN_ARROW_DAMAGE * (1 + darkness * 0.3);
  p.lifeSec = 1.4;
  p.live = true;
  return true;
}

/** Step all live enemy projectiles, applying gravity and checking player hit. Returns true if
 *  any player was struck this tick — caller uses this to gate the hurt-sound effect. */
export function stepEnemyProjectiles(
  pool: EnemyProjectile[],
  players: readonly [Player, Player],
  world: WorldTerrain,
  dt: number,
  fxPool?: VisualFx[],
): boolean {
  let anyHit = false;

  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (p === undefined || !p.live) continue;

    if (!stepBallisticMotion(p, world, dt, fxPool, 0x7a5528ff)) {
      continue;
    }

    // Check hit against players
    for (let pi = 0; pi < players.length; pi++) {
      const player = players[pi];
      if (player === undefined || !player.active || player.respawnTimer > 0) continue;
      const ddx = player.gx - p.x;
      const ddy = player.gy - p.y;
      if (ddx * ddx + ddy * ddy < 0.65 * 0.65) {
        player.sleeping = false;
        player.hp = Math.max(0, player.hp - p.damage);
        player.combatCooldown = 3.0;
        player.hurtFlash = 0.35;
        if (player.hp <= 0) {
          player.hp = 0;
          player.respawnTimer = 3;
        }
        if (fxPool !== undefined) {
          spawnHitSparks(fxPool, p.x, p.y, p.z, hex('#e74c3c'), 6);
        }
        p.live = false;
        anyHit = true;
        break;
      }
    }
  }

  return anyHit;
}