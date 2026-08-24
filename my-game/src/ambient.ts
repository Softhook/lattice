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

const BIRDS_COUNT = 18;
const FLIES_COUNT = 48;
const MOTES_COUNT = 36;

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

  // 2. Fireflies at night
  fireflies(pen, seed, world, daylight, light);

  // 3. Floating sun motes in the daylight
  motes(pen, seed, world, daylight);

  // 4. Smoke from watchtowers and fortress towers
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b === undefined || b.hp <= 0) continue;
    if (b.kind === 'wood_tower' || b.kind === 'stone_tower') {
      towerSmoke(pen, b.gx + 1, b.gy + 1, b.basePx + (b.kind === 'wood_tower' ? 52 : 68), seed ^ b.id);
    }
  }
}

/** Birds in loose flocks crossing the sky on slow loops. */
function birds(pen: Pen, seed: number, daylight: number): void {
  const alpha = clamp01(daylight * 1.5 - 0.2);
  if (alpha <= 0.01) return;
  const s = pen.surface;
  const ink = withAlpha(hex('#1e272c'), alpha * 0.8);

  for (let i = 0; i < BIRDS_COUNT; i++) {
    const flock = Math.floor(i / 6);
    const speed = 0.8 + toUnit(hash2(seed ^ 0xb1, flock, 1)) * 0.45;
    const lane = toUnit(hash2(seed ^ 0xb1, flock, 2));
    const phase = (pen.t * speed * 0.012 + toUnit(hash2(seed ^ 0xb1, flock, 3))) % 1;
    const spread = (i % 6) - 3;

    const gx = phase * (W - 10) + spread * 1.8;
    const gy = 8 + lane * (H * 0.7) - spread * 2.2 + Math.sin(pen.t * 0.8 + i) * 0.5; // @tier-b pixels only
    const zPx = 240 + lane * 80 + noise2(seed, i, pen.t * 0.5) * 30;

    gridToScreen(pen.camera, gx, gy, zPx, pt);
    const x = pt.x + pen.snapX;
    const y = pt.y + pen.snapY;
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

/** Glowing fireflies over wetlands and grass at night. */
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

  for (let i = 0; i < FLIES_COUNT; i++) {
    const gx = 8 + toUnit(hash2(seed ^ 0xf1, i, 1)) * (W - 16) + noise2(seed, i * 2.4, pen.t * 0.2) * 2.8;
    const gy = 8 + toUnit(hash2(seed ^ 0xf1, i, 2)) * (H - 16) + noise2(seed, i * 5.8, pen.t * 0.18) * 2.8;

    const igx = Math.floor(gx);
    const igy = Math.floor(gy);
    if (igx < 0 || igy < 0 || igx >= W || igy >= H) continue;

    const mat = world.surface.get(igx, igy);
    if (mat !== MAT_GRASS && mat !== MAT_WATER) continue;

    const blink = noise2(seed ^ 0x2a, i * 4.2, pen.t * 1.4) * 0.5 + 0.5;
    if (blink < 0.4) continue;

    const groundH = heightAt(world.field, gx, gy);
    const zPx = groundH + 10 + noise2(seed, i, pen.t * 0.4) * 12;
    gridToScreen(pen.camera, gx, gy, zPx, pt);

    const r = 1.8 * pen.camera.zoom;
    const a = alpha * (blink - 0.4) * 2.0;

    // Glowing halo
    s.softEllipse(pt.x, pt.y, r * 4.5, r * 4.5, withAlpha(WARM_GOLD, a * 0.3), withAlpha(WARM_GOLD, 0));
    // Center bright dot
    s.ellipse(pt.x, pt.y, r, r, withAlpha(mix(WARM_GOLD, 0xffffffff, 0.5), a));

    // Ground light pool scaling with zoom and 2:1 isometric aspect
    const rx = 1.6 * HALF_W * pen.camera.zoom;
    s.softEllipse(pt.x, pt.y + 4 * pen.camera.zoom, rx, rx * 0.5, withAlpha(WARM_GOLD, a * 0.35), withAlpha(WARM_GOLD, 0));
  }
}

/** Pollen and dust in the daylight breeze. */
function motes(pen: Pen, seed: number, world: WorldTerrain, daylight: number): void {
  const alpha = clamp01(daylight * 1.4 - 0.25);
  if (alpha <= 0.01) return;
  const s = pen.surface;

  for (let i = 0; i < MOTES_COUNT; i++) {
    const gx = 6 + toUnit(hash2(seed ^ 0x7c, i, 1)) * (W - 12) + noise2(seed, i * 2.1, pen.t * 0.15) * 3.5;
    const gy = 6 + toUnit(hash2(seed ^ 0x7c, i, 2)) * (H - 12) + noise2(seed, i * 7.9, pen.t * 0.13) * 3.5;
    const groundH = heightAt(world.field, gx, gy);
    const zPx = groundH + 6 + ((pen.t * 5 + i * 31) % 36);

    gridToScreen(pen.camera, gx, gy, zPx, pt);
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
