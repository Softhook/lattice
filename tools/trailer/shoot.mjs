#!/usr/bin/env node
/**
 * **The nine shots, written down.**
 *
 * The trailer is twenty seconds and nine cuts. This file is the manifest and the runner: it holds
 * every decision that is *about a shot* rather than about the harness, so that re-shooting one is
 * one word on a command line rather than a paragraph reconstructed from a report.
 *
 * ```bash
 * node tools/trailer/serve.mjs site/dist 8471          # in another terminal
 * node tools/trailer/shoot.mjs --print                 # the exact capture.mjs command for each
 * node tools/trailer/shoot.mjs                         # all nine
 * node tools/trailer/shoot.mjs 06-clay 04-caverns      # just those two
 * node tools/trailer/shoot.mjs --encode                # ffmpeg each shot and delete its PNGs
 * ```
 *
 * ## Two conventions that every shot follows
 *
 * **`?cost=0` on every exhibit URL, and it is not cosmetic.** `examples/_shared/src/cost.ts` is a
 * switch the gallery already ships for embedders, and this is exactly the case it was written for:
 * a frame-cost readout is evidence during development and a liability in a shop window. Here it is
 * also a *correctness* fix. Under the virtual clock `performance.now()` does not move inside a
 * frame, so `loop.stats.frameMs` is `0.00 ms` on every frame of every shot. Leaving that on screen
 * would put a number in the trailer that is not true — not a fast frame, a stopped clock. The
 * counts stay: `PEOPLE 900`, `POOLS 692`, `DRAWN 283`, `1,083 TILES UNDER WATER` are the subject
 * and every one of them is real.
 *
 * **`--hide .exhibit-panel` everywhere, and `.dock-foot` where the foot is a control.** The knobs
 * panel is a developer tool. `.dock-foot` is the exhibit's bottom strip and it is a *judgement per
 * exhibit*, not a rule: in Crowd it is a time scrubber, in Canyon a deep-time slider, in Clay a
 * RAISE/CUT mode switch — all controls, all hidden. The rest of `.lattice-ui` **stays**, because
 * the readouts in it are the proof the trailer is selling.
 *
 * ## Why several shots have an act file
 *
 * Five of the nine are photographs at rest, and a photograph is a dead second in a trailer. Each
 * act file carries its own reasoning; the short version is in the `why` field below, and the long
 * version is in the file. The rule they all obey: **an act may only do what a player can do.** No
 * act writes to a world, sets a variable, or calls anything the page does not expose to a mouse,
 * a key or its own buttons.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(dirname(here));
const act = (name) => join(here, 'acts', name);

/** Where the frames and the encodes go. */
export const SHOTS_DIR = join(here, 'shots');

/** The server the shots are captured from. `serve.mjs site/dist 8471`. */
export const BASE = process.env.TRAILER_BASE ?? 'http://127.0.0.1:8471';

/** 1280×720. Judged by looking: see this file's § On 1280 rather than 1920. */
export const SIZE = '1280x720';

/**
 * ## On 1280 rather than 1920
 *
 * The brief allowed 1920×1080 if the exhibits held up at it, and they do not, uniformly. Three of
 * them are tuned for a tile in a gallery and go sparse when the viewport grows: Orbit's eight
 * stations sit in a field of stars that gets emptier with every pixel, Evenfall Orchard fits its
 * camera to a fixed 42×42 opening so a wider window just adds more of the same green surround,
 * and Caverns' pool count is `LightField.count` *for the current view*, so a bigger view is a
 * different — and unreproducible — number under the caption. 1280×720 is where they were composed
 * and it is where they read.
 */

