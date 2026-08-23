/**
 * Everything that stands up out of the water: hulls, huts, guns, shot and flame. **@art**
 *
 * ## The four rules this folder is built on
 *
 * They come from the procedural art the kit was extracted from, and they are the difference
 * between "generated" and "designed":
 *
 * 1. **Silhouette first.** At forty pixels a hut, a magazine, a raider and the player differ in
 *    *outline* before any color is read. The magazine is the tallest thing on any island and the
 *    only one with a mast on its roof; the raider is the only hull with a spike on the bow.
 * 2. **Detail at three scales.** Massing, then panel rhythm, then a single light. Uniform detail
 *    at one scale reads as noise; a missing scale reads as a placeholder.
 * 3. **Something moves on everything.** The magazine's warning light blinks, trees sway, nets
 *    swing, the batteries track you, the player's sail bulges with her speed and her deck heels
 *    into a turn. A static object in a moving frame reads as a bug.
 * 4. **Every variation is seeded.** Per-instance jitter comes from `Prop.seed`, which came from
 *    the world's `Rng`. A hut that reshuffles on reload is a hut the player stops recognizing.
 *
 * ## Why none of this is a `SpriteDef`
 *
 * `@latticekit/draw` has a sprite system, and this game uses none of it. The reason is one line
 * of its own interface: `SpriteDef.emit` — the hook that posts a light pool — **receives no
 * clock**. Fire is the whole of this game's lighting and fire is never still, so the one thing
 * the sprite system exists to make declarative is the one thing it cannot express here. Filed as
 * a kit finding; the workaround is this file, which draws immediately and calls
 * `LightField.add` itself.
 */

import { clamp01, noise2 } from '@latticekit/core';
import { HALF_H, HALF_W } from '@latticekit/iso';
import {
  FACE_LEFT, FACE_RIGHT, contactShadow, glowDot, isoBox, isoCylinder, isoPost, isoRoof,
  isoWall, levelsToPx, mix, outlineOf, pxToLevels, shade, withAlpha, type Pen,
} from '@latticekit/draw';
import { Burn, Kind, type Battery, type Prop, type World } from '../world.js';
import { Puff, type Boat, type Game, type Shell } from '../game.js';
import { plot, sx, sy } from './space.js';

// ── fire ───────────────────────────────────────────────────────────────────────────────────

/**
 * A flame, in screen space, from a base point that has already been projected.
 *
 * Screen space and not world space, and that is the whole performance story of the fire: a
 * flame is five overlapping blobs, and projecting five world positions per flame per frame for
 * forty simultaneous fires is two hundred projections for an effect whose entire job is to be
 * approximately in the right place. One projection, then five screen offsets scaled by zoom, is
 * the same picture for a fifth of the arithmetic.
 *
 * The lean is `noise2` and not `sin`: a sine makes every fire in the world wave in unison, which
 * is the single most obvious tell of a procedural flame, and a per-instance phase only turns that
 * into forty sine waves that all *look* like sine waves. Noise sampled on `(seed, t)` gives each
 * fire its own gust.
 */
export function paintFlame(
  pen: Pen, bx: number, by: number, size: number, power: number, seed: number,
  windX: number, windY: number,
): void {
  if (power <= 0.02) return;
  const s = pen.surface;
  const t = pen.t;
  const z = pen.camera.zoom;
  // A flame is **taller than it is wide** and half again as tall as the thing it is consuming.
  // The first build had `w0` four times this and every fire read as a white balloon; the second
  // over-corrected to a flame exactly the height of its hut, which is a hearth. Fire climbs.
  const w0 = size * HALF_W * z * 0.23;
  const tall = size * 31 * z * (0.5 + power * 0.7);
  const flame = pen.palette.get('flame');
  const core = pen.palette.get('fcore');
  const ember = pen.palette.get('ember');

  // The scorch on the ground under it: flat, 2:1, and the reason a fire looks like it is *on*
  // something rather than floating in front of it.
  s.softEllipse(bx, by, w0 * 3.4, w0 * 1.7, withAlpha(ember, 0.45 * power), withAlpha(ember, 0));

  // **The tongue, and it is what makes this fire and not a lamp.**
  //
  // Four stacked soft ellipses give a column of light with a rounded top, and a rounded top is a
  // bulb: three separate builds of this game shipped villages that looked like they were lit
  // rather than burning, and the fix is not more blobs or hotter colour, it is a *point*. One
  // triangle from the two base corners to a leaning tip gives the silhouette a flame has, and
  // everything soft below is then read as the glow around it rather than as the shape itself.
  const gust = noise2(seed, t * 2.3, 0);
  const tipX = bx + (gust * 0.9 + windX * 2.2) * w0;
  const tipY = by - tall * (1.05 + gust * 0.12);
  pen.xy[0] = bx - w0 * 0.85;
  pen.xy[1] = by;
  pen.xy[2] = bx + w0 * 0.85;
  pen.xy[3] = by;
  pen.xy[4] = tipX;
  pen.xy[5] = tipY + windY * w0;
  s.poly(pen.xy, 3, withAlpha(ember, 0.4 * power));

  // **Hottest at the bottom.** A flame is white at its root and red at its tip, and getting that
  // gradient the wrong way round — which the first build did — makes the whole fire read as a
  // glowing egg rather than as combustion. The taper is steep for the same reason: four discs of
  // similar size stacked is a column of light, and a column of light is a lamp.
  for (let i = 0; i < 4; i++) {
    const frac = i / 3;
    const puff = noise2(seed, t * 2.6 + i * 1.7, i * 4.1);
    const flick = noise2(seed ^ 0x9e, t * 5.3 + i * 2.9, i);
    const lean = puff * (0.35 + frac) + windX * frac * 1.9;
    const cx = bx + lean * w0;
    const cy = by - tall * (0.08 + frac * 0.8) + windY * frac * w0;
    const r = w0 * (1 - frac * 0.78) * (0.88 + flick * 0.34);
    // Two mixes rather than one: white to orange over the first third, orange to red over the
    // rest. A single lerp from white to red spends half its length in the yellows, and a flame
    // that is yellow through its middle is a candle.
    const hot = mix(core, flame, frac < 0.45 ? frac / 0.45 : 1);
    const cool = mix(hot, ember, frac < 0.45 ? 0 : (frac - 0.45) / 0.55);
    s.softEllipse(cx, cy, r, r * 1.8,
      withAlpha(cool, (0.5 - frac * 0.2) * power), withAlpha(mix(flame, ember, frac), 0));
  }
  // The root. Hard-edged and nearly white, because the hottest part of a fire has an edge and a
  // flame made only of soft blobs reads as a smoke plume lit from inside.
  const jitter = noise2(seed ^ 0x4d, t * 7.1, 0);
  s.ellipse(bx + jitter * w0 * 0.3, by - tall * 0.1, w0 * 0.38, w0 * 0.62, withAlpha(core, 0.85 * power));
}

/** How brightly a prop is burning, 0–1. The same number the light field is given, so what you
 *  see and what the scene is lit by cannot drift apart. */
