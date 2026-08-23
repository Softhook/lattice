/**
 * **`@browser-only`** — the boot, the camera, the seven passes, and the two lines that make a
 * punch feel like a punch.
 *
 * Everything in this file is wiring except the camera, and the camera is the game.
 *
 * ## The frame, in order
 *
 * | pass | what, and why it is there and not somewhere else |
 * |---|---|
 * | backdrop | one ramp. The sea is not tiles; see `art/sea.ts` |
 * | terrain | swell, then land, then everything floating — so foam is under every hull, for free |
 * | solids | **two forward walks** of one sorted order: bodies, then fire. Never a partition |
 * | placement | shot and smoke: above the world, below the night |
 * | *light* | not a callback. `renderFrame` composites here and a game cannot move it |
 * | overlay | empty — the HUD is DOM |
 * | effects | embers and the white flash, above the night, because a spark is the night's exception |
 *
 * ## The camera
 *
 * It leads the boat rather than following her, shakes on a seeded noise field, and punches its
 * zoom on a kill. All three are one number each and all three are deterministic. The shake is
 * `noise2(seed, t·38)` and not a random walk, because a smooth field gives a *shudder* where
 * white noise gives a buzz — and because `t` is the loop's clock, the same seed shakes the same
 * way on every replay of the same run.
 *
 * **Shake that never stops reads as a broken camera.** The magnitude decays by a fixed factor
 * per tick and is clamped, so the frame is genuinely still between events. That restraint is the
 * whole of whether "intense" lands.
 */

import { clamp, clamp01, createRng, createScope, noise2 } from '@latticekit/core';
import {
  DepthSorter, HALF_H, HALF_W, TILE_H, TILE_W, createCamera, rectFromSize,
  type Camera, type Rect,
} from '@latticekit/iso';
import {
  beginFrame, createCanvas2dSurface, createLightField, endFrame, renderFrame, wash, withAlpha,
  type Passes, type Pen,
} from '@latticekit/draw';
import { createInput, type ActionMap } from '@latticekit/input';
import { drive } from '@latticekit/ui';
import { browserFrames, createLoop } from '@latticekit/loop';
import { MAP, MAX_HEIGHT_PX, createWorld, type World } from './world.js';
import { Phase, createGame, stepGame, type Game, type SoundEvent } from './game.js';
import { emberwakePalette } from './art/palette.js';
import { drawBackdrop, drawSwell, drawWaterMotes } from './art/sea.js';
import { drawLand } from './art/land.js';
import {
  fireOf, paintBattery, paintBearings, paintBoat, paintDarkMotes, paintEmbers, paintFlame,
  paintProp, paintShell,
} from './art/things.js';
import { sx, sy } from './art/space.js';
import { bindMute, createHud } from './hud.js';
import { createSound } from './sound.js';

// ── the page ───────────────────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search);
const seedText = params.get('seed') ?? 'emberwake';
const scope = createScope();

const host = document.getElementById('app') ?? document.body;
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;touch-action:none';
host.appendChild(canvas);

/**
 * `?dpr=N` pins the device pixel ratio.
 *
 * Not a knob for players — it is the only way to measure the retina case honestly, because a
 * headless Chrome renders at a device scale factor of 1 and a laptop renders at 2, and the light
 * field is priced by **buffer area**, so the second machine pays four times what the first one
 * measured. A performance claim taken at ratio 1 and quoted without one is a claim about a
 * machine nobody has.
 */
const dpr = Number(params.get('dpr') ?? '0');
const surface = createCanvas2dSurface(canvas, dpr > 0 ? { pixelRatio: dpr } : {});
const palette = emberwakePalette();
/**
 * The night.
 *
 * `scale` at 0.42 rather than the default 0.5, and that is the single most important performance
 * decision in the game: the light buffer is priced by **area**, so the pool cost scales with the
 * square of both the resolution and the camera's zoom. At 0.42 the buffers are 70% of the default
 * area for a difference nobody can point at in a scene whose light is all soft firelight anyway.
 *
 * `falloff` is exactly 1 on purpose. The kit's plateau is a hard ring at every value but 1 — a
 * pool at 2.6 has a visible seam where the plateau ends — and a fire wants a pure linear ramp
 * regardless. Filed; here it costs nothing because 1 is the value the art wanted.
 */
