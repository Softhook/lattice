#!/usr/bin/env node
/**
 * **Frames for a trailer, at exactly 60 fps, on any machine.**
 *
 * A screen recorder samples whatever a machine managed to draw, and the frames it drops are the
 * frames a viewer notices. This kit does not have to be recorded that way: nothing in it reads a
 * clock it was not handed, so the clock can be taken away. `clock.mjs` replaces
 * `performance.now`, `Date`, `requestAnimationFrame` and the Web Animations timeline before the
 * page's first line runs; this file navigates, warms the world up, then alternates
 * `__step(1000/60)` with `Page.captureScreenshot` for as long as the shot needs. A frame that took
 * 300 ms to render is still 16.667 ms of world, so the output is 60 fps by construction rather
 * than by luck.
 *
 * It shares `tools/looking/look.mjs`'s transport and its command-line conventions — URL as a
 * positional, `--size WxH`, `--at EXPR`, `--out DIR`, no npm dependencies anywhere — because a
 * second convention for the same thing is a second thing to remember.
 *
 * ```bash
 * # the beauty shot: forty-one seconds of settling, then three seconds of frames
 * node tools/trailer/capture.mjs http://127.0.0.1:8471/x/demo/ \
 *   --size 1280x720 --warmup 41000 --frames 180 --out tools/trailer/shots/01-lamp-road
 *
 * # with synthetic input, interleaved with the stepping so the drag is smooth
 * node tools/trailer/capture.mjs http://127.0.0.1:8471/x/clay/ \
 *   --frames 120 --act tools/trailer/acts/clay-drag.mjs --out /tmp/clay
 * ```
 *
 * ## The flags
 *
 * | flag | |
 * |---|---|
 * | `--size WxH` | viewport, in CSS pixels, at device scale factor 1. Default 1280×720 |
 * | `--frames N` | how many PNGs. At 60 fps, seconds × 60 |
 * | `--warmup MS` | virtual milliseconds stepped before the first frame. The world settles here |
 * | `--fps N` | steps per second of output. Default 60 |
 * | `--out DIR` | `frame-00000.png` upward. Created; **emptied of old frames first** |
 * | `--at EXPR` | evaluated in the page after load and before the warmup. Repeatable |
 * | `--after-warmup EXPR` | evaluated after the warmup and before the first frame. Repeatable |
 * | `--hide SEL` | `display:none !important`. Repeatable. For developer control panels |
 * | `--css TEXT` | raw CSS, injected at document start. Repeatable |
 * | `--act FILE` | `.mjs` or `.json` — input events and expressions on a frame timeline |
 * | `--clock MODE` | `frozen` (default) or `hybrid`. See `clock.mjs` |
 * | `--batch N` | warmup steps per round trip. Default 60 |
 * | `--gpu` | let Chrome rasterise on the GPU |
 * | `--json` | the report as JSON on stdout |
 *
 * ## Why `--out` is emptied and not merged
 *
 * A shot recaptured at 100 frames into a directory holding a previous 180-frame run leaves eighty
 * frames of the old take on the end, and `ffmpeg`'s glob input will happily encode them. The
 * result is a clip that plays correctly for 1.7 seconds and then cuts to a different world. That
 * is a bug you find in the edit and not in the capture, which is the worst place to find it.
 *
 * ## The act file
 *
 * A `.mjs` default-exporting a function of `{ frames, fps, width, height, warmupSteps }`, or a
 * JSON array, returning cues:
 *
 * ```js
 * export default ({ frames, width, height }) => [
 *   { at: 0,  events: [{ mouse: 'mousePressed', x: 900, y: 300, button: 'left', buttons: 1 }] },
 *   { at: 30, events: [{ mouse: 'mouseMoved',   x: 700, y: 380, button: 'left', buttons: 1 }] },
 *   { at: 90, events: [{ mouse: 'mouseReleased', x: 500, y: 460, button: 'left' }] },
 * ];
 * ```
 *
 * `at` is a **capture frame index**, and the cue's events are dispatched *before* that frame is
 * stepped. A negative `at` counts back from the end of the warmup, so `{ at: -1 }` is the last
 * warmup step — that is where a camera nudge goes if you want it settled before the shutter opens.
 * An event is one of `{ mouse }` → `Input.dispatchMouseEvent`, `{ keyboard }` →
 * `Input.dispatchKeyEvent`, or `{ eval }` → `Runtime.evaluate`; every other field is passed
 * through to CDP untouched, so the protocol's own documentation is the reference and this file
 * does not have to grow a second one.
 *
 * The keyboard discriminator is `keyboard` and not `key` for a reason worth one line: CDP's own
 * key event has a field called `key` — `' '` for the space bar — and a discriminator by that name
 * is silently overwritten by the payload it is discriminating. The first version of this file did
 * exactly that and failed with `Unexpected event type ' '`.
 *
 * **Input events are dispatched between steps, never during one.** `@latticekit/input` counts
 * every gesture duration in ticks rather than reading a clock, so a press at frame 0 and a release
 * at frame 90 is a ninety-tick press whatever the wall clock did — which is why a synthetic drag
 * through this harness produces exactly the gesture a human would have made at 60 fps.
 *
 * Exit code is `0` on a clean capture, `1` if the page logged an error or a rAF callback threw
 * during the shot, and `2` if the harness itself could not run. A shot captured over an exception
 * is a shot that will be cut into the trailer by someone who did not read the console.
 *
 * Impure by nature: spawns a browser, opens a socket, writes thousands of files.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

import { launch, wait } from './cdp.mjs';
import { virtualClock } from './clock.mjs';

const DEFAULT_FPS = 60;

function parseArgs(argv) {
  const args = {
    url: null,
    width: 1280,
    height: 720,
    frames: 60,
    warmupMs: 2000,
    fps: DEFAULT_FPS,
    out: null,
    at: [],
    afterWarmup: [],
    hide: [],
    css: [],
    act: null,
    clock: 'frozen',
    batch: 60,
    gpu: false,
    json: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--quiet') args.quiet = true;
    else if (arg === '--gpu') args.gpu = true;
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--frames') args.frames = Number(argv[++i]);
    else if (arg === '--warmup') args.warmupMs = Number(argv[++i]);
    else if (arg === '--fps') args.fps = Number(argv[++i]);
    else if (arg === '--at') args.at.push(argv[++i]);
    else if (arg === '--after-warmup') args.afterWarmup.push(argv[++i]);
    else if (arg === '--hide') args.hide.push(argv[++i]);
    else if (arg === '--css') args.css.push(argv[++i]);
    else if (arg === '--act') args.act = argv[++i];
    else if (arg === '--clock') args.clock = argv[++i];
    else if (arg === '--batch') args.batch = Number(argv[++i]);
    else if (arg === '--size') {
      const [w, h] = String(argv[++i]).split('x').map(Number);
      args.width = w;
      args.height = h;
    } else if (!arg.startsWith('-')) args.url = arg;
    else throw Object.assign(new Error(`capture: unknown flag ${arg}`), { fatal: true });
  }
  if (args.clock !== 'frozen' && args.clock !== 'hybrid') {
    throw Object.assign(new Error(`capture: --clock wants 'frozen' or 'hybrid', got ${args.clock}`), { fatal: true });
  }
  for (const [name, value] of [
    ['--frames', args.frames],
    ['--warmup', args.warmupMs],
    ['--fps', args.fps],
    ['--batch', args.batch],
  ]) {
    if (!Number.isFinite(value) || value < 0) {
      throw Object.assign(new Error(`capture: ${name} wants a finite number >= 0, got ${String(value)}`), { fatal: true });
    }
  }
  return args;
}

/**
 * The stylesheet injected at document start.
 *
 * Two jobs. The `--hide` selectors take the developer control panels off the frame — a debug
 * slider is for somebody already inside the gallery and a trailer is for somebody who has not
 * clicked. The rest is a determinism guard: caret blink and smooth scrolling are the two pieces of
 * browser behaviour that move on a clock this harness does not own.
 */
