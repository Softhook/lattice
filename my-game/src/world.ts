/**
 * World state: the terrain heightfield, surface materials, and all mutations to them.
 *
 * The world is a 200×200 grid of tiles. Height lives on vertices (TileGrid W+1 × H+1),
 * so adjacent tiles share corners exactly and the terrain never has seams.
 *
 * **Dig and raise mutate this module's state directly.** After any mutation that raises the
 * maximum height, `world.currentMaxHeightPx` is updated and passed to
 * `input.setTerrain({ field, maxHeightPx })`. Failing to do so makes taps resolve on the old
 * surface — ground the player raised this frame is ground the next event misses.
 */

import { fbm2, clamp } from '@latticekit/core';
import { TileGrid, type HeightField, type MutableTileSource } from '@latticekit/iso';

// ── map dimensions ─────────────────────────────────────────────────────────────

/** Tile count along each axis. 640x640 tiles provides a massive 409,600-tile continent. */
export const W = 640;
export const H = 640;

/** Height units per level — the art proportion. 10 px per unit gives 240 px maximum height. */
export const STEP_PX = 10;

/** Maximum terrain height in height units. Peaks reach this; sea level is 0. */
export const MAX_HEIGHT_UNITS = 24;

/** Maximum terrain height in world pixels — what cameras and input.setTerrain need. */
export const MAX_HEIGHT_PX = MAX_HEIGHT_UNITS * STEP_PX;

// ── Biome Registry & Definitions ──────────────────────────────────────────────

export type BiomeKind = 'alpine' | 'taiga' | 'meadow' | 'badlands' | 'wetlands' | 'coastal';

export interface BiomeDefinition {
  readonly kind: BiomeKind;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly minElevation: number;
  readonly maxElevation: number;
  readonly idealTemperature: number;
  readonly idealMoisture: number;
}

export const BIOME_REGISTRY: Record<BiomeKind, BiomeDefinition> = {
  alpine: {
    kind: 'alpine',
    name: 'Alpine Peaks',
    icon: '🏔️',
    description: 'Towering razor-sharp granite spires and glacial snowcaps',
    minElevation: 14,
    maxElevation: 24,
    idealTemperature: 0.15,
    idealMoisture: 0.35,
  },
  taiga: {
    kind: 'taiga',
    name: 'Deep Taiga',
    icon: '🌲',
    description: 'Cold northern boreal forest with towering spruce and slate outcrops',
    minElevation: 4,
    maxElevation: 18,
    idealTemperature: 0.25,
    idealMoisture: 0.65,
  },
  meadow: {
    kind: 'meadow',
    name: 'Temperate Meadows',
    icon: '🌳',
    description: 'Rolling pastoral glades with silver birch, broadleaf oaks, and wildflowers',
    minElevation: 2,
    maxElevation: 14,
    idealTemperature: 0.55,
    idealMoisture: 0.50,
  },
  badlands: {
    kind: 'badlands',
    name: 'Arid Badlands',
    icon: '🏜️',
    description: 'Stepped terracotta mesas, sandstone spires, and desert scrub',
    minElevation: 3,
    maxElevation: 16,
    idealTemperature: 0.85,
    idealMoisture: 0.15,
  },
  wetlands: {
    kind: 'wetlands',
    name: 'Lush Wetlands',
    icon: '🌿',
    description: 'Waterlogged bayous with weeping willows and shallow peat marshes',
    minElevation: 1,
    maxElevation: 6,
    idealTemperature: 0.60,
    idealMoisture: 0.85,
  },
  coastal: {
    kind: 'coastal',
    name: 'Coastal Archipelago',
    icon: '🏖️',
    description: 'Golden sandy shorelines and sea-level shallows',
    minElevation: 0,
    maxElevation: 2,
    idealTemperature: 0.50,
    idealMoisture: 0.70,
  },
};

export interface BiomeInfo {
  readonly kind: BiomeKind;
  readonly name: string;
  readonly icon: string;
  readonly temperature: number;
  readonly moisture: number;
}

export interface BiomeBlendInfo {
  readonly primary: BiomeKind;
  readonly secondary: BiomeKind;
  readonly blend: number;
  readonly info: BiomeInfo;
}

/**
 * Determine the biome, transition blend, and environmental climate at (gx, gy).
 * Driven deterministically by world seed, elevation, temperature, and moisture noise fields.
 */
