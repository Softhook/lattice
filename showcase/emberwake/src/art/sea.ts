/**
 * The water: the backdrop it is painted on, the swell that moves across it, and everything
 * floating at sea level. **@art**
 *
 * ## Why the sea is not tiles
 *
 * The obvious build is a tile of water per visible tile, and it was measured: about nine hundred
 * `isoTile` calls a frame at 1280×720, for a surface with no elevation, no variation the eye can
 * track and nothing on it. The whole of what makes water read as water at speed is **long crests
 * that cross the frame**, and a tile grid is the one thing that cannot draw one — every crest
 * becomes a stipple of nine hundred independent decisions.
 *
 * So the sea is one ramp and about thirty polylines. A crest is a line of constant `gx + gy`,
 * which projects to a screen **horizontal**, and its displacement is in `gx + gy` too, so the
 * wave moves up and down the screen exactly as a swell does. Two families at different spacings
 * and opposite drifts is what stops it reading as corduroy — one family is a pattern, two is a
 * sea.
 *
 * The cost is a rounding error against the tile grid it replaces, and it looks better, which is
 * the good kind of optimization.
 */

import { noise2 } from '@latticekit/core';
import { HALF_H, HALF_W, type Rect, type TileRange } from '@latticekit/iso';
import { withAlpha, type Pen } from '@latticekit/draw';
import { Puff, type Game } from '../game.js';

/** Points per crest. Fourteen segments across a 1280-wide frame is a wave whose curve you can
 *  see and whose vertices you cannot. */
const CREST_POINTS = 15;

/**
 * One swell family: how far apart the crests are in tiles, how far they move, how fast they
 * drift down the map, and how strongly they read.
 */
interface Swell {
  readonly spacing: number;
  readonly amp: number;
  readonly drift: number;
  readonly wave: number;
  readonly alpha: number;
  readonly slot: string;
  /** Dash length in CSS pixels. **The single most important number in the sea.** An unbroken
   *  crest running the width of the frame reads as a scan line; the same crest broken into
   *  three-metre lengths reads as water, and it is one argument on `Surface.stroke` rather than
   *  a second geometry pass. */
  readonly dash: number;
}

/** Two families. The long slow one carries the eye across the frame; the short fast one is what
 *  makes the surface feel like it is being blown across. */
const SWELLS: readonly Swell[] = [
  { spacing: 6.1, amp: 0.66, drift: 0.34, wave: 0.1, alpha: 0.34, slot: 'surf', dash: 34 },
  { spacing: 3.3, amp: 0.32, drift: -0.85, wave: 0.24, alpha: 0.2, slot: 'foam', dash: 15 },
  { spacing: 1.7, amp: 0.15, drift: 1.5, wave: 0.5, alpha: 0.09, slot: 'shoal', dash: 7 },
];

/**
 * The backdrop: one vertical ramp over the whole viewport.
 *
 * Screen coordinates rather than world ones, because this is the only thing in the game that is
 * not in the world — it is the paper everything else is on. A flat fill would be cheaper by one
 * gradient and would make the sea read as a sticker; the ramp is what gives the frame a top.
 *
 * The one `polyRamp` in the game, and that is deliberate: the Canvas2D backend allocates a
 * `CanvasGradient` on every call to it, uncached, so a per-object ramp is a per-object
 * allocation on the hot path. Filed.
 */
export function drawBackdrop(pen: Pen, _visible: Readonly<Rect>, glow: number): void {
  const s = pen.surface;
  const w = s.width;
  const h = s.height;
  const xy = pen.xy;
  xy[0] = 0; xy[1] = 0;
  xy[2] = w; xy[3] = 0;
  xy[4] = w; xy[5] = h;
  xy[6] = 0; xy[7] = h;
  // The top of the frame lifts a little while the world burns — not enough to name, enough that
  // a player who has set three islands alight is looking at a different picture than one who has
  // set none. It is the cheapest possible way to make progress visible in the composition itself.
  const top = pen.palette.get(glow > 0.25 ? 'sky' : 'seaFar');
  s.polyRamp(xy, 4, 0, 0, 0, h, top, pen.palette.get('seaDeep'));
}

