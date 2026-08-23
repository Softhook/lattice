#!/usr/bin/env node
/**
 * **The one command.** Everything in this directory, from scratch, and a non-zero exit if any of
 * the brief's assertions fail.
 *
 * ```bash
 * node tools/trailer/score-v2/build.mjs
 * ```
 *
 * Five steps, in order, and it stops at the first one that fails:
 *
 * | step | what it produces |
 * |---|---|
 * | `problems()` | the score's own validators, run in Node before a browser is opened |
 * | `tsc --build` | `packages/{audio,core}/dist` — the module graph the render actually imports |
 * | `render.mjs` | `score.wav`, three stems, and the determinism verdict |
 * | `analyze.mjs` | the measurements and `score.png` |
 * | the gate | the twelve assertions below, measured off the rendered samples |
 *
 * The validator step runs **first and in Node**, before forty seconds of `tsc` and a browser, for
 * two reasons: `@latticekit/audio` is safe to import with no DOM by design, so there is no excuse
 * for finding a table fault at the end; and `render.mjs` can only *print* what `problems()`
 * returns, so before this existed a score with a clipping chord rendered green.
 *
 * The build step is here rather than assumed because the render serves `dist` over HTTP and a
 * stale `dist` is the one failure mode that produces a *plausible* wrong answer: the score
 * renders, the numbers look fine, and what was measured is last week's package.
 *
 * `--skip-build` skips only the `tsc` step, for the tuning loop where nothing under `packages/`
 * has moved.
 *
 * Impure: spawns processes, reads and writes files.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeWav } from './wav.mjs';
import { CUES, DURATION_SEC, EVENTS, problems } from './score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

/**
 * What the deliverable has to be, checked rather than declared.
 *
 * The length is read off the score rather than written here, because two places that both claim
 * to know the length of the file are one place too many: the first retime that changed one and
 * not the other would fail this gate for the wrong reason, and the second would pass it while
 * delivering the wrong length.
 */
const WANT = { seconds: DURATION_SEC, rate: 48000, channels: 2 };

/** How close to full scale is close enough. −1 dBFS is the target; this is the window around it. */
const PEAK_WINDOW = { min: 0.85, max: 0.999 };

/** One frame of picture. The unit the flash is measured in, because the flash is one frame long. */
const FRAME_SEC = 1 / 60;

/**
 * The three sync points, as numbers a build can fail on.
 *
 * `flashStepDb` and `holeDb` are Emberwake's measured results, used here as a floor rather than as
 * a target: that score got 22.5 dB of step across one frame and decayed to −31.7 dBFS behind it,
 * and this one is required to match or beat both. `blackDb` and `blackTailDb` have no precedent —
 * the cut to black is this film's own problem — so they are set where a hole stops being a hole:
 * 55 dB under full scale is inaudible against any room, and the last 300 ms is required to be
 * 13 dB quieter again, because a window that is merely quiet throughout is a fade and a window
 * that keeps getting quieter is a silence.
 */
const SYNC = {
  flashStepDb: 22.5,
  holeDb: -31.7,
  blackDb: -55,
  blackTailDb: -68,
};

/** How much residual is allowed between the sum of the stems and the master. 24-bit quantization. */
const STEM_RESIDUAL_DB = -70;