const light = createLightField(surface, { scale: 0.42, falloff: 2.4, bloom: 0.2 });

/** How dark the night is before any fire. Not 1: a raid you cannot navigate is not a raid, and
 *  the sea has to keep enough tone for the swell to read between the islands. */
const NIGHT_DEPTH = 0.6;

// ── the camera ─────────────────────────────────────────────────────────────────────────────

/** Where the run sits. Wide enough that the clamp never fights the follow, and `keepVisible: 0`
 *  because there is nothing outside the map worth protecting the player from — this is open sea
 *  and the boat cannot leave it anyway. `Camera` has no way to say "no bounds"; this is the
 *  nearest sayable thing, and the gap is filed. */
const REACH: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
rectFromSize(REACH, -MAP * TILE_W * 0.5, -MAX_HEIGHT_PX, MAP * TILE_W, MAP * TILE_H + MAX_HEIGHT_PX * 2);

/** The zoom the game sits at. Close enough that a hull reads and far enough that a shell's whole
 *  arc fits in the frame — which is the constraint that actually chose it. */
const BASE_ZOOM = Number(params.get('zoom') ?? '1.05') || 1.05;

const camera: Camera = createCamera(Math.max(1, innerWidth), Math.max(1, innerHeight), {
  zoom: BASE_ZOOM, minZoom: 0.5, maxZoom: 2.2, keepVisible: 0, bounds: REACH,
});

// ── input ──────────────────────────────────────────────────────────────────────────────────

/** Six actions, and every one of them is bound twice so that arrows and WASD both work without
 *  the game knowing which a player chose. */
const ACTIONS = {
  ahead: ['key:KeyW', 'key:ArrowUp'],
  astern: ['key:KeyS', 'key:ArrowDown'],
  port: ['key:KeyA', 'key:ArrowLeft'],
  starboard: ['key:KeyD', 'key:ArrowRight'],
  fire: ['tap', 'key:Space'],
  mute: ['key:KeyM'],
} as const satisfies ActionMap<'ahead' | 'astern' | 'port' | 'starboard' | 'fire' | 'mute'>;

// ── the loop ───────────────────────────────────────────────────────────────────────────────

/**
 * The host clock.
 *
 * The one place in this game that reads a wall clock, and it exists because `@latticekit/loop`
 * takes a `Clock` and the kit ships no browser one — every game in the repository writes this
 * same line. Filed as a kit finding. Nothing downstream of it reads a clock: `loop` hands the
 * time to `update` and to `render`, and everything else takes it as a parameter.
 */
const loop = createLoop({ clock: { now: () => performance.now() }, frames: browserFrames() });

const input = createInput({
  element: canvas,
  camera,
  step: loop,
  actions: ACTIONS,
  // Declared flat and meant: the pointer is an *aim*, resolved on the sea, and the sea is a
  // plane at z = 0. Saying nothing here would earn a `flat-ground-pick` diagnostic on the first
  // click of every session, and saying `{ field }` would resolve the pointer onto a hillside —
  // which is wrong, because you are shooting at the water in front of the hillside.
  terrain: 'flat',
  // The player drives a boat, not a camera. Every gesture still arrives; nothing pans.
  control: false,
  onDiagnostic: (d) => console.warn(d.message),
});

const sound = createSound();

/**
 * The clock the HUD is on: the loop's own render time, caught on the way past.
 *
 * `@latticekit/ui`'s overlay requires the *same* clock `loop` was given and `loop` does not hand
 * its clock back, so a game either reads a second one — two clocks in one HUD, which is the bug
 * `createOverlay.now`'s own documentation names — or catches the value the loop already passes
 * to `render`. This is the catching. Filed.
 */
let nowMs = 0;
let hud = createHud(() => nowMs);
bindMute(hud, () => sound.toggleMute());
scope.add(drive(hud.overlay, loop));

// ── a run ──────────────────────────────────────────────────────────────────────────────────

