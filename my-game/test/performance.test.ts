import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.js';
import { createPlayers } from '../src/players.js';
import { populateFlora, rebuildFloraSpatial, removeFloraAt } from '../src/flora.js';
import { populateWorld, updateCreatures, createCreatureEvents } from '../src/creatures.js';
import { createProjectilePool, stepProjectiles } from '../src/combat.js';

describe('Performance & Regression Benchmarks', () => {
  it('executes 20-second simulation (1200 ticks) across 600 creatures and 6000 flora in under 3.0ms/tick', () => {
    const world = createWorld(42);
    const players = createPlayers();
    const flora = populateFlora(42, world);
    const creatures = populateWorld(42, world);
    const projectiles = createProjectilePool();
    const events = createCreatureEvents();

    const dt = 1 / 60;
    const TICKS = 1200; // 20 seconds of full 60fps simulation (720,000 creature updates)


    const startTime = performance.now();

    for (let i = 0; i < TICKS; i++) {
      updateCreatures(creatures, world, players, flora, [], i * dt, dt, events);
      stepProjectiles(projectiles, creatures, players, world, dt);
    }

    const elapsedMs = performance.now() - startTime;
    const avgTickMs = elapsedMs / TICKS;

    // Full 60Hz tick for 600 creatures and 6,000 flora runs in < 3.0ms even under full multi-core suite load
    expect(avgTickMs).toBeLessThan(3.0);
    expect(creatures.length).toBeGreaterThan(0);


    // Verify all creatures remained within valid 640x640 terrain boundaries
    for (let ci = 0; ci < creatures.length; ci++) {
      const c = creatures[ci];
      if (c === undefined) continue;
      expect(Number.isFinite(c.gx)).toBe(true);
      expect(Number.isFinite(c.gy)).toBe(true);
      expect(c.gx).toBeGreaterThanOrEqual(1);
      expect(c.gx).toBeLessThanOrEqual(639);
      expect(c.gy).toBeGreaterThanOrEqual(1);
      expect(c.gy).toBeLessThanOrEqual(639);
    }
  });

  it('removes a grazed/harvested plant in O(1)+O(cell), not an O(n) full re-index', () => {
    const world = createWorld(42);
    const flora = populateFlora(42, world);
    rebuildFloraSpatial(flora);
    expect(flora.length).toBeGreaterThan(8000);

    // Baseline: the cost of one full spatial rebuild over the whole flora population — what the
    // old grazing / harvest path paid on every single plant removed.
    const rebuildSamples = 40;
    const rb0 = performance.now();
    for (let i = 0; i < rebuildSamples; i++) rebuildFloraSpatial(flora);
    const rebuildEach = (performance.now() - rb0) / rebuildSamples;

    // The current path: locate the tail item, swap it into the hole, patch two grid slots.
    const removeSamples = Math.min(2000, flora.length - 100);
    const rm0 = performance.now();
    for (let i = 0; i < removeSamples; i++) {
      removeFloraAt(flora, Math.floor(flora.length * 0.41));
    }
    const removeEach = (performance.now() - rm0) / removeSamples;

    // Must be at least 20x cheaper than a full rebuild (measured ~375x; 20x is slack for a
    // loaded CI box). A regression to `splice` + `rebuildFloraSpatial` would fail this.
    expect(removeEach).toBeLessThan(rebuildEach / 20);
  });
});