export function fireOf(p: Prop): number {
  if (p.state !== Burn.Lit) return 0;
  const left = p.fuel / p.fuelMax;
  return p.flame * (left < 0.18 ? clamp01(left / 0.18) : 1);
}

// ── props ──────────────────────────────────────────────────────────────────────────────────

/**
 * The hulk outline in local tiles, and the scratch the two elevations are projected into.
 *
 * Six points and convex, for the reason {@link HULL} gives: `Surface` promises convex polygons
 * only. Module scope for the reason non-negotiable 7 gives — eleven wrecks times sixty frames is
 * six hundred and sixty allocations a second, for two arrays that never change size.
 */
const WRECK: readonly number[] = [1.15, 0, 0.4, 0.48, -0.9, 0.42, -1.2, 0, -0.9, -0.42, 0.4, -0.48];
/** Points in {@link WRECK}. */
const WRECK_N = 6;
/** See {@link WRECK}. */
const WRECK_LO = new Float64Array(WRECK_N * 2);
/** See {@link WRECK}. */
const WRECK_HI = new Float64Array(WRECK_N * 2);
/** Where the deck ribs stand, fore to aft, and which side each pair is on. */
const WRECK_RIBS: readonly number[] = [0.62, 0.05, -0.6];
/** See {@link WRECK_RIBS}. */
const WRECK_SIDES: readonly number[] = [-1, 1];

/** How high the deck stands at a given point along her, in world pixels. Bow well clear of the
 *  water and stern under it: the cant *is* the silhouette, and a wreck sitting level is a boat. */
function wreckDeckZ(along: number): number {
  return 5 + along * 15;
}

/** Seconds a burnt-out thing keeps embers in its ash. Long, because the aftermath is half of
 *  what the player came to see and a thirty-second island should still be glowing when they
 *  come back past it. */
const ASH_SECONDS = 14;

/** The two ends of a drying rack. Module scope: an array literal inside a per-frame draw call
 *  is an allocation per rack per frame, which is the whole of non-negotiable 7 in miniature. */
const RACK_POSTS: readonly number[] = [-0.6, 0.6];

/** Charred wood, or wood. One branch, used by every kind, so a burnt island is one decision. */
function timber(pen: Pen, p: Prop, slot: string): number {
  const base = pen.palette.get(slot);
  if (p.state === Burn.Cold) return base;
  const scorched = mix(base, pen.palette.get('char'), p.state === Burn.Spent ? 0.85 : 0.45);
  return scorched;
}

/**
 * One standing thing. Massing only — the flame on top of it is a separate walk of the same
 * sorted order, so that fire always draws over the buildings beside it.
 */