/**
 * The swell, drawn across whatever tile range the terrain pass was handed.
 *
 * Two loops and no allocation: the crest is written straight into `pen.xy`, which holds 128
 * points and is being asked for fifteen.
 */
export function drawSwell(pen: Pen, visible: Readonly<TileRange>, seed: number): void {
  const cam = pen.camera;
  const t = pen.t;
  // A crest is a line of constant v = gx + gy; u = gx - gy runs along it. The corners of the tile
  // range give the extremes of both, and over-covering slightly is free — a stroke that starts
  // off screen costs one clipped segment.
  const uMin = visible.gx0 - visible.gy1 - 2;
  const uMax = visible.gx1 - visible.gy0 + 2;
  const vMin = visible.gx0 + visible.gy0 - 2;
  const vMax = visible.gx1 + visible.gy1 + 2;
  const du = (uMax - uMin) / (CREST_POINTS - 1);

  for (const sw of SWELLS) {
    const color = withAlpha(pen.palette.get(sw.slot), sw.alpha);
    const phase = t * sw.drift;
    // Crests are pinned to the world grid and slide along it, so they do not swim when the camera
    // moves — a sea that scrolls with the viewport is the single most common tell of a fake one.
    const first = Math.ceil((vMin - phase) / sw.spacing) * sw.spacing + phase;
    for (let v = first; v <= vMax; v += sw.spacing) {
      let at = 0;
      for (let i = 0; i < CREST_POINTS; i++) {
        const u = uMin + i * du;
        // Two octaves would be smoother and one is enough: the crest is fifteen points long and
        // the eye is reading its *motion*, not its shape.
        const lift = noise2(seed, u * sw.wave, v * 0.09 + t * 0.7) * sw.amp;
        pen.xy[at] = cam.toScreenX(u * HALF_W) + pen.snapX;
        pen.xy[at + 1] = cam.toScreenY((v + lift) * HALF_H) + pen.snapY;
        at += 2;
      }
      // The dash offset walks with the crest's own `v`, so no two crests break in the same
      // place and the surface does not grow a vertical grain it has no reason to have.
      pen.surface.stroke(pen.xy, CREST_POINTS, false, color, 1, sw.dash, (v * 13) % (sw.dash * 2));
    }
  }
}

/**
 * Everything floating at sea level: wake foam, spray and splashes.
 *
 * Drawn at the end of the Terrain pass, which puts every one of them **under** every hull — which
 * is where foam belongs, and it costs nothing to be correct about because the pass order already
 * says so. Putting them in Effects instead would draw the player's own wake over the player.
 */
export function drawWaterMotes(pen: Pen, game: Game): void {
  const cam = pen.camera;
  const s = pen.surface;
  const foam = pen.palette.get('foam');
  const surf = pen.palette.get('surf');

  for (const m of game.motes) {
    if (!m.live) continue;
    if (m.kind !== Puff.Foam && m.kind !== Puff.Spray) continue;
    const life = 1 - m.age / m.ttl;
    const cx = cam.toScreenX((m.x - m.y) * HALF_W) + pen.snapX;
    const cy = cam.toScreenY((m.x + m.y) * HALF_H - m.z) + pen.snapY;

    if (m.kind === Puff.Foam) {
      // A wake puff lies flat, so it is 2:1 like everything else on the ground plane. Round foam
      // is the same mistake as a round light pool and reads as a bubble hovering over the sea.
      const r = m.size * HALF_W * cam.zoom;
      s.softEllipse(cx, cy, r, r * 0.5, withAlpha(foam, 0.34 * life * life), withAlpha(foam, 0));
    } else {
      // Spray is in the air and is therefore round, and it is a hard dot rather than a soft one:
      // at speed the bow throws water, and water has edges.
      const r = m.size * HALF_W * cam.zoom * (0.6 + life * 0.4);
      s.ellipse(cx, cy, r, r, withAlpha(m.z > 1 ? foam : surf, 0.6 * life));
    }
  }
}
