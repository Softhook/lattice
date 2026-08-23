/**
 * The archipelago, generated once from the seed and never again.
 *
 * Everything a run needs that does not move: the heightfield, the islands cut out of it, the
 * wooden things standing on them, the shore batteries, and — the part that matters most — the
 * **neighbor lists fire spreads along**. Those are built here, at generation, because a fire that
 * asks "what is near me" every tick is an O(n²) scan on the hot path, and a fire that asks it
 * once is a flat array walk.
 *
 * Nothing in this module reads a clock and nothing calls `Math.random`. Given the same seed it
 * produces the same coast, the same huts and the same wind, on every machine — which is what
 * makes `?seed=` a shareable level rather than a number in a URL.
 */

import { TileGrid, heightAt, type HeightField } from '@latticekit/iso';
import { fbm2, type Rng } from '@latticekit/core';

/** Width and depth of the map in tiles. Square, because an archipelago has no grain. */
export const MAP = 80;
/** World pixels per height unit. `TILE_H / 4` is the kit's suggested first guess and it is
 *  right here: four steps of rise per tile is where a 2:1 slope stops reading as a slope. */
export const STEP_PX = 10;
/**
 * The tallest ground in units. Everything above this is something standing on it.
 *
 * Fourteen steps of six pixels rather than six of fourteen, for the same summit height and a
 * completely different picture: `isoTerrain`'s relief term is a function of the height
 * *difference across one tile*, so a coarse field gives large flat plateaus with hard risers
 * between them — a wedding cake — while a fine one gives a continuous slope that shades. The
 * first build shipped the coarse version and the islands read as stacked plates.
 */
export const MAX_UNITS = 14;
/** The Terrain cull's margin, in world pixels: the tallest ground plus the tallest thing on it.
 *  Without it the summit of an island vanishes the moment its base leaves the bottom edge. */
export const MAX_HEIGHT_PX = MAX_UNITS * STEP_PX + 120;

/**
 * What a burnable is. The kind chooses the silhouette and the fuel; nothing else varies by kind,
 * so fire does not have to know what it is burning.
 */
export const Kind = {
  /** A plank hut with a pitched roof. The commonest thing on an island. */
  Hut: 0,
  /** A stack of pitch barrels. Small, fast, and the best thing to start a chain with. */
  Barrels: 1,
  /** A palisade post. Cheap fuel that carries fire along a shoreline like a fuse. */
  Post: 2,
  /** A pine. Burns long and throws the most light. */
  Tree: 3,
  /** A drying rack of nets. Wide, low, and links two other things that would not otherwise
   *  reach each other. */
  Rack: 4,
  /** The objective. Burns slowly, then goes up and takes the island's whole west end with it. */
  Magazine: 5,
} as const;
/** See {@link Kind}. */
export type Kind = (typeof Kind)[keyof typeof Kind];

/** How a burnable behaves. `Prop.state` is the whole of its fire lifecycle. */
export const Burn = {
  /** Standing, cold. */
  Cold: 0,
  /** Alight: consuming fuel, throwing light, and heating its neighbors. */
  Lit: 1,
  /** Burned out. A black stump that still smokes for a while. */
  Spent: 2,
} as const;
/** See {@link Burn}. */
export type Burn = (typeof Burn)[keyof typeof Burn];

/**
 * One standing, burnable thing.
 *
 * Mutable and pooled by generation: the array is allocated once and the fields are written in
 * place, so a run that burns ninety huts allocates nothing after the first frame.
 */
