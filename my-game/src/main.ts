/**
 * Verdant — main entry point.
 *
 * Wiring only: surfaces, cameras, loop, audio, input, persistent storage, and the game tick.
 * No game logic lives here. This file is the ordering that cannot be wrong.
 */

import { hashString, hashStep, toUnit, clamp } from '@latticekit/core';
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
  applyTerrainDeltas,
  W, H, MAX_HEIGHT_PX,
} from './world.js';
import { populateFlora, tickFloraRegrowth, restoreFlora } from './flora.js';
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
  craftNextAvailable,
  cycleWeapon,
} from './players.js';
import {
  damageBuildings,
  restoreBuilding,
  type Building,
} from './buildings.js';
import {
  createKeyState,
  pollP1Movement,
  pollP2Movement,
  pollActions,
  copyKeys,
  createActionEdges,
  type Vec2Out,
} from './input.js';
import {
  createVerdantPalette,
  renderVerdant,
  resizeCameras,
} from './render.js';
import { createGameAudio } from './audio.js';
import { createVerdantStore, extractSaveState } from './storage.js';
import {
  createProjectilePool,
  executeAttack,
  stepProjectiles,
} from './combat.js';

// ── Seed ───────────────────────────────────────────────────────────────────────

const urlSeed = new URLSearchParams(location.search).get('seed');
const SEED = urlSeed !== null ? parseInt(urlSeed, 10) : hashString('verdant-v1');

// ── Canvas + Surface ───────────────────────────────────────────────────────────

const canvasEl = document.getElementById('viewport');
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error('main: expected #viewport HTMLCanvasElement in DOM');
}
const surface = createCanvas2dSurface(canvasEl);
const palette = createVerdantPalette();
const light1  = createLightField(surface, { scale: 0.5, falloff: 1.8, bloom: 0.3 });
const light2  = createLightField(surface, { scale: 0.5, falloff: 1.8, bloom: 0.3 });

// ── Audio ──────────────────────────────────────────────────────────────────────

const audio = createGameAudio();

// ── World & Nature ─────────────────────────────────────────────────────────────

const world     = createWorld(SEED);
const flora     = populateFlora(SEED, world);
const buildings: Building[] = [];

// World bounding rectangle in world pixels
const worldRect: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
tileBounds(0, 0, W, H, MAX_HEIGHT_PX, worldRect);

// ── Players & Creatures ────────────────────────────────────────────────────────

const [p1, p2] = createPlayers();
const creatures = populateWorld(SEED, world);

// ── Persistent Storage ────────────────────────────────────────────────────────

const store = createVerdantStore(SEED, () => extractSaveState(SEED, [p1, p2], buildings, world, flora));
const opened = store.open();
if (opened.source === 'save' && opened.state && opened.state.p1 && opened.state.p2) {
  // Restore saved player inventories, positions & combat gear
  const s = opened.state;
  p1.inventory.wood = s.p1.wood;
  p1.inventory.stone = s.p1.stone;
  p1.inventory.fiber = s.p1.fiber;
  p1.hp = s.p1.hp;
  p1.gx = s.p1.gx;
  p1.gy = s.p1.gy;
  p1.weapon = s.p1.weapon;
  p1.craftedWeapons = [...s.p1.craftedWeapons];

  p2.inventory.wood = s.p2.wood;
  p2.inventory.stone = s.p2.stone;
  p2.inventory.fiber = s.p2.fiber;
  p2.hp = s.p2.hp;
  p2.gx = s.p2.gx;
  p2.gy = s.p2.gy;
  p2.weapon = s.p2.weapon;
  p2.craftedWeapons = [...s.p2.craftedWeapons];

  // Restore terraformed landscape (vertex heights and surface materials)
  if (Array.isArray(s.terrainHeights) || Array.isArray(s.terrainSurfaces)) {
    applyTerrainDeltas(world, s.terrainHeights ?? [], s.terrainSurfaces ?? []);
  }

  // Restore harvested / regrown flora landscape
  if (Array.isArray(s.flora) && s.flora.length > 0) {
    flora.length = 0;
    flora.push(...restoreFlora(s.flora));
  }

  // Restore saved constructed buildings
  if (Array.isArray(s.buildings)) {
    for (let i = 0; i < s.buildings.length; i++) {
      const sb = s.buildings[i];
      if (sb !== undefined && sb.hp > 0) {
        buildings.push(restoreBuilding(sb.kind, sb.gx, sb.gy, sb.hp, sb.maxHp, world));
      }
    }
  }
}

