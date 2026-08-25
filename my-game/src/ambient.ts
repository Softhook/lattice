/**
 * Ambient environmental life: soaring birds, night fireflies, floating pollen, and tower smoke.
 *
 * Implements non-allocating closed-form ambient particle and life systems:
 * - Birds soaring overhead in skeins across the valley.
 * - Fireflies drifting over water/meadows after dark with gentle glowing pools.
 * - Pollen & dust motes floating in the sunlit breeze.
 * - Lantern / chimney smoke puffs rising from watchtowers and fortresses.
 */

import { clamp01, hash2, noise2, toUnit, type Vec2 } from '@latticekit/core';
import { gridToScreen, heightAt, HALF_W } from '@latticekit/iso';
import { mix, withAlpha, type Pen, hex, type LightField } from '@latticekit/draw';
import { W, H, MAT_GRASS, MAT_WATER, type WorldTerrain } from './world.js';
import type { Building } from './buildings.js';

const pt: Vec2 = { x: 0, y: 0 };

const BIRDS_COUNT = 12;
const FLIES_COUNT = 24;
const MOTES_COUNT = 20;

const WARM_GOLD = hex('#f1c40f');
const SMOKE_COL = hex('#95a5a6');

/**
 * Draw all ambient effects in the Effects pass.
 */
export function drawAmbientEffects(
  pen: Pen,
  seed: number,
  world: WorldTerrain,
  daylight: number,
  light: LightField | undefined,
  buildings: readonly Building[],
): void {
  // 1. Birds in the sunlit sky
  birds(pen, seed, daylight);

  // 2. Fireflies at night (around active viewport)
  fireflies(pen, seed, world, daylight, light);

  // 3. Floating sun motes in the daylight (around active viewport)
  motes(pen, seed, world, daylight);

  // 4. Smoke and embers from watchtowers, fortresses, and campfires
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0) continue;
    if (b.kind === 'wood_tower' || b.kind === 'stone_tower') {
      towerSmoke(pen, b.gx + 1, b.gy + 1, b.basePx + (b.kind === 'wood_tower' ? 52 : 68), seed ^ b.id);
    } else if (b.kind === 'campfire') {
      campfireEmbers(pen, b.gx + 0.5, b.gy + 0.5, b.basePx + 8, seed ^ b.id);
    }
  }
}

/** Birds in loose flocks crossing the sky on slow loops. */
function birds(pen: Pen, seed: number, daylight: number): void {
  const alpha = clamp01(daylight * 1.5 - 0.2);
  if (alpha <= 0.01) return;
  const s = pen.surface;
  const ink = withAlpha(hex('#1e272c'), alpha * 0.8);

  const camGx = (pen.camera.x / 32 + pen.camera.y / 16) * 0.5;
  const camGy = (pen.camera.y / 16 - pen.camera.x / 32) * 0.5;

  for (let i = 0; i < BIRDS_COUNT; i++) {
    const flock = Math.floor(i / 4);
    const speed = 0.8 + toUnit(hash2(seed ^ 0xb1, flock, 1)) * 0.45;
    const lane = (toUnit(hash2(seed ^ 0xb1, flock, 2)) - 0.5) * 40;
    const phase = ((pen.t * speed * 0.015 + toUnit(hash2(seed ^ 0xb1, flock, 3))) % 1) - 0.5;
    const spread = (i % 4) - 2;

    const gx = camGx + phase * 60 + spread * 2.2;
    const gy = camGy + lane - spread * 2.5 + Math.sin(pen.t * 0.8 + i) * 0.5; // @tier-b pixels only
    const zPx = 240 + noise2(seed, i, pen.t * 0.5) * 30;

    gridToScreen(pen.camera, gx, gy, zPx, pt);
    const x = pt.x + pen.snapX;
    const y = pt.y + pen.snapY;
    if (x < -40 || y < -40 || x > pen.surface.width + 40 || y > pen.surface.height + 40) continue;

    const beat = Math.sin(pen.t * 9.5 + i * 1.6) * 2.5 * pen.camera.zoom; // @tier-b pixels only
    const wing = 4.5 * pen.camera.zoom;

    pen.xy[0] = x - wing;
    pen.xy[1] = y - beat;
    pen.xy[2] = x;
    pen.xy[3] = y + beat * 0.5;
    pen.xy[4] = x + wing;
    pen.xy[5] = y - beat;
    s.stroke(pen.xy, 3, false, ink, Math.max(1, 1.4 * pen.camera.zoom));
  }
}