export function paintProp(pen: Pen, p: Prop, world: World): void {
  const t = pen.t;
  const lz = pxToLevels(p.zPx);
  const spent = p.state === Burn.Spent;
  const lit = p.state === Burn.Lit;

  // **A burnt island has to read as burnt.** The first build let a spent hut collapse into a
  // small dark box and the result was that a shoreline the player had just set alight came back,
  // thirty seconds later, looking like a shoreline nobody had ever been to — the fire was a
  // transient and left no evidence. A scorch mark on the ground and embers in the ash cost two
  // draw calls and turn the aftermath into the thing the player did.
  if (spent) {
    const bx = sx(pen, p.gx, p.gy);
    const by = sy(pen, p.gx, p.gy, p.zPx);
    const r = p.size * HALF_W * pen.camera.zoom * 0.85;
    const char = pen.palette.get('char');
    pen.surface.softEllipse(bx, by, r, r * 0.5, withAlpha(char, 0.62), withAlpha(char, 0));
    const glow = clamp01(p.smoke / ASH_SECONDS);
    if (glow > 0.01) {
      glowDot(pen, p.gx, p.gy, lz + 0.04, 'ember', 0.08 + p.size * 0.08,
        glow * (0.4 + noise2(p.seed * 6011, t * 2.2, 0) * 0.35));
    }
  }

  switch (p.kind) {
    case Kind.Hut: {
      contactShadow(pen, p.gx - 0.55, p.gy - 0.55, 1.1, 1.1, 0.5, lz);
      const h = spent ? 0.46 : 0.66;
      isoBox(pen, p.gx - 0.5, p.gy - 0.5, 1, 1, { color: timber(pen, p, 'plank'), h, z: lz });
      if (!spent) {
        isoRoof(pen, p.gx - 0.56, p.gy - 0.56, 1.12, 1.12, lz + h, 0.38, timber(pen, p, 'wood'));
        // The window. One warm dot, flickering off a noise field so a sleeping village is not a
        // grid of identical bulbs — and out entirely once the hut is alight, because by then the
        // whole hut is the light.
        if (!lit && p.seed > 0.45) {
          glowDot(pen, p.gx - 0.05, p.gy + 0.42, lz + 0.34, 'lamp', 0.07,
            0.55 + noise2(p.seed * 9973, t * 1.6, 0) * 0.3);
        }
      } else {
        // A collapsed hut is three planks leaning. Cheaper than the roof it replaces and it
        // reads, at a glance, as *damage* rather than as a smaller hut.
        isoWall(pen, p.gx - 0.4, p.gy - 0.3, p.gx + 0.45, p.gy - 0.28, lz + 0.02, lz + 0.5,
          pen.palette.get('char'));
      }
      break;
    }
    case Kind.Barrels: {
      contactShadow(pen, p.gx - 0.35, p.gy - 0.35, 0.7, 0.7, 0.4, lz);
      const wood = timber(pen, p, 'wood');
      isoCylinder(pen, p.gx - 0.16, p.gy - 0.1, 0.2, { color: wood, h: spent ? 0.16 : 0.4, z: lz });
      isoCylinder(pen, p.gx + 0.2, p.gy + 0.16, 0.19, { color: shade(wood, 0.92), h: spent ? 0.14 : 0.36, z: lz });
      if (!spent) {
        isoCylinder(pen, p.gx + 0.02, p.gy + 0.34, 0.17, { color: wood, h: 0.3, z: lz });
      }
      break;
    }
    case Kind.Post: {
      const h = spent ? 0.4 : 0.85;
      isoPost(pen, p.gx, p.gy, lz, h, timber(pen, p, 'wood'), 0.15);
      // One post in eight, not one in four. A hundred posts line the shores of this
      // archipelago and twenty-eight pennants on them read as confetti — the eye counts them
      // instead of reading the coastline they are standing on.
      if (!spent && p.seed > 0.88) {
        // A pennant, and it is the motion on the cheapest object in the game. Three points, one
        // of which is a noise field, drawn straight into the scratch buffer.
        const flap = noise2(p.seed * 4441, t * 3.1, 0) * 0.16;
        let at = plot(pen, 0, p.gx, p.gy, p.zPx + levelsToPx(h));
        at = plot(pen, at, p.gx + 0.42, p.gy + flap, p.zPx + levelsToPx(h) - 3);
        plot(pen, at, p.gx + 0.06, p.gy + flap * 0.5, p.zPx + levelsToPx(h) - 11);
        // Off-white, not red. Red belongs to exactly one thing on this map — the magazine's
        // warning light — and a dozen red pennants on the palisade turn the objective into one
        // more red dot among many.
        pen.surface.poly(pen.xy, 3, withAlpha(pen.palette.get('trim'), 0.55));
      }
      break;
    }
    case Kind.Tree: {
      contactShadow(pen, p.gx - 0.4, p.gy - 0.4, 0.8, 0.8, 0.45, lz);
      const trunk = timber(pen, p, 'wood');
      isoPost(pen, p.gx, p.gy, lz, 0.62, shade(trunk, 0.8), 0.17);
      if (spent) break;
      // Three tiers, each swaying a little more than the one below it — the classic trick, and
      // the reason it works is that the *differential* is what the eye reads as flex.
      const sway = noise2(p.seed * 7717, t * 0.55, 0) * 0.075;
      const canopy = timber(pen, p, p.seed > 0.5 ? 'grass' : 'scrub');
      for (let i = 0; i < 3; i++) {
        const lift = 0.34 + i * 0.34;
        isoCylinder(pen, p.gx + sway * (i + 1) * (world.windX + 0.4), p.gy + sway * (i + 1) * (world.windY + 0.4),
          0.44 - i * 0.12, { color: shade(canopy, 1 + i * 0.08), h: 0.4, z: lz + lift, outline: i === 0 });
      }
      break;
    }
    case Kind.Rack: {
      const wood = timber(pen, p, 'wood');
      for (const dx of RACK_POSTS) {
        isoPost(pen, p.gx + dx, p.gy - 0.35, lz, 0.62, wood, 0.11);
        isoPost(pen, p.gx + dx, p.gy + 0.35, lz, 0.62, wood, 0.11);
      }
      if (spent) break;
      // The nets, swinging. `isoWall` refuses an edge-on span — equal `gx` and `gy` deltas
      // project to a line of zero width — so the sway is added to `gy` only and can never reach
      // the diagonal, which is precisely the failure mode its error message warns about.
      const swing = noise2(p.seed * 3313, t * 0.9, 0) * 0.1;
      isoWall(pen, p.gx - 0.6, p.gy - 0.32 + swing, p.gx + 0.6, p.gy - 0.32 + swing,
        lz + 0.16, lz + 0.58, withAlpha(pen.palette.get('rsail'), 0.75));
      isoWall(pen, p.gx - 0.6, p.gy + 0.38 - swing, p.gx + 0.6, p.gy + 0.38 - swing,
        lz + 0.2, lz + 0.6, withAlpha(pen.palette.get('trim'), 0.5));
      break;
    }
    case Kind.Magazine: {
      contactShadow(pen, p.gx - 1.1, p.gy - 1.1, 2.2, 2.2, 0.7, lz);
      const stone = pen.palette.get('stone');
      const plank = timber(pen, p, 'plank');
      // Four masses: plinth, body, iron band, roof. This is the only thing on any island with
      // four, and that is the silhouette rule — the objective must be identifiable at the size
      // it appears when you first come over the horizon.
      isoBox(pen, p.gx - 1, p.gy - 1, 2, 2, { color: stone, h: 0.3, z: lz, topColor: shade(stone, 1.08) });
      isoBox(pen, p.gx - 0.8, p.gy - 0.8, 1.6, 1.6, { color: plank, h: spent ? 0.5 : 1.35, z: lz + 0.3 });
      if (spent) break;
      isoBox(pen, p.gx - 0.8, p.gy - 0.8, 1.6, 1.6,
        { color: pen.palette.get('iron'), h: 0.16, z: lz + 1.05, inset: -0.03, outline: false });
      isoRoof(pen, p.gx - 0.95, p.gy - 0.95, 1.9, 1.9, lz + 1.65, 0.62, timber(pen, p, 'wood'));
      isoPost(pen, p.gx, p.gy, lz + 2.27, 0.5, pen.palette.get('iron'), 0.09);
      // The warning light: a hard on/off blink rather than a fade, because a magazine is a place
      // that is *shouting*, and the one thing on the map that must be legible from the far side
      // of the frame.
      const blink = ((t * 1.4 + p.seed) % 1) < 0.55 ? 1 : 0.34;
      // Two dots, not one: a wide dim halo that is legible from the far side of the frame and a
      // small bright core that is legible up close. One dot cannot do both, and this is the only
      // thing in the game a player has to be able to find from off screen.
      glowDot(pen, p.gx, p.gy, lz + 2.9, 'bad', 0.42, blink * 0.35);
      glowDot(pen, p.gx, p.gy, lz + 2.9, 'bad', 0.12, blink);
      break;
    }
    case Kind.Wreck:
      paintWreck(pen, p, spent);
      break;
    case Kind.Buoy: {
      // A buoy is the cheapest motion in the game and it is worth more than it costs: eighteen
      // of them turn open water from a background into a place with distances in it.
      const bob = noise2(p.seed * 8191, t * 1.15, 0) * 3.4;
      const bz = pxToLevels(bob);
      const bx = sx(pen, p.gx, p.gy);
      const by = sy(pen, p.gx, p.gy, bob);
      pen.surface.softEllipse(bx, by, HALF_W * pen.camera.zoom * 0.42, HALF_W * pen.camera.zoom * 0.21,
        withAlpha(pen.palette.get('foam'), 0.2), withAlpha(pen.palette.get('foam'), 0));
      isoPost(pen, p.gx, p.gy, bz, spent ? 0.16 : 0.34, timber(pen, p, 'wood'), 0.13);
      if (spent) break;
      // The lamp, and it is green like a raider's rather than warm like the player's: everything
      // that is not yours is cold, and a warm dot on the water would read as a friend.
      glowDot(pen, p.gx, p.gy, bz + 0.4, 'rlamp', 0.06,
        0.55 + noise2(p.seed * 331, t * 1.7, 0) * 0.3);
      break;
    }
    default:
      break;
  }
}

/**
 * A hulk aground in the shallows: a canted wedge with a snapped mast.
 *
 * Its own function rather than a case, because it is the one prop with a **per-vertex
 * elevation** — the bow stands out of the water and the stern is under it, and that cant is the
 * entire silhouette. Everything else in this file is a solid at one height, which is why the
 * solid kit can draw it and this cannot.
 */
