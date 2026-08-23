#!/usr/bin/env node
/**
 * **Play a capture act without a browser.**
 *
 * `tools/trailer/capture.mjs` films an act. Nothing rehearses one — and a beat that misses is
 * invisible until the frames come back, so every iteration on a shot costs a browser launch, a
 * warmup and sixteen seconds of screenshots, and then a contact sheet to find out that the boat
 * ran aground on the second frame. That is a twenty-second edit-compile-look loop for a file
 * whose whole content is timings, and it is why the first version of `beat-broadside.mjs` sailed
 * straight into the island it was supposed to shoot.
 *
 * This runs the same cue list against the same simulation in about forty milliseconds. It is
 * faithful in the ways that matter and approximate in exactly one:
 *
 * | | how |
 * |---|---|
 * | the world | `createWorld(createRng(seed))` — the same call `main.ts` makes |
 * | the run | `createGame` / `stepGame` at the same fixed step |
 * | keys | `code` off the cue, mapped through the same action table `main.ts` binds |
 * | the pointer | screen → world → grid through the camera's own arithmetic, reimplemented here |
 * | the camera | the lead-and-smooth from `main.ts`, copied, because `loop` owns the real one |
 * | **shake** | **not modelled.** It moves the camera by a few pixels, so an aim point resolves within a tile of where it will on film |
 *
 * The camera duplication is the one thing to be uneasy about: two copies of the follow can drift,
 * and if the game's changes here, a rehearsal will silently disagree with the film. It is worth it
 * anyway, and the honest fix belongs in the kit rather than here — see the report.
 *
 * ```bash
 * npx tsc -p showcase/emberwake/tsconfig.json
 * node showcase/emberwake/tools/rehearse.mjs act/beat-broadside.mjs --frames 264 --warmup 1600
 * ```
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRng } from '@latticekit/core';
import { createCamera, screenToTileOnHeights } from '@latticekit/iso';
import { Burn, Kind, MAP, MAX_UNITS, STEP_PX, createWorld } from '../dist-ts/world.js';
import { HULL, Phase, RUN_SECONDS, createGame, stepGame } from '../dist-ts/game.js';

/** Half a tile, in world pixels. `@latticekit/iso` fixes the tile at 64x32 and says so. */
const HALF_W = 32;
const HALF_H = 16;

const argv = process.argv.slice(2);
const actPath = argv[0];
if (actPath === undefined) {
  console.error('usage: rehearse.mjs <act.mjs> [--seed S] [--frames N] [--warmup MS] [--zoom Z] [--every N]');
  process.exit(2);
}
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at < 0 ? fallback : argv[at + 1];
};
const seed = flag('seed', 'emberwake');
const frames = Number(flag('frames', '300'));
const warmupMs = Number(flag('warmup', '1600'));
const zoom = Number(flag('zoom', '1.05'));
const every = Number(flag('every', '20'));
/**
 * `--target gx,gy` — also print where that world point lands **on screen** each sample.
 *
 * This is how an act's aim track gets written. A cue is a screen coordinate and the thing it
 * wants to hit is a world one, and the map between them moves every frame because the camera
 * leads the boat — so the alternative is arithmetic by hand against a projection, an elevation
 * and a lead, once per waypoint, which is how `beat-magazine.mjs` ended up aiming at the water on
 * the far side of an island. Ask the rehearsal instead, and copy the numbers.
 *
 * Pass `magazine` for the nearest standing objective, which is what an act usually wants.
 */
const target = flag('target', '');
const width = 1280;
const height = 720;
const stepMs = 1000 / 60;
const warmupSteps = Math.round(warmupMs / stepMs);

const module = await import(pathToFileURL(resolve(process.cwd(), actPath)).href);
const plan = module.default;
const cues = typeof plan === 'function'
  ? await plan({ frames, fps: 60, width, height, stepMs, warmupSteps, warmupMs })
  : plan;

/**
 * Cues by absolute step index, where step 0 is the first warmup step.
 *
 * **A cue earlier than the warmup is dropped, and `capture.mjs` drops it in silence.** That is
 * the single most expensive mistake an act can make — the film comes back showing a game that
 * ignored its keys, and nothing anywhere says why — so this counts them and says so before the
 * first line of the trace, which is the whole reason to rehearse.
 */
