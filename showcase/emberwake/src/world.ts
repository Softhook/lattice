/**
 * The archipelago, generated once from the seed and never again.
 *
 * Everything a run needs that does not move: the heightfield, the islands cut out of it, the
 * wooden things standing on them, the shore batteries, the hulks rotting in the shallows, and —
 * the part that matters most — the **neighbor lists fire spreads along**. Those are built here,
 * at generation, because a fire that asks "what is near me" every tick is an O(n²) scan on the
 * hot path, and a fire that asks it once is a flat array walk.
 *
 * ## Why there are three sizes of island and not one
 *
 * The first build placed seven islands of one size band on an 80-tile map and the result was a
 * game played on open water: two thirds of every frame was featureless navy, and the *between* —
 * which is most of a raid — had nothing in it to look at, steer around or set alight. The fix is
 * not more of the same island. It is a **size hierarchy**: four magazine islands a player
 * navigates *to*, half a dozen islets that break the horizon, and a scatter of skerries small
 * enough to be hazards rather than destinations. A sea with rocks in it is a sea you steer
 * through; a sea without them is a menu.
 *
 * Nothing in this module reads a clock and nothing calls `Math.random`. Given the same seed it
 * produces the same coast, the same huts and the same wind, on every machine — which is what
 * makes `?seed=` a shareable level rather than a number in a URL.
 */

import { TileGrid, heightAt, type HeightField } from '@latticekit/iso';
import { fbm2, type Rng } from '@latticekit/core';

/**
 * Width and depth of the map in tiles. Square, because an archipelago has no grain.
 *
 * Sixty-eight and not eighty, and the eighty was measured wrong rather than chosen: a run has to
 * cross this thing four times and the boat does nine tiles a second, so eighty tiles is a
 * fourteen-second transit between objectives with nothing happening in it. Sixty-eight puts every
 * magazine within about seven seconds of the next one and is the single change that turned a
 * four-minute errand into a ninety-second raid.
 */
export const MAP = 68;
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
  /**
   * A hulk aground in the shallows. Burns, throws a great deal of light, and is **solid** — the
   * only thing in open water a hull can hit, which is what makes running the gaps at speed a
   * decision rather than a straight line.
   */
  Wreck: 6,
  /** A channel buoy. Two seconds of fuel and a lamp: it exists so that empty water has something
   *  in it that moves, and so a fire has a stepping stone across a strait. */
  Buoy: 7,
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
  /** Which island it stands on, or -1 for anything floating. Used by the "this island is clear"
   *  test and by nothing else. */
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
  /**
   * Seconds of muzzle flash left.
   *
   * **A gun that fires with no flash is damage from nowhere.** The first playthrough on real
   * hardware lost a run without ever finding out what was shooting: a battery put a shell in the
   * air with three puffs of smoke and no light at all, at a range where the emplacement is a grey
   * box on a dark hillside. One frame of white on the muzzle, and a pool on the ground under it,
   * turns "my hull is going down" into "there, on the point".
   */
  flash: number;
}

/** An island, as the rest of the game needs to know it. Skerries are not in this list: nothing
 *  navigates to a rock. */
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
  /** Indices into {@link World.props} of everything a hull can run into that is not land. Kept
   *  as a short flat list rather than found by scanning `props`, because it is read by every
   *  hull on every tick and there are two hundred props and a dozen wrecks. */
  readonly wrecks: readonly number[];
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

/** The tallest ground a magazine will stand on, in height units. See where it is used. */
const MAGAZINE_CAP = 8;

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
  [Kind.Magazine]: 6,
  [Kind.Wreck]: 13,
  [Kind.Buoy]: 3,
};

/** Footprint in tiles, which is also how big the flame and the light pool get. */
const SIZE: Readonly<Record<Kind, number>> = {
  [Kind.Hut]: 1.5,
  [Kind.Barrels]: 0.9,
  [Kind.Post]: 0.5,
  [Kind.Tree]: 1.1,
  [Kind.Rack]: 1.7,
  [Kind.Magazine]: 2.6,
  [Kind.Wreck]: 2.2,
  [Kind.Buoy]: 0.45,
};