/** Camera state that outlives a run: where it is looking, how hard it is shaking, and how far
 *  the zoom has been punched off its rest value. */
let camX = 0;
let camY = 0;
let shake = 0;
let punchZoom = 0;
let shakeSeed = 1;

/** Whether the end card has been shown for this run. Declared before the first `start()` call:
 *  a `let` read inside a hoisted function that runs during initialization is a temporal dead zone
 *  error, and it costs a whole boot. */
let ended = false;
let world: World = createWorld(createRng(seedText));
let game: Game = start(world);

/**
 * `?ablaze=N` — open with `N` fires already going on the nearest island.
 *
 * Not a cheat and not a debug hatch: it is how the site's card and the trailer show what the
 * game *is* in one still frame, and how a change to the fire art is reviewed without playing two
 * minutes first. It only lights things; the run is otherwise identical, and the seeded spread
 * from those ignitions is as deterministic as any other.
 */
const ablaze = Number(params.get('ablaze') ?? '0');
if (ablaze > 0) {
  let lit = 0;
  for (const p of world.props) {
    if (lit >= ablaze) break;
    p.heat = 1.2;
    p.state = 1;
    lit++;
  }
}

/** Hooks, built once and shared by every run — they close over `sound` and the camera state
 *  rather than over the game, so a restart does not have to rebuild them. */
function start(w: World): Game {
  const rng = createRng(`${seedText}:run`);
  shakeSeed = rng.nextUint32();
  const made = createGame(w, rng, {
    sound: (name: SoundEvent, gx, gy, force) => sound.at(name, gx, gy, force, camera),
    punch: (mag, stopTicks, zoom) => {
      // Take the *larger* of the two shakes rather than adding them: two events in one tick
      // should not sum into a shake nobody asked for, and the loudest thing in a moment is what
      // a player thinks they felt.
      if (mag > shake) shake = mag;
      if (stopTicks > 0) made.stop = Math.max(made.stop, stopTicks);
      punchZoom += zoom;
    },
  });
  camX = (made.player.x - made.player.y) * HALF_W;
  camY = (made.player.x + made.player.y) * HALF_H;
  // Every piece of camera state, not just the position: a run restarted mid-shake opens on a
  // shaking camera with nothing to explain it, and a run restarted mid-punch opens at the wrong
  // zoom. Both are one line and both were wrong in the first build.
  shake = 0;
  punchZoom = 0;
  ended = false;
  return made;
}

/**
 * Restart on the same archipelago, or on the next one.
 *
 * Two buttons, because losing on a map you have learned is a different feeling from losing on one
 * you have not — and because "same seed, same world" is a claim this game can demonstrate rather
 * than assert: SAIL AGAIN regenerates from the identical seed and produces the identical coast.
 */
let runs = 0;
function again(sameWorld: boolean): void {
  runs++;
  world = createWorld(createRng(sameWorld ? seedText : `${seedText}:${String(runs)}`));
  game = start(world);
  hud.destroy();
  hud = createHud(() => nowMs);
  bindMute(hud, () => sound.toggleMute());
  scope.add(drive(hud.overlay, loop));
}

// ── the fixed step ─────────────────────────────────────────────────────────────────────────

/** Scratch for the pointer, reused. */
const pointer = { x: 0, y: 0 };