function stylesheet({ hide, css }) {
  const rules = [
    'html{scroll-behavior:auto !important}',
    '*{caret-color:transparent !important}',
    ...hide.map((selector) => `${selector}{display:none !important}`),
    ...css,
  ].join('\n');
  return `(() => {
  const install = () => {
    if (document.getElementById('__trailer_css')) return;
    const style = document.createElement('style');
    style.id = '__trailer_css';
    style.textContent = ${JSON.stringify(rules)};
    (document.head ?? document.documentElement).append(style);
  };
  if (document.head) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
  document.addEventListener('readystatechange', install);
  globalThis.__trailerCss = install;
})()`;
}

/** `.mjs` module, `.json` array, or nothing → cues grouped by the frame they fire before. */
async function loadAct(file, context) {
  if (!file) return new Map();
  const path = resolvePath(file);
  let cues;
  if (path.endsWith('.json')) {
    cues = JSON.parse(readFileSync(path, 'utf8'));
  } else {
    const module = await import(pathToFileURL(path).href);
    const plan = module.default;
    cues = typeof plan === 'function' ? await plan(context) : plan;
  }
  if (!Array.isArray(cues)) {
    throw Object.assign(
      new Error(`capture: --act ${file} produced ${typeof cues}, expected an array of { at, events } cues`),
      { fatal: true },
    );
  }
  const byFrame = new Map();
  for (const cue of cues) {
    const at = Number(cue.at ?? 0);
    if (!Number.isInteger(at)) {
      throw Object.assign(
        new Error(`capture: --act cue.at must be an integer frame index, got ${String(cue.at)}`),
        { fatal: true },
      );
    }
    const list = byFrame.get(at) ?? [];
    for (const event of cue.events ?? []) list.push(event);
    byFrame.set(at, list);
  }
  return byFrame;
}

