import { describe, it, expect } from 'vitest';
import { createPlayers } from '../src/players.js';
import { createWorld, applyTerrainDeltas } from '../src/world.js';
import { placeBuilding, restoreBuilding, type Building } from '../src/buildings.js';
import { populateFlora, restoreFlora, harvestFloraAt, type FloraItem } from '../src/flora.js';
import {
  extractSaveState,
  recognizeVerdantSaveV1,
  VERDANT_MIGRATIONS,
} from '../src/storage.js';
import { memoryStorage, createStore } from '@latticekit/persist';
import { asEpochMillis } from '@latticekit/core';

describe('Verdant Storage', () => {
  it('extracts live player, weapon, and building state into valid V1 save format', () => {
    const [p1, p2] = createPlayers();
    p1.inventory.wood = 55;
    p1.inventory.stone = 23;
    p1.hp = 80;
    p1.weapon = 'sword';
    p1.craftedWeapons = ['hands', 'axe', 'sword'];
    p1.gx = 18.5;
    p1.gy = 22.0;

    p2.inventory.fiber = 19;
    p2.hp = 95;
    p2.weapon = 'bow';
    p2.craftedWeapons = ['hands', 'bow'];

    const world = createWorld(42);
    const bld = placeBuilding('wood_tower', 10, 10, world, []);
    const buildings: Building[] = bld ? [bld] : [];

    const save = extractSaveState(42, [p1, p2], buildings);
    expect(save.version).toBe(1);
    expect(save.seed).toBe(42);
    expect(save.p1.wood).toBe(55);
    expect(save.p1.stone).toBe(23);
    expect(save.p1.hp).toBe(80);
    expect(save.p1.weapon).toBe('sword');
    expect(save.p1.craftedWeapons).toEqual(['hands', 'axe', 'sword']);
    expect(save.p1.gx).toBe(18.5);
    expect(save.p1.gy).toBe(22.0);

    expect(save.p2.fiber).toBe(19);
    expect(save.p2.hp).toBe(95);
    expect(save.p2.weapon).toBe('bow');
    expect(save.buildings.length).toBe(1);
    expect(save.buildings[0]?.kind).toBe('wood_tower');
  });

  it('recognizes valid V1 save and preserves all weapon and coordinate fields', () => {
    const [p1, p2] = createPlayers();
    p1.weapon = 'axe';
    p1.craftedWeapons = ['hands', 'axe'];
    const raw = extractSaveState(99, [p1, p2], []);
    const recognized = recognizeVerdantSaveV1(raw);
    expect(recognized.version).toBe(1);
    expect(recognized.seed).toBe(99);
    expect(recognized.p1.wood).toBe(12);
    expect(recognized.p1.weapon).toBe('axe');
    expect(recognized.p1.craftedWeapons).toEqual(['hands', 'axe']);
    expect(recognized.p2.wood).toBe(12);
  });

  it('tolerates missing or partial fields by providing sensible defaults', () => {
    const partial = {
      version: 1,
      seed: 123,
      p1: { wood: 10 },
      p2: {},
      buildings: [],
    };
    const recognized = recognizeVerdantSaveV1(partial);
    expect(recognized.version).toBe(1);
    expect(recognized.seed).toBe(123);
    expect(recognized.p1.wood).toBe(10);
    expect(recognized.p1.stone).toBe(0);
    expect(recognized.p1.hp).toBe(100);
    expect(recognized.p1.weapon).toBe('hands');
    expect(recognized.p1.craftedWeapons).toEqual(['hands']);
    expect(recognized.p1.gx).toBe(28);
    expect(recognized.p2.wood).toBe(0);
    expect(recognized.p2.hp).toBe(100);
    expect(recognized.p2.gx).toBe(36);
  });

  it('restores saved buildings with accurate footprints and elevation', () => {
    const world = createWorld(42);
    const restored = restoreBuilding('stone_tower', 14, 16, 200, 200, world);
    expect(restored.kind).toBe('stone_tower');
    expect(restored.gx).toBe(14);
    expect(restored.gy).toBe(16);
    expect(restored.w).toBe(2);
    expect(restored.d).toBe(2);
    expect(restored.hp).toBe(200);
    expect(restored.maxHp).toBe(200);
    expect(restored.basePx).toBeGreaterThan(0);
  });

  it('round-trips through persist store with memory adapter', () => {
    const [p1, p2] = createPlayers();
    p1.inventory.wood = 99;
    p1.weapon = 'sword';
    p1.craftedWeapons = ['hands', 'sword'];
    const adapter = memoryStorage();
    const store = createStore({
      key: 'test:verdant',
      chain: VERDANT_MIGRATIONS,
      adapter,
      fresh: () => extractSaveState(1, [p1, p2], []),
      now: () => asEpochMillis(1000, 'test'),
    });

    const openResult = store.open();
    expect(openResult.source).toBe('fresh');

    const saveState = extractSaveState(1, [p1, p2], []);
    store.save(saveState);

    const reloaded = store.open();
    expect(reloaded.source).toBe('save');
    expect(reloaded.state.p1.wood).toBe(99);
    expect(reloaded.state.p1.weapon).toBe('sword');
    expect(reloaded.state.p1.craftedWeapons).toEqual(['hands', 'sword']);
  });

  it('persists and restores terrain height and surface material terraforming deltas', () => {
    const world = createWorld(77);
    const initialH = world.heights.get(10, 10);
    // Terraforming: raise terrain at (10, 10)
    world.heights.set(10, 10, initialH + 3);
    world.heightDeltas.set(10 * 201 + 10, initialH + 3);
    world.surface.set(10, 10, 1); // MAT_DIRT
    world.surfaceDeltas.set(10 * 200 + 10, 1);

    const [p1, p2] = createPlayers();
    const saveState = extractSaveState(77, [p1, p2], [], world);
    expect(saveState.terrainHeights?.length).toBe(1);
    expect(saveState.terrainHeights?.[0]).toEqual({ x: 10, y: 10, h: initialH + 3 });
    expect(saveState.terrainSurfaces?.length).toBe(1);
    expect(saveState.terrainSurfaces?.[0]).toEqual({ x: 10, y: 10, mat: 1 });

    // Fresh seeded world
    const freshWorld = createWorld(77);
    expect(freshWorld.heights.get(10, 10)).toBe(initialH);

    // Apply saved deltas
    applyTerrainDeltas(freshWorld, saveState.terrainHeights!, saveState.terrainSurfaces!);
    expect(freshWorld.heights.get(10, 10)).toBe(initialH + 3);
    expect(freshWorld.surface.get(10, 10)).toBe(1);
  });

  it('persists and restores harvested and living flora landscape', () => {
    const world = createWorld(77);
    const flora = populateFlora(77, world);
    const initialCount = flora.length;
    expect(initialCount).toBeGreaterThan(0);

    // Harvest first flora item
    const target = flora[0]!;
    harvestFloraAt(flora, target.gx, target.gy);
    expect(flora.length).toBe(initialCount - 1);

    const [p1, p2] = createPlayers();
    const saveState = extractSaveState(77, [p1, p2], [], world, flora);
    expect(saveState.flora?.length).toBe(initialCount - 1);

    // Restore flora into new session
    const restoredFlora = restoreFlora(saveState.flora!);
    expect(restoredFlora.length).toBe(initialCount - 1);
    expect(restoredFlora.some((f: FloraItem) => Math.abs(f.gx - target.gx) < 0.1 && Math.abs(f.gy - target.gy) < 0.1)).toBe(false);
  });
});