export interface Prop {
  readonly kind: Kind;
  /** Tile position. Fractional — a village of things on integer tiles reads as a spreadsheet. */
  readonly gx: number;
  readonly gy: number;
  /** Ground elevation under it, in world pixels. Cached: `heightAt` is four lookups and a
   *  bilinear blend, and this cannot move. */
  readonly zPx: number;
  /** 0–1, stable per instance. Every piece of per-instance variation in the art reads this,
   *  so the same hut is the same hut on every reload. */
  readonly seed: number;
  /** Which island it stands on, for the "this island is clear" test. */
  readonly island: number;
  /** Footprint in tiles, for depth sorting and for how big its fire is. */
  readonly size: number;
  /** Indices of the props close enough to catch from this one. Built once; see the header. */
  readonly near: number[];
  /** How much is left to burn, in seconds of flame. Zero once spent. */
  fuel: number;
  /** Full fuel, kept so intensity can be a fraction of it. */
  readonly fuelMax: number;
  /** 0–1 heat accumulated from neighbors and hits. At 1 it lights. */
  heat: number;
  /** See {@link Burn}. */
  state: Burn;
  /** 0–1 flame size. Ramps in over a second so an ignition is a catch rather than a switch. */
  flame: number;
  /** Seconds of smoke left after the flame dies. */
  smoke: number;
}

/** A stone gun emplacement. Not burnable — it is the thing fire cannot solve. */
export interface Battery {
  readonly gx: number;
  readonly gy: number;
  readonly zPx: number;
  readonly seed: number;
  /** Aim direction, a unit vector, turned toward the player over time so a shot is telegraphed. */
  ax: number;
  ay: number;
  /** Seconds until it may fire again. */
  cd: number;
  /** Hits left. */
  hp: number;
  /** 0–1, rises on a hit and decays. Drives the damage flash and the smoke. */
  hurt: number;
}

/** An island, as the rest of the game needs to know it. */
export interface Island {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Index into {@link World.props} of this island's magazine, or -1 if it carries none. */
  readonly magazine: number;
}

/** Everything generation produced. */
export interface World {
  readonly heights: TileGrid;
  readonly field: HeightField;
  /**
   * Per **tile**, 1 where any of the tile's four corners stands above the sea.
   *
   * The height grid is read by `isoTerrain` as a lattice of **vertices**, so "is this tile land"
   * is a question about four values and not one — and the naive `heights.get(gx, gy) > 0` is
   * wrong along exactly the ring of tiles the player spends the whole game next to. Precomputed
   * because it is asked by the terrain loop for every visible tile, by every hull every tick, and
   * by every ember that lands.
   */
  readonly solid: Uint8Array;
  /** Per tile, 1 where a sea tile touches a land one: the ring the surf is drawn on. */
  readonly coast: Uint8Array;
  readonly props: Prop[];
  readonly batteries: Battery[];
  readonly islands: Island[];
  /** Wind, a unit vector in grid space. Fire leans downwind and spreads faster that way, which
   *  is the whole reason a player circles an island before firing rather than shooting the
   *  nearest thing. */
  readonly windX: number;
  readonly windY: number;
  /** Open water the run opens on, chosen to be within sight of the first island. */
  readonly startX: number;
  readonly startY: number;
}

/**
 * Is this position on land? The one question the simulation asks the map, so it is asked in one
 * place — a second spelling of it is a shoreline the boats and the pixels disagree about.
 */
export function onLand(world: World, x: number, y: number): boolean {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < 0 || gy < 0 || gx >= MAP || gy >= MAP) return false;
  return world.solid[gy * MAP + gx] === 1;
}

/** How far fire reaches, in tiles. Beyond this two things are separate fires. */
const REACH = 3.4;
/** Most neighbors any one prop tracks. A dense village would otherwise give one hut twenty
 *  links and make the innermost loop of the fire system quadratic in the crowd. */
const MAX_NEAR = 7;

/** Seconds of flame each kind carries. Long fuel is long light; short fuel is a fuse. */
const FUEL: Readonly<Record<Kind, number>> = {
  [Kind.Hut]: 11,
  [Kind.Barrels]: 4,
  [Kind.Post]: 5,
  [Kind.Tree]: 14,
  [Kind.Rack]: 6,
  [Kind.Magazine]: 9,
};

/** Footprint in tiles, which is also how big the flame and the light pool get. */
const SIZE: Readonly<Record<Kind, number>> = {
  [Kind.Hut]: 1.5,
  [Kind.Barrels]: 0.9,
  [Kind.Post]: 0.5,
  [Kind.Tree]: 1.1,
  [Kind.Rack]: 1.7,
  [Kind.Magazine]: 2.6,
};