function paintWreck(pen: Pen, p: Prop, spent: boolean): void {
  const s = pen.surface;
  const cam = pen.camera;
  // A heading off the seed, by the same rotation the hulls steer with. Sixteen distinct bearings
  // is more than the eye can count and none of them needs a cosine.
  let hx = 1;
  let hy = 0;
  const turn = 0.5 + p.seed * 3.7;
  for (let k = 0, n = 1 + Math.floor(p.seed * 5); k < n; k++) {
    const nx = hx - turn * hy;
    const ny = hy + turn * hx;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny);
    hx = nx * inv;
    hy = ny * inv;
  }

  const timberInk = timber(pen, p, 'wood');
  const deckInk = shade(timberInk, spent ? 0.7 : 0.86);
  const bx = sx(pen, p.gx, p.gy);
  const by = sy(pen, p.gx, p.gy, 0);
  const spread = HALF_W * cam.zoom;
  s.softEllipse(bx, by, spread * 1.9, spread * 0.95,
    withAlpha(pen.palette.get('foam'), 0.2), withAlpha(pen.palette.get('foam'), 0));

  // Waterline first, then the sides, then the canted deck — the same three-line ordering
  // `paintBoat` uses instead of a depth buffer, and it works here for the same reason.
  for (let i = 0; i < WRECK_N; i++) {
    const a = WRECK[i * 2] ?? 0;
    const c = WRECK[i * 2 + 1] ?? 0;
    const wx = p.gx + hx * a - hy * c;
    const wy = p.gy + hy * a + hx * c;
    WRECK_LO[i * 2] = sx(pen, wx, wy);
    WRECK_LO[i * 2 + 1] = sy(pen, wx, wy, -3);
    WRECK_HI[i * 2] = WRECK_LO[i * 2] ?? 0;
    WRECK_HI[i * 2 + 1] = sy(pen, wx, wy, wreckDeckZ(a));
  }
  s.poly(WRECK_LO, WRECK_N, shade(timberInk, 0.6));
  for (let i = 0; i < WRECK_N; i++) {
    const j = (i + 1) % WRECK_N;
    pen.xy[0] = WRECK_HI[i * 2] ?? 0;
    pen.xy[1] = WRECK_HI[i * 2 + 1] ?? 0;
    pen.xy[2] = WRECK_HI[j * 2] ?? 0;
    pen.xy[3] = WRECK_HI[j * 2 + 1] ?? 0;
    pen.xy[4] = WRECK_LO[j * 2] ?? 0;
    pen.xy[5] = WRECK_LO[j * 2 + 1] ?? 0;
    pen.xy[6] = WRECK_LO[i * 2] ?? 0;
    pen.xy[7] = WRECK_LO[i * 2 + 1] ?? 0;
    s.poly(pen.xy, 4, (pen.xy[2] ?? 0) > (pen.xy[0] ?? 0) ? shade(timberInk, FACE_LEFT) : shade(timberInk, FACE_RIGHT));
  }
  s.poly(WRECK_HI, WRECK_N, deckInk);
  s.stroke(WRECK_HI, WRECK_N, true, outlineOf(timberInk), 1);

  // The open hold: a dark inset polygon over the deck. **This is what stops a wreck reading as a
  // brown coffee table** — the first version filled the whole outline with one deck colour and
  // three flat cross-strokes, and at forty pixels that is a slab. A hole in the middle is the
  // silhouette cue, and it costs one more `poly` over points already projected.
  for (let i = 0; i < WRECK_N; i++) {
    const a = (WRECK[i * 2] ?? 0) * 0.62;
    const c = (WRECK[i * 2 + 1] ?? 0) * 0.55;
    const wx = p.gx + hx * a - hy * c;
    const wy = p.gy + hy * a + hx * c;
    pen.xy[i * 2] = sx(pen, wx, wy);
    pen.xy[i * 2 + 1] = sy(pen, wx, wy, wreckDeckZ(a) - 3);
  }
  s.poly(pen.xy, WRECK_N, mix(pen.palette.get('char'), timberInk, 0.18));

  // Ribs *standing out of* the hold, not laid across it. A row of curved frames sticking up is
  // the one shape that says shipwreck from any distance, and it is three strokes.
  for (const a of WRECK_RIBS) {
    for (const side of WRECK_SIDES) {
      const c = 0.34 * side;
      const rz = wreckDeckZ(a);
      let at = plot(pen, 0, p.gx + hx * a - hy * c, p.gy + hy * a + hx * c, rz - 3);
      plot(pen, at, p.gx + hx * a - hy * c * 1.5, p.gy + hy * a + hx * c * 1.5, rz + 7);
      s.stroke(pen.xy, 2, false, shade(timberInk, 0.66), Math.max(1, 1.8 * cam.zoom));
    }
  }

  if (spent) return;
  // The snapped mast, leaning the way she went over. Two strokes: the stump and a spar hanging
  // off it, because a clean broken pole reads as a flagpole.
  const mx = p.gx - hx * 0.15;
  const my = p.gy - hy * 0.15;
  let at = plot(pen, 0, mx, my, wreckDeckZ(-0.15));
  plot(pen, at, mx + hy * 1.15, my - hx * 1.15, 40);
  s.stroke(pen.xy, 2, false, shade(timberInk, 0.7), Math.max(2, 3.4 * cam.zoom));
  // A spar hanging off it with a rag of canvas still on. Two strokes, and it is the difference
  // between a broken pole and a ship that used to sail.
  at = plot(pen, 0, mx + hy * 0.7, my - hx * 0.7, 26);
  plot(pen, at, mx + hy * 0.25 + hx * 1.1, my - hx * 0.25 + hy * 1.1, 6);
  s.stroke(pen.xy, 2, false, withAlpha(pen.palette.get('rsail'), 0.5), Math.max(1, 2.4 * cam.zoom));
}

/** A shore battery: stone, a parapet, and a barrel that is always turning toward you. */
export function paintBattery(pen: Pen, b: Battery, t: number): void {
  const lz = pxToLevels(b.zPx);
  const dead = b.hp <= 0;
  const stone = pen.palette.get('stone');
  const body = dead ? mix(stone, pen.palette.get('char'), 0.7) : stone;
  contactShadow(pen, b.gx - 0.8, b.gy - 0.8, 1.6, 1.6, 0.55, lz);
  isoBox(pen, b.gx - 0.7, b.gy - 0.7, 1.4, 1.4, { color: body, h: 0.42, z: lz });
  isoBox(pen, b.gx - 0.7, b.gy - 0.7, 1.4, 1.4,
    { color: shade(body, 0.86), h: 0.3, z: lz + 0.42, inset: 0.18 });
  if (dead) {
    // A wrecked gun is a stump and a leaning barrel. Two calls, and the player can read at a
    // glance which islands still have teeth.
    isoPost(pen, b.gx, b.gy, lz + 0.5, 0.22, pen.palette.get('char'), 0.3);
    return;
  }

  // The barrel: one thick stroke along the aim vector, at parapet height. A box would have to be
  // axis-aligned and a cylinder would have to be upright, so this is the one place in the game
  // that draws a line and calls it geometry — at this size it reads better than either.
  const zPx = b.zPx + levelsToPx(0.72);
  let at = plot(pen, 0, b.gx - b.ax * 0.18, b.gy - b.ay * 0.18, zPx);
  plot(pen, at, b.gx + b.ax * 1.15, b.gy + b.ay * 1.15, zPx + 5);
  pen.surface.stroke(pen.xy, 2, false, pen.palette.get('iron'), Math.max(2, 5 * pen.camera.zoom));
  at = plot(pen, 0, b.gx - b.ax * 0.18, b.gy - b.ay * 0.18, zPx + 2);
  plot(pen, at, b.gx + b.ax * 1.0, b.gy + b.ay * 1.0, zPx + 6);
  pen.surface.stroke(pen.xy, 2, false, shade(pen.palette.get('iron'), 1.35), Math.max(1, 2 * pen.camera.zoom));

  // A crew lamp, so the emplacement is visible against a dark hillside before it fires.
  glowDot(pen, b.gx - 0.35, b.gy + 0.35, lz + 0.6, 'lamp', 0.07, 0.5 + noise2(b.seed * 1201, t * 2.1, 0) * 0.3);
  // And the muzzle flash, which is the *only* thing on the map that says where incoming fire is
  // coming from. Big and brief: an eighth of a second of near-white at the end of the barrel,
  // twice the radius of anything else on the island, because it has to be found rather than
  // merely seen. See `Battery.flash` for what happens without it.
  if (b.flash > 0) {
    const f = b.flash / 0.12;
    glowDot(pen, b.gx + b.ax * 1.3, b.gy + b.ay * 1.3, pxToLevels(zPx + 8), 'fcore', 0.5 * f, f);
    glowDot(pen, b.gx + b.ax * 1.3, b.gy + b.ay * 1.3, pxToLevels(zPx + 8), 'flame', 0.18 * f, f);
  }
  if (b.hurt > 0) {
    isoBox(pen, b.gx - 0.7, b.gy - 0.7, 1.4, 1.4,
      { color: withAlpha(pen.palette.get('bad'), b.hurt * 0.5), h: 0.44, z: lz, outline: false });
  }
}

