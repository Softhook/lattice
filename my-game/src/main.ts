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
  createCreatureEvents,
  evolveGeneration,
  GENERATION_TICKS,
  SPECIES_REGISTRY,
  relocateClearOfBuildings,
} from './creatures.js';
import {
  placeMissionSites,
  restoreMissions,
  updateMissions,
  createMissionEvents,
} from './missions.js';
import {
  createPlayers,
  movePlayer,
  facingTile,
  buildAtFacing,
  interactAtFacing,
  digAtFacing,
  raiseAtFacing,
  tickPlayer,
  toggleInventory,
  inventoryNav,
  activateInventorySelection,
  getTargetContext,
  resolveWork,
  startWork,
  advanceWork,
  clearWork,
  DIG_WORK_SECONDS,
  RAISE_WORK_SECONDS,
  type Player,
  type InteractType,
  type WorkKind,
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
  type PlayerActionEdges,
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
  createFxPool,
  stepFx,
  spawnHarvestDebris,
  spawnShockwave,
  executeAttack,
  stepProjectiles,
} from './combat.js';
import {
  createFoodPool,
  createFoodEvents,
  updateFoodDrops,
} from './food.js';
import { hex } from '@latticekit/draw';

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
// Hoisted once and reused everywhere: the identity of p1/p2 never changes, only their fields
// do, so `[p1, p2]` re-literalized inside the 60 Hz update or the render loop would allocate
// a fresh array every tick/frame for no reason (rule 7).
const playersPair: readonly [Player, Player] = [p1, p2];
const creatures = populateWorld(SEED, world);

// ── Missions ───────────────────────────────────────────────────────────────────
// Sites are deterministic from SEED, so they're placed unconditionally here; save restore below
// (if any) only overlays each mission's progress state, not its location.
const missions = placeMissionSites(SEED, world);

// ── Dev console helpers (dead-code-eliminated from `npm run build`) ────────────
//
// `import.meta.env.DEV` is Vite's compile-time flag: in `npm run dev` it's `true` and this
// block ships; `vite build` inlines it to `false` and Rollup strips the whole branch, so no
// game internals are ever exposed on `window` in the shipped build.
//
// From the browser console: `verdant.triggerMission()` teleports Player 1 to mission 0's site,
// which fires the same proximity trigger a player walking there would — announcement, tower,
// and monster spawns all play out exactly as in real play, just without the walk.
if (import.meta.env.DEV) {
  (window as unknown as { verdant: unknown }).verdant = {
    missions,
    buildings,
    creatures,
    p1,
    p2,
    triggerMission(index = 0): void {
      const m = missions[index];
      if (m === undefined) {
        console.warn(`verdant.triggerMission: no mission at index ${index} (have ${missions.length})`);
        return;
      }
      p1.gx = m.gx + 1;
      p1.gy = m.gy - 0.05;
      p1.facing = 's';
      console.log(`verdant.triggerMission: moved Player 1 to mission "${m.kind}" at (${m.gx}, ${m.gy})`);
    },
  };
}

// ── Persistent Storage ────────────────────────────────────────────────────────

const store = createVerdantStore(SEED, () => extractSaveState(SEED, playersPair, buildings, world, flora, missions));
const opened = store.open();
if (opened.source === 'save' && opened.state && opened.state.p1 && opened.state.p2) {
  // Restore saved player inventories, positions & combat gear
  const s = opened.state;
  p1.inventory.wood = s.p1.wood;
  p1.inventory.stone = s.p1.stone;
  p1.inventory.fiber = s.p1.fiber;
  p1.hp = s.p1.hp;
  p1.hunger = s.p1.hunger;
  p1.gx = s.p1.gx;
  p1.gy = s.p1.gy;
  p1.weapon = s.p1.weapon;
  p1.craftedWeapons = [...s.p1.craftedWeapons];

  p2.inventory.wood = s.p2.wood;
  p2.inventory.stone = s.p2.stone;
  p2.inventory.fiber = s.p2.fiber;
  p2.hp = s.p2.hp;
  p2.hunger = s.p2.hunger;
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

    // Creatures were populated from SEED alone, above, before these buildings existed — nudge
    // clear any that landed on a tile the player has since built on. See
    // `relocateClearOfBuildings`'s doc comment for why this has to run here rather than at
    // `populateWorld` time.
    if (buildings.length > 0) {
      for (let i = 0; i < creatures.length; i++) {
        const c = creatures[i];
        if (c !== undefined) relocateClearOfBuildings(c, buildings, world);
      }
    }
  }

  // Restore mission progress — must run after the buildings loop above, since it re-links each
  // active mission to its tower by matching kind + position against the buildings just restored.
  if (Array.isArray(s.missions)) {
    restoreMissions(missions, s.missions, buildings);
  }
}