/**
 * One event on the wire.
 *
 * Every field but the discriminator is forwarded to CDP as given. `timestamp` is deliberately not
 * set: `@latticekit/input` never reads `event.timeStamp` — it counts gesture durations in ticks —
 * so a synthetic timestamp would be a number in the page's past that only confuses a debugger.
 */
async function dispatch(session, event) {
  if (event.eval !== undefined) {
    const result = await session.send('Runtime.evaluate', {
      expression: event.eval,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const why = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw Object.assign(new Error(`capture: act eval '${event.eval}' threw — ${String(why).split('\n')[0]}`), {
        fatal: true,
      });
    }
    return;
  }
  if (event.mouse !== undefined) {
    const { mouse, ...rest } = event;
    await session.send('Input.dispatchMouseEvent', { type: mouse, pointerType: 'mouse', ...rest });
    return;
  }
  if (event.keyboard !== undefined) {
    const { keyboard, ...rest } = event;
    await session.send('Input.dispatchKeyEvent', { type: keyboard, ...rest });
    return;
  }
  throw Object.assign(
    new Error(
      `capture: an act event needs one of { mouse, keyboard, eval } — got ${JSON.stringify(event).slice(0, 120)}`,
    ),
    { fatal: true },
  );
}

async function capture(args) {
  const stepMs = 1000 / args.fps;
  const { session, close } = await launch({ width: args.width, height: args.height, gpu: args.gpu });
  const problems = [];

  try {
    session.on('Runtime.consoleAPICalled', ({ type, args: values }) => {
      if (type !== 'error' && type !== 'assert') return;
      problems.push(
        `[${type}] ${values.map((v) => v.value ?? v.description ?? v.type).join(' ').slice(0, 300)}`,
      );
    });
    session.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      problems.push(`[exception] ${(exceptionDetails.exception?.description ?? exceptionDetails.text).slice(0, 300)}`);
    });

    await session.send('Runtime.enable');
    await session.send('Page.enable');
    // Belt and braces over `--window-size`: the window Chrome gives back is not always the window
    // asked for, and a shot that is 1278 px wide is a shot the edit has to letterbox.
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: args.width,
      height: args.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: virtualClock({ mode: args.clock }) });
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: stylesheet(args) });

    const loaded = new Promise((resolve) => session.on('Page.loadEventFired', resolve));
    const navigation = await session.send('Page.navigate', { url: args.url });
    if (navigation.errorText) {
      throw Object.assign(
        new Error(`capture: could not open ${args.url} — ${navigation.errorText}. Is the server running?`),
        { fatal: true },
      );
    }
    await Promise.race([loaded, wait(20_000)]);
    // A Vite build fetches, parses and executes its module graph after `load`, and the exhibit's
    // first `requestAnimationFrame` happens somewhere in there. Stepping before it has registered
    // anything is a warmup of zero frames over an empty queue — which produces a perfectly clean
    // capture of a blank canvas and no error anywhere. Wait for the queue to have something in it.
    const armedAfterMs = await waitForFirstFrame(session, 15_000);

    const evaluate = async (expression, label) => {
      const result = await session.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        const why = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
        throw Object.assign(new Error(`capture: ${label} '${expression}' threw — ${String(why).split('\n')[0]}`), {
          fatal: true,
        });
      }
      return result.result.value;
    };

    // A page that swaps its own <head> after boot loses the sheet. Cheap to re-assert once here.
    await evaluate('__trailerCss()', 'stylesheet');
    for (const expression of args.at) await evaluate(expression, '--at');

    const warmupSteps = Math.round(args.warmupMs / stepMs);
    const act = await loadAct(args.act, {
      frames: args.frames,
      fps: args.fps,
      width: args.width,
      height: args.height,
      stepMs,
      warmupSteps,
      warmupMs: args.warmupMs,
    });

    // ── warmup ───────────────────────────────────────────────────────────────────────
    // Warmup cues are addressed from the *end* — `at: -1` is the last warmup step — because the
    // end of the warmup is the only edge of it a shot cares about. A batch may never step over
    // one, so the next cue is a ceiling on the chunk size.
    const warmupCues = [...act.keys()]
      .filter((at) => at < 0)
      .map((at) => at + warmupSteps)
      .sort((a, b) => a - b);
    const warmupStarted = Date.now();
    let reported = -1;
    for (let done = 0; done < warmupSteps; ) {
      const cue = act.get(done - warmupSteps);
      if (cue) for (const event of cue) await dispatch(session, event);
      const nextCue = warmupCues.find((index) => index > done) ?? Infinity;
      const chunk = Math.max(1, Math.min(args.batch, warmupSteps - done, nextCue - done));
      await evaluate(`__stepMany(${chunk}, ${stepMs})`, 'warmup');
      done += chunk;
      // A long warmup is the only part of a capture that looks hung, and 42 s of demo or 202 s of
      // orchard is minutes of silence otherwise. Every 5%, on one rewritten line.
      const percent = Math.floor((done / warmupSteps) * 20);
      if (!args.quiet && !args.json && warmupSteps > 600 && percent !== reported) {
        reported = percent;
        process.stderr.write(`  warmup ${percent * 5}%   \r`);
      }
    }
    const warmupSeconds = (Date.now() - warmupStarted) / 1000;

    for (const expression of args.afterWarmup) await evaluate(expression, '--after-warmup');

    // ── the shot ─────────────────────────────────────────────────────────────────────────────
    if (args.out) {
      mkdirSync(args.out, { recursive: true });
      for (const name of readdirSync(args.out)) {
        if (/^frame-\d+\.png$/.test(name)) rmSync(join(args.out, name));
      }
    }

    const shotStarted = Date.now();
    let bytes = 0;
    const sizes = [];
    for (let frame = 0; frame < args.frames; frame++) {
      const cue = act.get(frame);
      if (cue) for (const event of cue) await dispatch(session, event);
      await evaluate(`__step(${stepMs})`, 'step');
      const { data } = await session.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      const png = Buffer.from(data, 'base64');
      bytes += png.length;
      sizes.push(png.length);
      if (args.out) writeFileSync(join(args.out, `frame-${String(frame).padStart(5, '0')}.png`), png);
      if (!args.quiet && !args.json && frame % 30 === 29) {
        process.stderr.write(`  frame ${frame + 1}/${args.frames}\r`);
      }
    }
    const shotSeconds = (Date.now() - shotStarted) / 1000;

    const stepErrors = await evaluate('JSON.stringify(window.__stepErrors ?? [])', 'step errors');
    const virtualMs = await evaluate('__vnow()', 'clock read');
    for (const error of JSON.parse(stepErrors)) problems.push(`[rAF] ${error.split('\n')[0]}`);

    return {
      url: args.url,
      out: args.out,
      size: `${args.width}x${args.height}`,
      fps: args.fps,
      frames: args.frames,
      warmupMs: args.warmupMs,
      clock: args.clock,
      armedAfterMs,
      virtualMs,
      megabytes: Number((bytes / 1e6).toFixed(1)),
      /** Distinct PNG lengths. One value across a whole shot means nothing on screen ever moved. */
      distinctFrameSizes: new Set(sizes).size,
      warmupSeconds: Number(warmupSeconds.toFixed(1)),
      shotSeconds: Number(shotSeconds.toFixed(1)),
      problems,
    };
  } finally {
    session.close();
    close();
  }
}

