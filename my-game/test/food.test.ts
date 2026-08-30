import { describe, it, expect } from 'vitest';
import { createRng } from '@latticekit/core';
import { createWorld, isWalkable } from '../src/world.js';
import { rebuildFloraSpatial, type FloraItem } from '../src/flora.js';
import {
  createPlayers,
  tickPlayer,
  interactAtFacing,
  respawnPlayerAtRandomLocation,
  eatFood,
  dropInventoryItem,
  MAX_HUNGER,
} from '../src/players.js';
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

  it('a player standing on a drop collects it into inventory', () => {
    const [p1, p2] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;
    p1.inventory.food = 0;
    p2.gx = 500;
    p2.gy = 500;

    const pool = createFoodPool();
    spawnFoodDrop(pool, 10, 10, 'deer');
    const ev = createFoodEvents();
    updateFoodDrops(pool, [p1, p2], 1 / 60, ev);

    expect(ev.pickedUp).toBe(true);
    expect(p1.inventory.food).toBe(FOOD_YIELD.deer ?? 0);
    expect(pool.some((f) => f.live)).toBe(false);
  });

  it('eating food from inventory restores hunger up to MAX_HUNGER', () => {
    const [p1] = createPlayers();
    p1.inventory.food = 30;
    p1.hunger = 50;

    const res = eatFood(p1, 25);
    expect(res.ok).toBe(true);
    expect(res.ate).toBe(25);
    expect(p1.hunger).toBe(75);
    expect(p1.inventory.food).toBe(5);

    // Eating when almost full clamps at MAX_HUNGER
    const res2 = eatFood(p1, 25);
    expect(res2.ok).toBe(true);
    expect(res2.ate).toBe(5);
    expect(p1.hunger).toBe(80);
    expect(p1.inventory.food).toBe(0);

    // Eating with 0 food fails
    const res3 = eatFood(p1);
    expect(res3.ok).toBe(false);
  });

  it('dropping resources and food spawns drops that teammate can collect', () => {
    const [p1, p2] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;
    p1.inventory.wood = 20;
    p1.inventory.food = 15;

    p2.gx = 10;
    p2.gy = 11.1;
    p2.inventory.wood = 0;
    p2.inventory.food = 0;

    const pool = createFoodPool();
    const ev = createFoodEvents();

    // P1 drops 5 wood
    const dropRes = dropInventoryItem(p1, 'wood', pool);
    expect(dropRes.ok).toBe(true);
    expect(dropRes.count).toBe(5);
    expect(p1.inventory.wood).toBe(15);

    // P1 does not immediately pick it back up due to cooldown
    updateFoodDrops(pool, [p1], 1 / 60, ev);
    expect(ev.pickedUp).toBe(false);
    expect(p1.inventory.wood).toBe(15);

    // P2 standing nearby collects it
    updateFoodDrops(pool, [p1, p2], 1 / 60, ev);
    expect(ev.pickedUp).toBe(true);
    expect(p2.inventory.wood).toBe(5);
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

  it('foraging mushrooms adds food to inventory and gives no fiber', () => {
    const world = createWorld(42);
    const [p1] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;
    p1.facing = 's';
    p1.inventory.food = 0;
    const initialFiber = p1.inventory.fiber;

    const mushroom: FloraItem = {
      id: 99,
      kind: 'mushroom',
      gx: 10,
      gy: 11,
      w: 1,
      d: 1,
      basePx: 0,
      scale: 1,
      subType: 0,
    };
    const flora = [mushroom];
    rebuildFloraSpatial(flora);

    const result = interactAtFacing(p1, world, flora, []);
    expect(result.type).toBe('forage');
    expect(p1.inventory.food).toBeGreaterThan(0);
    expect(p1.inventory.fiber).toBe(initialFiber);
    expect(flora.length).toBe(0);
  });

  it('picking berries from bushes adds food to inventory and gives wood/fiber', () => {
    const world = createWorld(42);
    const [p1] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;
    p1.facing = 's';
    p1.inventory.food = 0;
    const initialFiber = p1.inventory.fiber;
    const initialWood = p1.inventory.wood;

    const bush: FloraItem = {
      id: 100,
      kind: 'bush',
      gx: 10,
      gy: 11,
      w: 1,
      d: 1,
      basePx: 0,
      scale: 1,
      subType: 0,
    };
    const flora = [bush];
    rebuildFloraSpatial(flora);

    const result = interactAtFacing(p1, world, flora, []);
    expect(result.type).toBe('forage');
    expect(p1.inventory.food).toBeGreaterThan(0);
    expect(p1.inventory.wood).toBeGreaterThan(initialWood);
    expect(p1.inventory.fiber).toBeGreaterThan(initialFiber);
    expect(flora.length).toBe(0);
  });

  it('respawnPlayerAtRandomLocation places the player at a walkable legal location', () => {
    const world = createWorld(42);
    const [p1] = createPlayers();
    const rng = createRng(12345);

    for (let i = 0; i < 20; i++) {
      respawnPlayerAtRandomLocation(p1, world, rng, []);
      expect(isWalkable(world, Math.floor(p1.gx), Math.floor(p1.gy))).toBe(true);
      expect(p1.gx).toBeGreaterThanOrEqual(16);
      expect(p1.gx).toBeLessThanOrEqual(640 - 16);
      expect(p1.gy).toBeGreaterThanOrEqual(16);
      expect(p1.gy).toBeLessThanOrEqual(640 - 16);
      expect(p1.vx).toBe(0);
      expect(p1.vy).toBe(0);
    }
  });
});
