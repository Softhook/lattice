import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.js';
import { createPlayers } from '../src/players.js';
import { populateFlora } from '../src/flora.js';
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
});

