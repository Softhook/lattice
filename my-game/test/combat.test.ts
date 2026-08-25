import { describe, it, expect } from 'vitest';
import { heightAt } from '@latticekit/iso';
import { createWorld } from '../src/world.js';

import { createPlayers, canAffordWeapon, craftWeapon, cycleWeapon, craftNextAvailable } from '../src/players.js';
import {
  WEAPONS,
  createProjectilePool,
  createFxPool,
  spawnSlashFx,
  spawnHitSparks,
  spawnShockwave,
  spawnHarvestDebris,
  stepFx,
  launchArrow,
  executeAttack,
  stepProjectiles,
} from '../src/combat.js';
import { spawnCreature, updateCreatures, type Creature } from '../src/creatures.js';
import { playerVariant, creatureVariant } from '../src/sprites.js';

describe('Combat & Weapon Crafting System', () => {
  it('defines all core weapons with valid stats and non-zero costs for craftables', () => {
    expect(WEAPONS.hands.damage).toBe(8);
    expect(WEAPONS.axe.damage).toBe(28);
    expect(WEAPONS.sword.damage).toBe(38);
    expect(WEAPONS.bow.damage).toBe(26);
    expect(WEAPONS.bow.isRanged).toBe(true);

    expect(WEAPONS.axe.cost.wood).toBeGreaterThan(0);
    expect(WEAPONS.sword.cost.stone).toBeGreaterThan(0);
    expect(WEAPONS.bow.cost.fiber).toBeGreaterThan(0);
  });

  it('manages weapon crafting and cycling correctly', () => {
    const [p1] = createPlayers();
    expect(p1.weapon).toBe('hands');
    expect(p1.craftedWeapons).toEqual(['hands']);

    // Set initial materials
    p1.inventory.wood = 30;
    p1.inventory.stone = 20;
    p1.inventory.fiber = 10;

    expect(canAffordWeapon(p1, 'axe')).toBe(true);
    expect(canAffordWeapon(p1, 'sword')).toBe(true);
    expect(canAffordWeapon(p1, 'bow')).toBe(true);

    // Craft Axe
    const axeCrafted = craftWeapon(p1, 'axe');
    expect(axeCrafted).toBe(true);
    expect(p1.weapon).toBe('axe');
    expect(p1.craftedWeapons).toContain('axe');
    expect(p1.inventory.wood).toBe(22); // 30 - 8

    // Craft Sword
    const swordCrafted = craftWeapon(p1, 'sword');
    expect(swordCrafted).toBe(true);
    expect(p1.weapon).toBe('sword');
    expect(p1.craftedWeapons).toContain('sword');

    // Cycle through crafted weapons
    const next1 = cycleWeapon(p1);
    expect(p1.craftedWeapons.includes(next1)).toBe(true);
    const next2 = cycleWeapon(p1);
    expect(p1.craftedWeapons.includes(next2)).toBe(true);

    // Craft next available (Bow)
    const nextRes = craftNextAvailable(p1);
    expect(nextRes.crafted).toBe(true);
    expect(nextRes.kind).toBe('bow');
    expect(p1.weapon).toBe('bow');
  });

  it('executes melee strikes against creatures in facing cone with knockback and loot drops', () => {
    const [p1] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;
    p1.facing = 'e';
    p1.weapon = 'sword';

    const wolf = spawnCreature('wolf', 11.2, 10.0, 42);
    wolf.hp = 30;
    const creatures: Creature[] = [wolf];

    const pool = createProjectilePool();
    const initialStone = p1.inventory.stone;

    const res = executeAttack(p1, creatures, pool, 32);
    expect(res.hit).toBe(true);
    expect(res.damageDealt).toBe(WEAPONS.sword.damage);
    expect(res.creatureDefeated).toBe(true);
    expect(creatures[0]?.hp).toBeLessThanOrEqual(0);
    // Wolf dropped loot into inventory
    expect(p1.inventory.stone).toBeGreaterThan(initialStone);
  });

  it('launches and simulates 3D ballistic projectiles (Arrows)', () => {
    const [p1, p2] = createPlayers();
    const world = createWorld(42);
    p1.gx = 20;
    p1.gy = 20;
    p1.facing = 's';
    p1.weapon = 'bow';

    const pool = createProjectilePool();
    const baseH = heightAt(world.field, p1.gx, p1.gy);
    const launched = launchArrow(pool, p1, baseH);
    expect(launched).toBe(true);

    const activeArrow = pool.find((p) => p.live);
    expect(activeArrow).toBeDefined();
    expect(activeArrow?.vx).toBe(0);
    expect(activeArrow?.vy).toBeGreaterThan(0); // moving south
    expect(activeArrow?.z).toBe(baseH + 16);


    const targetCreature = spawnCreature('troll', 20.0, 21.0, 42);
    targetCreature.hp = 100;

    // Step projectiles with dt=0.04s so arrow travels to y = 20.4 + 15*0.04 = 21.0
    const hits = stepProjectiles(pool, [targetCreature], [p1, p2], world, 0.04);
    expect(hits.length).toBe(1);
    expect(hits[0]?.hit).toBe(true);
    expect(targetCreature.hp).toBe(100 - WEAPONS.bow.damage);
    expect(activeArrow?.live).toBe(false); // Fused on impact
  }, 15000);

  it('triggers player action animations and encodes them in playerVariant', () => {
    const [p1] = createPlayers();
    expect(p1.actionType).toBe('none');
    expect(p1.actionTimer).toBe(0);

    const pool = createProjectilePool();
    const wolf = spawnCreature('wolf', 10.5, 10.0, 1);
    p1.gx = 10;
    p1.gy = 10;
    p1.facing = 'e';
    p1.weapon = 'sword';

    executeAttack(p1, [wolf], pool, 0);
    expect(p1.actionType).toBe('sword_slash');
    expect(p1.actionTimer).toBeGreaterThan(0);
    expect(wolf.hurtTimer).toBeGreaterThan(0);

    const v = playerVariant(p1);
    const actionCode = (v.flags >> 6) & 15;
    expect(actionCode).toBe(1); // 1: sword_slash
  });

  it('manages visual FX particle pool without heap allocations', () => {
    const fxPool = createFxPool();
    expect(fxPool.length).toBe(256);
    expect(fxPool.every((fx) => !fx.live)).toBe(true);

    spawnSlashFx(fxPool, 10, 10, 0, 'e', 0xffffffff);
    const activeSlash = fxPool.find((fx) => fx.live && fx.kind === 'slash');
    expect(activeSlash).toBeDefined();
    expect(activeSlash?.lifeSec).toBeGreaterThan(0);

    spawnHitSparks(fxPool, 10, 10, 0, 0xffd54fff, 4);
    const sparks = fxPool.filter((fx) => fx.live && fx.kind === 'spark');
    expect(sparks.length).toBe(4);

    spawnShockwave(fxPool, 10, 10, 0, 0x8a6040ff, 1.5);
    const shockwaves = fxPool.filter((fx) => fx.live && fx.kind === 'shockwave');
    expect(shockwaves.length).toBe(1);

    spawnHarvestDebris(fxPool, 10, 10, 0, 0x2ecc71ff, 5);
    const debris = fxPool.filter((fx) => fx.live && fx.kind === 'debris');
    expect(debris.length).toBe(5);

    // Step FX
    stepFx(fxPool, 0.1);
    expect(activeSlash?.lifeSec).toBeLessThan(0.22);
  });

  it('plays wolf attack animation cycle smoothly without timer resets', () => {
    const [p1, p2] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;

    const world = createWorld(42);
    const wolf = spawnCreature('wolf', 10.5, 10.0, 1);
    wolf.traits = { ...wolf.traits, aggression: 1.0 };
    const creatures = [wolf];

    // First update tick: wolf enters attack range, triggers attack animation (0.55s)
    const events1 = updateCreatures(creatures, world, [p1, p2], [], [], 0, 1 / 60);
    expect(wolf.state).toBe('attack');
    expect(wolf.attackAnimTimer).toBeGreaterThan(0.5);
    expect(events1.playerAttacked).toBe(true);

    const v1 = creatureVariant(wolf);
    const stateCode1 = (v1.flags >> 3) & 7;
    expect(stateCode1).toBe(4); // 4 = attack

    // Next tick: timer counts down smoothly and is NOT reset to 0.55
    updateCreatures(creatures, world, [p1, p2], [], [], 0, 0.2);
    expect(wolf.attackAnimTimer).toBeLessThan(0.4);
    expect(wolf.attackAnimTimer).toBeGreaterThan(0);

    const v2 = creatureVariant(wolf);
    expect(v2.level).toBeGreaterThan(0); // Progress is advancing smoothly
  }, 15000);
});

