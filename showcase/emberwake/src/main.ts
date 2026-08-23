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
  DepthSorter, HALF_H, HALF_W, TILE_H, TILE_W, createCamera, heightAt, rectFromSize,
  screenToTileOnHeights, type Camera, type Rect, type Tile,
} from '@latticekit/iso';
import {
  beginFrame, createCanvas2dSurface, createLightField, endFrame, renderFrame, wash, withAlpha,
  type Passes, type Pen,
} from '@latticekit/draw';
import { createInput, type ActionMap } from '@latticekit/input';
import { drive } from '@latticekit/ui';
import { browserFrames, createLoop } from '@latticekit/loop';
import { MAP, MAX_HEIGHT_PX, MAX_UNITS, STEP_PX, createWorld, type World } from './world.js';
import {
  MAG_BLAST, Phase, RELOAD_SECONDS, RUN_SECONDS, createGame, stepGame, type Game, type SoundEvent,
} from './game.js';
import { DAWN_REACH, DAWN_STOPS, NIGHT_STOPS, emberwakePalette } from './art/palette.js';
import { drawBackdrop, drawSwell, drawWaterMotes } from './art/sea.js';
import { drawLand } from './art/land.js';
import {
  fireOf, paintBattery, paintBearingOfHit, paintBearings, paintBoat, paintDarkMotes, paintEmbers,
  paintFlame, paintProp, paintReticle, paintShell,
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
 * **`falloff` is exactly 1, and for two builds it was 2.4 while this paragraph said it was 1.**
 * The kit's exponent sets how much of the radius stays at full intensity before the ramp begins,
 * so anything above 1 is a plateau with a rim — and at 2.4 every fire in the game threw a
 * hard-edged white disc onto the ground that read as a spotlight rather than as firelight. It
 * survived two reviews because the comment beside it described the value it should have had. A
 * fire wants a pure linear ramp and 1 is it.
 *
 * `bloom` at 0.3 rather than the default 0.35: this scene has forty pools of one colour and the
 * spill compounds where they overlap, which is the case the option's own doc names.
 */
const light = createLightField(surface, { scale: 0.42, falloff: 1, bloom: 0.3 });

/** How dark the night is before any fire. Not 1: a raid you cannot navigate is not a raid, and
 *  the sea has to keep enough tone for the swell to read between the islands. */
const NIGHT_DEPTH = 0.6;
/** …and how dark it is at first light. The mask has to lift with the palette or the two disagree:
 *  a `DUSK` sea under a midnight mask is a grey sea, which is worse than either. */
const DAWN_DEPTH = 0.3;

// ── the camera ─────────────────────────────────────────────────────────────────────────────

/** Where the run sits. Wide enough that the clamp never fights the follow, and `keepVisible: 0`
 *  because there is nothing outside the map worth protecting the player from — this is open sea
 *  and the boat cannot leave it anyway. `Camera` has no way to say "no bounds"; this is the
 *  nearest sayable thing, and the gap is filed. */
const REACH: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
rectFromSize(REACH, -MAP * TILE_W * 0.5, -MAX_HEIGHT_PX, MAP * TILE_W, MAP * TILE_H + MAX_HEIGHT_PX * 2);

/**
 * The zoom the game sits at.
 *
 * Close enough that a hull reads and far enough that a shell's whole arc fits in the frame — and
 * then pulled back from 1.05 to 0.9 for the same reason the drag went up: at 1.05 the frame holds
 * about twenty tiles corner to corner, one island is most of it, and the burning one is off the
 * edge the moment the boat leaves. Twenty-three tiles is a boat, the island she is working on,
 * and the sea she is going to next.
 */
const BASE_ZOOM = Number(params.get('zoom') ?? '0.9') || 0.9;

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

/**
 * `?night=F` — open with `F` of the night already gone, 0 to 1.
 *
 * The same kind of hatch as `?ablaze`, for the same reason and with the same limits: it sets an
 * **opening state**, not a rule. The run that follows is the ordinary run — the same escalation,
 * the same clock rate, the same seeded fleet — it simply starts later in the night, so the sky is
 * already coming up.
 *
 * It exists because the alternative is filming it, and filming it is not available. The colour
 * arc is the best thing in this game and it is eighty seconds into a raid nobody can survive
 * unattended: a capture act that has to *play* for eighty seconds through an archipelago this
 * dense grounds itself four times and is sunk at forty-four. Three cuts of that act are in the
 * git history. A parameter that says "start at four fifths past midnight" is honest about what it
 * is doing; an act that pretends to have played there is not.
 */
const nightGone = clamp01(Number(params.get('night') ?? '0'));
if (nightGone > 0) game.t = nightGone * RUN_SECONDS;

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
    beat: (what, left) => hud.notice(what, left),
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

/** Scratch for the pointer and for the tile it lands on, reused. */
const pointer = { x: 0, y: 0 };
const aimTile: Tile = { gx: 0, gy: 0 };
/** The tallest *ground*, which is what bounds the aim march — `MAX_HEIGHT_PX` includes the
 *  tallest thing standing on it and would start the march above any terrain that exists. */
const GROUND_TOP_PX = MAX_UNITS * STEP_PX;

loop.onUpdate((dt, tick) => {
  input.tick(tick);

  // Read the helm. `held` answers for a whole action rather than for a key, so the two bindings
  // on each control are one question here.
  game.throttle = (input.held('ahead') ? 1 : 0) + (input.held('astern') ? -1 : 0);
  game.rudder = (input.held('port') ? -1 : 0) + (input.held('starboard') ? 1 : 0);
  game.firing = input.held('fire');

  if (input.pointerScreen(pointer)) {
    // Screen → world → grid **on the sea plane**. Two divisions, and they are the inverse of the
    // projection every draw call in the game runs forward. Exact, and correct for everything
    // afloat, which is most of what a player shoots at.
    const wx = camera.toWorldX(pointer.x);
    const wy = camera.toWorldY(pointer.y);
    game.aimX = wy / TILE_H + wx / TILE_W;
    game.aimY = wy / TILE_H - wx / TILE_W;

    // **…and on the ground where the ray meets ground, which is the whole difference between a
    // game about fire and a game about missing.**
    //
    // A magazine stands fourteen levels up a hill. Fourteen levels is a hundred and forty world
    // pixels, and in a dimetric projection a hundred and forty pixels of elevation is nine tiles
    // of apparent displacement up the screen — so a player who points at the building they can
    // see is pointing at a tile nine tiles beyond it, and every shell lands in the water on the
    // far side of the island. There is no feedback that says so: the splash is off screen behind
    // the hill. A first playthrough on real hardware ran ninety-two seconds and set nothing on
    // fire, in a game named after fire, for exactly this reason.
    //
    // `screenToTileOnHeights` marches the ray down the height field and answers with the tile it
    // actually strikes, which is the one the player is looking at. Taken **only when that tile is
    // land**: over water the plane answer above is exact and sub-tile, and a tile-centred aim
    // would quantise every shot at a moving hull to the nearest half tile.
    if (screenToTileOnHeights(camera, pointer.x, pointer.y, game.world.field, GROUND_TOP_PX, aimTile)) {
      const at = aimTile.gy * MAP + aimTile.gx;
      if (aimTile.gx >= 0 && aimTile.gy >= 0 && aimTile.gx < MAP && aimTile.gy < MAP &&
        game.world.solid[at] === 1) {
        game.aimX = aimTile.gx + 0.5;
        game.aimY = aimTile.gy + 0.5;
      }
    }
  }

  stepGame(game, dt);

  // The camera leads the boat by about a third of a second of her own velocity, which is what
  // puts the thing she is about to hit on screen before she hits it. Chasing her position alone
  // reads as lag no matter how fast the follow is.
  const p = game.player;
  // Half a second of her own velocity, down from three quarters. The lead exists to put what she
  // is about to hit on screen before she hits it, and at the old speed three quarters of a second
  // was five tiles; the same fraction now overshoots less and the frame sits behind her, which is
  // where a chase camera belongs.
  const leadX = p.x + p.vx * 0.62;
  const leadY = p.y + p.vy * 0.62;
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

/**
 * Cap on light pools per frame. The field is priced by pool **area**, so a burning island at a
 * punched-in zoom is the worst case in the game.
 *
 * Forty-four rather than thirty, and the cap only became honest at the same time. Pools were
 * added in prop-array order, so once the world held more fires than the cap the *first* forty-four
 * in the array won — which is an arbitrary corner of the map, and a burning island the camera was
 * looking straight at could go unlit because a fire eight hundred pixels off screen took the
 * budget. {@link postLight} now skips anything outside the frame before it counts, so the cap
 * spends itself on what is visible and forty-four is more than a 1280x720 frame can hold anyway.
 */
const MAX_POOLS = 44;

/** Tiles from the camera's own center, on each axis, past which nothing is lit. A 1280x720 frame
 *  at zoom 1.05 is about twenty tiles across the diagonal; twenty-two has a margin for the pool
 *  radius of a fire just off the edge, whose glow does reach in. */
const LIGHT_REACH = 22;

/** Post the frame's light. Called after `light.begin` and before `renderFrame`, which is the one
 *  window in which pools may be added. */
function postLight(): void {
  let pools = 0;
  const w = game.world;
  // The camera's center, back in grid space. `worldX = (gx - gy) · HALF_W` and
  // `worldY = (gx + gy) · HALF_H`, so this is that pair of equations solved — two divides and two
  // adds, once a frame, and it is what makes MAX_POOLS a budget rather than a lottery.
  const cgx = (camera.y / HALF_H + camera.x / HALF_W) * 0.5;
  const cgy = (camera.y / HALF_H - camera.x / HALF_W) * 0.5;
  for (const p of w.props) {
    if (pools >= MAX_POOLS) break;
    const f = fireOf(p);
    if (f <= 0.04) continue;
    if (p.gx - cgx > LIGHT_REACH || cgx - p.gx > LIGHT_REACH) continue;
    if (p.gy - cgy > LIGHT_REACH || cgy - p.gy > LIGHT_REACH) continue;
    // The pool is the same `f` the flame is drawn at, so what the scene is lit by and what it
    // looks like cannot drift.
    light.add(p.gx, p.gy, p.zPx, 1.7 + p.size * 2 * f, 0.34 + f * 0.5, 'flame');
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
  // The shore guns. One pool each while the muzzle is lit, so a battery firing from a headland
  // lights its own hillside and the player can see where the shell came from even when the
  // emplacement itself is a grey box at the edge of the frame.
  for (const b of w.batteries) {
    if (b.flash <= 0 || pools >= MAX_POOLS) continue;
    light.add(b.gx, b.gy, b.zPx, 8, 0.85 * (b.flash / 0.12), 'fcore');
    pools++;
  }
  // The magazine. One pool, enormous, for a fifth of a second, and it is the only time the whole
  // frame is lit at once.
  if (game.flashAge < 0.34) {
    const f = 1 - game.flashAge / 0.34;
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
    drawShockwave(pen);
    if (game.phase === Phase.Playing) {
      // The sight, on the ground, at the answer the height march gave — above the night, because
      // a reticle a player cannot see in the dark is a reticle that is not there.
      paintReticle(pen, game.aimX, game.aimY, heightAt(game.world.field, game.aimX, game.aimY),
        clamp01(1 - game.player.reload / RELOAD_SECONDS));
      paintBearingOfHit(pen, game.player.x, game.player.y, game.hitX, game.hitY, game.hitAge);
      paintBearings(pen, game.world, camera);
    }
    // The white flash. Fifteen hundredths of a second, and it is the reason a magazine feels
    // like a magazine rather than like a large fire.
    // Twelve hundredths, not sixteen, and half a stop less of it. At the old numbers the frame
    // is *white* for four frames and then sepia for a third of a second, which in a cut reads as
    // a bad dissolve rather than as a bang. The shockwave ring above now carries the reach and
    // the light pool carries the heat, so the wash only has to carry the instant.
    if (game.flashAge < 0.12) {
      wash(pen, withAlpha(pen.palette.get('fcore'), (1 - game.flashAge / 0.12) * 0.52));
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
      // 0.18 and a wider ellipse, not 0.34 and a narrower one. At a third, a frame in which the
      // player has just been hit is *entirely magenta* — the transparent middle is a quarter of
      // the width and everything outside it is red at an alpha you cannot see through, which is
      // the wash this comment says it is not. The bearing arc above is now the tell that carries
      // the information, so the vignette only has to say "that hurt".
      pen.surface.softEllipse(w * 0.5, h * 0.5, w * 0.96, h * 1.02,
        withAlpha(red, 0), withAlpha(red, game.player.hurt * 0.18));
    }
  },
};

/** Seconds a magazine's shockwave takes to cross its own blast radius. */
const WAVE_SECONDS = 0.62;
/** Segments in the ring, and the turn between two of them expressed as the `k` of the rotation
 *  trick: `atan(RING_K)` is exactly `TAU / RING_N`, so the walk closes on itself. */
const RING_N = 24;
const RING_K = 0.26794919243112270;

/**
 * The ring a magazine throws.
 *
 * Two strokes of one ellipse, and it is the single cheapest thing in this file that makes an
 * explosion read as *pressure* rather than as a large light. The white flash says something
 * happened; the ring says how far it reached — which is the information the player needs, because
 * the blast radius is bigger than the fireball and standing off is the lesson the first magazine
 * teaches. Drawn in Effects so it sits above the night, like the sparks.
 */
function drawShockwave(pen: Pen): void {
  const age = game.flashAge;
  if (age >= WAVE_SECONDS) return;
  const k = age / WAVE_SECONDS;
  // Fast out, slow to stop — a linear ring reads as an animation and this reads as a bang.
  const grow = 1 - (1 - k) * (1 - k);
  const r = HALF_W * pen.camera.zoom * MAG_BLAST * grow;
  const cx = sx(pen, game.flashX, game.flashY);
  const cy = sy(pen, game.flashX, game.flashY, 0);
  const fade = (1 - k) * (1 - k);
  pen.surface.softEllipse(cx, cy, r, r * 0.5,
    withAlpha(pen.palette.get('fcore'), 0), withAlpha(pen.palette.get('flame'), 0.5 * fade));
  // The ring, as a closed polyline: `Surface` strokes point lists and has no arc primitive. The
  // walk round it is the same `v + k·perp(v)` rotation the hulls steer with, so twenty-four steps
  // of `atan(RING_K)` is exactly one turn and the whole ring stays Tier A — no `cos` anywhere.
  let ux = 1;
  let uy = 0;
  for (let i = 0; i <= RING_N; i++) {
    pen.xy[i * 2] = cx + ux * r;
    pen.xy[i * 2 + 1] = cy + uy * r * 0.5;
    const nx = ux - RING_K * uy;
    const ny = uy + RING_K * ux;
    const inv = 1 / Math.sqrt(nx * nx + ny * ny);
    ux = nx * inv;
    uy = ny * inv;
  }
  pen.surface.stroke(pen.xy, RING_N + 1, true, withAlpha(pen.palette.get('fcore'), 0.75 * fade),
    Math.max(1, 3 * pen.camera.zoom * fade));
}

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

  // The sunrise. `Palette.lerp` quantises to 32 levels and bumps `rev` only when the level
  // changes, so calling it every frame costs one comparison on 31 frames out of 32 and one
  // palette rebuild on the thirty-second — which is why this can be a continuous value in the
  // simulation and a stepped one in the caches without the game having to know.
  palette.lerp(NIGHT_STOPS, DAWN_STOPS, game.dawn * DAWN_REACH);

  const pen: Pen = beginFrame({ surface, camera, palette, t: time, light, snap: true });
  const depth = NIGHT_DEPTH + (DAWN_DEPTH - NIGHT_DEPTH) * game.dawn;
  light.begin(pen, clamp(depth - game.heat * 0.08, 0.28, 0.9), 'night');
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
    get firing(): boolean { return game.firing; },
    get aimX(): number { return game.aimX; },
    get aimY(): number { return game.aimY; },
    get shells(): number {
      let n = 0;
      for (const s of game.shells) if (s.live) n++;
      return n;
    },
    get t(): number { return game.t; },
  },
});
