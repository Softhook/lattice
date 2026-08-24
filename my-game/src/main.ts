/**
 * Verdant — main entry point.
 *
 * Wiring only: surfaces, cameras, loop, input, keyboard state, and the game tick.
 * No game logic lives here. This file is the ordering that cannot be wrong.
 */

import { hashString, clamp } from '@latticekit/core';
import {
  createCamera,
  tileBounds,
  gridToWorldX,
  gridToWorldY,
  heightAt,
  type Camera,
  type Rect,
} from '@latticekit/iso';
import { createCanvas2dSurface, createLightField } from '@latticekit/draw';
import { createLoop, browserFrames } from '@latticekit/loop';
import { createInput } from '@latticekit/input';

import {
  createWorld,
  W, H, MAX_HEIGHT_PX, STEP_PX,
} from './world.js';
import { populateFlora, tickFloraRegrowth } from './flora.js';
import {
  populateWorld,
  updateCreatures,
  evolveGeneration,
  GENERATION_TICKS,
} from './creatures.js';
import {
  createPlayers,
  movePlayer,
  buildAtFacing,
  interactAtFacing,
  digAtFacing,
  raiseAtFacing,
  cycleBuildKind,
  tickPlayer,
} from './players.js';
import {
  damageBuildings,
  type Building,
} from './buildings.js';
import {
  createKeyState,
  pollP1Movement,
  pollP2Movement,
  pollActions,
  snapshotKeys,
} from './input.js';
import {
  createVerdantPalette,
  renderVerdant,
  resizeCameras,
} from './render.js';
import { NIGHT_COLOR } from './palette.js';

// ── Seed ───────────────────────────────────────────────────────────────────────

const urlSeed = new URLSearchParams(location.search).get('seed');
const SEED = urlSeed !== null ? parseInt(urlSeed, 10) : hashString('verdant-v1');

// ── Canvas + Surface ───────────────────────────────────────────────────────────

const canvas  = document.getElementById('viewport') as HTMLCanvasElement;
const surface = createCanvas2dSurface(canvas);
const palette = createVerdantPalette();
const light1  = createLightField(surface, { scale: 0.5, falloff: 1.8, bloom: 0.3 });
const light2  = createLightField(surface, { scale: 0.5, falloff: 1.8, bloom: 0.3 });

// ── World & Nature ─────────────────────────────────────────────────────────────

const world     = createWorld(SEED);
const flora     = populateFlora(SEED, world);
const buildings: Building[] = [];

// World bounding rectangle in world pixels.
const worldRect: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
tileBounds(0, 0, W, H, MAX_HEIGHT_PX, worldRect);

// ── Players & Creatures ────────────────────────────────────────────────────────

const [p1, p2] = createPlayers();
const creatures = populateWorld(SEED, world);

// Helper to lock camera center on a player's coordinates with smooth continuous elevation
function lockCameraToPlayer(camera: Camera, player: typeof p1): void {
  const pgx = player.gx;
  const pgy = player.gy;
  const pzPx = heightAt(world.field, pgx, pgy);
  const wx = gridToWorldX(pgx, pgy);
  const wy = gridToWorldY(pgx, pgy) - pzPx;
  camera.centerOn(wx, wy);
}

// ── Cameras ────────────────────────────────────────────────────────────────────

// Each camera covers half the window width.
const initHalfW  = Math.max(1, Math.floor(window.innerWidth / 2));
const initViewH  = Math.max(1, window.innerHeight - 32);

const camera1 = createCamera(initHalfW, initViewH, {
  bounds: worldRect,
  minZoom: 0.2,
  maxZoom: 5.0,
  zoom: 1.8,
  keepVisible: 0.3,
});
lockCameraToPlayer(camera1, p1);

const camera2 = createCamera(initHalfW, initViewH, {
  bounds: worldRect,
  minZoom: 0.2,
  maxZoom: 5.0,
  zoom: 1.8,
  keepVisible: 0.3,
});
lockCameraToPlayer(camera2, p2);

// ── Loop ───────────────────────────────────────────────────────────────────────

const loop = createLoop({
  clock:  { now: () => performance.now() },
  frames: browserFrames(),
});

// ── Input (pointer + camera panning for Player 1's viewport) ──────────────────

const input = createInput({
  element: canvas,
  camera:  camera1,
  step:    loop,
  terrain: { field: world.field, maxHeightPx: world.currentMaxHeightPx },
  actions: {},
});

// ── Keyboard ───────────────────────────────────────────────────────────────────

const { state: keyState, dispose: disposeKeys } = createKeyState();
let prevKeys = new Set<string>();

// ── Game update (fixed 60 Hz) ─────────────────────────────────────────────────

let tickCount = 0;