const byStep = new Map();
let dropped = 0;
let earliest = 0;
for (const cue of cues) {
  const at = cue.at ?? 0;
  const step = warmupSteps + at;
  if (at < earliest) earliest = at;
  if (step < 0) { dropped += (cue.events ?? []).length; continue; }
  const list = byStep.get(step) ?? [];
  list.push(...(cue.events ?? []));
  byStep.set(step, list);
}
if (dropped > 0) {
  console.log(
    `  ! ${String(dropped)} event(s) fall before the warmup and will never be dispatched — ` +
    `earliest cue is ${String(earliest)}, warmup is ${String(warmupSteps)} steps. ` +
    `Pass --warmup ${String(Math.ceil(-earliest * stepMs) + 100)} or later.`,
  );
}

/** The same six actions `main.ts` binds, by `KeyboardEvent.code`. */
const ACTION_OF = {
  KeyW: 'ahead', ArrowUp: 'ahead',
  KeyS: 'astern', ArrowDown: 'astern',
  KeyA: 'port', ArrowLeft: 'port',
  KeyD: 'starboard', ArrowRight: 'starboard',
  Space: 'fire',
};

const world = createWorld(createRng(seed));
const log = [];
const game = createGame(world, createRng(`${seed}:run`), {
  sound: () => {},
  // **Hit-stop is modelled, and it has to be.** `stepGame` skips its whole body while `stop` is
  // positive, so a run that ignores the punch hook advances `game.t` faster than the browser
  // does — about a third of a second over ten, which is twenty frames of film and enough to put
  // an explosion outside a two-second shot. The camera shake and the zoom punch are presentation
  // and are not modelled; the freeze is simulation and is.
  punch: (_mag, stopTicks) => {
    if (stopTicks > 0) game.stop = Math.max(game.stop, stopTicks);
  },
  beat: (what, left) => log.push([game.t, `beat:${what} (${left} left)`]),
});

// A real camera, only for the pointer march: `screenToTileOnHeights` takes one, and building a
// second projection here is exactly the drift this rehearsal exists to avoid.
const camera = createCamera(width, height, { zoom, minZoom: 0.5, maxZoom: 2.2, keepVisible: 0 });
const aimTile = { gx: 0, gy: 0 };

let camX = (game.player.x - game.player.y) * HALF_W;
let camY = (game.player.x + game.player.y) * HALF_H;
const held = new Set();
let pointerX = width * 0.5;
let pointerY = height * 0.5;
let firing = false;
let havePointer = false;

const dt = 1 / 60;
const total = warmupSteps + frames;
let worstHull = HULL;
let aground = 0;
let peakFires = 0;

console.log(`${actPath} on seed "${seed}" — ${String(frames)} frames after ${String(warmupMs)} ms of warmup`);
console.log(`world: start ${world.startX.toFixed(1)},${world.startY.toFixed(1)}  wind ${String(world.windX)},${String(world.windY)}`);

