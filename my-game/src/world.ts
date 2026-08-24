/**
 * World state: the terrain heightfield, surface materials, and all mutations to them.
 *
 * The world is a 160×160 grid of tiles. Height lives on vertices (TileGrid W+1 × H+1),
 * so adjacent tiles share corners exactly and the terrain never has seams.
 *
 * **Dig and build mutate this module's state directly.** After any mutation that raises the
 * maximum height, call `world.maxHeightPx` to re-read it and pass the new value to
 * `input.setTerrain({ field, maxHeightPx })`. Failing to do so makes taps resolve on the old
 * surface — ground the player raised this frame is ground the next event misses.
 */

import { fbm2, clamp } from '@latticekit/core';
import { TileGrid, type HeightField, type MutableTileSource } from '@latticekit/iso';

// ── map dimensions ─────────────────────────────────────────────────────────────

/** Tile count along each axis. 200 tiles provides an expansive, vast landscape to explore. */
export const W = 200;
export const H = 200;

/** Height units per level — the art proportion. 10 px per unit gives 240 px maximum height. */
export const STEP_PX = 10;

/** Maximum terrain height in height units. Peaks reach this; sea level is 0. */
export const MAX_HEIGHT_UNITS = 24;

/** Maximum terrain height in world pixels — what cameras and input.setTerrain need. */
export const MAX_HEIGHT_PX = MAX_HEIGHT_UNITS * STEP_PX;

// ── surface material IDs ───────────────────────────────────────────────────────

export const MAT_GRASS  = 0;
export const MAT_DIRT   = 1;
export const MAT_ROCK   = 2;
export const MAT_WATER  = 3;
export const MAT_SAND   = 4;
export const MAT_SNOW   = 5;
export const MAT_FLOOR  = 6;  // placed by players
export const MAT_STONE  = 7;  // placed by players

// ── world state ────────────────────────────────────────────────────────────────

/** The live height field handed to `input` and `draw`. */
export interface WorldTerrain {
  /** W+1 × H+1 vertex heights, in height units (not world px). */
  readonly heights: TileGrid;
  /** Per-tile material id. W × H. */
  readonly surface: TileGrid;
  /** The `HeightField` shape `iso` and `input` consume. Derived from `heights`. */
  readonly field: HeightField;
  /** Highest vertex on the current map, in world pixels. Updated by dig/raise. */
  currentMaxHeightPx: number;
}

/**
 * Generate the world from a seed. Same seed → identical terrain, creature spawns, etc.
 *
 * Multi-frequency octave noise creates dramatic continental relief, alpine ridges,
 * mountain cliffs, river valleys, and rolling meadows.
 */
export function createWorld(seed: number): WorldTerrain {
  // Vertices: one more than tile count on each axis.
  const heights = new TileGrid(W + 1, H + 1);
  const surface = new TileGrid(W, H);

  heights.fillFrom((gx, gy) => {
    // @tier-b — terrain shape uses fbm2 (transcendental). Pixels only, never hashed.
    const continental = fbm2(seed, gx * 0.012, gy * 0.012, 4);
    const ridges = Math.abs(fbm2(seed ^ 0x9999, gx * 0.022, gy * 0.022, 3)) * 2 - 1;
    const hills = fbm2(seed ^ 0x5555, gx * 0.045, gy * 0.045, 2) * 0.35;

    const combined = continental * 0.6 + ridges * 0.4 + hills;
    // Scaled to [0, MAX_HEIGHT_UNITS] with rich height variation
    const raw = (combined + 0.85) * 0.55 * MAX_HEIGHT_UNITS - 1.2;
    return clamp(Math.round(raw), 0, MAX_HEIGHT_UNITS);
  });

  // Surface material from height — derived at load, player can override later.
  surface.fillFrom((gx, gy) => {
    // Sample the four vertices of this tile and take the minimum (the "floor" of the tile).
    const minH = Math.min(
      heights.get(gx,   gy),
      heights.get(gx+1, gy),
      heights.get(gx,   gy+1),
      heights.get(gx+1, gy+1),
    );
    return materialFromHeight(minH);
  });

  const field: HeightField = {
    heights: boundedHeightSource(heights, W + 1, H + 1),
    stepPx:  STEP_PX,
  };

  return {
    heights,
    surface,
    field,
    currentMaxHeightPx: MAX_HEIGHT_PX,
  };
}