export function getBiomeBlendAt(gx: number, gy: number, seed: number, elevation: number): BiomeBlendInfo {
  // @tier-b — biome distribution uses noise fields (pixels and classification only)
  const ny = gy / H;

  // Temperature gradient: cooler north (low Y) and alpine heights, warmer south (high Y)
  const tempNoise = fbm2(seed ^ 0x7777, gx * 0.012, gy * 0.012, 3);
  const temp = clamp(0.5 + tempNoise * 0.4 + (ny - 0.5) * 0.3 - (elevation / MAX_HEIGHT_UNITS) * 0.35, 0, 1);

  // Moisture noise: rain shadows vs verdant basins
  const moistNoise = fbm2(seed ^ 0x3333, gx * 0.014, gy * 0.014, 3);
  const moist = clamp(0.5 + moistNoise * 0.45, 0, 1);

  if (elevation <= 1) {
    const def = BIOME_REGISTRY.coastal;
    const info: BiomeInfo = { kind: 'coastal', name: def.name, icon: def.icon, temperature: temp, moisture: moist };
    return { primary: 'coastal', secondary: 'meadow', blend: 0, info };
  }
  if (elevation >= 14) {
    const def = BIOME_REGISTRY.alpine;
    const info: BiomeInfo = { kind: 'alpine', name: def.name, icon: def.icon, temperature: temp, moisture: moist };
    return { primary: 'alpine', secondary: 'taiga', blend: clamp((17 - elevation) / 3, 0, 1), info };
  }

  // Continuous biome affinity weights
  const badlandsAffinity = clamp((temp - 0.46) / 0.14, 0, 1) * clamp((0.54 - moist) / 0.14, 0, 1);
  const wetlandsAffinity = clamp((moist - 0.48) / 0.14, 0, 1) * clamp((10 - elevation) / 6, 0, 1);
  const taigaAffinity = clamp((0.50 - temp) / 0.14, 0, 1);

  // Determine primary and secondary biomes
  let primary: BiomeKind = 'meadow';
  let secondary: BiomeKind = 'meadow';
  let secondaryWeight = 0;

  if (badlandsAffinity > 0.45) {
    primary = 'badlands';
    secondary = 'meadow';
    secondaryWeight = 1 - badlandsAffinity;
  } else if (taigaAffinity > 0.45) {
    primary = 'taiga';
    secondary = 'meadow';
    secondaryWeight = 1 - taigaAffinity;
  } else if (wetlandsAffinity > 0.45) {
    primary = 'wetlands';
    secondary = 'meadow';
    secondaryWeight = 1 - wetlandsAffinity;
  } else {
    primary = 'meadow';
    if (badlandsAffinity > taigaAffinity && badlandsAffinity > wetlandsAffinity) {
      secondary = 'badlands';
      secondaryWeight = badlandsAffinity;
    } else if (taigaAffinity > wetlandsAffinity) {
      secondary = 'taiga';
      secondaryWeight = taigaAffinity;
    } else {
      secondary = 'wetlands';
      secondaryWeight = wetlandsAffinity;
    }
  }

  const def = BIOME_REGISTRY[primary];
  const info: BiomeInfo = {
    kind: primary,
    name: def.name,
    icon: def.icon,
    temperature: temp,
    moisture: moist,
  };

  return { primary, secondary, blend: secondaryWeight, info };
}

/**
 * Determine the primary biome and environmental climate at (gx, gy).
 */
export function getBiomeAt(gx: number, gy: number, seed: number, elevation: number): BiomeInfo {
  return getBiomeBlendAt(gx, gy, seed, elevation).info;
}

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

export interface SavedVertexDelta {
  readonly x: number;
  readonly y: number;
  readonly h: number;
}

export interface SavedSurfaceDelta {
  readonly x: number;
  readonly y: number;
  readonly mat: number;
}

import { DIRT, getTileColor } from './palette.js';

/** The live height field handed to `input` and `draw`. */
export interface WorldTerrain {
  /** W+1 × H+1 vertex heights, in height units (not world px). */
  readonly heights: TileGrid;
  /** Per-tile material id. W × H. */
  readonly surface: TileGrid;
  /** Precalculated 32-bit RGBA tile colors for instant zero-allocation render lookup. W × H. */
  readonly tileColors: Uint32Array;
  /** The `HeightField` shape `iso` and `input` consume. Derived from `heights`. */
  readonly field: HeightField;
  /** Highest vertex on the current map, in world pixels. Updated by dig/raise. */
  currentMaxHeightPx: number;
  /** Mutated vertex height deltas for persistence (key: y * (W + 1) + x). */
  readonly heightDeltas: Map<number, number>;
  /** Mutated tile surface material deltas for persistence (key: y * W + x). */
  readonly surfaceDeltas: Map<number, number>;
}

/**
 * Generate the massive 640x640 world from a seed. Same seed → identical terrain.
 *
 * Implements continuous multi-biome topographical layer blending:
 * - Alpine: Razor-sharp spires and jagged needle crags.
 * - Badlands: Stepped flat-top mesa plateaus and canyon gullies.
 * - Taiga: Rugged coniferous hills and deep valleys.
 * - Wetlands: Flat waterlogged marshes with winding bayous.
 * - Meadows: Soft rolling pastoral hills.
 */