loop.onUpdate((dt, tick) => {
  input.tick(tick);

  const curr  = keyState.held;
  const edges = pollActions(prevKeys, curr);

  // ── Player movement ──────────────────────────────────────────────────────────
  const { dx: dx1, dy: dy1 } = pollP1Movement(curr);
  const { dx: dx2, dy: dy2 } = pollP2Movement(curr);
  movePlayer(p1, dx1, dy1, world, dt);
  movePlayer(p2, dx2, dy2, world, dt);

  // ── Player 1 Actions ─────────────────────────────────────────────────────────
  if (edges.p1Cycle) {
    cycleBuildKind(p1);
    updateDomHud();
  }
  if (edges.p1Build) {
    if (p1.mode === 'move') {
      interactAtFacing(p1, world, flora, buildings);
    } else {
      const placed = buildAtFacing(p1, world, buildings);
      if (placed !== undefined) {
        buildings.push(placed);
        updateDomHud();
      }
    }
  }
  if (edges.p1Dig) {
    digAtFacing(p1, world);
    input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
  }
  if (edges.p1Raise) {
    raiseAtFacing(p1, world);
    input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
  }

  // ── Player 2 Actions ─────────────────────────────────────────────────────────
  if (edges.p2Cycle) {
    cycleBuildKind(p2);
    updateDomHud();
  }
  if (edges.p2Build) {
    if (p2.mode === 'move') {
      interactAtFacing(p2, world, flora, buildings);
    } else {
      const placed = buildAtFacing(p2, world, buildings);
      if (placed !== undefined) {
        buildings.push(placed);
        updateDomHud();
      }
    }
  }
  if (edges.p2Dig) {
    digAtFacing(p2, world);
    input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
  }
  if (edges.p2Raise) {
    raiseAtFacing(p2, world);
    input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
  }

  prevKeys = snapshotKeys(curr);

  // ── Creature & Flora Ecosystem ───────────────────────────────────────────────
  updateCreatures(creatures, world, [p1, p2], flora, dt);
  tickFloraRegrowth(SEED, flora, world, dt);

  // ── Troll building damage ────────────────────────────────────────────────────
  for (const c of creatures) {
    if (c.species === 'troll' && c.hp > 0) {
      damageBuildings(buildings, c.gx, c.gy, dt * 0.4);
    }
  }

  // ── Remove destroyed buildings ────────────────────────────────────────────────
  let bi = buildings.length;
  while (bi--) {
    if ((buildings[bi] as Building).hp <= 0) buildings.splice(bi, 1);
  }

  // ── Evolution ─────────────────────────────────────────────────────────────────
  tickCount++;
  if (tickCount % GENERATION_TICKS === 0) {
    evolveGeneration(creatures, SEED, world);
  }

  // ── Player regen / respawn ────────────────────────────────────────────────────
  tickPlayer(p1, dt);
  tickPlayer(p2, dt);
});

// ── DOM Controls Bar Helper ───────────────────────────────────────────────────

function updateDomHud(): void {
  const p1ToolEl = document.getElementById('p1-tool');
  const p2ToolEl = document.getElementById('p2-tool');
  if (p1ToolEl) p1ToolEl.textContent = p1.mode.toUpperCase();
  if (p2ToolEl) p2ToolEl.textContent = p2.mode.toUpperCase();
}

// ── Render (display rate) ─────────────────────────────────────────────────────

loop.onRender((_alpha, t, nowMs) => {
  input.frame(nowMs);

  // Synchronize camera2 zoom with camera1 zoom
  if (Math.abs(camera2.zoom - camera1.zoom) > 1e-4) {
    camera2.zoomAt(camera1.zoom / camera2.zoom, camera2.viewW / 2, camera2.viewH / 2);
  }

  // Lock camera center to each player's world position.
  lockCameraToPlayer(camera1, p1);
  lockCameraToPlayer(camera2, p2);

  // Day/night cycle: `t` is seconds since loop start. One cycle = 120 s.
  // @tier-b — sin for day/night, visual only, never hashed.
  const cycle    = (t % 120) / 120;
  const daylight = Math.sin(cycle * Math.PI) * 0.5 + 0.5;
  const darkness = clamp((0.55 - daylight) * 1.8, 0, 0.85);

  // Render split-screen frame
  renderVerdant(
    surface,
    light1,
    light2,
    palette,
    camera1,
    camera2,
    world,
    flora,
    creatures,
    [p1, p2],
    buildings,
    t,
    darkness,
    daylight,
    cycle,
    SEED,
  );
});

// ── Resize ────────────────────────────────────────────────────────────────────

function fit(): void {
  resizeCameras(surface, camera1, camera2);
}
window.addEventListener('resize', fit);
if (window.visualViewport !== null) {
  window.visualViewport?.addEventListener('resize', fit);
}
fit();
updateDomHud();

// ── Teardown (HMR) ────────────────────────────────────────────────────────────

function dispose(): void {
  loop.stop();
  input.dispose();
  disposeKeys();
  window.removeEventListener('resize', fit);
}
if ((import.meta as any).hot) (import.meta as any).hot.dispose(dispose);

// ── Go! ────────────────────────────────────────────────────────────────────────

loop.start();