loop.onUpdate((dt, tick) => {
  input.tick(tick);

  // Read the helm. `held` answers for a whole action rather than for a key, so the two bindings
  // on each control are one question here.
  game.throttle = (input.held('ahead') ? 1 : 0) + (input.held('astern') ? -1 : 0);
  game.rudder = (input.held('port') ? -1 : 0) + (input.held('starboard') ? 1 : 0);
  game.firing = input.held('fire');

  if (input.pointerScreen(pointer)) {
    // Screen → world → grid, on the sea plane. Two divisions, and they are the inverse of the
    // projection every draw call in the game runs forward.
    const wx = camera.toWorldX(pointer.x);
    const wy = camera.toWorldY(pointer.y);
    game.aimX = wy / TILE_H + wx / TILE_W;
    game.aimY = wy / TILE_H - wx / TILE_W;
  }

  stepGame(game, dt);

  // The camera leads the boat by about a third of a second of her own velocity, which is what
  // puts the thing she is about to hit on screen before she hits it. Chasing her position alone
  // reads as lag no matter how fast the follow is.
  const p = game.player;
  const leadX = p.x + p.vx * 0.72;
  const leadY = p.y + p.vy * 0.72;
  camX += ((leadX - leadY) * HALF_W - camX) * 0.11;
  camY += ((leadX + leadY) * HALF_H - camY) * 0.11;

  // Both decays are per **tick** multipliers, not `exp(-λ·dt)`, so the whole camera stays Tier A
  // and a replay lands on the same pixel.
  shake *= 0.86;
  if (shake < 0.05) shake = 0;
  punchZoom *= 0.9;
  if (punchZoom < 0.001) punchZoom = 0;

  sound.drive(clamp01(0.35 + game.heat * 0.65), game.heat);

  if (game.phase !== Phase.Playing && !ended) {
    ended = true;
    hud.finish(game, () => again(true), () => again(false));
  }
});

// ── the frame ──────────────────────────────────────────────────────────────────────────────

/**
 * The parallel table beside the depth sorter.
 *
 * `DepthSorter.add` hands back an insertion index and deliberately does not know what a drawable
 * is, so a game with three kinds of drawable has to keep its own `index → thing` map — and the
 * kit's own docs say the failure mode is a tap that opens the building behind the one under the
 * finger. `examples/_shared` has a `createBucket` for exactly this and it is not in any package,
 * so the flagship game reimplements it in fifteen lines. Filed.
 */
const SLOTS = 1024;
const slotKind = new Uint8Array(SLOTS);
const slotRef = new Int32Array(SLOTS);
/** What a slot holds. */
const PROP = 0;
const RAIDER = 1;
const BATTERY = 2;
const PLAYER = 3;

function fill(order: DepthSorter): void {
  order.clear();
  const w = game.world;
  for (let i = 0; i < w.props.length; i++) {
    const p = w.props[i];
    if (p === undefined) continue;
    const slot = order.add(p.gx - p.size * 0.5, p.gy - p.size * 0.5, p.size, p.size, p.zPx + 90);
    if (slot >= SLOTS) continue;
    slotKind[slot] = PROP;
    slotRef[slot] = i;
  }
  for (let i = 0; i < w.batteries.length; i++) {
    const b = w.batteries[i];
    if (b === undefined) continue;
    const slot = order.add(b.gx - 0.8, b.gy - 0.8, 1.6, 1.6, b.zPx + 40);
    if (slot >= SLOTS) continue;
    slotKind[slot] = BATTERY;
    slotRef[slot] = i;
  }
  for (let i = 0; i < game.raiders.length; i++) {
    const b = game.raiders[i];
    if (b === undefined || !b.live) continue;
    const slot = order.add(b.x - 1.2, b.y - 1.2, 2.4, 2.4, 60);
    if (slot >= SLOTS) continue;
    slotKind[slot] = RAIDER;
    slotRef[slot] = i;
  }
  if (game.player.live) {
    const p = game.player;
    const slot = order.add(p.x - 1.4, p.y - 1.4, 2.8, 2.8, 70);
    if (slot < SLOTS) {
      slotKind[slot] = PLAYER;
      slotRef[slot] = 0;
    }
  }
}

/** Cap on light pools per frame. The field is priced by pool **area**, so a burning island at
 *  a punched-in zoom is the worst case in the game; past about thirty pools the composite starts
 *  costing more than everything else put together and the thirty-first is indistinguishable. */
const MAX_POOLS = 30;

/** Post the frame's light. Called after `light.begin` and before `renderFrame`, which is the one
 *  window in which pools may be added. */
