/**
 * Grid → screen, with the pen's snap applied. **@art**
 *
 * Three lines, and the game should not have had to write them. `@latticekit/draw` has exactly
 * this function — `put(pen, at, gx, gy, zPx)` in `solids.ts`, used by every primitive in the
 * package — and it is not in the barrel, so anything drawing a shape the solid kit does not
 * already know how to draw (a hull under way, a flame leaning downwind, a shell's shadow) has to
 * re-derive it. Getting it wrong is quiet: forget `pen.snapX` and the whole boat shimmers against
 * terrain that is snapped, at some zooms and not others, which reads as a hardware fault.
 *
 * Filed as a kit finding. Everything else in this folder builds on these two functions.
 */

import { HALF_H, HALF_W } from '@latticekit/iso';
import type { Pen } from '@latticekit/draw';

/** Screen x of a grid position. Depends on `gx - gy` alone, which is why the two axes are two
 *  functions: a hull's seven corners have seven `x` values and fourteen `y` values, and doing
 *  both axes in one call would project twice as much as the shape needs. */
export function sx(pen: Pen, gx: number, gy: number): number {
  return pen.camera.toScreenX((gx - gy) * HALF_W) + pen.snapX;
}

/** Screen y of a grid position lifted `zPx` world pixels off the ground plane. */
export function sy(pen: Pen, gx: number, gy: number, zPx: number): number {
  return pen.camera.toScreenY((gx + gy) * HALF_H - zPx) + pen.snapY;
}

/** Write one projected point into the pen's scratch buffer and return the next write index —
 *  the shape every polygon in this game is built with. */
export function plot(pen: Pen, at: number, gx: number, gy: number, zPx: number): number {
  pen.xy[at] = sx(pen, gx, gy);
  pen.xy[at + 1] = sy(pen, gx, gy, zPx);
  return at + 2;
}