// ── DOM Bottom Inventory Bar Helper ───────────────────────────────────────────

let lastP1W = -1;
let lastP1S = -1;
let lastP1F = -1;
let lastP2W = -1;
let lastP2S = -1;
let lastP2F = -1;

const p1WoodEl = document.getElementById('p1-wood');
const p1StoneEl = document.getElementById('p1-stone');
const p1FiberEl = document.getElementById('p1-fiber');
const p2WoodEl = document.getElementById('p2-wood');
const p2StoneEl = document.getElementById('p2-stone');
const p2FiberEl = document.getElementById('p2-fiber');

function updateDomHud(): void {
  if (p1.inventory.wood !== lastP1W && p1WoodEl) {
    lastP1W = p1.inventory.wood;
    p1WoodEl.textContent = String(lastP1W);
  }
  if (p1.inventory.stone !== lastP1S && p1StoneEl) {
    lastP1S = p1.inventory.stone;
    p1StoneEl.textContent = String(lastP1S);
  }
  if (p1.inventory.fiber !== lastP1F && p1FiberEl) {
    lastP1F = p1.inventory.fiber;
    p1FiberEl.textContent = String(lastP1F);
  }
  if (p2.inventory.wood !== lastP2W && p2WoodEl) {
    lastP2W = p2.inventory.wood;
    p2WoodEl.textContent = String(lastP2W);
  }
  if (p2.inventory.stone !== lastP2S && p2StoneEl) {
    lastP2S = p2.inventory.stone;
    p2StoneEl.textContent = String(lastP2S);
  }
  if (p2.inventory.fiber !== lastP2F && p2FiberEl) {
    lastP2F = p2.inventory.fiber;
    p2FiberEl.textContent = String(lastP2F);
  }
}

updateDomHud();

// ── Camera Locking ────────────────────────────────────────────────────────────