export function createWorld(seed: number): WorldTerrain {
  // Vertices: one more than tile count on each axis.
  const heights = new TileGrid(W + 1, H + 1);
  const surface = new TileGrid(W, H);
  const tileColors = new Uint32Array(W * H);

  heights.fillFrom((gx, gy) => {
    // @tier-b — terrain shape uses fbm2 (transcendental). Pixels only, never hashed.
    const ny = gy / H;

    // Macro climate fields
    const tempNoise = fbm2(seed ^ 0x7777, gx * 0.012, gy * 0.012, 3);
    const temp = clamp(0.5 + tempNoise * 0.4 + (ny - 0.5) * 0.3, 0, 1);
    const moistNoise = fbm2(seed ^ 0x3333, gx * 0.014, gy * 0.014, 3);
    const moist = clamp(0.5 + moistNoise * 0.45, 0, 1);
    const continental = fbm2(seed, gx * 0.009, gy * 0.009, 3);

    // Continuous topographical layer weights
    const alpineW = clamp((continental - 0.12) / 0.18, 0, 1);
    const coastalW = clamp((-0.22 - continental) / 0.15, 0, 1);
    const badlandsW = (1 - alpineW) * (1 - coastalW) * clamp((temp - 0.46) / 0.14, 0, 1) * clamp((0.54 - moist) / 0.14, 0, 1);
    const wetlandsW = (1 - alpineW) * (1 - coastalW) * clamp((moist - 0.48) / 0.14, 0, 1) * clamp((0.15 - continental) / 0.15, 0, 1);
    const taigaW = (1 - alpineW) * (1 - coastalW) * (1 - badlandsW) * clamp((0.50 - temp) / 0.14, 0, 1);
    const meadowW = Math.max(0, 1 - alpineW - coastalW - badlandsW - wetlandsW - taigaW);

    let blendedH = 0;

    if (alpineW > 0.01) {
      const sharpRidge = 1 - Math.abs(fbm2(seed ^ 0x9999, gx * 0.018, gy * 0.018, 3));
      const needleSpires = Math.max(0, fbm2(seed ^ 0x8888, gx * 0.035, gy * 0.035, 2));
      const alpineH = Math.pow(sharpRidge, 2.2) * 19 + needleSpires * 5 + 4; // @tier-b
      blendedH += alpineH * alpineW;
    }

    if (badlandsW > 0.01) {
      const mesaBase = fbm2(seed ^ 0x4444, gx * 0.014, gy * 0.014, 3);
      const canyonCut = Math.abs(fbm2(seed ^ 0x2222, gx * 0.025, gy * 0.025, 2));
      const mesaContinuous = (mesaBase * 0.7 + (1 - canyonCut) * 0.5 + 0.4) * 16;
      const mesaH = Math.floor(mesaContinuous / 3.2) * 3.2 + 2;
      blendedH += mesaH * badlandsW;
    }

    if (wetlandsW > 0.01) {
      const marsh = fbm2(seed ^ 0x1111, gx * 0.02, gy * 0.02, 3);
      const slough = Math.abs(fbm2(seed ^ 0x6666, gx * 0.035, gy * 0.035, 2));
      const wetlandsH = slough < 0.12 ? 0 : marsh > 0.15 ? 3 : marsh > -0.1 ? 2 : 1;
      blendedH += wetlandsH * wetlandsW;
    }

    if (taigaW > 0.01) {
      const taigaNoise = fbm2(seed ^ 0xaaaa, gx * 0.016, gy * 0.016, 3) * 0.7 + fbm2(seed ^ 0xbbbb, gx * 0.03, gy * 0.03, 2) * 0.3;
      const taigaH = (taigaNoise + 0.5) * 13 + 3;
      blendedH += taigaH * taigaW;
    }

    if (coastalW > 0.01) {
      const dune = fbm2(seed ^ 0xcccc, gx * 0.016, gy * 0.016, 2);
      const coastalH = (dune + 0.3) * 4;
      blendedH += coastalH * coastalW;
    }

    if (meadowW > 0.01) {
      const meadow = fbm2(seed ^ 0x5555, gx * 0.014, gy * 0.014, 3) * 0.75 + fbm2(seed ^ 0x1234, gx * 0.028, gy * 0.028, 2) * 0.25;
      const meadowH = (meadow + 0.5) * 9 + 2;
      blendedH += meadowH * meadowW;
    }

    return clamp(Math.round(blendedH), 0, MAX_HEIGHT_UNITS);
  });



  // Surface material & Precalculated tile colors with smooth biome color blending
  surface.fillFrom((gx, gy) => {
    // Sample the four vertices of this tile and take the minimum (the "floor" of the tile).
    const minH = Math.min(
      heights.get(gx,   gy),
      heights.get(gx+1, gy),
      heights.get(gx,   gy+1),
      heights.get(gx+1, gy+1),
    );
    const blend = getBiomeBlendAt(gx, gy, seed, minH);
    tileColors[gy * W + gx] = getTileColor(blend.primary, minH, seed, gx, gy, blend.secondary, blend.blend);

    if (minH <= 1) return MAT_WATER;
    if (minH <= 2 || blend.primary === 'coastal') return MAT_SAND;
    if (blend.primary === 'badlands') return minH > 6 ? MAT_ROCK : MAT_SAND;
    if (minH >= 19 || (blend.primary === 'alpine' && minH >= 17)) return MAT_SNOW;
    if (minH >= 14 || blend.primary === 'alpine') return MAT_ROCK;
    return MAT_GRASS;
  });

  const field: HeightField = {
    heights: boundedHeightSource(heights, W + 1, H + 1),
    stepPx:  STEP_PX,
  };

  return {
    heights,
    surface,
    tileColors,
    field,
    currentMaxHeightPx: MAX_HEIGHT_PX,
    heightDeltas: new Map<number, number>(),
    surfaceDeltas: new Map<number, number>(),
  };
}