/** Glowing fireflies around the active viewport at night. */
function fireflies(
  pen: Pen,
  seed: number,
  world: WorldTerrain,
  daylight: number,
  light: LightField | undefined,
): void {
  const alpha = clamp01((0.6 - daylight) * 2.2);
  if (alpha <= 0.01) return;
  const s = pen.surface;

  const camGx = (pen.camera.x / 32 + pen.camera.y / 16) * 0.5;
  const camGy = (pen.camera.y / 16 - pen.camera.x / 32) * 0.5;

  for (let i = 0; i < FLIES_COUNT; i++) {
    const relX = (toUnit(hash2(seed ^ 0xf1, i, 1)) - 0.5) * 44 + noise2(seed, i * 2.4, pen.t * 0.2) * 2.8;
    const relY = (toUnit(hash2(seed ^ 0xf1, i, 2)) - 0.5) * 44 + noise2(seed, i * 5.8, pen.t * 0.18) * 2.8;
    const gx = camGx + relX;
    const gy = camGy + relY;

    const igx = Math.floor(gx);
    const igy = Math.floor(gy);
    if (igx < 0 || igy < 0 || igx >= W || igy >= H) continue;

    const blink = noise2(seed ^ 0x2a, i * 4.2, pen.t * 1.4) * 0.5 + 0.5;
    if (blink < 0.4) continue;

    const groundH = heightAt(world.field, gx, gy);
    const zPx = groundH + 8 + noise2(seed, i, pen.t * 0.4) * 10;
    gridToScreen(pen.camera, gx, gy, zPx, pt);

    if (pt.x < -20 || pt.y < -20 || pt.x > pen.surface.width + 20 || pt.y > pen.surface.height + 20) continue;

    const r = 1.8 * pen.camera.zoom;
    const a = alpha * (blink - 0.4) * 2.0;

    // Glowing halo
    s.softEllipse(pt.x, pt.y, r * 4.0, r * 4.0, withAlpha(WARM_GOLD, a * 0.3), withAlpha(WARM_GOLD, 0));
    // Center bright dot
    s.ellipse(pt.x, pt.y, r, r, withAlpha(mix(WARM_GOLD, 0xffffffff, 0.5), a));

    // Register into LightField for ground illumination
    if (light !== undefined && daylight < 0.6) {
      light.add(gx, gy, groundH, 1.6, (0.6 - daylight) * 0.4 * blink, WARM_GOLD);
    }
  }
}

/** Pollen and dust in the daylight breeze around the active camera. */
function motes(pen: Pen, seed: number, world: WorldTerrain, daylight: number): void {
  const alpha = clamp01(daylight * 1.4 - 0.25);
  if (alpha <= 0.01) return;
  const s = pen.surface;

  const camGx = (pen.camera.x / 32 + pen.camera.y / 16) * 0.5;
  const camGy = (pen.camera.y / 16 - pen.camera.x / 32) * 0.5;

  for (let i = 0; i < MOTES_COUNT; i++) {
    const relX = (toUnit(hash2(seed ^ 0x7c, i, 1)) - 0.5) * 36 + noise2(seed, i * 2.1, pen.t * 0.15) * 3.0;
    const relY = (toUnit(hash2(seed ^ 0x7c, i, 2)) - 0.5) * 36 + noise2(seed, i * 7.9, pen.t * 0.13) * 3.0;
    const gx = camGx + relX;
    const gy = camGy + relY;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;

    const groundH = heightAt(world.field, gx, gy);
    const zPx = groundH + 6 + ((pen.t * 5 + i * 31) % 36);

    gridToScreen(pen.camera, gx, gy, zPx, pt);
    if (pt.x < -10 || pt.y < -10 || pt.x > pen.surface.width + 10 || pt.y > pen.surface.height + 10) continue;
    s.ellipse(pt.x, pt.y, 1.2 * pen.camera.zoom, 1.2 * pen.camera.zoom, withAlpha(0xfff6d8ff, alpha * 0.35));
  }
}


/** Watchtower lantern beacon smoke puff. */
function towerSmoke(pen: Pen, gx: number, gy: number, zPx: number, seed: number): void {
  const s = pen.surface;
  for (let i = 0; i < 4; i++) {
    const phase = (pen.t * 0.25 + i / 4 + toUnit(hash2(seed, i, 7))) % 1;
    const drift = noise2(seed, i * 2.8, pen.t * 0.3) * 0.45;
    gridToScreen(pen.camera, gx + drift * phase, gy - drift * phase, zPx + phase * 48, pt);
    const r = (2.5 + phase * 10) * pen.camera.zoom;
    s.softEllipse(
      pt.x + pen.snapX,
      pt.y + pen.snapY,
      r,
      r * 0.85,
      withAlpha(SMOKE_COL, (1 - phase) * 0.25),
      withAlpha(SMOKE_COL, 0),
    );
  }
}

/** Campfire floating embers and light woodsmoke. */
function campfireEmbers(pen: Pen, gx: number, gy: number, zPx: number, seed: number): void {
  const s = pen.surface;
  for (let i = 0; i < 5; i++) {
    const phase = (pen.t * 0.8 + i / 5 + toUnit(hash2(seed, i, 9))) % 1;
    const driftX = noise2(seed ^ 0x3c, i * 3.1, pen.t * 0.5) * 0.4;
    const driftY = noise2(seed ^ 0x9a, i * 4.7, pen.t * 0.45) * 0.4;
    gridToScreen(pen.camera, gx + driftX * phase, gy + driftY * phase, zPx + phase * 32, pt);
    const r = (1.2 + (1 - phase) * 1.5) * pen.camera.zoom;
    const col = phase < 0.5 ? hex('#ff9f43') : hex('#ee5253');
    s.ellipse(pt.x + pen.snapX, pt.y + pen.snapY, r, r, withAlpha(col, (1 - phase) * 0.85));
  }
}