updateDomHud();

// ── Camera Locking ────────────────────────────────────────────────────────────

function lockCameraToPlayer(camera: Camera, player: typeof p1): void {
  const pgx = player.gx;
  const pgy = player.gy;
  const pzPx = heightAt(world.field, pgx, pgy);
  const wx = gridToWorldX(pgx, pgy);
  const wy = gridToWorldY(pgx, pgy) - pzPx;
  camera.centerOn(wx, wy);
}

// ── Cameras ────────────────────────────────────────────────────────────────────

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

// ── Input ──────────────────────────────────────────────────────────────────────

const input = createInput({
  element: canvasEl,
  camera:  camera1,
  step:    loop,
  terrain: { field: world.field, maxHeightPx: world.currentMaxHeightPx },
  actions: {},
});

// ── Keyboard & Hot-Path Scratch Structures (Zero Allocation) ───────────────────

const { state: keyState, dispose: disposeKeys } = createKeyState();
const prevKeys = new Set<string>();
const edges = createActionEdges();
const moveVec1: Vec2Out = { dx: 0, dy: 0 };
const moveVec2: Vec2Out = { dx: 0, dy: 0 };

// Unlock audio on first keypress or canvas interaction
function onFirstGesture(): void {
  audio.unlock();
  audio.play('wake');
  window.removeEventListener('keydown', onFirstGesture);
  window.removeEventListener('pointerdown', onFirstGesture);
}
window.addEventListener('keydown', onFirstGesture, { once: true });
window.addEventListener('pointerdown', onFirstGesture, { once: true });

// ── Game update (fixed 60 Hz) ─────────────────────────────────────────────────

let tickCount = 0;
let currentDarkness = 0;
let autosaveTimer = 0;
let prevDaylight = 1.0;
const projectiles = createProjectilePool();

