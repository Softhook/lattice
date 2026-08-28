/**
 * What a dig turns up: the deterministic ore/gem content of one vertical layer of one tile.
 *
 * **No DOM, no canvas — runs unchanged in Node.**
 *
 * Digging in `world.ts` lowers a tile's four vertices one unit at a time; each integer layer
 * between the surface and `-UNDERGROUND_DEPTH` is therefore cleared exactly once over the life
 * of a world. That is the whole trick here: because a layer is never re-dug, the seam it holds
 * can be a *pure function* of `(seed, gx, gy, level)` with no "already mined" bookkeeping, no
 * extra grid, and nothing new in the save file — the ore is spent the instant the layer is
 * gone, and the lowered vertex height already records that.
 *
 * The maths is Tier A only — `hash3`/`toUnit` are integer avalanche plus one divide, and the
 * probability ramp is `+ - * /`. No `@tier-b`: this feeds a gameplay count that lands in the
 * inventory and the save, so it must be bit-identical on every engine.
 */

import { hash3, toUnit, clamp } from '@latticekit/core';

/** What one dug layer yielded. `'none'` is by far the common case. */
export type OreKind = 'none' | 'iron' | 'gem';

/** Distinct salts so a layer's iron roll and gem roll are independent — without them every gem
 *  layer would also read as iron and the two seams would never pull apart. */
const IRON_SALT = 0x1a9c3f5b;
const GEM_SALT = 0x7e2d10a7;

/** Shallowest depth (in gameplay units *below* sea level) at which each seam can appear. Iron
 *  starts just under the topsoil so a modest pit already pays off; gems sit deep enough that
 *  reaching them is a decision, not an accident. */
const IRON_MIN_DEPTH = 3;
const GEM_MIN_DEPTH = 9;

/** The deepest a shaft can go, matching `world.UNDERGROUND_DEPTH`. Kept as a local literal
 *  rather than an import so this module stays pure maths with one dependency; the two are
 *  pinned together by `underground.test.ts`. */
const MAX_DEPTH = 40;

/** Find rate at the shallowest and deepest reachable layer, linearly interpolated between.
 *  Iron is common enough to keep a smith supplied; gems stay a slow trickle even at the bottom
 *  so a full pouch always represents real distance travelled. */
const IRON_CHANCE_MIN = 0.10;
const IRON_CHANCE_MAX = 0.35;
const GEM_CHANCE_MIN = 0.03;
const GEM_CHANCE_MAX = 0.12;

function ramp(depth: number, minDepth: number, chanceMin: number, chanceMax: number): number {
  const span = MAX_DEPTH - minDepth;
  const t = span > 0 ? (depth - minDepth) / span : 0;
  return chanceMin + clamp(t, 0, 1) * (chanceMax - chanceMin);
}

/**
 * The ore in the layer a dig just cleared at tile `(gx, gy)`, where `level` is the tile's new
 * floor in gameplay height units — negative underground, so `-level` is the depth reached.
 *
 * Gems are checked before iron so the rarer seam wins a layer that rolls both; above
 * `IRON_MIN_DEPTH` the answer is always `'none'` and no hashing is done. Deterministic for a
 * given `(seed, gx, gy, level)` — the same shaft on the same seed always gives the same haul.
 */
export function oreAt(seed: number, gx: number, gy: number, level: number): OreKind {
  const depth = -level;
  if (depth < IRON_MIN_DEPTH) return 'none';

  if (depth >= GEM_MIN_DEPTH) {
    const gemRoll = toUnit(hash3(seed ^ GEM_SALT, gx, gy, level));
    if (gemRoll < ramp(depth, GEM_MIN_DEPTH, GEM_CHANCE_MIN, GEM_CHANCE_MAX)) return 'gem';
  }

  const ironRoll = toUnit(hash3(seed ^ IRON_SALT, gx, gy, level));
  if (ironRoll < ramp(depth, IRON_MIN_DEPTH, IRON_CHANCE_MIN, IRON_CHANCE_MAX)) return 'iron';

  return 'none';
}

/** The dig floor this module assumes, for a test to pin against `world.UNDERGROUND_DEPTH`. */
export const ASSUMED_MAX_DEPTH = MAX_DEPTH;