function postLight(): void {
  let pools = 0;
  const w = game.world;
  for (const p of w.props) {
    if (pools >= MAX_POOLS) break;
    const f = fireOf(p);
    if (f <= 0.04) continue;
    // The pool is the same `f` the flame is drawn at, so what the scene is lit by and what it
    // looks like cannot drift.
    light.add(p.gx, p.gy, p.zPx, 1.3 + p.size * 1.35 * f, 0.3 + f * 0.4, 'flame');
    pools++;
  }
  const p = game.player;
  if (p.live) {
    light.add(p.x, p.y, 0, 2.6, 0.26, 'lamp');
    if (p.muzzle > 0) light.add(p.x, p.y, 0, 9, 0.95, 'fcore');
  }
  for (const b of game.raiders) {
    if (!b.live) continue;
    if (b.fire > 0.05) light.add(b.x, b.y, 0, 2.5 + b.fire * 3, 0.4 + b.fire * 0.4, 'flame');
    else if (b.muzzle > 0) light.add(b.x, b.y, 0, 7, 0.8, 'fcore');
  }
  for (const s of game.shells) {
    if (!s.live) continue;
    light.add(s.x, s.y, 0, 1.8, 0.26, s.team === 0 ? 'ember' : 'rlamp');
  }
  // The magazine. One pool, enormous, for a fifth of a second, and it is the only time the whole
  // frame is lit at once.
  if (game.flashAge < 0.45) {
    const f = 1 - game.flashAge / 0.45;
    light.add(game.flashX, game.flashY, 0, 26 * f, f, 'fcore');
  }
}

const passes: Passes = {
  backdrop: (pen, visible) => drawBackdrop(pen, visible, game.heat),
  maxHeightPx: MAX_HEIGHT_PX,
  terrain: (pen, visible) => {
    drawSwell(pen, visible, 0x51ab);
    drawLand(pen, game.world, visible, 0x51ab);
    drawWaterMotes(pen, game);
  },
  solids: (pen, order) => {
    const w = game.world;
    // Walk one: bodies. Forward, in the order `iso` produced, and nothing here reorders it.
    for (let i = 0; i < order.count; i++) {
      const slot = order.indexAt(i);
      const ref = slotRef[slot] ?? 0;
      switch (slotKind[slot]) {
        case PROP: {
          const p = w.props[ref];
          if (p !== undefined) paintProp(pen, p, w);
          break;
        }
        case BATTERY: {
          const b = w.batteries[ref];
          if (b !== undefined) paintBattery(pen, b, pen.t);
          break;
        }
        case RAIDER: {
          const b = game.raiders[ref];
          if (b !== undefined) paintBoat(pen, b, false, 0, 0);
          break;
        }
        default:
          paintBoat(pen, game.player, true, game.aimX, game.aimY);
          break;
      }
    }
    // Walk two: fire. **A second forward walk, never a partition** — the kit's own layering
    // header names the partitioned version as the bug, because a stable partition of a sorted
    // order is still a reorder and `pickSorted` walks the same instance backwards.
    for (let i = 0; i < order.count; i++) {
      const slot = order.indexAt(i);
      if (slotKind[slot] !== PROP) continue;
      const p = w.props[slotRef[slot] ?? 0];
      if (p === undefined) continue;
      const f = fireOf(p);
      if (f <= 0.02) continue;
      paintFlame(pen, sx(pen, p.gx, p.gy), sy(pen, p.gx, p.gy, p.zPx), p.size, f,
        p.seed * 104729, w.windX - w.windY, -(w.windX + w.windY) * 0.5);
    }
  },
  placement: (pen) => {
    for (const s of game.shells) if (s.live) paintShell(pen, s, game.world);
    paintDarkMotes(pen, game);
  },
  effects: (pen) => {
    paintEmbers(pen, game);
    if (game.phase === Phase.Playing) paintBearings(pen, game.world, camera);
    // The white flash. Fifteen hundredths of a second, and it is the reason a magazine feels
    // like a magazine rather than like a large fire.
    if (game.flashAge < 0.16) {
      wash(pen, withAlpha(pen.palette.get('fcore'), (1 - game.flashAge / 0.16) * 0.6));
    }
    // Damage is a **vignette, not a wash**. A full-screen red at any alpha you can see tints the
    // sea, the islands and the boat together, and the frame stops being a night and becomes a
    // photograph with a filter on it — which is exactly what the first build did, at 0.22, and it
    // made the whole game look purple. One `softEllipse` with a transparent middle costs the same
    // call and leaves the middle of the frame alone, which is where the player is looking.
    if (game.player.hurt > 0.02) {
      const red = pen.palette.get('bad');
      const w = pen.surface.width;
      const h = pen.surface.height;
      pen.surface.softEllipse(w * 0.5, h * 0.5, w * 0.78, h * 0.86,
        withAlpha(red, 0), withAlpha(red, game.player.hurt * 0.34));
    }
  },
};