loop.onUpdate((dt, tick) => {
  input.tick(tick);

  const curr = keyState.held;
  pollActions(prevKeys, curr, edges);

  // ── Player movement ───────────────────────────────────────────────────────────
  pollP1Movement(curr, moveVec1);
  pollP2Movement(curr, moveVec2);
  movePlayer(p1, moveVec1.dx, moveVec1.dy, world, buildings, dt);
  movePlayer(p2, moveVec2.dx, moveVec2.dy, world, buildings, dt);

  // ── Player 1 Actions ─────────────────────────────────────────────────────────
  if (edges.p1CycleWeapon) {
    cycleWeapon(p1);
    audio.play('click');
    updateDomHud();
  }
  if (edges.p1CraftWeapon) {
    const res = craftNextAvailable(p1);
    if (res.crafted) audio.play('craft');
    else audio.play('deny');
    updateDomHud();
  }
  if (edges.p1Attack) {
    if (p1.attackCooldown <= 0 && p1.respawnTimer <= 0) {
      const baseH = heightAt(world.field, p1.gx, p1.gy);
      const res = executeAttack(p1, creatures, projectiles, baseH);
      if (res.isRanged) audio.play('bow_shoot');
      else if (res.hit) audio.play('hit_meat');
      else audio.play('attack');
      updateDomHud();
    }
  }
  if (edges.p1Cycle) {
    cycleBuildKind(p1);
    audio.play('click');
    updateDomHud();
  }
  if (edges.p1Build) {
    if (p1.mode === 'move') {
      const res = interactAtFacing(p1, world, flora, buildings);
      if (res.type !== 'none') {
        audio.play(res.type);
        updateDomHud();
      } else {
        audio.play('attack');
      }
    } else {
      const placed = buildAtFacing(p1, world, buildings);
      if (placed !== undefined) {
        buildings.push(placed);
        audio.play('build');
        updateDomHud();
      } else {
        audio.play('deny');
      }
    }
  }
  if (edges.p1Dig) {
    const changed = digAtFacing(p1, world);
    if (changed) {
      audio.play('dig');
      input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
    } else {
      audio.play('deny');
    }
  }
  if (edges.p1Raise) {
    const changed = raiseAtFacing(p1, world);
    if (changed) {
      audio.play('raise');
      input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
    } else {
      audio.play('deny');
    }
  }

  // ── Player 2 Actions ─────────────────────────────────────────────────────────
  if (edges.p2CycleWeapon) {
    cycleWeapon(p2);
    audio.play('click');
    updateDomHud();
  }
  if (edges.p2CraftWeapon) {
    const res = craftNextAvailable(p2);
    if (res.crafted) audio.play('craft');
    else audio.play('deny');
    updateDomHud();
  }
  if (edges.p2Attack) {
    if (p2.attackCooldown <= 0 && p2.respawnTimer <= 0) {
      const baseH = heightAt(world.field, p2.gx, p2.gy);
      const res = executeAttack(p2, creatures, projectiles, baseH);
      if (res.isRanged) audio.play('bow_shoot');
      else if (res.hit) audio.play('hit_meat');
      else audio.play('attack');
      updateDomHud();
    }
  }
  if (edges.p2Cycle) {
    cycleBuildKind(p2);
    audio.play('click');
    updateDomHud();
  }
  if (edges.p2Build) {
    if (p2.mode === 'move') {
      const res = interactAtFacing(p2, world, flora, buildings);
      if (res.type !== 'none') {
        audio.play(res.type);
        updateDomHud();
      } else {
        audio.play('attack');
      }
    } else {
      const placed = buildAtFacing(p2, world, buildings);
      if (placed !== undefined) {
        buildings.push(placed);
        audio.play('build');
        updateDomHud();
      } else {
        audio.play('deny');
      }
    }
  }
  if (edges.p2Dig) {
    const changed = digAtFacing(p2, world);
    if (changed) {
      audio.play('dig');
      input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
    } else {
      audio.play('deny');
    }
  }
  if (edges.p2Raise) {
    const changed = raiseAtFacing(p2, world);
    if (changed) {
      audio.play('raise');
      input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
    } else {
      audio.play('deny');
    }
  }

  // Snapshot held keys without heap allocations
  copyKeys(curr, prevKeys);

  // ── Projectile kinematics & collision ────────────────────────────────────────
  const projHits = stepProjectiles(projectiles, creatures, [p1, p2], world, dt);
  if (projHits.length > 0) {
    audio.play('hit_meat');
    updateDomHud();
  }

  // ── Creature & Flora Ecosystem ───────────────────────────────────────────────
  const creEvents = updateCreatures(creatures, world, [p1, p2], flora, buildings, currentDarkness, dt);
  if (creEvents.playerAttacked) {
    audio.play('hurt');
  }
  if (creEvents.roarOccurred) {
    audio.play('roar');
  }
  if (creEvents.howlOccurred) {
    audio.play('howl');
  }

  tickFloraRegrowth(SEED, flora, world, dt);

  // ── Troll building damage ────────────────────────────────────────────────────
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c !== undefined && c.species === 'troll' && c.hp > 0) {
      const hit = damageBuildings(buildings, c.gx, c.gy, dt * 0.4);
      if (hit && tickCount % 45 === 0) {
        const d1 = (p1.gx - c.gx) * (p1.gx - c.gx) + (p1.gy - c.gy) * (p1.gy - c.gy);
        const d2 = (p2.gx - c.gx) * (p2.gx - c.gx) + (p2.gy - c.gy) * (p2.gy - c.gy);
        if (d1 < 256 || d2 < 256) {
          audio.play('stomp');
        }
      }
    }
  }

  // ── Remove destroyed buildings in place ────────────────────────────────────────
  let bi = buildings.length;
  while (bi--) {
    const b = buildings[bi];
    if (b !== undefined && b.hp <= 0) buildings.splice(bi, 1);
  }

  // ── Evolution ─────────────────────────────────────────────────────────────────
  tickCount++;
  if (tickCount % GENERATION_TICKS === 0) {
    evolveGeneration(creatures, SEED, world);
  }

  // ── Player regen & respawn ────────────────────────────────────────────────────
  const p1Respawned = tickPlayer(p1, dt);
  const p2Respawned = tickPlayer(p2, dt);
  if (p1Respawned || p2Respawned) {
    audio.play('respawn');
  }

  // ── Autosave every 30 seconds ─────────────────────────────────────────────────
  autosaveTimer += dt;
  if (autosaveTimer >= 30.0) {
    autosaveTimer = 0;
    store.save(extractSaveState(SEED, [p1, p2], buildings, world, flora));
  }
});