/** A placed landmass before anything stands on it. See {@link createWorld}. */
interface Mound {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /**
   * Ceiling on this mound's height in units.
   *
   * **The whole reason skerries are rocks and not spires.** `landAt` sums the bells of every
   * mound and then scales the sum into height, so a two-tile skerry whose bell peaks at 1 comes
   * out exactly as tall as a ten-tile island whose bell peaks at 1 — a needle. Capping by the
   * *dominant* mound rather than by the sum keeps a small thing small without making the
   * isthmus between two large ones disappear.
   */
  readonly cap: number;
  /** Does it carry an objective? Only the first band does. */
  readonly big: boolean;
}

/**
 * Land height in units at a tile, or 0 for sea.
 *
 * The shape is a sum of island bells rather than a max of them, so two islands that overlap grow
 * an isthmus instead of a crease — and the noise is added *before* the threshold, so the
 * coastline is ragged rather than circular. Thresholding a smooth field is the cheapest way to
 * get a coast that looks drawn, and the only thing it needs to look natural is for the noise to
 * be at the same scale as the smallest bay you want.
 */
function landAt(mounds: readonly Mound[], seed: number, gx: number, gy: number): number {
  let bell = 0;
  let cap = 0;
  let nearest = 0;
  for (const isle of mounds) {
    const dx = gx - isle.cx;
    const dy = gy - isle.cy;
    const d = Math.sqrt(dx * dx + dy * dy) / isle.r;
    if (d >= 1.35) continue;
    const share = (1.35 - d) / 1.35;
    bell += share;
    if (share > nearest) {
      nearest = share;
      cap = isle.cap;
    }
  }
  if (bell <= 0) return 0;
  // Five octaves at a base wavelength of about twelve tiles. Four was smooth enough that every
  // coastline came out as a rounded diamond; the fifth is what puts a cove in it.
  const grain = fbm2(seed, gx * 0.075, gy * 0.075, 5, 0.58) * 0.46;
  const v = bell + grain - 0.44;
  if (v <= 0) return 0;
  const units = 1 + Math.floor(v * 17);
  if (units > cap) return cap;
  return units > MAX_UNITS ? MAX_UNITS : units;
}

/**
 * Which mound a land tile belongs to: the one whose bell is loudest there.
 *
 * **Not a bounding-box test, and the difference is a bug you can see from orbit.** The first
 * build collected an island's tiles by walking the box `cx ± r · 1.6` and taking every land tile
 * in it, which is correct only while no two islands are within that box of each other. Pack the
 * map and the boxes overlap: a village is placed on its neighbor's hillside, and — much worse —
 * "the highest inland tile" resolves to the *ridge between* two islands for both of them, so two
 * objectives end up one tile apart in the middle of the map. One seed put two magazines at
 * (33.3, 32.2) and (33.3, 33.2) and a single shell took both, which is how a four-objective run
 * finished in eleven seconds.
 */
function ownerAt(mounds: readonly Mound[], gx: number, gy: number): number {
  let owner = -1;
  let loudest = 0;
  for (let i = 0; i < mounds.length; i++) {
    const isle = mounds[i];
    if (isle === undefined) continue;
    const dx = gx - isle.cx;
    const dy = gy - isle.cy;
    const d = Math.sqrt(dx * dx + dy * dy) / isle.r;
    if (d >= 1.35) continue;
    const share = (1.35 - d) / 1.35;
    if (share > loudest) {
      loudest = share;
      owner = i;
    }
  }
  return owner;
}

/**
 * The two filler bands, in the order they are placed.
 *
 * The counts here have been wrong in both directions and the second mistake looked exactly like
 * the fix for the first: seven islands on an eighty-tile map was a game played on empty navy, so
 * the next build put thirty-one landmasses on a sixty-four-tile one and the sea disappeared
 * entirely — every frame was coastline and the boat had nowhere to run, which is worse, because
 * an open-water game with no open water has lost the thing it was about. The number that reads
 * right is roughly **half the frame water**, which is these.
 *
 * Largest first and not by accident: rejection sampling gives the *first* band the whole map to
 * choose from and every later one only the gaps, which is exactly the priority a level wants —
 * an objective that failed to place is a run with three magazines in it, and a skerry that
 * failed to place is nothing at all.
 */
