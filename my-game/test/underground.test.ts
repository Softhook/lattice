import { describe, it, expect } from 'vitest';
import { oreAt, ASSUMED_MAX_DEPTH } from '../src/underground.js';
import { UNDERGROUND_DEPTH } from '../src/world.js';

describe('underground ore seams', () => {
  it('assumes the same dig floor the world enforces', () => {
    expect(ASSUMED_MAX_DEPTH).toBe(UNDERGROUND_DEPTH);
  });

  it('is a pure function — same (seed, tile, layer) always gives the same answer', () => {
    for (let i = 0; i < 60; i++) {
      const gx = 3 + i * 7;
      const gy = 11 + i * 5;
      const level = -(3 + (i % 30));
      expect(oreAt(1234, gx, gy, level)).toBe(oreAt(1234, gx, gy, level));
    }
  });

  it('depends on the seed', () => {
    let disagreements = 0;
    for (let gx = 0; gx < 60; gx++) {
      for (let level = -3; level >= -UNDERGROUND_DEPTH; level--) {
        if (oreAt(1, gx, 7, level) !== oreAt(2, gx, 7, level)) disagreements++;
      }
    }
    expect(disagreements).toBeGreaterThan(0);
  });

  it('never yields ore in the topsoil (shallower than the iron threshold)', () => {
    for (let gx = 0; gx < 200; gx++) {
      for (let gy = 0; gy < 5; gy++) {
        for (let level = 8; level >= -2; level--) {
          expect(oreAt(42, gx, gy, level)).toBe('none');
        }
      }
    }
  });

  it('never places a gem above the (deeper) gem threshold', () => {
    for (let gx = 0; gx < 400; gx++) {
      for (let level = -3; level >= -8; level--) {
        expect(oreAt(99, gx, 2, level)).not.toBe('gem');
      }
    }
  });

  it('yields both iron and gems over a deep scan, but keeps ore the exception', () => {
    let iron = 0;
    let gem = 0;
    let none = 0;
    for (let gx = 0; gx < 160; gx++) {
      for (let gy = 0; gy < 6; gy++) {
        for (let level = -3; level >= -UNDERGROUND_DEPTH; level--) {
          const kind = oreAt(7, gx, gy, level);
          if (kind === 'iron') iron++;
          else if (kind === 'gem') gem++;
          else none++;
        }
      }
    }
    expect(iron).toBeGreaterThan(0);
    expect(gem).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(iron + gem);
  });

  it('gets richer the deeper the shaft goes', () => {
    const strikeRate = (from: number, to: number): number => {
      let hits = 0;
      let n = 0;
      for (let gx = 0; gx < 500; gx++) {
        for (let level = from; level >= to; level--) {
          n++;
          if (oreAt(5, gx, 3, level) !== 'none') hits++;
        }
      }
      return hits / n;
    };
    expect(strikeRate(-30, -UNDERGROUND_DEPTH)).toBeGreaterThan(strikeRate(-3, -13));
  });
});