function step(label, command, args, cwd) {
  process.stdout.write(`\n── ${label}\n`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nbuild: ${label} failed with status ${String(result.status)}`);
    process.exit(result.status ?? 1);
  }
}

const db = (value) => (value > 0 ? 20 * Math.log10(value) : -Infinity);

/** Peak, its position in seconds, and RMS over a window. Both channels, because a mix is not one. */
function measure(channels, from, to, rate) {
  const start = Math.max(0, Math.round(from * rate));
  const end = Math.min(channels[0].length, Math.round(to * rate));
  let peak = 0;
  let peakAt = start;
  let sum = 0;
  let count = 0;
  for (const data of channels) {
    for (let i = start; i < end; i += 1) {
      const magnitude = data[i] < 0 ? -data[i] : data[i];
      if (magnitude > peak) {
        peak = magnitude;
        peakAt = i;
      }
      sum += data[i] * data[i];
      count += 1;
    }
  }
  return { peak, peakAt: peakAt / rate, rms: count > 0 ? Math.sqrt(sum / count) : 0 };
}

// --- step one: the score's own validators, before anything expensive -------
process.stdout.write('\n── validators\n');
const faults = problems();
for (const fault of faults) console.error(`  FAIL ${fault}`);
if (faults.length > 0) {
  console.error(`\nbuild: ${String(faults.length)} problem(s) in the score. Nothing was rendered.`);
  process.exit(1);
}
console.log(`  ${String(EVENTS.length)} events, no problems.`);

const skipBuild = process.argv.includes('--skip-build');
if (!skipBuild) step('tsc --build', 'npm', ['run', 'build'], ROOT);
step('render', process.execPath, [join(HERE, 'render.mjs')], ROOT);
step('analyze', process.execPath, [join(HERE, 'analyze.mjs')], ROOT);

// --- the gate --------------------------------------------------------------
// Every one of these is a thing that has silently been wrong in a delivered master somewhere, and
// every one of them is a few lines to check. The peak in particular: `encodeWav` clamps, so a mix
// that went over full scale reads back as exactly full scale and looks fine.
process.stdout.write('\n── gate\n');
const master = join(HERE, 'score.wav');
if (!existsSync(master)) {
  console.error('build: render produced no score.wav');
  process.exit(1);
}
const { channels, sampleRate, frames } = decodeWav(readFileSync(master));
const seconds = frames / sampleRate;

const whole = measure(channels, 0, seconds, sampleRate);
let atFullScale = 0;
for (const data of channels) {
  for (let i = 0; i < frames; i += 1) if (Math.abs(data[i]) >= 0.99999) atFullScale += 1;
}

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

// --- the file is what it claims to be --------------------------------------
check(Math.abs(seconds - WANT.seconds) <= 1e-6, `length is ${seconds.toFixed(6)} s, want ${WANT.seconds.toFixed(6)}`);
check(sampleRate === WANT.rate, `sample rate is ${String(sampleRate)}, want ${String(WANT.rate)}`);
check(channels.length === WANT.channels, `${String(channels.length)} channels, want ${String(WANT.channels)}`);
check(atFullScale === 0, `${String(atFullScale)} samples at or above full scale`);
check(
  whole.peak >= PEAK_WINDOW.min && whole.peak <= PEAK_WINDOW.max,
  `peak is ${db(whole.peak).toFixed(2)} dBFS, want between ${db(PEAK_WINDOW.min).toFixed(1)} and ${db(PEAK_WINDOW.max).toFixed(1)}`,
);

// --- sync point one: the white flash ---------------------------------------
// Three separate claims, because "the peak is at the flash" is not the same as "the flash is
// loud" and neither of them is "there is a hole behind it".
const flashFrame = measure(channels, CUES.flash, CUES.flash + FRAME_SEC, sampleRate);
const runUp = measure(channels, CUES.flash - FRAME_SEC, CUES.flash, sampleRate);
const flashStep = db(flashFrame.peak) - db(runUp.peak);
const hole = measure(channels, CUES.blind[0], CUES.blind[1], sampleRate);
check(
  whole.peakAt >= CUES.flash && whole.peakAt < CUES.flash + FRAME_SEC,
  `the file's loudest sample is at ${whole.peakAt.toFixed(4)} s, and it belongs inside the white frame at ${CUES.flash.toFixed(3)}`,
);
check(
  flashStep >= SYNC.flashStepDb,
  `the flash steps ${flashStep.toFixed(1)} dB across one frame, want at least ${String(SYNC.flashStepDb)}`,
);
check(
  db(hole.rms) <= SYNC.holeDb,
  `the hole behind the flash is ${db(hole.rms).toFixed(1)} dBFS rms, want no louder than ${String(SYNC.holeDb)}`,
);

// --- sync point two: the cut to black --------------------------------------
// The event list is checked symbolically by `problems()`; this is the same claim made about the
// samples, which is the one that can be false while the event list is clean, because every
// envelope in this package is an exponential with a tail and there is no gate anywhere.
const black = measure(channels, CUES.black[0], CUES.black[1], sampleRate);
const blackTail = measure(channels, CUES.black[1] - 0.3, CUES.black[1], sampleRate);
check(
  db(black.rms) <= SYNC.blackDb,
  `the cut to black is ${db(black.rms).toFixed(1)} dBFS rms, want no louder than ${String(SYNC.blackDb)}`,
);
check(
  db(blackTail.rms) <= SYNC.blackTailDb,
  `the last 300 ms of the cut to black is ${db(blackTail.rms).toFixed(1)} dBFS rms, want no louder than ${String(SYNC.blackTailDb)}`,
);

// --- sync point three: the turn --------------------------------------------
// The E flat is checked in `problems()`, where it is a fact about pitch classes rather than about
// samples. What is checked here is that the turn is a *door* and not a *slam*: it must not be
// louder than the shot it interrupts, because act three has an actual climax 5.7 s later and
// nothing before then is allowed to compete with it.
const beforeTurn = measure(channels, CUES.beforeTheBell, CUES.turn, sampleRate);
const afterTurn = measure(channels, CUES.turn, CUES.emberwake, sampleRate);
check(
  afterTurn.peak <= whole.peak * 0.8,
  `the turn peaks at ${db(afterTurn.peak).toFixed(1)} dBFS, within 2 dB of the flash — the door is a slam`,
);

// --- the stems -------------------------------------------------------------
const stemFiles = ['stem-pulse', 'stem-melody', 'stem-floor'].map((name) => join(HERE, `${name}.wav`));
let residual = null;
if (stemFiles.every((file) => existsSync(file))) {
  const stems = stemFiles.map((file) => decodeWav(readFileSync(file)));
  let worst = 0;
  for (let channel = 0; channel < channels.length; channel += 1) {
    for (let i = 0; i < frames; i += 1) {
      let sum = 0;
      for (const stem of stems) sum += stem.channels[channel][i];
      worst = Math.max(worst, Math.abs(sum - channels[channel][i]));
    }
  }
  residual = db(worst);
  check(residual <= STEM_RESIDUAL_DB, `the stems miss the master by ${residual.toFixed(1)} dB, want under ${String(STEM_RESIDUAL_DB)}`);
} else {
  failures.push('one or more stems are missing');
}

console.log(
  `  ${seconds.toFixed(3)} s  ${String(sampleRate)} Hz  ${String(channels.length)} ch  ` +
    `peak ${db(whole.peak).toFixed(2)} dBFS at ${whole.peakAt.toFixed(4)} s  ${String(atFullScale)} samples at full scale`,
);
console.log(
  `  the flash: +${flashStep.toFixed(1)} dB across one frame, hole behind it ${db(hole.rms).toFixed(1)} dBFS rms`,
);
console.log(
  `  the black: ${db(black.rms).toFixed(1)} dBFS rms over 500 ms, ${db(blackTail.rms).toFixed(1)} across its last 300`,
);
console.log(
  `  the turn:  ${db(afterTurn.peak).toFixed(1)} dBFS peak against ${db(beforeTurn.peak).toFixed(1)} before it, ` +
    `${db(whole.peak).toFixed(1)} at the flash`,
);
if (residual !== null) console.log(`  the stems sum to the master to within ${residual.toFixed(1)} dB`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
console.log('  the master is what it claims to be, and it lands where the picture does.');
