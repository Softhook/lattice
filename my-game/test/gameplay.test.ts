import { describe, it, expect } from 'vitest';
import { createWorld, W, H, isWalkable, dig, raise, BIOME_REGISTRY } from '../src/world.js';
import { createPlayers, movePlayer, interactAtFacing, cycleBuildKind, buildAtFacing, canAffordBuilding, tickPlayer, getTargetContext, facingTile, isInForwardCone } from '../src/players.js';
import { populateFlora, FLORA_REGISTRY } from '../src/flora.js';
import { BUILDING_COSTS, BUILDING_REGISTRY, type Building } from '../src/buildings.js';
import { populateWorld, updateCreatures, createCreatureEvents, SPECIES_REGISTRY, spawnCreature, isNearActiveFireOrLight, FIRE_WARD_RADIUS, FIRE_SAFE_ZONE_RADIUS, type CreatureState } from '../src/creatures.js';

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

  it('cycles player build modes only for affordable recipes', () => {
    const [p1] = createPlayers();
    expect(p1.mode).toBe('move');

    // With 0 materials, cycling skips all and stays in 'move' mode
    p1.inventory.wood = 0;
    p1.inventory.stone = 0;
    p1.inventory.fiber = 0;
    cycleBuildKind(p1);
    expect(p1.mode).toBe('move');

    // With 4 wood only (can afford wood_wall (4W) and floor (2W), but not campfire (4W 2S 2F))
    p1.inventory.wood = 4;
    cycleBuildKind(p1);
    expect(p1.mode).toBe('wood_wall');
    cycleBuildKind(p1);
    expect(p1.mode).toBe('floor');
    cycleBuildKind(p1);
    expect(p1.mode).toBe('move');

    // With materials for campfire (4W, 2S, 2F)
    p1.inventory.stone = 2;
    p1.inventory.fiber = 2;
    cycleBuildKind(p1);
    expect(p1.mode).toBe('campfire');
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

    const buildings: Building[] = [];
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

    const events = createCreatureEvents();
    updateCreatures(creatures, world, [p1, p2], flora, [], 0, 1 / 60, events);
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
  }, 15000);

  it('verifies continuous tile color lookups and zero NaN values in color buffer', () => {
    const world = createWorld(42);
    for (let i = 0; i < world.tileColors.length; i++) {
      expect(world.tileColors[i]).toBeGreaterThan(0);
    }
  });

  it('validates all registries (Biomes, Flora, Species, Buildings) are clean and expandable', () => {
    // 1. Biome Registry
    const biomeKeys = Object.keys(BIOME_REGISTRY);
    expect(biomeKeys.length).toBe(6);
    for (const key of biomeKeys) {
      const b = BIOME_REGISTRY[key as keyof typeof BIOME_REGISTRY];
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.icon.length).toBeGreaterThan(0);
      expect(b.maxElevation).toBeGreaterThanOrEqual(b.minElevation);
    }

    // 2. Flora Registry
    const floraKeys = Object.keys(FLORA_REGISTRY);
    expect(floraKeys.length).toBe(12);
    for (const key of floraKeys) {
      const f = FLORA_REGISTRY[key as keyof typeof FLORA_REGISTRY];
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.harvestVerb.length).toBeGreaterThan(0);
      expect(f.preferredBiomes.length).toBeGreaterThan(0);
      expect(f.spriteDef).toBeDefined();
    }

    // 3. Species Registry
    const speciesKeys = Object.keys(SPECIES_REGISTRY);
    expect(speciesKeys.length).toBe(8);
    for (const key of speciesKeys) {
      const s = SPECIES_REGISTRY[key as keyof typeof SPECIES_REGISTRY];
      expect(s.baseHp).toBeGreaterThan(0);
      expect(s.baseTraits.speed).toBeGreaterThan(0);
      expect(s.minPopulation).toBeGreaterThan(0);
      expect(s.preferredBiomes.length).toBeGreaterThan(0);
    }

    // 4. Building Registry
    const buildingKeys = Object.keys(BUILDING_REGISTRY);
    expect(buildingKeys.length).toBe(6);
    expect(buildingKeys.includes('campfire')).toBe(true);
    for (const key of buildingKeys) {
      const bld = BUILDING_REGISTRY[key as keyof typeof BUILDING_REGISTRY];
      expect(bld.maxHp).toBeGreaterThan(0);
      expect(bld.footprint.w).toBeGreaterThan(0);
      expect(bld.footprint.d).toBeGreaterThan(0);
      expect(bld.spriteDef).toBeDefined();
    }
  });

  it('crafts, places, and stokes a campfire', () => {
    const world = createWorld(42);
    const [p1] = createPlayers();
    p1.gx = 20;
    p1.gy = 20;
    p1.facing = 's';
    p1.mode = 'campfire';
    p1.inventory.wood = 10;
    p1.inventory.stone = 5;
    p1.inventory.fiber = 5;

    const buildings: Building[] = [];
    expect(canAffordBuilding(p1, 'campfire')).toBe(true);

    const placed = buildAtFacing(p1, world, buildings);
    expect(placed).toBeDefined();
    if (placed === undefined) throw new Error('expected campfire to be placed');
    expect(placed.kind).toBe('campfire');
    expect(placed.gx).toBe(20);
    expect(placed.gy).toBe(21);
    expect(placed.hp).toBe(120);

    // Verify inventory cost deduction: 4 wood, 2 stone, 2 fiber
    expect(p1.inventory.wood).toBe(6);
    expect(p1.inventory.stone).toBe(3);
    expect(p1.inventory.fiber).toBe(3);

    buildings.push(placed);

    // Simulate campfire burning down to 60s
    placed.hp = 60;

    // Player in move mode faces campfire and stokes it with wood
    p1.mode = 'move';
    const stokeRes = interactAtFacing(p1, world, [], buildings);
    expect(stokeRes.type).toBe('stoke');
    expect(placed.hp).toBe(100);
    expect(p1.inventory.wood).toBe(5); // 1 wood consumed to stoke
  });

  it('computes contextual cursor target for flora, creatures, and campfires', () => {
    const world = createWorld(42);
    const [p1] = createPlayers();
    p1.gx = 10;
    p1.gy = 10;
    p1.facing = 's'; // facing tile is (10, 11)

    const flora = [
      { id: 1, kind: 'pine' as const, gx: 10, gy: 11, w: 1, d: 1, scale: 1, subType: 0, basePx: 0 },
    ];

    // 1. Facing Pine Tree -> Flora target CHOP
    const targetFlora = getTargetContext(p1, world, flora, [], []);
    expect(targetFlora.kind).toBe('flora');
    expect(targetFlora.actionLabel).toBe('CHOP');
    expect(targetFlora.actionKey).toBe('[Space]');

    // 2. Facing Campfire -> Campfire target
    const campfire = { id: 9, kind: 'campfire' as const, gx: 10, gy: 11, w: 1, d: 1, hp: 80, maxHp: 120, basePx: 0 };
    const targetFire = getTargetContext(p1, world, [], [], [campfire]);
    expect(targetFire.kind).toBe('campfire');
    expect(targetFire.actionLabel).toContain('STOKE');

    // 3. Enemy creature in reach -> Creature target ATTACK
    const troll = spawnCreature('troll', 10, 10.8, 42);
    troll.hp = 150;
    const targetEnemy = getTargetContext(p1, world, [], [troll], []);
    expect(targetEnemy.kind).toBe('creature');
    expect(targetEnemy.actionLabel).toBe('ATTACK TROLL');
    expect(targetEnemy.subLabel).toBe('HP: 150');

    // 4. In build mode -> Build target (ghost sprite preview only, no text pill)
    p1.mode = 'wood_wall';
    const targetBuild = getTargetContext(p1, world, [], [], []);
    expect(targetBuild.kind).toBe('build');
    expect(targetBuild.actionLabel).toBe('');
  });

  it('maintains strict isometric grid locking across all facings and fractional positions', () => {
    const [p1] = createPlayers();
    const world = createWorld(42);

    // Place player at fractional continuous coordinate within cell (15, 22)
    p1.gx = 14.85;
    p1.gy = 22.35;

    p1.facing = 's';
    let target = facingTile(p1);
    expect(target).toEqual({ gx: 15, gy: 23 });

    p1.facing = 'n';
    target = facingTile(p1);
    expect(target).toEqual({ gx: 15, gy: 21 });

    p1.facing = 'e';
    target = facingTile(p1);
    expect(target).toEqual({ gx: 16, gy: 22 });

    p1.facing = 'w';
    target = facingTile(p1);
    expect(target).toEqual({ gx: 14, gy: 22 });

    // Step player movement and verify cursor tile position is strictly integer
    movePlayer(p1, 1, 0, world, [], 1 / 60);
    expect(Number.isInteger(p1.cursorGx)).toBe(true);
    expect(Number.isInteger(p1.cursorGy)).toBe(true);
    expect(p1.cursorGx).toBe(facingTile(p1).gx);
    expect(p1.cursorGy).toBe(facingTile(p1).gy);

    const ctx = getTargetContext(p1, world, [], [], []);
    expect(Number.isInteger(ctx.gx)).toBe(true);
    expect(Number.isInteger(ctx.gy)).toBe(true);
  });

  it('accurately evaluates forward interaction cone and magnetically soft-locks to interactive items', () => {
    // 1. Test geometric forward cone
    expect(isInForwardCone('s', 0, 1)).toBe(true);
    expect(isInForwardCone('s', 0.5, 1)).toBe(true);
    expect(isInForwardCone('s', 0, -1)).toBe(false); // behind
    expect(isInForwardCone('n', 0, -1)).toBe(true);
    expect(isInForwardCone('e', 1, 0)).toBe(true);
    expect(isInForwardCone('w', -1, 0)).toBe(true);

    // 2. Test magnetic soft-locking to adjacent forward tree
    const [p1] = createPlayers();
    const world = createWorld(42);
    p1.gx = 10;
    p1.gy = 10;
    p1.facing = 's';

    // Direct tile is (10, 11). Place flora slightly offset at (10, 11) and another at (11, 11)
    const flora = [
      { id: 1, kind: 'pine' as const, gx: 10, gy: 11, w: 1, d: 1, basePx: 0, scale: 1, subType: 0 },
    ];
    const target1 = getTargetContext(p1, world, flora, [], []);
    expect(target1.kind).toBe('flora');
    expect(target1.actionLabel).toBe('CHOP');
    expect(target1.gx).toBe(10);
    expect(target1.gy).toBe(11);

    // Test soft-lock when directly facing empty tile (10, 11) but tree is at (11, 11)
    const offsetFlora = [
      { id: 2, kind: 'oak' as const, gx: 11, gy: 11, w: 1, d: 1, basePx: 0, scale: 1, subType: 0 },
    ];
    const target2 = getTargetContext(p1, world, offsetFlora, [], []);
    expect(target2.kind).toBe('flora');
    expect(target2.gx).toBe(11);
    expect(target2.gy).toBe(11);
  });

  it('wards off basic predators (wolves) near active campfires and light beacons', () => {
    const world = createWorld(42);
    const [p1, p2] = createPlayers();
    p1.gx = 20;
    p1.gy = 20;
    p2.gx = 100;
    p2.gy = 100;

    // 1. Active campfire at (20, 20)
    const campfire = { id: 101, kind: 'campfire' as const, gx: 20, gy: 20, w: 1, d: 1, hp: 120, maxHp: 120, basePx: 0 };
    const buildings = [campfire];

    // Wolf placed 4 tiles south of campfire (inside FIRE_WARD_RADIUS = 9.0)
    const wolf = spawnCreature('wolf', 20, 24, 42);
    wolf.traits = { speed: 2.0, aggression: 0.9, size: 1.0, fertility: 1.0 }; // Highly aggressive
    wolf.state = 'idle';

    const creatures = [wolf];
    const events = createCreatureEvents();
    updateCreatures(creatures, world, [p1, p2], [], buildings, 0.5, 0.1, events);

    // Wolf should be warded off by fire, flee south away from campfire, and record ward event
    expect(events.wardOccurred).toBe(true);
    expect(wolf.state).toBe('flee');
    expect(wolf.gy).toBeGreaterThan(24); // Moved further south away from (20, 20)
  });

  it('protects players and prey inside campfire sanctuary from predator targeting', () => {
    const world = createWorld(42);
    const [p1, p2] = createPlayers();
    // Player 1 is standing directly next to active campfire
    p1.gx = 20;
    p1.gy = 20;
    p2.gx = 200;
    p2.gy = 200;

    const campfire = { id: 102, kind: 'campfire' as const, gx: 20, gy: 21, w: 1, d: 1, hp: 100, maxHp: 120, basePx: 0 };
    const buildings = [campfire];

    // Wolf is positioned outside ward radius at (20, 32)
    const wolf = spawnCreature('wolf', 20, 32, 42);
    wolf.traits = { speed: 2.0, aggression: 0.95, size: 1.0, fertility: 1.0 };
    wolf.state = 'idle';

    expect(isNearActiveFireOrLight(p1.gx, p1.gy, buildings)).toBe(true);

    const creatures = [wolf];
    updateCreatures(creatures, world, [p1, p2], [], buildings, 0.8, 0.1, createCreatureEvents());

    // Wolf should NOT chase player 1 because player is within campfire sanctuary
    expect(wolf.state).not.toBe('chase');
    expect(wolf.state).not.toBe('attack');
  });

  it('does not ward off predators if campfire is extinguished (hp <= 0)', () => {
    const world = createWorld(42);
    const [p1, p2] = createPlayers();
    p1.gx = 20;
    p1.gy = 20;
    p2.gx = 200;
    p2.gy = 200;

    // Extinguished campfire
    const extinguishedCampfire = { id: 103, kind: 'campfire' as const, gx: 20, gy: 21, w: 1, d: 1, hp: 0, maxHp: 120, basePx: 0 };
    const buildings = [extinguishedCampfire];

    expect(isNearActiveFireOrLight(p1.gx, p1.gy, buildings)).toBe(false);

    // Wolf placed 3 tiles away from player
    const wolf = spawnCreature('wolf', 20, 23, 42);
    wolf.traits = { speed: 2.0, aggression: 0.95, size: 1.0, fertility: 1.0 };
    wolf.state = 'idle';

    const creatures = [wolf];
    updateCreatures(creatures, world, [p1, p2], [], buildings, 0.5, 0.1, createCreatureEvents());

    // With extinguished campfire, wolf aggressively targets player as normal
    const aggressiveStates: readonly CreatureState[] = ['chase', 'attack'];
    expect(aggressiveStates.includes(wolf.state)).toBe(true);
  });

  it('allows fearless monsters (trolls) to ignore fire warding', () => {
    const world = createWorld(42);
    const [p1, p2] = createPlayers();
    p1.gx = 20;
    p1.gy = 20;
    p2.gx = 200;
    p2.gy = 200;

    const campfire = { id: 104, kind: 'campfire' as const, gx: 20, gy: 21, w: 1, d: 1, hp: 100, maxHp: 120, basePx: 0 };
    const buildings = [campfire];

    // Troll placed near campfire
    const troll = spawnCreature('troll', 20, 24, 42);
    troll.traits = { speed: 1.0, aggression: 0.95, size: 1.5, fertility: 0.5 };
    troll.state = 'idle';

    expect(SPECIES_REGISTRY.troll.fearsFire).toBe(false);

    const creatures = [troll];
    updateCreatures(creatures, world, [p1, p2], [], buildings, 0.5, 0.1, createCreatureEvents());

    // Troll does NOT flee from campfire; it sieges buildings or targets players
    expect(troll.state).not.toBe('flee');
  });
});