export const SHOTS = [
  {
    name: '01-lamp-road',
    url: '/x/demo/?cost=0',
    seconds: 3.0,
    warmupMs: 42_000,
    hide: ['.exhibit-panel'],
    act: act('lamp-road.mjs'),
    why:
      '42 s puts the shot inside the exhibit\'s own dusk ramp (DAY_SEC 40 + RAMP_SEC 7, rules.ts:33), ' +
      'so the sky darkens and the stars come out across the three seconds rather than sitting still at ' +
      'one hour. site/tools/og.mjs found 41 s; 42 was better by eye, because at 41 the sun is still on ' +
      'the horizon and the lamps have nothing to be brighter than. The act plays the game through the ' +
      'warmup so there are nine lamps on the road to come on.',
  },
  {
    name: '02-crowd',
    url: '/x/crowd/?cost=0',
    seconds: 1.2,
    warmupMs: 8_000,
    hide: ['.exhibit-panel', '.dock-foot'],
    why:
      'No act. 900 walkers on eight closed curves is the densest motion in the kit — 4.4% of pixels ' +
      'change every frame with the camera held still, which is more than any other shot here. The ' +
      'opening camera already frames the thickest part of the plaza; a pan would only smear it. ' +
      '.dock-foot is the world-time scrubber and goes.',
  },
  {
    name: '03-canyon',
    url: '/x/canyon/?cost=0',
    seconds: 1.6,
    warmupMs: 6_000,
    hide: ['.exhibit-panel', '.dock-foot'],
    act: act('canyon-frame.mjs'),
    why:
      'At 6 s the model is at EPOCH ~760/2000 and cutting hard: 40% of pixels change across the ' +
      'shot, the highest in the set. The HUD prints 1 STEP THIS FRAME, so the erosion is provably ' +
      'stepping and not sitting finished — it finishes near 16 s, holds for six, and re-runs, so a ' +
      'warmup past 20 s would film the hold. The act zooms three notches out; see the file.',
  },
  {
    name: '04-caverns',
    url: '/x/caverns/?cost=0',
    seconds: 1.2,
    warmupMs: 4_000,
    hide: ['.exhibit-panel', '.dock-foot'],
    at: [
      '(() => { const b = [...document.querySelectorAll("button")]' +
        '.find((b) => /Light 100 more/.test(b.textContent || "")); ' +
        'if (!b) throw new Error("caverns: no \\"Light 100 more\\" button"); ' +
        'b.click(); b.click(); b.click(); return "300 torches"; })()',
    ],
    act: act('caverns-lantern.mjs'),
    why:
      'Three presses of the exhibit\'s own button before the warmup: 300 torches, which is the state ' +
      'the 704 figure was measured in. The number this produces at 1280x720 is POOLS 692, because ' +
      'POOLS is LightField.count for the current view. Caption it 692. The act walks the lantern so ' +
      'the biggest light in the frame moves.',
  },
  {
    name: '05-orbit',
    url: '/x/orbit/?cost=0',
    seconds: 1.2,
    warmupMs: 6_000,
    hide: ['.exhibit-panel'],
    act: act('orbit-drift.mjs'),
    why:
      'The cold shot, and the one that breaks the all-green-hills read. Also the slowest: 0.44% ' +
      'frame to frame standing still. The act crosses the void slowly, which is what makes three ' +
      'parallax star bands visible as three. VISIBLE reads 226-227, not the 214 in exhibits.json.',
  },
  {
    name: '06-clay',
    url: '/x/clay/?cost=0',
    seconds: 2.0,
    warmupMs: 4_000,
    hide: ['.exhibit-panel', '.dock-foot'],
    act: act('clay-drag.mjs'),
    why:
      'The synthetic-input shot. A thousand feet of new mountain raised under the cursor in a second ' +
      'and a half, with 2,200 props, the river and 180 replanned walker routes resettling on top of ' +
      'it. Three attempts are compared in the act file; this is the one that reads.',
  },
  {
    name: '07-chime-path',
    url: '/g/chime-path/',
    seconds: 2.0,
    warmupMs: 5_000,
    act: act('chime-path.mjs'),
    why:
      'Four chimes hung during the warmup, two gusts and a slow walk along the ridge in the shot. ' +
      'At rest the game is an empty trail and 0.70% frame to frame; the walk carries the chimes past ' +
      'the lens and brings the snow line into frame. The A/D/G/C′ strip along the bottom is the ' +
      'phrase, not a control — the pills light as each chime rings — so it stays.',
  },
  {
    name: '08-evenfall-orchard',
    url: '/g/evenfall-orchard/',
    seconds: 1.5,
    warmupMs: 202_000,
    act: act('orchard-evening.mjs'),
    why:
      'The quietest shot in the trailer and the act file says so at length. Three virtual nights of ' +
      '"let it grow" put fruit on the trees; 202 s lands the wall-clock day phase where the light is ' +
      'falling fastest while the picture is still warm. Even so it measures 0.18% frame to frame at ' +
      'its liveliest. Cut it as a held frame.',
  },
  {
    name: '09-before-the-bell',
    url: '/g/before-the-bell/',
    seconds: 1.5,
    warmupMs: 8_000,
    act: act('bell-stalls.mjs'),
    why:
      'Several hundred market-goers walking continuous paths, 1.7% frame to frame with no input at ' +
      'all. The act sets three stalls into the stream during the shot, which is the game\'s own ' +
      'subject and the only discrete beat available in a second and a half.',
  },
];