// ── hulls ──────────────────────────────────────────────────────────────────────────────────

/**
 * The hull outline in boat-local tiles: `along` forward, `across` to port.
 *
 * Seven points, convex, and pointed at one end — which is the whole silhouette. A `Surface`
 * promises convex polygons only, so this is a contract and not a preference: a hollowed stern
 * would fan-triangulate wrong on a GPU backend and there would be nothing on screen to say why.
 */
const HULL: readonly number[] = [
  1.72, 0, 0.98, 0.48, -0.69, 0.58, -1.15, 0.39, -1.15, -0.39, -0.69, -0.58, 0.98, -0.48,
];
/** Points in {@link HULL}. */
const HULL_N = 7;
/** Freeboard in world pixels: how far the deck stands above the waterline. */
const FREEBOARD = 15;

/**
 * Scratch for the two hull polygons, allocated once at module load.
 *
 * `pen.xy` would do for one of them, and using it for both is the trap: `Surface.poly` reads
 * from index 0, so passing the second polygon means either `subarray` — an allocation per hull
 * per frame — or overwriting the first while the side quads still need it. Two small arrays that
 * outlive every frame cost 256 bytes total and remove the choice.
 */
const WATERLINE = new Float64Array(HULL_N * 2);
/** See {@link WATERLINE}. */
const DECK = new Float64Array(HULL_N * 2);

/**
 * One boat, under way.
 *
 * ## How a vertical prism is drawn with no transform stack
 *
 * The deck polygon and the waterline polygon are the same seven points at two elevations, so in
 * screen space one is the other translated straight down. Painting the waterline first, then a
 * quad per edge, then the deck, produces a correct solid **without any back-face test**: every
 * side quad that should be hidden lies inside the deck polygon that is painted over it. That is
 * three lines of ordering standing in for a depth buffer, and it is the reason a boat can point
 * in any direction in a kit whose solids are all axis-aligned.
 *
 * The heel is one number: the deck's seven points are shifted sideways relative to the
 * waterline's, so the side quads become trapezoids and the boat leans into her turn. It costs an
 * add per corner and it is the single most convincing thing in the frame.
 */