/** Apply saved terrain height and surface material deltas onto a freshly seeded world. */
export function applyTerrainDeltas(
  world: WorldTerrain,
  heights: readonly SavedVertexDelta[],
  surfaces: readonly SavedSurfaceDelta[],
): void {
  let maxH = 0;
  for (let i = 0; i < heights.length; i++) {
    const d = heights[i];
    if (d !== undefined && d.x >= 0 && d.x <= W && d.y >= 0 && d.y <= H) {
      world.heights.set(d.x, d.y, d.h);
      world.heightDeltas.set(d.y * (W + 1) + d.x, d.h);
      if (d.h > maxH) maxH = d.h;
    }
  }
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (s !== undefined && s.x >= 0 && s.x < W && s.y >= 0 && s.y < H) {
      world.surface.set(s.x, s.y, s.mat);
      world.surfaceDeltas.set(s.y * W + s.x, s.mat);
    }
  }
  const maxPx = maxH * STEP_PX;
  if (maxPx > world.currentMaxHeightPx) {
    world.currentMaxHeightPx = maxPx;
  }
}

/** Extract all modified terrain vertices and surface tiles. */
export function extractTerrainDeltas(world: WorldTerrain): {
  heights: SavedVertexDelta[];
  surfaces: SavedSurfaceDelta[];
} {
  const heights: SavedVertexDelta[] = [];
  world.heightDeltas.forEach((h, key) => {
    const x = key % (W + 1);
    const y = Math.floor(key / (W + 1));
    heights.push({ x, y, h });
  });

  const surfaces: SavedSurfaceDelta[] = [];
  world.surfaceDeltas.forEach((mat, key) => {
    const x = key % W;
    const y = Math.floor(key / W);
    surfaces.push({ x, y, mat });
  });

  return { heights, surfaces };
}

/** Map a height unit value to its default material. */
export function materialFromHeight(h: number): number {
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
        const next = cur - 1;
        world.heights.set(x, y, next);
        world.heightDeltas.set(y * (W + 1) + x, next);
        changed = true;
      }
    }
  }
  if (changed) {
    world.surface.set(gx, gy, MAT_DIRT);
    world.surfaceDeltas.set(gy * W + gx, MAT_DIRT);
    world.tileColors[gy * W + gx] = DIRT;
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
  let maxNewH = 0;
  for (let dx = 0; dx <= 1; dx++) {
    for (let dy = 0; dy <= 1; dy++) {
      const x = gx + dx;
      const y = gy + dy;
      const cur = world.heights.get(x, y);
      if (cur < MAX_HEIGHT_UNITS) {
        const next = cur + 1;
        world.heights.set(x, y, next);
        world.heightDeltas.set(y * (W + 1) + x, next);
        if (next > maxNewH) maxNewH = next;
        changed = true;
      }
    }
  }
  if (changed) {
    world.surface.set(gx, gy, MAT_DIRT);
    world.surfaceDeltas.set(gy * W + gx, MAT_DIRT);
    world.tileColors[gy * W + gx] = DIRT;
    const newMaxPx = maxNewH * STEP_PX;
    if (newMaxPx > world.currentMaxHeightPx) {
      world.currentMaxHeightPx = newMaxPx;
    }
  }
  return changed;
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
