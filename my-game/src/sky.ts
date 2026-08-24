/**
 * Celestial sky, sun & moon arc, twinkling stars, and distant mountain horizons.
 *
 * Implements full atmospheric projection:
 * - Dynamic zenith to horizon color gradient matching the day/night progression.
 * - Orbiting sun with warm radiant corona during daylight.
 * - Glowing crescent moon with crater shadow at night.
 * - Twinkling star field when darkness falls.
 * - Multi-layer parallax mountain ridgelines on the horizon (farRanges).
 */

import { clamp01, hash2, noise2, toUnit, type Vec2 } from '@latticekit/core';
import { gridToScreen } from '@latticekit/iso';
import { mix, shade, withAlpha, type Pen, type Rgba, hex } from '@latticekit/draw';

const pt: Vec2 = { x: 0, y: 0 };

/** Horizon boundary in grid coordinate space. */
const HORIZON_BAND = 16;

/**
 * The screen row where the terrain meets the distant sky.
 *
 * Derived from camera projection so the horizon rises and pans accurately with zoom/pan.
 */
export function horizonY(pen: Pen): number {
  gridToScreen(pen.camera, HORIZON_BAND * 0.5, HORIZON_BAND * 0.5, 0, pt);
  return pt.y + pen.snapY;
}

/**
 * The celestial sky backdrop: zenith/horizon gradient, orbiting sun/moon, and twinkling stars.
 */
export function drawSky(pen: Pen, daylight: number, cycle: number): void {
  const s = pen.surface;
  const w = s.width;
  const h = s.height;
  const hy = Math.min(h, Math.max(1, horizonY(pen)));

  const xy = pen.xy;
  xy[0] = 0; xy[1] = 0;
  xy[2] = w; xy[3] = 0;
  xy[4] = w; xy[5] = h;
  xy[6] = 0; xy[7] = h;

  // Sky atmospheric gradient based on time of day
  const dayZenith = shade(pen.palette.get('sky'), 0.95);
  const nightZenith = hex('#060c07');
  const zenith = mix(nightZenith, dayZenith, daylight);

  const dayHorizon = mix(pen.palette.get('sky'), hex('#d4ac0d'), 0.22);
  const nightHorizon = hex('#0e1a12');
  const horizon = mix(nightHorizon, dayHorizon, daylight);

  s.polyRamp(xy, 4, 0, 0, 0, hy, zenith, horizon);

  // Orbiting Sun during daylight (cycle 0.0 to 0.5)
  if (cycle < 0.5) {
    const dayProgress = cycle * 2; // 0..1
    const sunX = dayProgress * w;
    // @tier-b — celestial sun arc trajectory
    const sunY = hy - Math.sin(dayProgress * Math.PI) * (hy * 0.65) - 20;
    s.ellipse(sunX, sunY, 28, 28, withAlpha(hex('#fff3b0'), 0.25 * daylight));
    s.ellipse(sunX, sunY, 16, 16, withAlpha(hex('#ffe082'), 0.65 * daylight));
    s.ellipse(sunX, sunY, 8, 8, withAlpha(hex('#ffffff'), 0.95 * daylight));
  } else {
    // Glowing Moon during nighttime (cycle 0.5 to 1.0)
    const nightProgress = (cycle - 0.5) * 2; // 0..1
    const moonX = nightProgress * w;
    // @tier-b — celestial moon arc trajectory
    const moonY = hy - Math.sin(nightProgress * Math.PI) * (hy * 0.60) - 20;
    const moonAlpha = clamp01((0.55 - daylight) * 2.0);
    s.ellipse(moonX, moonY, 22, 22, withAlpha(hex('#7986cb'), 0.20 * moonAlpha));
    s.ellipse(moonX, moonY, 10, 10, withAlpha(hex('#e8eaf6'), 0.90 * moonAlpha));
    // Crater crescent shadow
    s.ellipse(moonX + 3, moonY - 2, 7, 7, withAlpha(hex('#0c160a'), 0.85 * moonAlpha));
  }

  // Twinkling stars at night
  if (daylight < 0.65) {
    const starAlpha = clamp01((0.65 - daylight) * 2.2);
    for (let i = 0; i < 180; i++) {
      const sx = toUnit(hash2(0x51a2, i, 1)) * w;
      const sy = toUnit(hash2(0x51a2, i, 2)) * hy;
      const twinkle = 0.4 + 0.6 * (noise2(0x51a2, i * 0.7, pen.t * 0.5) * 0.5 + 0.5);
      const sz = 0.8 + twinkle * 0.9;
      s.ellipse(sx, sy, sz, sz, withAlpha(0xf0f7ffff, starAlpha * twinkle * 0.85));
    }
  }
}

/**
 * Distant parallax mountain ridgelines on the horizon.
 */
export function farRanges(pen: Pen, seed: number, daylight: number): void {
  const s = pen.surface;
  const w = s.width;
  const hy = horizonY(pen);
  if (hy <= 0) return;

  const baseRock = hex('#3a4a38');
  const skyCol = pen.palette.get('sky');

  for (let layer = 0; layer < 3; layer++) {
    const amp = (18 + layer * 22) * Math.min(1.3, pen.camera.zoom + 0.3);
    const back = 0.75 - layer * 0.18;
    const drift = -pen.camera.x * (0.04 + layer * 0.035);
    let n = 0;

    for (let i = 0; i <= 36; i++) {
      const x = (i / 36) * w;
      const u = (x + drift) * (0.0012 + layer * 0.0008);
      const h = (noise2(seed ^ (0x3a1 + layer), u, layer * 7) * 0.65 + noise2(seed ^ 0x51c, u * 3.1, layer) * 0.28 + 0.4) * amp;
      pen.xy[n++] = x;
      pen.xy[n++] = hy - h;
    }
    pen.xy[n++] = w;
    pen.xy[n++] = hy + 6;
    pen.xy[n++] = 0;
    pen.xy[n++] = hy + 6;

    const layerColor = mix(skyCol, baseRock, (1 - back) * (0.4 + daylight * 0.6));
    s.poly(pen.xy, n / 2, layerColor);
  }
}
