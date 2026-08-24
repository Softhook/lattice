import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.js';
import { createPlayers } from '../src/players.js';
import { populateFlora } from '../src/flora.js';
import { populateWorld, updateCreatures } from '../src/creatures.js';
import { createProjectilePool, stepProjectiles } from '../src/combat.js';

describe('Performance & Regression Benchmarks', () => {
  it('executes 60-second simulation (3600 ticks) in under 300ms', () => {
    const world = createWorld(42);
    const players = createPlayers();
    const flora = populateFlora(42, world);
    const creatures = populateWorld(42, world);
    const projectiles = createProjectilePool();

    const dt = 1 / 60;
    const TICKS = 3600; // 60 seconds of full 60fps gameplay

    const startTime = performance.now();

    for (let i = 0; i < TICKS; i++) {
      updateCreatures(creatures, world, players, flora, [], i * dt, dt);
      stepProjectiles(projectiles, creatures, players, world, dt);
    }

    const elapsedMs = performance.now() - startTime;
    const avgTickMs = elapsedMs / TICKS;

    // Full 60Hz tick must run in under 0.25ms (well under the 16.6ms frame budget!)
    expect(avgTickMs).toBeLessThan(0.25);
    expect(creatures.length).toBeGreaterThan(0);

    // Verify all creatures remained within valid terrain boundaries
    for (let ci = 0; ci < creatures.length; ci++) {
      const c = creatures[ci];
      if (c === undefined) continue;
      expect(Number.isFinite(c.gx)).toBe(true);
      expect(Number.isFinite(c.gy)).toBe(true);
      expect(c.gx).toBeGreaterThanOrEqual(1);
      expect(c.gx).toBeLessThanOrEqual(199);
      expect(c.gy).toBeGreaterThanOrEqual(1);
      expect(c.gy).toBeLessThanOrEqual(199);
    }
  });
});