/**
 * Land height in units at a tile, or 0 for sea.
 *
 * The shape is a sum of island bells rather than a max of them, so two islands that overlap grow
 * an isthmus instead of a crease — and the noise is added *before* the threshold, so the
 * coastline is ragged rather than circular. Thresholding a smooth field is the cheapest way to
 * get a coast that looks drawn, and the only thing it needs to look natural is for the noise to
 * be at the same scale as the smallest bay you want.
 */
/** A placed island before it knows whether it carries a magazine. See {@link createWorld}. */
interface Mound { readonly cx: number; readonly cy: number; readonly r: number }

function landAt(islands: readonly Mound[], seed: number, gx: number, gy: number): number {
  let bell = 0;
  for (const isle of islands) {
    const dx = gx - isle.cx;
    const dy = gy - isle.cy;
    const d = Math.sqrt(dx * dx + dy * dy) / isle.r;
    if (d < 1.35) bell += (1.35 - d) / 1.35;
  }
  if (bell <= 0) return 0;
  // Five octaves at a base wavelength of about twelve tiles. Four was smooth enough that every
  // coastline came out as a rounded diamond; the fifth is what puts a cove in it.
  const grain = fbm2(seed, gx * 0.075, gy * 0.075, 5, 0.58) * 0.46;
  const v = bell + grain - 0.44;
  if (v <= 0) return 0;
  const units = 1 + Math.floor(v * 17);
  return units > MAX_UNITS ? MAX_UNITS : units;
}

/**
 * Build the run's world.
 *
 * Deterministic in the strict sense: every number below comes out of `rng` or out of `fbm2`,
 * both of which are Tier A — integer hashing, multiplies and adds — so two machines agree bit
 * for bit rather than nearly.
 */
