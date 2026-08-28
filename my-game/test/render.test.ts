import { describe, it, expect } from 'vitest';
import type { HeightField } from '@latticekit/iso';
import { occludedFraction } from '../src/render.js';
import { W, H, STEP_PX } from '../src/world.js';

/** A stand-in heightfield: `units(gx, gy)` in gameplay height units, scaled to px by `heightAt`. */
function field(units: (gx: number, gy: number) => number): HeightField {
  return {
    heights: { get: (gx, gy) => units(gx, gy), has: () => true },
    stepPx: STEP_PX,
  } as HeightField;
}

const SPRITE_TOP = 40; // px above the entity's feet

describe('occludedFraction', () => {
  it('is zero on flat ground — nothing in front stands high enough to hide anything', () => {
    expect(occludedFraction(field(() => 0), 100, 100, 0, SPRITE_TOP)).toBe(0);
  });

  it('is one for an entity sunk deep below the surrounding surface', () => {
    // Entity 30 units down; the untouched surface (0) sits camera-ward.
    const groundPx = -30 * STEP_PX;
    expect(occludedFraction(field(() => 0), 100, 100, groundPx, groundPx + SPRITE_TOP)).toBe(1);
  });

  it('is strictly between 0 and 1 for a shallow dip', () => {
    const groundPx = -5 * STEP_PX; // 50 px down; one diagonal step of lip = 32 px
    const frac = occludedFraction(field(() => 0), 100, 100, groundPx, groundPx + SPRITE_TOP);
    expect(frac).toBeGreaterThan(0);
    expect(frac).toBeLessThan(1);
  });

  it('grows as the shaft deepens', () => {
    const at = (down: number): number => {
      const g = -down * STEP_PX;
      return occludedFraction(field(() => 0), 100, 100, g, g + SPRITE_TOP);
    };
    expect(at(8)).toBeGreaterThan(at(4));
  });

  it('does not treat the void past the map rim as an occluder', () => {
    // Entity on the very edge, deep underground, with "terrain" that would otherwise bury it.
    const groundPx = -30 * STEP_PX;
    expect(occludedFraction(field(() => 50), W, H, groundPx, groundPx + SPRITE_TOP)).toBe(0);
  });

  it('is zero when the sprite has no height', () => {
    expect(occludedFraction(field(() => 20), 100, 100, 0, 0)).toBe(0);
  });
});