function lockCameraToPlayer(camera: Camera, player: typeof p1): void {
  const pgx = player.gx;
  const pgy = player.gy;
  const pzPx = heightAt(world.field, pgx, pgy) + player.elevationPx;
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
  // Catch-up ceiling. The default (250 ms) lets a single long frame — a GC pause, a tab
  // refocus, or the sim itself briefly going over budget with ~1200 creatures alive — queue
  // up to ~15 fixed steps that then all run in the *next* pump before one paint. Every
  // creature advances fifteen ticks of movement, animation, and AI between two frames at
  // once: the "all the animals lurch together for a second" glitch. Worse, running 15 heavy
  // steps in one pump overruns the next frame too, so it feeds itself for about a second.
  // Capping at 3 steps turns any hitch into an imperceptible hiccup (the lost time is just
  // dropped — this is a real-time sandbox with no score to desync) and makes the recovery
  // pump cheap enough that it can't spiral.
  maxCatchUpMs: 50,
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
let autosaveCount = 0;
let prevDaylight = 1.0;
const projectiles = createProjectilePool();
const fxPool = createFxPool();
const foodPool = createFoodPool();
const creatureEvents = createCreatureEvents();
const missionEvents = createMissionEvents();
const foodEvents = createFoodEvents();

/** Debris tint spawned at the target tile for each harvest/repair interaction type. */
const INTERACT_DEBRIS_COLOR: Partial<Record<InteractType, number>> = {
  chop:   0x8a6040ff,
  mine:   0x95a5a6ff,
  forage: 0x2ecc71ff,
  repair: 0xf39c12ff,
};

/**
 * Resolve a sustained action that just finished its `workRequired` seconds — called from
 * `runPlayerActions` on the tick `advanceWork` returns true. Reaching this at all means the player
 * stood still for the whole channel (any movement key would have abandoned it early — see
 * `movePlayer`'s `workKind` guard in `players.ts`), so `facingTile(player)` is still the exact
 * tile the channel started on; each underlying instant-resolution function re-derives its own
 * target from that, same as it always has.
 */
function resolveCompletedWork(player: Player, kind: WorkKind): void {
  if (kind === 'build') {
    const placed = buildAtFacing(player, world, buildings);
    if (placed !== undefined) {
      buildings.push(placed);
      audio.play(placed.kind === 'campfire' ? 'ignite' : 'build');
    } else {
      audio.play('deny');
    }
    return;
  }

  if (kind === 'dig' || kind === 'raise') {
    const targetTile = facingTile(player);
    const changed = kind === 'dig' ? digAtFacing(player, world) : raiseAtFacing(player, world);
    if (changed) {
      audio.play(kind);
      const targetBaseH = heightAt(world.field, targetTile.gx, targetTile.gy);
      spawnHarvestDebris(fxPool, targetTile.gx + 0.5, targetTile.gy + 0.5, targetBaseH, kind === 'dig' ? 0x795548ff : 0x8d6e63ff);
      input.setTerrain({ field: world.field, maxHeightPx: world.currentMaxHeightPx });
    } else {
      audio.play('deny');
    }
    return;
  }

  // chop / mine / forage / repair / stoke
  const targetTile = facingTile(player);
  const targetBaseH = heightAt(world.field, targetTile.gx, targetTile.gy);
  const interact = interactAtFacing(player, world, flora, buildings);
  if (interact.type !== 'none') {
    audio.play(interact.type);
    const debrisColor = INTERACT_DEBRIS_COLOR[interact.type];
    if (debrisColor !== undefined) {
      spawnHarvestDebris(fxPool, targetTile.gx + 0.5, targetTile.gy + 0.5, targetBaseH, debrisColor);
    }
  } else {
    audio.play('deny');
  }
}

/**
 * Run one player's action edges for this tick: Inventory toggle/nav/select when it's open,
 * otherwise continue any in-progress sustained action, or start one (place-armed-building,
 * harvest/mine/forage/stoke/repair, dig, raise) — or fall through to a combat swing. One
 * implementation for both players — see the `PlayerActionEdges` note in `input.ts`.
 *
 * Harvesting, mining, repairing, stoking, building, and terraforming are all sustained actions
 * now: a single press commits the player (`startWork`) and it plays out on its own over
 * `workRequired` seconds (`advanceWork`, called unconditionally below) — no need to hold or
 * repeat the key. Combat stays an instant rising-edge press — winding up a sword swing would kill
 * the game's feel — so a creature target (or nothing at all) still fires `executeAttack` at once.
 */
function runPlayerActions(player: Player, e: PlayerActionEdges, dt: number): void {
  if (e.invToggle) {
    // A same-tick toggle wins outright — pressing Space in the same 16 ms frame as C/V should
    // never also open-and-immediately-select or close-and-immediately-act.
    toggleInventory(player);
    audio.play('click');
    clearWork(player);
    return;
  }

  if (player.invOpen) {
    if (e.navUp)    inventoryNav(player, 0, -1);
    if (e.navDown)  inventoryNav(player, 0, 1);
    if (e.navLeft)  inventoryNav(player, -1, 0);
    if (e.navRight) inventoryNav(player, 1, 0);
    if (e.attack) {
      const res = activateInventorySelection(player);
      audio.play(res.ok ? (res.action === 'craft' ? 'craft' : 'click') : 'deny');
    }
    return;
  }

  if (player.respawnTimer > 0) {
    clearWork(player);
    return;
  }

  if (player.workKind !== 'none') {
    // Already channeling: keep it running on its own. Read the kind before `advanceWork` resets
    // it back to 'none' on the completing tick.
    const completingKind = player.workKind;
    if (advanceWork(player, dt)) {
      resolveCompletedWork(player, completingKind);
    }
    return;
  }

  // Idle: a fresh press starts a sustained action, or (when there's nothing to work) fires an
  // instant combat swing.
  if (e.attack) {
    const target = getTargetContext(player, world, flora, creatures, buildings);
    const work = resolveWork(player, target, flora, buildings);
    if (work.kind !== 'none') {
      startWork(player, work.kind, target.gx, target.gy, work.seconds);
    } else if (player.attackCooldown <= 0) {
      const baseH = heightAt(world.field, player.gx, player.gy) + player.elevationPx;
      const res = executeAttack(player, creatures, projectiles, baseH, fxPool, buildings, foodPool);
      audio.play(res.isRanged ? 'bow_shoot' : res.hit ? 'hit_meat' : 'attack');
    }
    return;
  }

  if (e.dig) {
    const targetTile = facingTile(player);
    startWork(player, 'dig', targetTile.gx, targetTile.gy, DIG_WORK_SECONDS);
    return;
  }

  if (e.raise) {
    const targetTile = facingTile(player);
    startWork(player, 'raise', targetTile.gx, targetTile.gy, RAISE_WORK_SECONDS);
  }
}

loop.onUpdate((dt, tick) => {
  input.tick(tick);

  const curr = keyState.held;
  pollActions(prevKeys, curr, edges);

  // ── Player movement ───────────────────────────────────────────────────────────
  // Movement keys double as Inventory-overlay navigation while it's open, so the player stands
  // still (rather than walking off) instead of actually moving — see the p*Nav* edges below.
  pollP1Movement(curr, moveVec1);
  if (p1.invOpen) { moveVec1.dx = 0; moveVec1.dy = 0; }
  const p1Stepped = movePlayer(p1, moveVec1.dx, moveVec1.dy, world, buildings, dt);
  let p2Stepped = false;
  if (p2.active) {
    pollP2Movement(curr, moveVec2);
    if (p2.invOpen) { moveVec2.dx = 0; moveVec2.dy = 0; }
    p2Stepped = movePlayer(p2, moveVec2.dx, moveVec2.dy, world, buildings, dt);
  }
  if (p1Stepped || p2Stepped) {
    audio.play('step');
  }

  // ── Player Actions ────────────────────────────────────────────────────────────
  // Player 2 is skipped entirely while hidden — frozen where they stood until brought back.
  runPlayerActions(p1, edges.p[0], dt);
  if (p2.active) {
    runPlayerActions(p2, edges.p[1], dt);
  }

  // Snapshot held keys without heap allocations
  copyKeys(curr, prevKeys);

  // ── Projectile kinematics & collision ────────────────────────────────────────
  const projHits = stepProjectiles(projectiles, creatures, playersPair, world, dt, fxPool, buildings, foodPool);
  if (projHits.length > 0) {
    audio.play('hit_meat');
  }

  // ── Combat and interaction FX particle simulation ───────────────────────────
  stepFx(fxPool, dt);

  // ── Food drops: rot timers, bob, and player pickup (refills the hunger bar) ──
  updateFoodDrops(foodPool, playersPair, dt, foodEvents);
  if (foodEvents.pickedUp) {
    audio.play('forage');
  }

  // ── Creature & Flora Ecosystem ───────────────────────────────────────────────
  updateCreatures(creatures, world, playersPair, flora, buildings, currentDarkness, dt, creatureEvents);
  if (creatureEvents.playerAttacked) {
    audio.play('hurt');
  }
  if (creatureEvents.roarOccurred) {
    audio.play('roar');
  }
  if (creatureEvents.howlOccurred) {
    audio.play('howl');
  }

  tickFloraRegrowth(SEED, flora, world, dt);

  // ── Missions ──────────────────────────────────────────────────────────────────
  updateMissions(missions, playersPair, creatures, buildings, world, SEED, dt, missionEvents);
  if (missionEvents.announced !== undefined) {
    audio.play('mission_alert');
  }
  if (missionEvents.completed !== undefined) {
    audio.play('mission_complete');
  }

  // ── Building-siege damage (trolls, mission-conjured monsters) ──────────────────
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (c !== undefined && c.hp > 0 && SPECIES_REGISTRY[c.species].attacksBuildings) {
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

  // ── Campfire Burn Duration Decay ─────────────────────────────────────────────
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b !== undefined && b.kind === 'campfire' && b.hp > 0) {
      // Campfire consumes 1.0 fuel per second (~120s base burn duration)
      b.hp -= dt;
      if (b.hp <= 0) b.hp = 0;
    }
  }

  // ── Remove destroyed / extinguished buildings in place ─────────────────────────
  // A building that's actually knocked down (as opposed to a campfire quietly running out of
  // fuel) gets a debris burst and a thud — without it, a wall reduced to 0 hp by a siege just
  // vanishes on the tick it happens, and the very next frame a monster walks across that empty
  // tile. Silent removal reads exactly like the monster walked *through* a still-standing wall.
  let bi = buildings.length;
  let anyCollapsed = false;
  while (bi--) {
    const b = buildings[bi];
    if (b !== undefined && b.hp <= 0) {
      if (b.kind !== 'campfire') {
        const cx = b.gx + b.w * 0.5;
        const cy = b.gy + b.d * 0.5;
        spawnShockwave(fxPool, cx, cy, b.basePx, hex('#8d7a68'), 1.6 + b.w * 0.4);
        spawnHarvestDebris(fxPool, cx, cy, b.basePx + 8, hex('#6b6558'), 10);
        anyCollapsed = true;
      }
      buildings.splice(bi, 1);
    }
  }
  if (anyCollapsed) {
    audio.play('collapse');
  }

  // ── Evolution ─────────────────────────────────────────────────────────────────
  tickCount++;
  if (tickCount % GENERATION_TICKS === 0) {
    evolveGeneration(creatures, SEED, world, buildings);
  }

  // ── Player regen & respawn ────────────────────────────────────────────────────
  const p1Respawned = tickPlayer(p1, dt);
  const p2Respawned = p2.active && tickPlayer(p2, dt);
  if (p1Respawned || p2Respawned) {
    audio.play('respawn');
  }

  // ── Autosave ─────────────────────────────────────────────────────────────────
  // The periodic write skips the flora array — ~14k plants that dominate the payload, cost a
  // ~1 MB synchronous `localStorage` write plus the store's checksum round-trip, and are the
  // least consequential thing to lose (flora regenerates deterministically from the seed).
  // Player-meaningful state (inventory, buildings, terraform, missions, hp/hunger) goes out
  // every 30 s; the full snapshot including flora goes out every ~4 min and on `pagehide`
  // (see `flushFullSave`). The write is also deferred off a generation boundary so an
  // `evolveGeneration` tick and a save tick never stack into one visible hitch.
  autosaveTimer += dt;
  if (autosaveTimer >= 30.0 && tickCount % GENERATION_TICKS !== 0) {
    autosaveTimer = 0;
    autosaveCount++;
    const withFlora = autosaveCount % 8 === 0;
    store.save(extractSaveState(SEED, playersPair, buildings, world, withFlora ? flora : undefined, missions));
  }

  // Refreshes the DOM resource counters — cheap no-op when nothing changed (it diffs internally),
  // so one unconditional call here is simpler and less error-prone than one after every mutation.
  updateDomHud();
});

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
    playersPair,
    buildings,
    projectiles,
    missions,
    t,
    darkness,
    daylight,
    cycle,
    SEED,
    fxPool,
    foodPool,
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