export function createWorld(rng: Rng): World {
  const noiseSeed = rng.nextUint32();

  // ── islands ────────────────────────────────────────────────────────────────────────────
  //
  // Rejection-sampled with a spacing rule, because a Poisson disc here would be forty lines to
  // place seven points. The four largest carry a magazine; the rest are cover, and cover is what
  // makes the last magazine hard to reach rather than merely far away.
  const placed: Mound[] = [];
  for (let attempt = 0; attempt < 900 && placed.length < 7; attempt++) {
    const r = rng.float(5.5, 10.5);
    const cx = rng.float(13, MAP - 13);
    const cy = rng.float(13, MAP - 13);
    let ok = true;
    for (const other of placed) {
      const dx = cx - other.cx;
      const dy = cy - other.cy;
      if (Math.sqrt(dx * dx + dy * dy) < r + other.r + 5) ok = false;
    }
    if (ok) placed.push({ cx, cy, r });
  }
  // Largest first, so "the four biggest islands carry the magazines" is an index test rather
  // than a second pass. It also makes the objectives the four most legible shapes on the map.
  placed.sort((a, b) => b.r - a.r);
  /** How many islands carry an objective. Four is a three-minute run at the pace this moves. */
  const MAGAZINES = 4;

  // ── the ground ─────────────────────────────────────────────────────────────────────────
  const heights = new TileGrid(MAP, MAP, { bits: 8 });
  heights.fillFrom((gx, gy) => landAt(placed, noiseSeed, gx, gy));
  const field: HeightField = { heights, stepPx: STEP_PX };
  // Bilinear, not the corner value: props stand at fractional positions and a hut placed off the
  // corner height floats or sinks by up to a whole step on any slope, which reads as the art
  // being wrong rather than as the placement being wrong.
  const zAt = (gx: number, gy: number): number => heightAt(field, gx, gy);

  // ── what stands on it ──────────────────────────────────────────────────────────────────
  const props: Prop[] = [];
  const batteries: Battery[] = [];

  const push = (kind: Kind, gx: number, gy: number, island: number, seed: number): number => {
    const fuelMax = FUEL[kind];
    props.push({
      kind, gx, gy, zPx: zAt(gx, gy), seed, island, size: SIZE[kind],
      near: [], fuel: fuelMax, fuelMax, heat: 0, state: Burn.Cold, flame: 0, smoke: 0,
    });
    return props.length - 1;
  };

  for (let i = 0; i < placed.length; i++) {
    const isle = placed[i];
    if (isle === undefined) continue;

    // Every land tile of this island, and every land tile of it that touches water. The second
    // list is where the palisade and the battery go, and building it here costs one pass over a
    // box that is already small.
    const inland: number[] = [];
    const shore: number[] = [];
    const lo = Math.max(1, Math.floor(isle.cx - isle.r * 1.6));
    const hi = Math.min(MAP - 2, Math.ceil(isle.cx + isle.r * 1.6));
    const lo2 = Math.max(1, Math.floor(isle.cy - isle.r * 1.6));
    const hi2 = Math.min(MAP - 2, Math.ceil(isle.cy + isle.r * 1.6));
    for (let gy = lo2; gy <= hi2; gy++) {
      for (let gx = lo; gx <= hi; gx++) {
        if (heights.get(gx, gy) === 0) continue;
        const edge =
          heights.get(gx + 1, gy) === 0 || heights.get(gx - 1, gy) === 0 ||
          heights.get(gx, gy + 1) === 0 || heights.get(gx, gy - 1) === 0;
        (edge ? shore : inland).push(gy * MAP + gx);
      }
    }
    if (inland.length < 6) continue;

    // The magazine goes on the highest inland tile, which is both the readable place for it and
    // the one that forces the player to reach past everything else to set it alight.
    if (i < MAGAZINES) {
      let best = inland[0] ?? 0;
      let bestH = -1;
      for (const cell of inland) {
        const h = heights.get(cell % MAP, Math.floor(cell / MAP));
        if (h > bestH) { bestH = h; best = cell; }
      }
      const gx = (best % MAP) + rng.float(0.2, 0.5);
      const gy = Math.floor(best / MAP) + rng.float(0.2, 0.5);
      push(Kind.Magazine, gx, gy, i, rng.next());
    }

    // A village. Spaced by rejection against what is already down, so huts do not stack — and
    // the spacing is deliberately smaller than REACH, because a village nothing can jump between
    // is a village the player has to shoot one building at a time.
    const want = Math.round(isle.r * 1.9);
    for (let n = 0, tries = 0; n < want && tries < want * 12; tries++) {
      const cell = rng.pick(inland);
      const gx = (cell % MAP) + rng.float(0.15, 0.7);
      const gy = Math.floor(cell / MAP) + rng.float(0.15, 0.7);
      let clear = true;
      for (const p of props) {
        if (p.island !== i) continue;
        const dx = p.gx - gx;
        const dy = p.gy - gy;
        if (dx * dx + dy * dy < 1.55) clear = false;
      }
      if (!clear) continue;
      const roll = rng.next();
      const kind: Kind = roll < 0.34 ? Kind.Hut : roll < 0.55 ? Kind.Tree : roll < 0.76 ? Kind.Barrels : Kind.Rack;
      push(kind, gx, gy, i, rng.next());
      n++;
    }

    // A palisade around part of the shore: a run of posts that carries fire like a fuse and
    // gives the coastline something to be a silhouette against.
    if (shore.length > 8) {
      const start = rng.int(0, shore.length);
      const run = Math.min(shore.length, rng.int(6, 14));
      for (let k = 0; k < run; k += 1) {
        const cell = shore[(start + k * 2) % shore.length];
        if (cell === undefined) continue;
        push(Kind.Post, (cell % MAP) + 0.5, Math.floor(cell / MAP) + 0.5, i, rng.next());
      }
    }

    // One gun, and only on an island big enough to be worth defending. Seven guns on seven
    // islands put the player under fire from three of them at once everywhere on the map, which
    // measured as a hit every two seconds in `tools/soak.mjs` and is not a fight, it is weather.
    if (shore.length > 4 && isle.r >= 7.0) {
      const cell = shore[rng.int(0, shore.length)] ?? 0;
      const gx = (cell % MAP) + 0.5;
      const gy = Math.floor(cell / MAP) + 0.5;
      batteries.push({
        gx, gy, zPx: zAt(gx, gy), seed: rng.next(),
        ax: 1, ay: 0, cd: rng.float(1.5, 5), hp: 3, hurt: 0,
      });
    }
  }

  // ── who can catch from whom ────────────────────────────────────────────────────────────
  //
  // O(n²) once, at generation, for a table the fire system then walks in a straight line. With
  // ~120 props that is fourteen thousand comparisons in the frame nobody is looking at, against
  // fourteen thousand *per tick* if it were asked live.
  for (let i = 0; i < props.length; i++) {
    const a = props[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < props.length; j++) {
      const b = props[j];
      if (b === undefined) continue;
      const dx = b.gx - a.gx;
      const dy = b.gy - a.gy;
      if (dx * dx + dy * dy > REACH * REACH) continue;
      if (a.near.length < MAX_NEAR) a.near.push(j);
      if (b.near.length < MAX_NEAR) b.near.push(i);
    }
  }

  // ── wind, and where the run opens ──────────────────────────────────────────────────────
  //
  // A unit vector taken from a quarter-turn table rather than from `sin`: the eight compass
  // directions are the only ones a player can read off the smoke anyway, and a table keeps the
  // whole of world generation inside Tier A.
  const COMPASS = [
    [1, 0], [0.7071067811865476, 0.7071067811865476], [0, 1], [-0.7071067811865476, 0.7071067811865476],
    [-1, 0], [-0.7071067811865476, -0.7071067811865476], [0, -1], [0.7071067811865476, -0.7071067811865476],
  ] as const;
  const wind = COMPASS[rng.int(0, 8)] ?? COMPASS[0];

  // Open water, close enough to the first island that the opening frame has a target in it.
  const first = placed[0];
  let startX = MAP * 0.5;
  let startY = MAP * 0.5;
  if (first !== undefined) {
    for (let ring = 0; ring < 40; ring++) {
      const d = first.r + 3.5 + ring * 0.5;
      const dir = COMPASS[(ring * 3) % 8] ?? COMPASS[0];
      const x = first.cx + dir[0] * d;
      const y = first.cy + dir[1] * d;
      if (x < 6 || y < 6 || x > MAP - 6 || y > MAP - 6) continue;
      if (heights.get(Math.floor(x), Math.floor(y)) !== 0) continue;
      startX = x;
      startY = y;
      break;
    }
  }

  // ── the two masks the hot paths read ───────────────────────────────────────────────────
  const solid = new Uint8Array(MAP * MAP);
  const coast = new Uint8Array(MAP * MAP);
  for (let gy = 0; gy < MAP; gy++) {
    for (let gx = 0; gx < MAP; gx++) {
      const top = heights.get(gx, gy) + heights.get(gx + 1, gy) + heights.get(gx, gy + 1) + heights.get(gx + 1, gy + 1);
      if (top > 0) solid[gy * MAP + gx] = 1;
    }
  }
  for (let gy = 1; gy < MAP - 1; gy++) {
    for (let gx = 1; gx < MAP - 1; gx++) {
      const at = gy * MAP + gx;
      if (solid[at] === 1) continue;
      if (
        solid[at - 1] === 1 || solid[at + 1] === 1 || solid[at - MAP] === 1 || solid[at + MAP] === 1 ||
        solid[at - MAP - 1] === 1 || solid[at - MAP + 1] === 1 || solid[at + MAP - 1] === 1 || solid[at + MAP + 1] === 1
      ) coast[at] = 1;
    }
  }

  const islands: Island[] = placed.map((isle, i) => ({
    cx: isle.cx, cy: isle.cy, r: isle.r,
    magazine: props.findIndex((p) => p.kind === Kind.Magazine && p.island === i),
  }));

  return { heights, field, props, batteries, islands, solid, coast, windX: wind[0], windY: wind[1], startX, startY };
}