const FPS = 60;

/** The exact argv `capture.mjs` is run with, so `--print` and the run cannot disagree. */
export function argvFor(shot) {
  const argv = [
    join(here, 'capture.mjs'),
    `${BASE}${shot.url}`,
    '--size', SIZE,
    '--frames', String(Math.round(shot.seconds * FPS)),
    '--warmup', String(shot.warmupMs),
    '--out', join(SHOTS_DIR, shot.name),
  ];
  for (const selector of shot.hide ?? []) argv.push('--hide', selector);
  for (const expression of shot.at ?? []) argv.push('--at', expression);
  if (shot.act) argv.push('--act', shot.act);
  return argv;
}

const quote = (s) => (/^[\w./:@=?&-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/**
 * `ffmpeg` settings, and why each one.
 *
 * `-crf 12 -preset slow` is an *intermediate*: it will be re-encoded by the edit, so it should
 * throw away as little as possible now. `-pix_fmt yuv420p` is the format that plays everywhere
 * rather than the one that looks best in a comparison. `-r 60` is a statement rather than a
 * conversion — the frames already are 60 fps by construction.
 */
function encode(shot) {
  const dir = join(SHOTS_DIR, shot.name);
  const frames = readdirSync(dir).filter((n) => /^frame-\d+\.png$/.test(n)).sort();
  if (frames.length === 0) return `${shot.name}: no frames to encode`;
  const out = join(dir, `${shot.name}.mp4`);
  // One frame survives as a poster. 1,200 PNGs is several gigabytes and goes; half a megabyte so
  // that an editor can see what a clip is without decoding it stays.
  copyFileSync(join(dir, frames[0]), join(dir, 'poster.png'));
  execFileSync(
    'ffmpeg',
    ['-y', '-framerate', String(FPS), '-i', join(dir, 'frame-%05d.png'),
      '-c:v', 'libx264', '-crf', '12', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', String(FPS), out],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  for (const name of frames) rmSync(join(dir, name));
  return `${shot.name}: ${frames.length} frames → ${out} (+ poster.png)`;
}

const args = process.argv.slice(2);
const print = args.includes('--print');
const doEncode = args.includes('--encode');
const only = args.filter((a) => !a.startsWith('-'));
const chosen = only.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;
if (only.length && chosen.length !== only.length) {
  const known = SHOTS.map((s) => s.name).join(', ');
  process.stderr.write(`shoot: unknown shot. Known: ${known}\n`);
  process.exit(2);
}

if (print) {
  for (const shot of chosen) {
    process.stdout.write(`# ${shot.name} — ${shot.seconds}s\nnode ${argvFor(shot).map(quote).join(' ')}\n\n`);
  }
  process.exit(0);
}

mkdirSync(SHOTS_DIR, { recursive: true });
for (const shot of chosen) {
  if (doEncode) {
    if (!existsSync(join(SHOTS_DIR, shot.name))) {
      process.stdout.write(`${shot.name}: nothing captured yet\n`);
      continue;
    }
    process.stdout.write(`${encode(shot)}\n`);
    continue;
  }
  process.stdout.write(`\n=== ${shot.name} — ${shot.seconds}s, ${Math.round(shot.seconds * FPS)} frames\n`);
  execFileSync('node', argvFor(shot), { stdio: 'inherit', cwd: repo });
}
