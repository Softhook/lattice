/**
 * The islands: ground, the surf around it, and the wet line the sea leaves on it. **@art**
 *
 * One pass over the visible tile range, and **only land tiles and the ring of sea touching them
 * are painted at all** — the open water underneath was already drawn by `sea.ts` as one ramp, so
 * the terrain loop's job is to draw the four hundred tiles that are actually something and skip
 * the four hundred that are not. That skip is the single largest saving in the renderer and it
 * comes from a `Uint8Array` built once at world generation; see `World.solid`.
 *
 * ## Three scales of detail, as the reference demands
 *
 * | scale | what |
 * |---|---|
 * | massing | the heightfield itself: `isoTerrain` per tile, on shared vertices, so there are no seams to skirt |
 * | texture | elevation chooses sand, scrub or rock, and a stateless per-tile hash varies each by a few percent |
 * | motion | the surf line breathes on the beach, and the coast ring moves with a noise field that scrolls |
 *
 * The middle one is what stops an island reading as a contour map, and the third is what stops it
 * reading as a photograph of one.
 */

import { hash2, noise2 } from '@latticekit/core';
import { isoTerrain, isoTile, mix, shade, withAlpha, type Ink, type Pen } from '@latticekit/draw';
import type { TileRange } from '@latticekit/iso';
import { MAP, type World } from '../world.js';

/** The lowest camera zoom at which the per-tile decoration is worth its cost. Below it the
 *  detail is a pixel wide and the frame is bigger, which is exactly the wrong trade. */
const DETAIL_ZOOM = 0.62;

/**
 * Ground color for one tile, from its elevation and a hash.
 *
 * Ramps rather than thresholds, for the reason every terrain in this kit gives: a branch on a
 * quantized field draws its own contour line across the hillside, and the line moves with the
 * seed so no single threshold is ever right. Here the field really *is* quantized — heights are
 * integers — so the hash is what has to do the softening, and it does it by moving the *blend*
 * rather than the brightness.
 */
function groundInk(pen: Pen, h: number, grain: number): Ink {
  const sand = pen.palette.get('sand');
  const grass = pen.palette.get('grass');
  const scrub = pen.palette.get('scrub');
  const rock = pen.palette.get('rock');
  if (h <= 1) return mix(sand, grass, grain * 0.3);
  if (h <= 3) return mix(sand, grass, 0.35 + h * 0.18 + grain * 0.2);
  if (h <= 9) return mix(grass, scrub, grain);
  return mix(scrub, rock, (h - 9) * 0.18 + grain * 0.3);
}

/**
 * Paint every visible tile that is not open water.
 *
 * `visible` is `renderFrame`'s own margined tile range, so the margin that keeps a summit on
 * screen after its base has left the bottom of the frame is `Passes.maxHeightPx`'s job and not
 * this loop's.
 */
export function drawLand(pen: Pen, world: World, visible: Readonly<TileRange>, seed: number): void {
  const t = pen.t;
  const detail = pen.camera.zoom >= DETAIL_ZOOM;
  const heights = world.heights;
  const foam = pen.palette.get('foam');
  const shoal = pen.palette.get('shoal');
  const surf = pen.palette.get('surf');
  const gx0 = Math.max(0, visible.gx0);
  const gy0 = Math.max(0, visible.gy0);
  const gx1 = Math.min(MAP - 1, visible.gx1);
  const gy1 = Math.min(MAP - 1, visible.gy1);

  for (let gy = gy0; gy <= gy1; gy++) {
    const row = gy * MAP;
    for (let gx = gx0; gx <= gx1; gx++) {
      const at = row + gx;

      if (world.solid[at] !== 1) {
        if (world.coast[at] !== 1) continue;
        // The ring of water against the beach. One quad, one color, and the color is where the
        // motion is: a noise field scrolling shoreward, so the surf advances up the beach and
        // pulls back rather than pulsing in place.
        const swell = noise2(seed ^ 0x51, gx * 0.34 + t * 0.75, gy * 0.34 + t * 0.55);
        isoTile(pen, gx, gy, mix(shoal, surf, 0.3 + swell * 0.3));
        continue;
      }

      // Massing. `isoTerrain` leaves the four projected corners in `pen.xy`, which is what makes
      // every decoration below free of projection — and returns the color it actually painted,
      // relief term included, so the decorations stay relatives of the tile's own hue.
      const h = heights.get(gx, gy);
      const grain = (hash2(seed, gx, gy) & 0xffff) / 0xffff;
      const tint = 0.94 + grain * 0.13;
      const painted = isoTerrain(pen, world.field, gx, gy, groundInk(pen, h, grain), undefined, tint);

      if (!detail) continue;

      // The wet line. A tile with a corner at sea level is a tile the sea is currently on, and
      // the alpha breathes with the same field the coast ring uses so the two agree about where
      // the water is. This is the one decoration in the game that is worth more than it costs:
      // without it an island is a plate sitting on the sea rather than a thing the sea is
      // washing against.
      const wet =
        heights.get(gx, gy) === 0 || heights.get(gx + 1, gy) === 0 ||
        heights.get(gx, gy + 1) === 0 || heights.get(gx + 1, gy + 1) === 0;
      if (wet) {
        const swell = noise2(seed ^ 0x51, gx * 0.34 + t * 0.75, gy * 0.34 + t * 0.55);
        pen.surface.poly(pen.xy, 4, withAlpha(foam, 0.1 + swell * 0.12 + 0.12));
        continue;
      }

      // A hairline fold, on three of the four edges and only where the ground is actually
      // folded. A stroke per land tile is the most expensive thing a terrain loop can do, and on
      // level ground it draws a crease that is not there.
      const fall = heights.get(gx + 1, gy) - heights.get(gx, gy + 1);
      if (fall > 2 || fall < -2) {
        pen.surface.stroke(pen.xy, 3, false, withAlpha(shade(painted, 0.84), 0.3), 1);
      } else if (h >= 9 && grain > 0.86) {
        // Scree on the tops: one small dark triangle out of the tile's own color. Sparse, so it
        // reads as loose stone rather than as noise, and it is the third scale of detail that
        // stops a summit being one flat facet.
        pen.surface.poly(pen.xy, 3, withAlpha(shade(painted, 0.8), 0.5));
      }
    }
  }
}
