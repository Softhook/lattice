import { describe, it, expect } from 'vitest';
import { createPlayers, tickPlayer, MAX_HUNGER } from '../src/players.js';
import {
  createFoodPool,
  createFoodEvents,
  spawnFoodDrop,
  updateFoodDrops,
  isEdibleSpecies,
  FOOD_ROT_SECONDS,
  FOOD_YIELD,
} from '../src/food.js';
import { spawnCreature } from '../src/creatures.js';
import { executeAttack, createProjectilePool } from '../src/combat.js';

describe('Hunger & Food Drops', () => {
  it('drains hunger over time while the player is up and about', () => {
    const [p1] = createPlayers();
    expect(p1.hunger).toBe(MAX_HUNGER);
    p1.hunger = 50;
    tickPlayer(p1, 1);
    expect(p1.hunger).toBeLessThan(50);
    expect(p1.hunger).toBeGreaterThan(49); // ~0.42/s
  });

  it('bleeds HP while starving and stops regen', () => {
    const [p1] = createPlayers();
    p1.hunger = 0;
    p1.hp = 50;
    p1.combatCooldown = 0;
    tickPlayer(p1, 1);
    expect(p1.hp).toBeLessThan(50); // starvation damage, not regen
    expect(p1.hunger).toBe(0);
  });

  it('does not drain hunger while knocked down, and refills it on respawn', () => {
    const [p1] = createPlayers();
    p1.hunger = 0;
    p1.hp = 0;
    p1.respawnTimer = 0.1;
    const respawned = tickPlayer(p1, 0.2);
    expect(respawned).toBe(true);
    expect(p1.hunger).toBe(MAX_HUNGER);
  });

  it('only huntable game animals leave food', () => {
    expect(isEdibleSpecies('rabbit')).toBe(true);
    expect(isEdibleSpecies('deer')).toBe(true);
    expect(isEdibleSpecies('boar')).toBe(true);
    expect(isEdibleSpecies('wolf')).toBe(false);
    expect(isEdibleSpecies('croc')).toBe(false);
    expect(isEdibleSpecies('shade')).toBe(false);

    const pool = createFoodPool();
    expect(spawnFoodDrop(pool, 0, 0, 'wolf')).toBe(false);
    expect(pool.some((f) => f.live)).toBe(false);
    expect(spawnFoodDrop(pool, 0, 0, 'deer')).toBe(true);
    expect(pool.filter((f) => f.live).length).toBe(1);
  });

  it('a player standing on a drop collects it and refills hunger (clamped)', () => {
    const [p1, p2] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;
    p1.hunger = 20;
    p2.gx = 500;
    p2.gy = 500;

    const pool = createFoodPool();
    spawnFoodDrop(pool, 10, 10, 'deer');
    const ev = createFoodEvents();
    updateFoodDrops(pool, [p1, p2], 1 / 60, ev);

    expect(ev.pickedUp).toBe(true);
    expect(p1.hunger).toBe(20 + (FOOD_YIELD.deer ?? 0));
    expect(pool.some((f) => f.live)).toBe(false);

    // Clamps at MAX_HUNGER
    p1.hunger = 95;
    spawnFoodDrop(pool, 10, 10, 'deer');
    updateFoodDrops(pool, [p1, p2], 1 / 60, ev);
    expect(p1.hunger).toBe(MAX_HUNGER);
  });

  it('uncollected meat rots away after FOOD_ROT_SECONDS', () => {
    const [p1, p2] = createPlayers();
    p1.gx = 400;
    p1.gy = 400;
    p2.gx = 500;
    p2.gy = 500;

    const pool = createFoodPool();
    spawnFoodDrop(pool, 10, 10, 'boar');
    const ev = createFoodEvents();
    updateFoodDrops(pool, [p1, p2], FOOD_ROT_SECONDS + 0.1, ev);

    expect(ev.pickedUp).toBe(false);
    expect(pool.some((f) => f.live)).toBe(false);
  });

  it('killing a game animal drops its meat when a food pool is passed', () => {
    const [p1] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;
    p1.facing = 'e';
    p1.weapon = 'sword';

    const rabbit = spawnCreature('rabbit', 11.0, 10.0, 42);
    rabbit.hp = 5;

    const pool = createFoodPool();
    const proj = createProjectilePool();
    const res = executeAttack(p1, [rabbit], proj, 0, undefined, [], pool);

    expect(res.creatureDefeated).toBe(true);
    expect(pool.some((f) => f.live && f.species === 'rabbit')).toBe(true);
  });
});