/** Map a height unit value to its default material. */
function materialFromHeight(h: number): number {
  if (h <= 1) return MAT_WATER;
  if (h <= 2) return MAT_SAND;
  if (h >= 19) return MAT_SNOW;
  if (h >= 14) return MAT_ROCK;
  return MAT_GRASS;
}

/**
 * Lower the four vertices around a tile by one height unit.
 *
 * The four vertices of tile (gx,gy) are at grid positions (gx,gy), (gx+1,gy), (gx,gy+1),
 * (gx+1,gy+1). Digging lowers all four equally; the tile becomes a bowl.
 *
 * Returns true if anything changed (i.e. at least one vertex was above 0).
 */
export function dig(world: WorldTerrain, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= W || gy >= H) return false;
  let changed = false;
  for (let dx = 0; dx <= 1; dx++) {
    for (let dy = 0; dy <= 1; dy++) {
      const x = gx + dx;
      const y = gy + dy;
      const cur = world.heights.get(x, y);
      if (cur > 0) {
        world.heights.set(x, y, cur - 1);
        changed = true;
      }
    }
  }
  if (changed) {
    // Update surface material for the tile.
    world.surface.set(gx, gy, MAT_DIRT);
    // Recompute currentMaxHeightPx (dig can only lower, so this only needs updating
    // if the dug vertex was the current maximum — conservative: just scan all vertices).
    // In practice this is rarely called so the scan is acceptable.
    world.currentMaxHeightPx = measureMaxHeightPx(world.heights);
  }
  return changed;
}

/**
 * Raise the four vertices around a tile by one height unit.
 *
 * Returns true if anything changed.
 */
export function raise(world: WorldTerrain, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= W || gy >= H) return false;
  let changed = false;
  for (let dx = 0; dx <= 1; dx++) {
    for (let dy = 0; dy <= 1; dy++) {
      const x = gx + dx;
      const y = gy + dy;
      const cur = world.heights.get(x, y);
      if (cur < MAX_HEIGHT_UNITS) {
        world.heights.set(x, y, cur + 1);
        changed = true;
      }
    }
  }
  if (changed) {
    world.surface.set(gx, gy, MAT_DIRT);
    // Raising can increase the max — update it.
    const newMax = measureMaxHeightPx(world.heights);
    if (newMax > world.currentMaxHeightPx) {
      world.currentMaxHeightPx = newMax;
    }
  }
  return changed;
}

/** Scan all vertices for the current tallest, in world pixels. Called after dig/raise. */
function measureMaxHeightPx(heights: TileGrid): number {
  let max = 0;
  for (let gy = 0; gy <= H; gy++) {
    for (let gx = 0; gx <= W; gx++) {
      const h = heights.get(gx, gy);
      if (h > max) max = h;
    }
  }
  return max * STEP_PX;
}

/**
 * A bounded `TileSource` adapter over `TileGrid`.
 *
 * `tileSourceOf` from iso returns `has() = true` everywhere, which makes off-map taps
 * return a grid coordinate instead of `onGround: false`. This adapter properly bounds it.
 */
function boundedHeightSource(grid: TileGrid, w: number, h: number): MutableTileSource {
  return {
    get(gx, gy)  { return grid.get(gx, gy); },
    set(gx, gy, v) { grid.set(gx, gy, v); },
    has(gx, gy)  { return gx >= 0 && gy >= 0 && gx < w && gy < h; },
    get version()  { return grid.version; },
    fill(v) { grid.fill(v); },
    fillFrom(getVal) { grid.fillFrom(getVal); },
  };
}

/** Read a tile's center height in world pixels (bilinear-like: average of four vertices). */
export function tileCenterHeightPx(world: WorldTerrain, gx: number, gy: number): number {
  const h = world.heights;
  const avg = (h.get(gx, gy) + h.get(gx+1, gy) + h.get(gx, gy+1) + h.get(gx+1, gy+1)) * 0.25;
  return avg * STEP_PX;
}

/** True if a tile is walkable (not water, not a wall block). */
export function isWalkable(world: WorldTerrain, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= W || gy >= H) return false;
  const mat = world.surface.get(gx, gy);
  return mat !== MAT_WATER;
}