export function paintBoat(pen: Pen, b: Boat, player: boolean, aimX: number, aimY: number): void {
  const s = pen.surface;
  const t = pen.t;
  const cam = pen.camera;
  const sink = b.sinking >= 0 ? b.sinking / 2.6 : 0;

  // Bob and heel. The bob is two noise fields at different rates, which is what makes it read as
  // a sea state rather than as an oscillator; the heel is the sideways component of her own
  // velocity, so she leans *because* she is sliding and not because a timer said to.
  const bob = (noise2(b.seed * 6151, t * 0.85, 0) * 2.6 + noise2(b.seed * 2237, t * 1.9, 4) * 1.4) * (1 - sink);
  const lat = b.vx * -b.hy + b.vy * b.hx;
  const heel = Math.max(-0.3, Math.min(0.3, lat * 0.055));
  const deckZ = FREEBOARD * (1 - sink * 1.35) + bob;
  const waterZ = -8 * sink + bob;

  const hullInk = player ? pen.palette.get('hull') : pen.palette.get('raider');
  const deckInk = player ? pen.palette.get('deck') : pen.palette.get('rdeck');
  const wet = shade(hullInk, FACE_RIGHT * 0.9);
  const side = shade(hullInk, FACE_LEFT);
  const alpha = sink > 0 ? Math.max(0, 1 - sink * 0.9) : 1;
  const prev = alpha < 1 ? s.alpha(alpha) : 1;

  // Displacement: the water the hull is pushing aside. It grounds the boat exactly as a contact
  // shadow grounds a building, and it is brighter rather than darker, because a hull at night
  // shows as the foam around it.
  const bx = sx(pen, b.x, b.y);
  const by = sy(pen, b.x, b.y, 0);
  const spread = HALF_W * cam.zoom;
  s.softEllipse(bx, by, spread * 1.7, spread * 0.85,
    withAlpha(pen.palette.get('foam'), 0.16), withAlpha(pen.palette.get('foam'), 0));

  // The waterline, then the sides, then the deck. `pen.xy` holds 128 points; the two polygons
  // are seven each and the side quads are written over the top of them one at a time, which is
  // why the deck is projected twice rather than cached — the buffer is the cache.
  for (let i = 0; i < HULL_N; i++) {
    const a = HULL[i * 2] ?? 0;
    const c = HULL[i * 2 + 1] ?? 0;
    const wx = b.x + b.hx * a - b.hy * c;
    const wy = b.y + b.hy * a + b.hx * c;
    WATERLINE[i * 2] = sx(pen, wx, wy);
    WATERLINE[i * 2 + 1] = sy(pen, wx, wy, waterZ);
    const dc = c + heel;
    const dx2 = b.x + b.hx * a - b.hy * dc;
    const dy2 = b.y + b.hy * a + b.hx * dc;
    DECK[i * 2] = sx(pen, dx2, dy2);
    DECK[i * 2 + 1] = sy(pen, dx2, dy2, deckZ);
  }
  s.poly(WATERLINE, HULL_N, wet);
  for (let i = 0; i < HULL_N; i++) {
    const j = (i + 1) % HULL_N;
    pen.xy[0] = DECK[i * 2] ?? 0;
    pen.xy[1] = DECK[i * 2 + 1] ?? 0;
    pen.xy[2] = DECK[j * 2] ?? 0;
    pen.xy[3] = DECK[j * 2 + 1] ?? 0;
    pen.xy[4] = WATERLINE[j * 2] ?? 0;
    pen.xy[5] = WATERLINE[j * 2 + 1] ?? 0;
    pen.xy[6] = WATERLINE[i * 2] ?? 0;
    pen.xy[7] = WATERLINE[i * 2 + 1] ?? 0;
    // One side is lit and one is in shadow, chosen by which way the edge runs across the screen
    // — the same two face factors every solid in the kit uses, so a hull sits in the same light
    // as the buildings behind it.
    s.poly(pen.xy, 4, (pen.xy[2] ?? 0) > (pen.xy[0] ?? 0) ? side : wet);
  }
  s.poly(DECK, HULL_N, deckInk);
  s.stroke(DECK, HULL_N, true, outlineOf(hullInk), 1);

  // ── the second and third scales of detail ────────────────────────────────────────────
  const px = -b.hy;
  const py = b.hx;
  const gx = (a: number, c: number): number => b.x + b.hx * a + px * (c + heel);
  const gy = (a: number, c: number): number => b.y + b.hy * a + py * (c + heel);
  const dz = deckZ;

  // A deck plank running fore and aft, which is what stops the deck reading as one flat lozenge.
  let at = plot(pen, 0, gx(1.15, 0), gy(1.15, 0), dz + 1);
  plot(pen, at, gx(-0.9, 0), gy(-0.9, 0), dz + 1);
  s.stroke(pen.xy, 2, false, withAlpha(shade(deckInk, 0.82), 0.8), Math.max(1, cam.zoom));

  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (player) {
    // Mast and a fore-and-aft sail that bellies with her speed. The belly is the readout for
    // "how fast am I going" that a speedometer would have been.
    const mastZ = dz + 48;
    at = plot(pen, 0, gx(0.05, 0), gy(0.05, 0), dz);
    plot(pen, at, gx(0.05, 0), gy(0.05, 0), mastZ);
    s.stroke(pen.xy, 2, false, pen.palette.get('wood'), Math.max(1.5, 2.6 * cam.zoom));

    // **The belly is capped, and the cap is the whole readability of the boat.** Uncapped it is
    // `0.16 + speed · 0.045`, which at nine knots puts the sail's middle point a tile and a half
    // forward of the bow — a pale triangle bigger than the hull, detached from it, pointing the
    // wrong way. It read as a shark fin in every frame of the first film. Capped at a third of a
    // tile the sail still visibly fills and empties with her speed and still sits *on* the boat.
    const belly = 0.2 + Math.min(0.26, speed * 0.03) + noise2(b.seed * 811, t * 1.4, 0) * 0.04;
    at = plot(pen, 0, gx(0.05, 0), gy(0.05, 0), mastZ - 2);
    at = plot(pen, at, gx(-0.5 + belly, -belly), gy(-0.5 + belly, -belly), dz + 27);
    plot(pen, at, gx(-1.15, 0), gy(-1.15, 0), dz + 5);
    s.poly(pen.xy, 3, withAlpha(pen.palette.get('trim'), 0.92));
    s.stroke(pen.xy, 3, true, outlineOf(pen.palette.get('trim')), 1);

    // The gun, pointed where the player is pointing. It is the only part of the boat that does
    // not follow the heading, and that separation is the whole of the aiming feel.
    const adx = aimX - b.x;
    const ady = aimY - b.y;
    const inv = 1 / (Math.sqrt(adx * adx + ady * ady) || 1);
    const ax = adx * inv;
    const ay = ady * inv;
    isoCylinder(pen, b.x, b.y, 0.26, { color: pen.palette.get('iron'), h: 0.24, z: pxToLevels(dz) });
    at = plot(pen, 0, b.x, b.y, dz + 11);
    plot(pen, at, b.x + ax * 1.05, b.y + ay * 1.05, dz + 13);
    s.stroke(pen.xy, 2, false, pen.palette.get('iron'), Math.max(2, 4.2 * cam.zoom));
    if (b.muzzle > 0) {
      const f = b.muzzle / 0.09;
      glowDot(pen, b.x + ax * 1.3, b.y + ay * 1.3, pxToLevels(dz + 13), 'fcore', 0.3 * f, f);
    }
    // Stern lantern. The player's own light, and the thing that says *this one is me* in a frame
    // with nine hulls in it.
    // Stern lantern. **This is how a player finds themselves** in a frame with nine hulls, three
    // wrecks and a burning village in it, so it is drawn twice: a wide soft halo that carries at
    // the far edge of the frame and a hard core that reads up close. One dot does neither well.
    const lantern = 0.75 + noise2(b.seed * 97, t * 3.3, 0) * 0.2;
    glowDot(pen, gx(-0.95, 0), gy(-0.95, 0), pxToLevels(dz + 16), 'lamp', 0.34, lantern * 0.3);
    glowDot(pen, gx(-0.95, 0), gy(-0.95, 0), pxToLevels(dz + 16), 'lamp', 0.09, lantern);
  } else {
    // The raider: a ram, a square sail on a stubby mast, two cold lamps. Every one of those is a
    // *difference* from the player's silhouette rather than a decoration on it.
    at = plot(pen, 0, gx(1.5, 0), gy(1.5, 0), waterZ + 4);
    plot(pen, at, gx(2.3, 0), gy(2.3, 0), waterZ + 10);
    s.stroke(pen.xy, 2, false, pen.palette.get('iron'), Math.max(1.5, 3 * cam.zoom));

    const mastZ = dz + 34;
    at = plot(pen, 0, gx(0.15, 0), gy(0.15, 0), dz);
    plot(pen, at, gx(0.15, 0), gy(0.15, 0), mastZ);
    s.stroke(pen.xy, 2, false, pen.palette.get('char'), Math.max(1.5, 2.4 * cam.zoom));
    const sag = noise2(b.seed * 1777, t * 1.1, 0) * 0.08;
    at = plot(pen, 0, gx(0.15, 0.62 + sag), gy(0.15, 0.62 + sag), mastZ - 4);
    at = plot(pen, at, gx(0.15, -0.62 + sag), gy(0.15, -0.62 + sag), mastZ - 4);
    at = plot(pen, at, gx(0.15, -0.52 + sag), gy(0.15, -0.52 + sag), dz + 12);
    plot(pen, at, gx(0.15, 0.52 + sag), gy(0.15, 0.52 + sag), dz + 12);
    s.poly(pen.xy, 4, withAlpha(pen.palette.get('rsail'), 0.85));
    s.stroke(pen.xy, 4, true, outlineOf(pen.palette.get('rsail')), 1);
    glowDot(pen, gx(1.0, 0), gy(1.0, 0), pxToLevels(dz + 8), 'rlamp', 0.075, 0.8);
    if (b.muzzle > 0) glowDot(pen, gx(1.1, 0), gy(1.1, 0), pxToLevels(dz + 12), 'fcore', 0.24, b.muzzle / 0.09);
  }

  // Damage: a red bloom over the hull, and fire if she has caught. The fire is the same routine
  // an island burns with, which is why a burning raider reads as the same event.
  //
  // **Both are inside the alpha scope, and the version that was not is visible in every wide
  // shot of the dense map.** A raider sinking on a beach fades under `Surface.alpha`; a damage
  // flash drawn *after* the restore paints a full-opacity red hull over the top of her, and
  // because `hurt` decays while `sinking` does not clear it, what is left on screen is a red
  // brick on a hillside that never goes away. A dying hull has to dim as one thing.
  //
  // A third rather than a half, too: at 0.45 a raider that has taken one shell is a flat red
  // lozenge for half a second, which reads as a UI overlay rather than as a hit.
  if (b.hurt > 0) s.poly(DECK, HULL_N, withAlpha(pen.palette.get('bad'), b.hurt * 0.3));
  if (b.fire > 0.02) {
    paintFlame(pen, bx, by - deckZ * cam.zoom, 1.1 + b.fire, b.fire * (1 - sink), b.seed * 5171,
      0.1, -0.4);
  }

  if (alpha < 1) s.alpha(prev);
}