/** Poll until the page has a rAF callback pending, so the first step has something to run. */
async function waitForFirstFrame(session, timeoutMs) {
  const start = Date.now();
  for (;;) {
    const { result } = await session.send('Runtime.evaluate', {
      expression: 'typeof __vframes === "function" ? __vframes() : -1',
      returnByValue: true,
    });
    if (Number(result.value) > 0) return Date.now() - start;
    if (Date.now() - start > timeoutMs) {
      throw Object.assign(
        new Error(
          'capture: the page never called requestAnimationFrame in ' +
            `${timeoutMs / 1000}s. Either it does not animate, or its script failed to load.`,
        ),
        { fatal: true },
      );
    }
    await wait(50);
  }
}

function render(report) {
  const lines = [
    `captured ${report.frames} frames of ${report.url} at ${report.size}, ${report.fps} fps`,
    `  world advanced ${(report.virtualMs / 1000).toFixed(2)} s of virtual time ` +
      `(${(report.warmupMs / 1000).toFixed(1)} s warmup, clock ${report.clock})`,
    `  ${report.megabytes} MB, ${report.distinctFrameSizes} distinct frame sizes of ${report.frames}`,
    `  ${report.warmupSeconds} s to warm up, ${report.shotSeconds} s to shoot — ` +
      `${(report.frames / Math.max(report.shotSeconds, 0.001)).toFixed(1)} frames/s of wall clock`,
  ];
  if (report.out) lines.push(`  frames in ${report.out}`);
  if (report.distinctFrameSizes <= 2 && report.frames > 4) {
    lines.push('  WARNING  every frame is the same size on disk. Nothing is moving — open one and look.');
  }
  if (report.problems.length) {
    lines.push('  PROBLEMS');
    for (const problem of report.problems.slice(0, 12)) lines.push(`    ${problem}`);
    if (report.problems.length > 12) lines.push(`    …and ${report.problems.length - 12} more`);
  }
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
  if (!args.url) {
    process.stderr.write(
      'usage: node capture.mjs <url> [--size WxH] [--frames N] [--warmup MS] [--fps N]\n' +
        '                        [--out DIR] [--at EXPR] [--after-warmup EXPR] [--hide SEL]\n' +
        '                        [--css TEXT] [--act FILE] [--clock frozen|hybrid] [--json]\n',
    );
    process.exit(2);
  }
  try {
    const report = await capture(args);
    if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else process.stdout.write(`${render(report)}\n`);
    process.exit(report.problems.length ? 1 : 0);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
}

export { capture, parseArgs };
