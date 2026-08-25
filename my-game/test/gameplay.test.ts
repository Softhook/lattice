import { describe, it, expect } from 'vitest';
import { createWorld, W, H, isWalkable, dig, raise } from '../src/world.js';
import { createPlayers, movePlayer, interactAtFacing, cycleBuildKind, buildAtFacing, canAffordBuilding, tickPlayer } from '../src/players.js';
import { populateFlora } from '../src/flora.js';
import { BUILDING_COSTS } from '../src/buildings.js';
import { populateWorld, updateCreatures } from '../src/creatures.js';

describe('Verdant Gameplay Logic', () => {
  it('initializes world and terrain grid with bounds', () => {
    const world = createWorld(42);
    expect(world.heights.w).toBe(W + 1);
    expect(world.heights.h).toBe(H + 1);
    expect(world.surface.w).toBe(W);
    expect(world.surface.h).toBe(H);
    expect(world.currentMaxHeightPx).toBeGreaterThan(0);
  });

  it('mutates terrain on dig and raise', () => {
    const world = createWorld(42);
    const h0 = world.heights.get(20, 20);
    const dug = dig(world, 20, 20);
    expect(dug).toBe(true);
    expect(world.heights.get(20, 20)).toBeLessThan(h0);

    const raised = raise(world, 20, 20);
    expect(raised).toBe(true);
    expect(world.heights.get(20, 20)).toBe(h0);
  });

  it('moves player and updates facing direction', () => {
    const world = createWorld(42);
    const [p1] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;

    movePlayer(p1, 0, 1, world, [], 0.1);
    expect(p1.facing).toBe('s');
    expect(p1.gy).toBeGreaterThan(10);

    movePlayer(p1, -1, 0, world, [], 0.1);
    expect(p1.facing).toBe('w');
  });

  it('cycles player build modes', () => {
    const [p1] = createPlayers();
    expect(p1.mode).toBe('move');
    cycleBuildKind(p1);
    expect(p1.mode).toBe('wood_wall');
    cycleBuildKind(p1);
    expect(p1.mode).toBe('stone_wall');
  });

  it('validates affordability and constructs buildings', () => {
    const world = createWorld(42);
    const [p1] = createPlayers();
    p1.gx = 15;
    p1.gy = 15;
    p1.facing = 'e';
    p1.mode = 'wood_wall';
    p1.inventory.wood = 10;
    p1.inventory.stone = 10;

    const buildings = [];
    expect(canAffordBuilding(p1, 'wood_wall')).toBe(true);
    const placed = buildAtFacing(p1, world, buildings);
    expect(placed).toBeDefined();
    expect(placed?.kind).toBe('wood_wall');
    expect(placed?.gx).toBe(16);
    expect(placed?.gy).toBe(15);
    expect(p1.inventory.wood).toBe(10 - BUILDING_COSTS.wood_wall.wood);
  });

  it('handles harvesting flora items', () => {
    const world = createWorld(42);
    const [p1] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;
    p1.facing = 's';
    p1.mode = 'move';

    const flora = [
      {
        id: 1,
        kind: 'pine' as const,
        gx: 10,
        gy: 11,
        w: 1,
        d: 1,
        scale: 1,
        subType: 0,
        basePx: 0,
      },
    ];

    const initialWood = p1.inventory.wood;
    const res = interactAtFacing(p1, world, flora, []);
    expect(res.type).toBe('chop');
    expect(p1.inventory.wood).toBeGreaterThan(initialWood);
    expect(flora.length).toBe(0);
  });

  it('updates creatures without throwing or NaN', () => {
    const world = createWorld(42);
    const [p1, p2] = createPlayers();
    const flora = populateFlora(42, world);
    const creatures = populateWorld(42, world);

    const initialCount = creatures.length;
    expect(initialCount).toBeGreaterThan(0);

    // Verify all 8 species are present in the world ecosystem
    const speciesPresent = new Set(creatures.map((c) => c.species));
    expect(speciesPresent.has('rabbit')).toBe(true);
    expect(speciesPresent.has('deer')).toBe(true);
    expect(speciesPresent.has('boar')).toBe(true);
    expect(speciesPresent.has('fox')).toBe(true);
    expect(speciesPresent.has('wolf')).toBe(true);
    expect(speciesPresent.has('croc')).toBe(true);
    expect(speciesPresent.has('bear')).toBe(true);
    expect(speciesPresent.has('troll')).toBe(true);

    const events = updateCreatures(creatures, world, [p1, p2], flora, [], 0, 1 / 60);
    expect(typeof events.playerAttacked).toBe('boolean');
    for (const c of creatures) {
      expect(Number.isFinite(c.gx)).toBe(true);
      expect(Number.isFinite(c.gy)).toBe(true);
      expect(Number.isFinite(c.hp)).toBe(true);
    }
  });

  it('ticks player respawn timer correctly', () => {
    const [p1] = createPlayers();
    p1.hp = 0;
    p1.respawnTimer = 0.5;

    const respawnedSoon = tickPlayer(p1, 0.2);
    expect(respawnedSoon).toBe(false);
    expect(p1.hp).toBe(0);

    const respawnedDone = tickPlayer(p1, 0.4);
    expect(respawnedDone).toBe(true);
    expect(p1.hp).toBe(100);
    expect(p1.respawnTimer).toBe(0);
  });

  it('generates subtle continuous biome transitions and diverse flora species across biomes', () => {
    const world = createWorld(42);
    const flora = populateFlora(42, world);

    // Verify all 12 flora kinds are present across the continent
    const kindsPresent = new Set(flora.map((f) => f.kind));
    expect(kindsPresent.has('cactus')).toBe(true);
    expect(kindsPresent.has('swamp_tree')).toBe(true);
    expect(kindsPresent.has('spruce')).toBe(true);
    expect(kindsPresent.has('birch')).toBe(true);
    expect(kindsPresent.has('rock_spire')).toBe(true);
    expect(kindsPresent.has('dead_bush')).toBe(true);
    expect(kindsPresent.has('pine')).toBe(true);
    expect(kindsPresent.has('oak')).toBe(true);
    expect(kindsPresent.has('bush')).toBe(true);
    expect(kindsPresent.has('flowers')).toBe(true);
    expect(kindsPresent.has('mushroom')).toBe(true);
    expect(kindsPresent.has('rock')).toBe(true);

    // Verify continuous tile color lookups and zero NaN values in color buffer
    for (let i = 0; i < world.tileColors.length; i++) {
      expect(world.tileColors[i]).toBeGreaterThan(0);
    }
  });
});