const order = new DepthSorter(SLOTS);

loop.onRender((_alpha, time, ms) => {
  nowMs = ms;
  input.frame(ms);

  // Shake. Two samples of one smooth field at different offsets, so the two axes move together
  // the way a knocked camera does rather than independently the way noise does.
  const jitterX = noise2(shakeSeed, time * 41, 0) * shake;
  const jitterY = noise2(shakeSeed, time * 41, 17) * shake * 0.6;
  camera.centerOn(camX + jitterX, camY + jitterY);

  // Zoom. `Camera.zoom` is read-only and moves only through `zoomAt`, which takes a *factor* and
  // an anchor — so a game that wants to set a zoom has to divide by the zoom it already has, and
  // has to keep its own copy of the value it is aiming at. Filed; the division is here.
  const want = BASE_ZOOM * (1 + punchZoom);
  if (Math.abs(want - camera.zoom) > 0.0005) {
    camera.zoomAt(want / camera.zoom, camera.viewW * 0.5, camera.viewH * 0.5);
  }

  const pen: Pen = beginFrame({ surface, camera, palette, t: time, light, snap: true });
  light.begin(pen, clamp(NIGHT_DEPTH - game.heat * 0.08, 0.3, 0.9), 'night');
  postLight();
  fill(order);
  renderFrame(pen, passes, order);
  endFrame(pen);

  hud.update(game, loop.stats.worstGapMs, loop.stats.cadenceMs);
});

// ── the window ─────────────────────────────────────────────────────────────────────────────

function fit(): void {
  const w = Math.max(1, innerWidth);
  const h = Math.max(1, innerHeight);
  // `surface.pixelRatio`, never `devicePixelRatio`: the surface already clamped the device ratio
  // and re-reading the raw one here walks straight past that clamp.
  surface.resize(w, h, surface.pixelRatio);
  camera.resize(w, h);
  light.resize(w, h);
}
addEventListener('resize', fit);
visualViewport?.addEventListener('resize', () => fit());
scope.add(() => removeEventListener('resize', fit));
fit();

// Sound is unlocked by the first gesture and by nothing else — no context exists before this
// listener fires, which is the whole of the autoplay rule.
const wake = (): void => sound.unlock();
addEventListener('pointerdown', wake, { once: true });
addEventListener('keydown', wake, { once: true });
input.onAction('mute', () => {
  const muted = sound.toggleMute();
  const button = hud.overlay.root.querySelector('.mute');
  if (button instanceof HTMLButtonElement) {
    button.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    button.dataset['on'] = muted ? '0' : '1';
  }
});

loop.start();

/**
 * The handle the looking and trailer harnesses read.
 *
 * Not a debug hatch: `tools/looking/look.mjs --eval` and `tools/trailer/acts/*.mjs` both drive a
 * page from the outside, and a game with no seam for them can only be measured by its pixels.
 * Everything here is a *reading*; nothing on it can change the run.
 */
Object.defineProperty(window, '__emberwake', {
  value: {
    get worstMs(): number { return loop.stats.worstGapMs; },
    get cadenceMs(): number { return loop.stats.cadenceMs; },
    get frameMs(): number { return loop.stats.frameMs; },
    get pools(): number { return light.count; },
    get drawn(): number { return order.count; },
    get fires(): number {
      let n = 0;
      for (const p of game.world.props) if (fireOf(p) > 0) n++;
      return n;
    },
    get motes(): number {
      let n = 0;
      for (const m of game.motes) if (m.live) n++;
      return n;
    },
    get phase(): number { return game.phase; },
    get left(): number { return game.left; },
    get hull(): number { return game.player.hull; },
    get speed(): number {
      const p = game.player;
      return Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    },
    get throttle(): number { return game.throttle; },
  },
});