/**
 * Toggle single-player view: hides Player 2 (frozen in place, keeping position/inventory/gear)
 * and lets Player 1's camera fill the screen, or brings Player 2 back into the split view.
 */
function setSinglePlayerView(hidePlayer2: boolean): void {
  if (p2.active === !hidePlayer2) return;
  p2.active = !hidePlayer2;
  document.getElementById('inventory-bar')?.classList.toggle('single-player', hidePlayer2);
  fit();
}

const btnFullscreen = document.getElementById('btn-fullscreen');
btnFullscreen?.addEventListener('click', toggleFullscreen);

const btnNewWorld = document.getElementById('btn-new-world');
btnNewWorld?.addEventListener('click', createNewWorld);

window.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreen();
  } else if (e.key === 'F2') {
    e.preventDefault();
    createNewWorld();
  } else if (e.code === 'Digit1') {
    e.preventDefault();
    setSinglePlayerView(true);
  } else if (e.code === 'Digit2') {
    e.preventDefault();
    setSinglePlayerView(false);
  }
});

document.addEventListener('fullscreenchange', () => {
  fit();
});

// ── Full save on the way out ─────────────────────────────────────────────────
// The periodic autosave skips flora for cost; this is where the complete snapshot (flora
// included) actually gets written — when the tab is hidden or closed, which is both the last
// safe moment and a frame the player isn't watching, so a one-off ~1 MB write is invisible.
let fullSavePending = true;
function flushFullSave(): void {
  if (!fullSavePending) return;
  fullSavePending = false;
  store.save(extractSaveState(SEED, playersPair, buildings, world, flora, missions));
}
window.addEventListener('pagehide', flushFullSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushFullSave();
  else fullSavePending = true;
});

// ── Resize ────────────────────────────────────────────────────────────────────

function fit(): void {
  const w = canvasEl?.clientWidth || window.innerWidth;
  const h = canvasEl?.clientHeight || window.innerHeight;
  resizeCameras(surface, camera1, camera2, w, h, !p2.active);
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