// ── shot, smoke and sparks ─────────────────────────────────────────────────────────────────

/**
 * A shell and the shadow that says how high it is.
 *
 * **The shadow is the readability of the whole weapon.** An arcing projectile drawn without one
 * is a dot moving over a background: the eye cannot tell a shell about to land at your feet from
 * one that will pass overhead, and the game becomes unfair for a reason nobody can name. The
 * shadow shrinks and darkens as the shell falls, so the moment of impact is legible a third of a
 * second before it happens.
 */
export function paintShell(pen: Pen, s: Shell, world: World): void {
  const surface = pen.surface;
  const cam = pen.camera;
  const ground = world.heights.get(Math.floor(s.x), Math.floor(s.y)) * 8;
  const up = Math.max(0, s.z - ground);
  const shrink = 1 / (1 + up * 0.012);

  const shx = sx(pen, s.x, s.y);
  const shy = sy(pen, s.x, s.y, ground);
  const r = HALF_W * cam.zoom * 0.3 * shrink;
  const dark = pen.palette.get('ink');
  surface.softEllipse(shx, shy, r, r * 0.5, withAlpha(dark, 0.45 * shrink), withAlpha(dark, 0));

  const warm = s.team === 0;
  const cx = sx(pen, s.x, s.y);
  const cy = sy(pen, s.x, s.y, s.z);
  const glow = pen.palette.get(warm ? 'ember' : 'rlamp');
  const core = pen.palette.get('fcore');
  // A three-dot trail rather than a polyline: the trail has to fade *and* shrink, and three
  // ellipses do both for the price of one stroke that could do neither.
  for (let i = 3; i > 0; i--) {
    const back = i * 0.028;
    const tx = sx(pen, s.x - s.vx * back, s.y - s.vy * back);
    const ty = sy(pen, s.x - s.vx * back, s.y - s.vy * back, s.z - s.vz * back);
    const rr = HALF_W * cam.zoom * (0.1 - i * 0.02);
    surface.ellipse(tx, ty, rr, rr, withAlpha(glow, 0.45 / i));
  }
  const rr = HALF_W * cam.zoom * 0.11;
  surface.softEllipse(cx, cy, rr * 3, rr * 3, withAlpha(glow, 0.5), withAlpha(glow, 0));
  surface.ellipse(cx, cy, rr, rr, withAlpha(core, 0.95));
}

/** Smoke and debris, drawn above the world and *under* the night composite so that smoke is
 *  genuinely dark except where a fire is lighting it. */
export function paintDarkMotes(pen: Pen, game: Game): void {
  const s = pen.surface;
  const cam = pen.camera;
  const fume = pen.palette.get('fume');
  const char = pen.palette.get('char');
  for (const m of game.motes) {
    if (!m.live) continue;
    if (m.kind !== Puff.Smoke && m.kind !== Puff.Debris) continue;
    const life = 1 - m.age / m.ttl;
    const cx = sx(pen, m.x, m.y);
    const cy = sy(pen, m.x, m.y, m.z);
    if (m.kind === Puff.Smoke) {
      const r = m.size * HALF_W * cam.zoom;
      // Denser than it was. A village with twenty fires in it should have a pall over it, and at
      // 0.34 against a night sky the plume was invisible in every wide shot — smoke is the only
      // thing in the frame that says a fire has been burning for a while rather than just caught.
      s.softEllipse(cx, cy, r, r * 0.9, withAlpha(fume, 0.46 * life), withAlpha(fume, 0));
    } else {
      const r = m.size * HALF_W * cam.zoom * 0.4;
      s.ellipse(cx, cy, r, r, withAlpha(char, 0.85 * life));
    }
  }
}

/** Embers, drawn **after** the light composite so they stay hot. Everything else in the frame is
 *  subject to the night; a spark is the night's exception, and it is one pass and thirty calls. */
export function paintEmbers(pen: Pen, game: Game): void {
  const s = pen.surface;
  const cam = pen.camera;
  const ember = pen.palette.get('ember');
  const core = pen.palette.get('fcore');
  for (const m of game.motes) {
    if (!m.live || m.kind !== Puff.Ember) continue;
    const life = 1 - m.age / m.ttl;
    const cx = sx(pen, m.x, m.y);
    const cy = sy(pen, m.x, m.y, m.z);
    const r = Math.max(0.7, m.size * HALF_W * cam.zoom * (0.4 + life * 0.6));
    s.softEllipse(cx, cy, r * 3.4, r * 3.4, withAlpha(ember, 0.3 * life), withAlpha(ember, 0));
    s.ellipse(cx, cy, r, r, withAlpha(mix(ember, core, life * 0.7), 0.9 * life));
  }
}

/**
 * The mark on the ground where the shells will land.
 *
 * **Not decoration.** The aim resolves against the height field, so a cursor over a hillside
 * points at a tile nine tiles up the screen from where the cursor is — which is correct, and
 * completely invisible without something drawn at the answer. A player without this is aiming by
 * dead reckoning at a building whose base they cannot see, and the first real playthrough of the
 * dense map went ninety-two seconds without setting anything alight.
 *
 * It also carries the reload, which is the other thing a gunner needs and the only readout in the
 * game that is not on the HUD: the ring is faint while she is reloading and hard when she is not,
 * so the rhythm of the guns is read where the eye already is rather than in the corner.
 */
export function paintReticle(pen: Pen, gx: number, gy: number, zPx: number, ready: number): void {
  const s = pen.surface;
  const z = pen.camera.zoom;
  const cx = sx(pen, gx, gy);
  const cy = sy(pen, gx, gy, zPx);
  const r = HALF_W * z * 0.56;
  const warm = pen.palette.get(ready >= 1 ? 'fcore' : 'trim');
  const a = 0.3 + ready * 0.5;

  s.softEllipse(cx, cy, r * 1.5, r * 0.75, withAlpha(warm, 0.09 * ready), withAlpha(warm, 0));
  // A ring lying in the ground plane — 2:1 like every other flat thing — as eight strokes, and
  // four ticks outside it. A dot would be invisible over a lit village and a full circle would
  // read as a light pool; the gap between the ring and the ticks is what makes it a *sight*.
  for (let i = 0; i <= RETICLE_N; i++) {
    pen.xy[i * 2] = cx + (RING[i * 2] ?? 0) * r;
    pen.xy[i * 2 + 1] = cy + (RING[i * 2 + 1] ?? 0) * r * 0.5;
  }
  s.stroke(pen.xy, RETICLE_N + 1, true, withAlpha(warm, a), Math.max(1, 1.4 * z));
  for (const k of RETICLE_TICKS) {
    pen.xy[0] = cx + k[0] * r * 1.35;
    pen.xy[1] = cy + k[1] * r * 0.68;
    pen.xy[2] = cx + k[0] * r * 2.05;
    pen.xy[3] = cy + k[1] * r * 1.03;
    s.stroke(pen.xy, 2, false, withAlpha(warm, a * 0.85), Math.max(1, 1.6 * z));
  }
}

