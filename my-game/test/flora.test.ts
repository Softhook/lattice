import { describe, it, expect } from 'vitest';
import { createWorld } from '../src/world.js';
import {
  populateFlora,
  rebuildFloraSpatial,
  removeFloraAt,
  consumeFloraItem,
  harvestFloraAt,
  tickFloraRegrowth,
  maturityScale,
  floraVariant,
  findClosestEdibleFlora,
  FLORA_SPATIAL,
  type FloraItem,
} from '../src/flora.js';

function mkFlora(): FloraItem[] {
  const at = (id: number, kind: FloraItem['kind'], gx: number, gy: number): FloraItem => ({
    id, kind, gx, gy, w: 1, d: 1, basePx: 0, scale: 1, subType: 0,
  });
  const flora = [
    at(1, 'bush', 10, 10),
    at(2, 'flowers', 40, 40),
    at(3, 'mushroom', 70, 70),
    at(4, 'pine', 100, 100),
  ];
  rebuildFloraSpatial(flora);
  return flora;
}

/** Assert every item in `flora` is still discoverable through the spatial index at its own tile,
 *  under its live array index — the invariant `removeFloraAt` must preserve without a full rebuild. */
function gridInSync(flora: readonly FloraItem[]): boolean {
  for (let i = 0; i < flora.length; i++) {
    const f = flora[i];
    if (f === undefined) return false;
    const count = FLORA_SPATIAL.queryRadius(f.gx, f.gy, 0.1);
    let found = false;
    for (let q = 0; q < count; q++) if (FLORA_SPATIAL.queryBuffer[q] === i) found = true;
    if (!found) return false;
  }
  return true;
}