const BANDS = [
  { n: 5, rMin: 3.8, rMax: 6.2, cap: 9, gap: 8, edge: 9 },
  { n: 14, rMin: 1.1, rMax: 2.5, cap: 4, gap: 5.5, edge: 4 },
] as const;

/**
 * Where the four objectives go: one per quadrant, jittered.
 *
 * **Placed, not sampled.** Rejection sampling gave a seed between two and four magazine islands
 * depending on how the dice fell, and a run whose *length* is a lottery cannot be tuned and
 * cannot be filmed — one seed finished in nine seconds because two objectives landed close
 * enough to chain, and the next took three minutes. Four fixed quadrants with three tiles of
 * jitter keeps every seed a four-objective tour of the whole map, and leaves the interesting
 * variation — the coastlines, the villages, the wind — exactly where it was.
 */
const QUADRANTS: readonly (readonly [number, number])[] = [
  [0.27, 0.28], [0.73, 0.29], [0.28, 0.72], [0.72, 0.71],
];

/**
 * Build the run's world.
 *
 * Deterministic in the strict sense: every number below comes out of `rng` or out of `fbm2`,
 * both of which are Tier A — integer hashing, multiplies and adds — so two machines agree bit
 * for bit rather than nearly.
 */
export function createWorld(rng: Rng): World {
  const noiseSeed = rng.nextUint32();

  // ── the landmasses ─────────────────────────────────────────────────────────────────────
  const placed: Mound[] = [];
  for (const q of QUADRANTS) {
    placed.push({
      cx: MAP * q[0] + rng.float(-3, 3),
      cy: MAP * q[1] + rng.float(-3, 3),
      r: rng.float(7.2, 9.2),
      cap: MAX_UNITS,
      big: true,
    });
  }
  for (const band of BANDS) {
    let made = 0;
    for (let attempt = 0; attempt < band.n * 120 && made < band.n; attempt++) {
      const r = rng.float(band.rMin, band.rMax);
      const cx = rng.float(band.edge, MAP - band.edge);
      const cy = rng.float(band.edge, MAP - band.edge);
      let ok = true;
      for (const other of placed) {
        const dx = cx - other.cx;
        const dy = cy - other.cy;
        if (Math.sqrt(dx * dx + dy * dy) < r + other.r + band.gap) ok = false;
      }
      if (!ok) continue;
      placed.push({ cx, cy, r, cap: band.cap, big: false });
      made++;
    }
  }

  // ── the ground, and the two masks every hot path reads ─────────────────────────────────
  const heights = new TileGrid(MAP, MAP, { bits: 8 });
  heights.fillFrom((gx, gy) => landAt(placed, noiseSeed, gx, gy));
  const field: HeightField = { heights, stepPx: STEP_PX };

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

  // Bilinear, not the corner value: props stand at fractional positions and a hut placed off the
  // corner height floats or sinks by up to a whole step on any slope, which reads as the art
  // being wrong rather than as the placement being wrong.
  const zAt = (gx: number, gy: number): number => heightAt(field, gx, gy);

  // ── what stands on it ──────────────────────────────────────────────────────────────────
  const props: Prop[] = [];
  const batteries: Battery[] = [];
  const wrecks: number[] = [];

  const push = (kind: Kind, gx: number, gy: number, island: number, seed: number): number => {
    const fuelMax = FUEL[kind];
    props.push({
      kind, gx, gy, zPx: island < 0 ? 0 : zAt(gx, gy), seed, island, size: SIZE[kind],
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
        if (ownerAt(placed, gx, gy) !== i) continue;
        const edge =
          heights.get(gx + 1, gy) === 0 || heights.get(gx - 1, gy) === 0 ||
          heights.get(gx, gy + 1) === 0 || heights.get(gx, gy - 1) === 0;
        (edge ? shore : inland).push(gy * MAP + gx);
      }
    }

    // A skerry: a rock with at most one thing on it, and often nothing. It is scenery and a
    // hazard, and a village on it would make it look like a destination.
    if (inland.length < 6) {
      // One or two things, never a village. A bare rock in every gap reads as unfinished terrain;
      // a rock with a leaning pine on it reads as a rock.
      const things = rng.int(1, 3);
      for (let k = 0; k < things && shore.length > 1; k++) {
        const cell = shore[rng.int(0, shore.length)] ?? 0;
        push(rng.next() < 0.45 ? Kind.Post : Kind.Tree,
          (cell % MAP) + rng.float(0.25, 0.75), Math.floor(cell / MAP) + rng.float(0.25, 0.75),
          i, rng.next());
      }
      continue;
    }

    // The magazine goes on the highest inland tile **that is not on the summit**, and the cap is
    // the whole of why.
    //
    // In a dimetric projection an object's elevation is drawn as displacement *up the screen*:
    // a hundred and forty world pixels of hill is nine tiles of apparent lift, so a magazine on a
    // fourteen-unit peak is drawn near the top edge of the frame from anywhere a boat can float,
    // and the tile it actually occupies is under the building and out of sight. It is the hardest
    // thing on the map to look at and the hardest to aim at, which is a poor property for the one
    // thing the game asks you to hit. Capped at eight units it still stands over its village —
    // the silhouette rule is intact — and it sits in the middle of the frame where a player can
    // put a reticle on it.
    if (isle.big) {
      let best = inland[0] ?? 0;
      let bestH = -1;
      for (const cell of inland) {
        const h = heights.get(cell % MAP, Math.floor(cell / MAP));
        if (h > MAGAZINE_CAP) continue;
        if (h > bestH) { bestH = h; best = cell; }
      }
      const gx = (best % MAP) + rng.float(0.2, 0.5);
      const gy = Math.floor(best / MAP) + rng.float(0.2, 0.5);
      push(Kind.Magazine, gx, gy, i, rng.next());
    }

    // A village. Spaced by rejection against what is already down, so huts do not stack — and
    // the spacing is deliberately smaller than REACH, because a village nothing can jump between
    // is a village the player has to shoot one building at a time.
    const want = Math.round(isle.r * 2.1);
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
      const run = Math.min(shore.length, rng.int(8, 18));
      for (let k = 0; k < run; k += 1) {
        const cell = shore[(start + k * 2) % shore.length];
        if (cell === undefined) continue;
        push(Kind.Post, (cell % MAP) + 0.5, Math.floor(cell / MAP) + 0.5, i, rng.next());
      }
    }

    // Guns, and only on an island big enough to be worth defending. Seven guns on seven islands
    // put the player under fire from three of them at once everywhere on the map, which measured
    // as a hit every two seconds in `tools/soak.mjs` and is not a fight, it is weather. A big
    // island gets two, because an objective with no teeth is a delivery.
    if (shore.length > 4 && isle.r >= 5.6) {
      const guns = isle.big ? 2 : 1;
      for (let g = 0; g < guns; g++) {
        const cell = shore[rng.int(0, shore.length)] ?? 0;
        const gx = (cell % MAP) + 0.5;
        const gy = Math.floor(cell / MAP) + 0.5;
        let clear = true;
        for (const other of batteries) {
          const dx = other.gx - gx;
          const dy = other.gy - gy;
          if (dx * dx + dy * dy < 36) clear = false;
        }
        if (!clear) continue;
        batteries.push({
          gx, gy, zPx: zAt(gx, gy), seed: rng.next(),
          ax: 1, ay: 0, cd: rng.float(1.5, 5), hp: 3, hurt: 0, flash: 0,
        });
      }
    }
  }

  // ── what floats ────────────────────────────────────────────────────────────────────────
  //
  // Hulks in the shallows and buoys in the channels. Both are ordinary props, so both burn, both
  // light the water and both spread fire, for no code beyond their placement and their art —
  // which is the argument for having one burnable type rather than a hierarchy of them.
  const water: number[] = [];
  const shallow: number[] = [];
  for (let gy = 2; gy < MAP - 2; gy++) {
    for (let gx = 2; gx < MAP - 2; gx++) {
      const at = gy * MAP + gx;
      if (solid[at] === 1) continue;
      if (coast[at] === 1) shallow.push(at);
      else water.push(at);
    }
  }

  /** Reject anything within `gap` tiles of a prop already placed at sea. */
  const clearOfFloat = (gx: number, gy: number, gap: number): boolean => {
    for (const p of props) {
      if (p.island >= 0) continue;
      const dx = p.gx - gx;
      const dy = p.gy - gy;
      if (dx * dx + dy * dy < gap * gap) return false;
    }
    return true;
  };

  for (let n = 0, tries = 0; n < 11 && tries < 400; tries++) {
    const cell = shallow.length > 0 ? rng.pick(shallow) : -1;
    if (cell < 0) break;
    const gx = (cell % MAP) + rng.float(0.2, 0.8);
    const gy = Math.floor(cell / MAP) + rng.float(0.2, 0.8);
    if (!clearOfFloat(gx, gy, 4.5)) continue;
    wrecks.push(push(Kind.Wreck, gx, gy, -1, rng.next()));
    n++;
  }
  for (let n = 0, tries = 0; n < 4 && tries < 400; tries++) {
    const cell = water.length > 0 ? rng.pick(water) : -1;
    if (cell < 0) break;
    const gx = (cell % MAP) + rng.float(0.2, 0.8);
    const gy = Math.floor(cell / MAP) + rng.float(0.2, 0.8);
    if (!clearOfFloat(gx, gy, 7)) continue;
    wrecks.push(push(Kind.Wreck, gx, gy, -1, rng.next()));
    n++;
  }
  for (let n = 0, tries = 0; n < 18 && tries < 600; tries++) {
    const cell = water.length > 0 ? rng.pick(water) : -1;
    if (cell < 0) break;
    const gx = (cell % MAP) + 0.5;
    const gy = Math.floor(cell / MAP) + 0.5;
    if (!clearOfFloat(gx, gy, 5)) continue;
    push(Kind.Buoy, gx, gy, -1, rng.next());
    n++;
  }

  // ── who can catch from whom ────────────────────────────────────────────────────────────
  //
  // O(n²) once, at generation, for a table the fire system then walks in a straight line. With
  // ~220 props that is twenty-four thousand comparisons in the frame nobody is looking at,
  // against twenty-four thousand *per tick* if it were asked live.
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
  //
  // The test is `solid`, not `heights.get`, and it clears the hulks by four tiles. Both were
  // learned the same way: one seed opened the run with the player's hull *inside* a wreck, which
  // is fifty frames of collision damage before the first key press and a run lost in eight
  // tenths of a second. A start position is the one place in a game where "usually fine" is not.
  const first = placed[0];
  let startX = MAP * 0.5;
  let startY = MAP * 0.5;
  if (first !== undefined) {
    for (let ring = 0; ring < 60; ring++) {
      // Six and a half tiles clear of the shore, not five and not nine. A 1280x720 frame at the
      // game's zoom holds about twenty tiles corner to corner: at five the first island fills the
      // opening frame and the opening move is *fire now*, at nine there is nothing on screen but
      // water and the opening move is a guess. At six and a half the objective's warning light is
      // in the top corner of the very first frame and it is a long shot away.
      const d = first.r + 6.5 + ring * 0.4;
      const dir = COMPASS[(ring * 3) % 8] ?? COMPASS[0];
      const x = first.cx + dir[0] * d;
      const y = first.cy + dir[1] * d;
      if (x < 6 || y < 6 || x > MAP - 6 || y > MAP - 6) continue;
      const gx = Math.floor(x);
      const gy = Math.floor(y);
      if (solid[gy * MAP + gx] === 1 || coast[gy * MAP + gx] === 1) continue;
      let clear = true;
      for (const i of wrecks) {
        const p = props[i];
        if (p === undefined) continue;
        const dx = p.gx - x;
        const dy = p.gy - y;
        if (dx * dx + dy * dy < 16) clear = false;
      }
      if (!clear) continue;
      startX = x;
      startY = y;
      break;
    }
  }

  const islands: Island[] = [];
  for (let i = 0; i < placed.length; i++) {
    const isle = placed[i];
    if (isle === undefined || isle.r < 3.5) continue;
    islands.push({
      cx: isle.cx, cy: isle.cy, r: isle.r,
      magazine: props.findIndex((p) => p.kind === Kind.Magazine && p.island === i),
    });
  }
  return {
    heights, field, props, wrecks, batteries, islands, solid, coast,
    windX: wind[0], windY: wind[1], startX, startY,
  };
}