/** Segments in the reticle ring. */
const RETICLE_N = 16;
/** The four directions its ticks point, in ring space. */
const RETICLE_TICKS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * A unit circle, built once at module load, as `RETICLE_N + 1` points closing on the first.
 *
 * The walk is the same `v + k · perp(v)` rotation the hulls steer with, so `atan(RING_K)` is
 * exactly one sixteenth of a turn and the ring closes on itself — no `cos` anywhere, and the
 * whole reticle stays Tier A. Built once because it never changes: the per-frame work is a
 * multiply per point, which is what non-negotiable 7 asks for.
 */
const RING_K = 0.19891236737965800;
const RING = ((): Float64Array => {
  const out = new Float64Array((RETICLE_N + 1) * 2);
  let ux = 1;
  let uy = 0;
  for (let i = 0; i <= RETICLE_N; i++) {
    out[i * 2] = ux;
    out[i * 2 + 1] = uy;
    const nx = ux - RING_K * uy;
    const ny = uy + RING_K * ux;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny);
    ux = nx * inv;
    uy = ny * inv;
  }
  return out;
})();

/**
 * A red arc at the edge of the frame pointing at whatever last hit her.
 *
 * The one piece of non-diegetic UI on the canvas, and it earns its place: the first playthrough
 * on real hardware lost a run and reported, exactly, "I died without understanding what was
 * killing me". A hull bar going down with no direction attached is not difficulty, it is noise.
 * Two seconds of a thin arc on the bearing turns it into information the player can act on —
 * turn away, or turn *toward* and put a shell into it.
 */
export function paintBearingOfHit(
  pen: Pen, playerX: number, playerY: number, hitX: number, hitY: number, age: number,
): void {
  if (age >= HIT_TELL_SECONDS) return;
  const s = pen.surface;
  const w = pen.surface.width;
  const h = pen.surface.height;
  const dx = (hitX - playerX) - (hitY - playerY);
  const dy = (hitX - playerX) + (hitY - playerY);
  const len = Math.sqrt(dx * dx * HALF_W * HALF_W + dy * dy * HALF_H * HALF_H);
  if (len < 1) return;
  const ux = (dx * HALF_W) / len;
  const uy = (dy * HALF_H) / len;
  const fade = 1 - age / HIT_TELL_SECONDS;
  const red = pen.palette.get('bad');
  const cx = w * 0.5;
  const cy = h * 0.5;
  // Sit it on an ellipse inscribed in the frame rather than on the frame's own edge: a marker
  // that walks the rectangle bunches in the corners and reads as four markers.
  const ex = cx + ux * w * 0.4;
  const ey = cy + uy * h * 0.4;
  const px = -uy;
  const py = ux;
  // A deep chevron, not a shallow one. At a third of its width in depth it draws as a straight
  // line at any distance from the centre and reads as a scratch on the lens; at two thirds it
  // reads as an arrowhead pointing outward, which is the whole content of the marker.
  pen.xy[0] = ex + px * 26 - ux * 20;
  pen.xy[1] = ey + py * 26 - uy * 20;
  pen.xy[2] = ex + ux * 16;
  pen.xy[3] = ey + uy * 16;
  pen.xy[4] = ex - px * 26 - ux * 20;
  pen.xy[5] = ey - py * 26 - uy * 20;
  s.stroke(pen.xy, 3, false, withAlpha(red, 0.8 * fade), 3);
  s.softEllipse(ex, ey, 60, 60, withAlpha(red, 0.16 * fade), withAlpha(red, 0));
}

/** Seconds the hit bearing stays up. Long enough to look at, short enough that two hits from two
 *  places do not leave a permanent ring of arcs. */
const HIT_TELL_SECONDS = 1.9;

// ── finding the objective ──────────────────────────────────────────────────────────────────

/** How far in from the frame edge a bearing marker sits, in CSS pixels. */
const BEARING_INSET = 30;

/**
 * A chevron at the edge of the frame for every magazine that is off it.
 *
 * The map is eighty tiles across and the camera shows about twenty of them, so four objectives
 * on it are four things the player cannot see — and "sail around until you find one" is not
 * tension, it is an errand. Two triangles and a dot each, at most four of them, drawn in the
 * Effects pass so they sit above the night.
 *
 * The marker grows as the target nears, which is the whole navigation aid: a player reads
 * *closer* off the size long before the island itself comes over the edge of the frame.
 */
export function paintBearings(pen: Pen, world: World, camera: { viewW: number; viewH: number }): void {
  const s = pen.surface;
  const w = pen.surface.width;
  const h = pen.surface.height;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const red = pen.palette.get('bad');

  for (const p of world.props) {
    if (p.kind !== Kind.Magazine || p.state === Burn.Spent) continue;
    const px = sx(pen, p.gx, p.gy);
    const py = sy(pen, p.gx, p.gy, p.zPx);
    if (px > BEARING_INSET && px < w - BEARING_INSET && py > BEARING_INSET && py < h - BEARING_INSET) continue;

    // Clamp the bearing to the inset rectangle by scaling the offset from the center down until
    // it fits on both axes. One divide per axis and no trigonometry, which keeps this off the
    // Tier B list entirely.
    const dx = px - cx;
    const dy = py - cy;
    const kx = Math.abs(dx) > 0.001 ? (cx - BEARING_INSET) / Math.abs(dx) : 1e9;
    const ky = Math.abs(dy) > 0.001 ? (cy - BEARING_INSET) / Math.abs(dy) : 1e9;
    const k = Math.min(kx, ky, 1);
    const ex = cx + dx * k;
    const ey = cy + dy * k;

    // Distance in screen pixels, turned into a size. Near targets get a big chevron; a magazine
    // on the far side of the map gets a small one, which is the difference between a HUD and a
    // compass.
    const far = Math.sqrt(dx * dx + dy * dy);
    const size = 7 + 9 / (1 + far / 900);
    const inv = 1 / (far || 1);
    const ux = dx * inv;
    const uy = dy * inv;
    const alpha = 0.35 + 0.4 / (1 + far / 700);
    pen.xy[0] = ex + ux * size;
    pen.xy[1] = ey + uy * size;
    pen.xy[2] = ex - ux * size * 0.5 - uy * size * 0.72;
    pen.xy[3] = ey - uy * size * 0.5 + ux * size * 0.72;
    pen.xy[4] = ex - ux * size * 0.5 + uy * size * 0.72;
    pen.xy[5] = ey - uy * size * 0.5 - ux * size * 0.72;
    s.poly(pen.xy, 3, withAlpha(red, alpha));
    s.softEllipse(ex, ey, size * 2.2, size * 2.2, withAlpha(red, alpha * 0.4), withAlpha(red, 0));
  }
}