describe('Flora removal (swap-pop, incremental spatial patch)', () => {
  it('removeFloraAt swaps the tail into the hole and keeps the spatial index in sync', () => {
    const flora = mkFlora();
    removeFloraAt(flora, 1); // remove 'flowers' at index 1; 'pine' (last) swaps in

    expect(flora.length).toBe(3);
    expect(flora.some((f) => f.id === 2)).toBe(false);
    expect(flora[1]?.id).toBe(4); // tail moved into the hole
    expect(gridInSync(flora)).toBe(true);

    // The removed plant's tile no longer resolves to anything.
    expect(FLORA_SPATIAL.queryRadius(40, 40, 0.5)).toBe(0);
  });

  it('removeFloraAt on the last index is a plain pop', () => {
    const flora = mkFlora();
    removeFloraAt(flora, flora.length - 1);
    expect(flora.length).toBe(3);
    expect(flora.some((f) => f.id === 4)).toBe(false);
    expect(gridInSync(flora)).toBe(true);
  });

  it('removeFloraAt ignores an out-of-range index', () => {
    const flora = mkFlora();
    removeFloraAt(flora, 99);
    removeFloraAt(flora, -1);
    expect(flora.length).toBe(4);
    expect(gridInSync(flora)).toBe(true);
  });

  it('consumeFloraItem finds and removes a specific plant, and reports if it was already gone', () => {
    const flora = mkFlora();
    const target = flora[2]!; // 'mushroom'
    expect(consumeFloraItem(flora, target)).toBe(true);
    expect(flora.includes(target)).toBe(false);
    expect(gridInSync(flora)).toBe(true);
    // Second attempt: already gone.
    expect(consumeFloraItem(flora, target)).toBe(false);
  });

  it('keeps the spatial index consistent across many randomized removals', () => {
    const world = createWorld(42);
    const flora = populateFlora(42, world);
    rebuildFloraSpatial(flora);

    let seed = 12345;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    for (let k = 0; k < 800 && flora.length > 50; k++) {
      const idx = Math.floor(rand() * flora.length);
      removeFloraAt(flora, idx);
    }
    expect(gridInSync(flora)).toBe(true);
  }, 30000);

  it('maturityScale eases a sprout to full size and clamps out of range', () => {
    expect(maturityScale(0)).toBeCloseTo(0.18, 5);
    expect(maturityScale(1)).toBeCloseTo(1, 5);
    expect(maturityScale(-5)).toBeCloseTo(0.18, 5);
    expect(maturityScale(12)).toBeCloseTo(1, 5);
    // Monotonic increasing between the ends.
    expect(maturityScale(0.25)).toBeLessThan(maturityScale(0.5));
    expect(maturityScale(0.5)).toBeLessThan(maturityScale(0.9));
    expect(maturityScale(0.6)).toBeLessThan(1);
  });

  it('floraVariant shrinks a plant while it is immature', () => {
    const mature: FloraItem = { id: 1, kind: 'bush', gx: 5, gy: 5, w: 1, d: 1, basePx: 0, scale: 1.2, subType: 0, growth: 1 };
    const sprout: FloraItem = { ...mature, id: 2, growth: 0.05 };
    expect(floraVariant(sprout).progress).toBeLessThan(floraVariant(mature).progress);
    expect(floraVariant(mature).progress).toBeCloseTo(1.2, 5);
    // A plant with growth omitted renders as mature.
    const legacy: FloraItem = { id: 3, kind: 'bush', gx: 5, gy: 5, w: 1, d: 1, basePx: 0, scale: 1, subType: 0 };
    expect(floraVariant(legacy).progress).toBeCloseTo(1, 5);
  });

  it('regrows soft flora one seedling at a time — never a synchronized batch', () => {
    const world = createWorld(42);
    const flora = populateFlora(42, world); // also resets regrowth module state
    // Simulate a heavily grazed meadow: strip ~97% of plants at random, the way grazing does.
    let s = 20260827;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
    while (flora.length > 400) removeFloraAt(flora, Math.floor(rnd() * flora.length));
    const start = flora.length;

    let maxAddedInOneTick = 0;
    for (let i = 0; i < 45 * 60; i++) {
      const before = flora.length;
      tickFloraRegrowth(42, flora, world, 1 / 60);
      maxAddedInOneTick = Math.max(maxAddedInOneTick, flora.length - before);
    }

    expect(flora.length - start).toBeGreaterThan(5);   // the meadow is recovering
    expect(maxAddedInOneTick).toBeLessThanOrEqual(1);   // and never in a burst

    const seedlings = flora.slice(start);
    // Every new plant sprouted small and is still on its way up.
    expect(seedlings.length).toBeGreaterThan(0);
    expect(seedlings.some((f) => (f.growth ?? 1) < 1)).toBe(true);
    expect(seedlings.every((f) => (f.growth ?? 1) > 0)).toBe(true);
    const young = seedlings.find((f) => (f.growth ?? 1) < 0.3);
    if (young !== undefined) {
      expect(floraVariant(young).progress).toBeLessThan(young.scale * 0.6);
    }
  }, 30000);

  it('herbivore foraging skips bare sprouts so regrowth can establish', () => {
    const near: FloraItem = { id: 1, kind: 'bush', gx: 11, gy: 10, w: 1, d: 1, basePx: 0, scale: 1, subType: 0, growth: 0.1 };
    const far: FloraItem = { id: 2, kind: 'flowers', gx: 16, gy: 10, w: 1, d: 1, basePx: 0, scale: 1, subType: 0, growth: 1 };
    const flora = [near, far];
    rebuildFloraSpatial(flora);

    // Closest plant is the sprout, but a herbivore walks past it to the mature bloom.
    const pick = findClosestEdibleFlora(flora, 10, 10, 12, undefined, FLORA_SPATIAL);
    expect(pick?.id).toBe(2);

    // Once the sprout matures it's fair game again (and now it's the nearer one).
    near.growth = 1;
    rebuildFloraSpatial(flora);
    expect(findClosestEdibleFlora(flora, 10, 10, 12, undefined, FLORA_SPATIAL)?.id).toBe(1);
  });

  it('a seedling matures to full size given enough time', () => {
    const world = createWorld(42);
    const flora = populateFlora(42, world);
    let s = 424242;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
    while (flora.length > 400) removeFloraAt(flora, Math.floor(rnd() * flora.length));
    const start = flora.length;

    for (let i = 0; i < 15 * 60; i++) tickFloraRegrowth(42, flora, world, 1 / 60);
    const seedlings = flora.slice(start).filter((f) => (f.growth ?? 1) < 1);
    expect(seedlings.length).toBeGreaterThan(0);

    // Well past the growth window.
    for (let i = 0; i < 120 * 60; i++) tickFloraRegrowth(42, flora, world, 1 / 60);
    expect(seedlings.every((f) => f.growth === 1)).toBe(true);
  }, 30000);

  it('harvestFloraAt still yields resources and removes the plant', () => {
    const world = createWorld(42);
    const flora: FloraItem[] = [
      { id: 1, kind: 'pine', gx: 20, gy: 20, w: 1, d: 1, basePx: 0, scale: 1, subType: 0 },
      { id: 2, kind: 'bush', gx: 60, gy: 60, w: 1, d: 1, basePx: 0, scale: 1, subType: 0 },
    ];
    rebuildFloraSpatial(flora);

    const yield_ = harvestFloraAt(flora, 20, 20);
    expect(yield_).toBeDefined();
    expect(yield_!.wood + yield_!.stone + yield_!.fiber).toBeGreaterThan(0);
    expect(flora.some((f) => f.id === 1)).toBe(false);
    expect(flora.length).toBe(1);
    expect(gridInSync(flora)).toBe(true);
  });
});
