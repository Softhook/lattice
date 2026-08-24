/**
 * Verdant — main entry point.
 *
 * Wiring only: surfaces, cameras, loop, input, keyboard state, and the game tick.
 * No game logic lives here. This file is the ordering that cannot be wrong.
 *
 * Boot sequence (order matters — see skills/starting/SKILL.md):
 *   1. Canvas + Surface
 *   2. Palette + LightField
 *   3. World generation (needs the seed)
 *   4. Camera setup (needs the world bounds)
 *   5. Loop (needed by Input)
 *   6. Input (pointer/camera control)
 *   7. Keyboard state
 *   8. Players + Creatures
 *   9. loop.start() — nothing runs before this
 */

import { hashString } from '@latticekit/core';
import {
  createCamera,
  tileBounds,
  footprintBase,
  type Camera,
  type Rect,
} from '@latticekit/iso';
import { createCanvas2dSurface, createLightField } from '@latticekit/draw';
import { createLoop, browserFrames } from '@latticekit/loop';
import { createInput } from '@latticekit/input';

import {
  createWorld,
  dig as digTile,
  W, H, MAX_HEIGHT_PX, STEP_PX,
} from './world.js';
import {
  populateWorld,
  updateCreatures,
  evolveGeneration,
  GENERATION_TICKS,
} from './creatures.js';
import {
  createPlayers,
  movePlayer,
  playerAction,
  switchMode,
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
  isP1Dig,
  isP2Dig,
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
const light   = createLightField(surface, { scale: 0.5, falloff: 1.8, bloom: 0.3 });

// ── World ──────────────────────────────────────────────────────────────────────

const world     = createWorld(SEED);
const buildings: Building[] = [];

// World bounding rectangle in world pixels.
const worldRect: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
tileBounds(0, 0, W, H, MAX_HEIGHT_PX, worldRect);

// ── Players ────────────────────────────────────────────────────────────────────

const [p1, p2] = createPlayers();
const creatures = populateWorld(SEED, world);

// Helper to lock camera center on a player's coordinates
function lockCameraToPlayer(camera: Camera, player: typeof p1): void {
  const pgx = player.gx;
  const pgy = player.gy;
  const pzPx = footprintBase(world.field, { gx: Math.floor(pgx), gy: Math.floor(pgy), w: 1, d: 1 });
  const wx = (pgx - pgy) * 32; // HALF_W = 32
  const wy = (pgx + pgy) * 16 - pzPx; // HALF_H = 16
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

  // ── Mode switches ────────────────────────────────────────────────────────────
  if (edges.p1Mode) switchMode(p1);
  if (edges.p2Mode) switchMode(p2);

  // ── Player 1 action ──────────────────────────────────────────────────────────
  if (edges.p1Action) {
    if (isP1Dig(curr, prevKeys)) {
      // Q key: always dig the player's facing tile regardless of mode.
      const gx = Math.floor(p1.gx);
      const gy = Math.floor(p1.gy);
      digTile(world, gx, gy);
    } else {
      // E key: perform the mode action (which may build or dig depending on mode).
      const placed = playerAction(p1, world, buildings);
      if (placed !== undefined) buildings.push(placed);
    }
    // Update terrain for tap resolution after any ground change.
    input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
  }

  // ── Player 2 action ──────────────────────────────────────────────────────────
  if (edges.p2Action) {
    if (isP2Dig(curr, prevKeys)) {
      const gx = Math.floor(p2.gx);
      const gy = Math.floor(p2.gy);
      digTile(world, gx, gy);
    } else {
      const placed = playerAction(p2, world, buildings);
      if (placed !== undefined) buildings.push(placed);
    }
    input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
  }

  prevKeys = snapshotKeys(curr);

  // ── Creature AI ──────────────────────────────────────────────────────────────
  updateCreatures(creatures, world, [p1, p2], dt);

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

// ── Render (display rate) ─────────────────────────────────────────────────────

loop.onRender((_alpha, t, nowMs) => {
  input.frame(nowMs);

  // Lock camera center to each player's world position.
  lockCameraToPlayer(camera1, p1);
  lockCameraToPlayer(camera2, p2);

  // Day/night cycle: `t` is seconds since loop start. One cycle = 120 s.
  // @tier-b — sin for day/night, visual only, never hashed.
  const phase    = (t % 120) / 120;
  const darkness = Math.max(0, Math.sin(phase * Math.PI * 2) * -1) * 0.7;

  // Begin the light field with the primary pen for this frame.
  // `renderVerdant` calls `beginFrame` internally; we pass the light so it can be
  // handed to `beginFrame`. The light field's `begin` is called inside `renderVerdant`.
  renderVerdant(
    surface,
    light,
    palette,
    camera1,
    camera2,
    world,
    creatures,
    [p1, p2],
    buildings,
    t,
    darkness,
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