for (let step = 0; step < total; step++) {
  for (const event of byStep.get(step) ?? []) {
    if (typeof event.keyboard === 'string') {
      const action = ACTION_OF[event.code];
      if (action !== undefined) {
        if (event.keyboard === 'keyDown') held.add(action);
        else held.delete(action);
      }
    } else if (typeof event.mouse === 'string') {
      if (typeof event.x === 'number') { pointerX = event.x; pointerY = event.y; havePointer = true; }
      if (event.mouse === 'mousePressed') firing = true;
      if (event.mouse === 'mouseReleased') firing = false;
    }
    // `{ eval }` cues are page expressions and cannot be rehearsed. Silence would be worse than
    // a warning: an act driven entirely by them would rehearse as a boat that never moves.
    if (typeof event.eval === 'string' && step === 0) {
      console.log('  ! this act uses { eval } cues, which this rehearsal cannot run');
    }
  }

  game.throttle = (held.has('ahead') ? 1 : 0) + (held.has('astern') ? -1 : 0);
  game.rudder = (held.has('port') ? -1 : 0) + (held.has('starboard') ? 1 : 0);
  game.firing = firing || held.has('fire');

  if (havePointer) {
    const wx = camX + (pointerX - width * 0.5) / zoom;
    const wy = camY + (pointerY - height * 0.5) / zoom;
    game.aimX = wy / (HALF_H * 2) + wx / (HALF_W * 2);
    game.aimY = wy / (HALF_H * 2) - wx / (HALF_W * 2);
    // **The height march, exactly as `main.ts` runs it.** Without this the rehearsal aims at the
    // sea plane while the game aims at the hillside, and the two diverge from the first salvo:
    // one run of this file reported a boat alive at eighty-two seconds that the browser had sunk
    // at forty-four. A rehearsal that is wrong about aiming is wrong about everything downstream
    // of it, which is the whole game.
    camera.centerOn(camX, camY);
    if (screenToTileOnHeights(camera, pointerX, pointerY, world.field, MAX_UNITS * STEP_PX, aimTile)) {
      const cell = aimTile.gy * MAP + aimTile.gx;
      if (aimTile.gx >= 0 && aimTile.gy >= 0 && aimTile.gx < MAP && aimTile.gy < MAP &&
        world.solid[cell] === 1) {
        game.aimX = aimTile.gx + 0.5;
        game.aimY = aimTile.gy + 0.5;
      }
    }
  }

  const before = game.player.hull;
  stepGame(game, dt);
  const p = game.player;
  if (p.hull < worstHull) worstHull = p.hull;
  if (before - p.hull > 2) aground++;

  const leadX = p.x + p.vx * 0.72;
  const leadY = p.y + p.vy * 0.72;
  camX += ((leadX - leadY) * HALF_W - camX) * 0.11;
  camY += ((leadX + leadY) * HALF_H - camY) * 0.11;

  let fires = 0;
  for (const q of world.props) if (q.state === Burn.Lit) fires++;
  if (fires > peakFires) peakFires = fires;

  const shot = step - warmupSteps;
  if (shot >= 0 && shot % every === 0) {
    let raiders = 0;
    for (const b of game.raiders) if (b.live && b.sinking < 0) raiders++;
    let nearest = 1e9;
    for (const q of world.props) {
      if (q.kind !== Kind.Magazine || q.state === Burn.Spent) continue;
      const d = Math.hypot(q.gx - p.x, q.gy - p.y);
      if (d < nearest) nearest = d;
    }
    let mark = '';
    if (target !== '') {
      let tx = 0;
      let ty = 0;
      let tz = 0;
      if (target === 'magazine') {
        let near = 1e9;
        for (const q of world.props) {
          if (q.kind !== Kind.Magazine || q.state === Burn.Spent) continue;
          const d = Math.hypot(q.gx - p.x, q.gy - p.y);
          if (d < near) { near = d; tx = q.gx; ty = q.gy; tz = q.zPx; }
        }
      } else {
        const parts = target.split(',').map(Number);
        tx = parts[0] ?? 0;
        ty = parts[1] ?? 0;
        tz = parts[2] ?? 0;
      }
      // The same projection `art/space.ts` runs forward, against the camera as it stands *now* —
      // which is why this has to be sampled from inside the loop rather than computed afterwards.
      const px = (tx - ty) * HALF_W - camX;
      const py = (tx + ty) * HALF_H - tz - camY;
      mark = `  screen ${(width * 0.5 + px * zoom).toFixed(0)},${(height * 0.5 + py * zoom).toFixed(0)}`;
    }
    console.log(
      `f${String(shot).padStart(4)}  ${game.t.toFixed(1).padStart(5)}s  ` +
      `at ${p.x.toFixed(1).padStart(5)},${p.y.toFixed(1).padStart(5)}  ` +
      `${Math.hypot(p.vx, p.vy).toFixed(1)}kn  hull ${p.hull.toFixed(0).padStart(3)}  ` +
      `fires ${String(fires).padStart(3)}  mag@${nearest.toFixed(1).padStart(5)}  ` +
      `aim ${game.aimX.toFixed(1)},${game.aimY.toFixed(1)}  ` +
      `raiders ${String(raiders)}  left ${String(game.left)}${mark}`,
    );
  }
  if (game.phase !== Phase.Playing) break;
}

for (const [t, what] of log) console.log(`  ${t.toFixed(1)}s  ${what}`);
const verdict = game.phase === Phase.Won ? 'WON'
  : game.phase === Phase.Lost ? 'SUNK' : game.phase === Phase.Dawn ? 'DAWN' : 'still playing';
console.log(
  `${verdict} — hull ${game.player.hull.toFixed(0)} (worst ${worstHull.toFixed(0)}), ` +
  `${String(game.burned)} burned, ${String(game.sunk)} sunk, peak ${String(peakFires)} fires, ` +
  `${String(aground)} hard knocks, night ${(game.t / RUN_SECONDS * 100).toFixed(0)}% gone`,
);
void Kind;