// ── DOM Controls Bar Helper ───────────────────────────────────────────────────

function updateDomHud(): void {
  const p1ToolEl = document.getElementById('p1-tool');
  const p2ToolEl = document.getElementById('p2-tool');
  if (p1ToolEl) {
    const m = p1.mode.replace('_', ' ').toUpperCase();
    const w = p1.weapon.toUpperCase();
    p1ToolEl.textContent = `${m} | ⚔️${w} [🪵${p1.inventory.wood} 🪨${p1.inventory.stone} 🌿${p1.inventory.fiber}]`;
  }
  if (p2ToolEl) {
    const m = p2.mode.replace('_', ' ').toUpperCase();
    const w = p2.weapon.toUpperCase();
    p2ToolEl.textContent = `${m} | ⚔️${w} [🪵${p2.inventory.wood} 🪨${p2.inventory.stone} 🌿${p2.inventory.fiber}]`;
  }
}

// ── Render (display rate) ─────────────────────────────────────────────────────

loop.onRender((_alpha, t, nowMs) => {
  input.frame(nowMs);

  // Synchronize camera2 zoom with camera1 zoom
  if (Math.abs(camera2.zoom - camera1.zoom) > 1e-4) {
    camera2.zoomAt(camera1.zoom / camera2.zoom, camera2.viewW / 2, camera2.viewH / 2);
  }

  // Lock camera center to each player's world position
  lockCameraToPlayer(camera1, p1);
  lockCameraToPlayer(camera2, p2);

  // Day/night cycle: `t` is seconds since loop start. One full cycle = 120 s (60s day, 60s night).
  // @tier-b — sin for day/night, visual only, never hashed.
  const cycle    = (t % 120) / 120;
  const daylight = Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5;
  const darkness = clamp((0.55 - daylight) * 1.8, 0, 0.85);
  currentDarkness = darkness;

  // Drive ambient day/night sound bed
  audio.setBedTone(daylight, darkness);

  // Trigger dusk and dawn chime boundaries
  if (prevDaylight >= 0.5 && daylight < 0.5) {
    audio.play('dusk_chime');
  } else if (prevDaylight < 0.5 && daylight >= 0.5) {
    audio.play('dawn_chime');
  }
  prevDaylight = daylight;

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
    projectiles,
    t,
    darkness,
    daylight,
    cycle,
    SEED,
  );
});

// ── UI Actions & Fullscreen ───────────────────────────────────────────────────

function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function createNewWorld(): void {
  if (confirm('Create a brand new world from scratch? (Current progress will be reset)')) {
    store.reset();
    const newSeed = Math.floor(toUnit(hashStep(SEED, Date.now())) * 900000) + 100000;
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(newSeed));
    window.location.href = url.toString();
  }
}

function toggleControls(): void {
  const controlsEl = document.getElementById('controls');
  if (controlsEl) {
    controlsEl.classList.toggle('hidden');
    fit();
  }
}

const btnFullscreen = document.getElementById('btn-fullscreen');
btnFullscreen?.addEventListener('click', toggleFullscreen);

const btnNewWorld = document.getElementById('btn-new-world');
btnNewWorld?.addEventListener('click', createNewWorld);

const btnControlsToggle = document.getElementById('btn-controls-toggle');
btnControlsToggle?.addEventListener('click', toggleControls);

window.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreen();
  } else if (e.key === 'F2') {
    e.preventDefault();
    createNewWorld();
  }
});

document.addEventListener('fullscreenchange', () => {
  fit();
});

// ── Resize ────────────────────────────────────────────────────────────────────

function fit(): void {
  const w = canvasEl.clientWidth || window.innerWidth;
  const h = canvasEl.clientHeight || window.innerHeight;
  resizeCameras(surface, camera1, camera2, w, h);
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
  audio.dispose();
  window.removeEventListener('resize', fit);
}

interface HotModule {
  dispose(cb: () => void): void;
}

const hotMeta = import.meta as unknown as { hot?: HotModule };
if (hotMeta.hot) {
  hotMeta.hot.dispose(dispose);
}

// ── Go! ────────────────────────────────────────────────────────────────────────

loop.start();

