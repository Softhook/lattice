#!/usr/bin/env node
/**
 * **The one command.** Everything in this directory, from scratch, and a non-zero exit if any of
 * the brief's assertions fail.
 *
 * ```bash
 * node tools/trailer/score-v3/build.mjs
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

/** One frame of picture. The unit the *step* into the flash is measured in — the white is one frame. */
const FRAME_SEC = 1 / 60;

/**
 * How long after the chord is struck the file's loudest sample is still allowed to be.
 *
 * `score-v2` required this inside the single white frame and got it, because its climax was a
 * noise blast and a noise blast peaks on its first sample. A **chord** does not. Fifteen pitches
 * spelling G major are near-harmonics of the G1 underneath them, so the sum crests every 20 ms and
 * equal temperament makes those crests beat by a decibel or so; the loudest one is whichever the
 * beating favours. See `blaze` in `score.mjs`, which shortens the ring until the *earliest* crest
 * is the loudest — that moved the peak from 63 ms after the picture to 22.
 *
 * 40 ms is two and a half frames and it is inside the chord's own attack and first ring, so the
 * claim it makes is still the real one: the loudest sample in the master belongs to the flash and
 * to nothing else. The sync claim proper is the one-frame *step* below, which is 32 dB.
 */
const FLASH_PEAK_SEC = 0.04;

/**
 * The three sync points, as numbers a build can fail on.
 *
 * `flashStepDb` is the brief's floor of 20 dB raised to the two previous scores' measured results:
 * Emberwake got 22.5 dB across one frame and `score-v2` got 26.0, and there is no reason for this
 * one to be quieter than either. `dropDb` is the hole *in front of* the chord rather than behind
 * it, which is a change from `score-v2`: the shape of the moment comes from the 530 ms the
 * sequencer is stopped for, and measuring the ring after it only measures the chord.
 *
 * `blackDb` and `blackTailDb` are where a hole stops being a hole: 55 dB under full scale is
 * inaudible against any room, and the last 300 ms is required to be 10 dB quieter again, because a
 * window that is merely quiet throughout is a fade and a window that keeps getting quieter is a
 * silence.
 *
 * Both numbers are load-bearing rather than decorative. Struck as a bell, act one's last landing
 * at 7.10 was still at −62 dBFS at 8.95 and the tail measured −64; struck as a pluck it is gone by
 * 7.53 and the tail measures −72. The check is what found that, and the fix was in the music.
 */
const SYNC = {
  flashStepDb: 26,
  dropDb: -26,
  blackDb: -55,
  blackTailDb: -68,
};

/**
 * **Brightness, as a number a build can fail on** — and half the reason this file exists.
 *
 * The commission is *upbeat*, and its failure mode is a third act that escalates by getting
 * darker. `score-v2` did exactly that and measured it: 2–14 kHz fell **2.2 dB** across the turn.
 * So the claim checked here is the direct one — the energy above 2 kHz does not fall at the turn
 * and does not fall in act three.
 *
 * The first version of this check used the ratio of the first difference's RMS to the signal's
 * RMS, which is a spectral *centroid* and is the wrong question: adding a low G1 to a chord lowers
 * the centroid without darkening anything, and the check failed a turn whose 2–14 kHz had in fact
 * gone **up**. Absolute high-band energy is what "brighter" means here.
 */
const BRIGHTER = { turn: 1, actThree: 1 };

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

/** Where "bright" starts, for {@link treble}. The top of the four bands `analyze.mjs` prints. */
const TREBLE_HZ = 2000;

/**
 * RMS above 2 kHz, through a second-order Butterworth high-pass.
 *
 * The filter is primed on the 100 ms before the window and that reading is discarded, because a
 * biquad started cold rings for a few milliseconds and a 400 ms section would carry it into the
 * answer. Compared only against another section of the same file.
 *
 * @tier-b `tan`, `cos` and `sin`. Analysis only: printed to a human, never hashed, never persisted.
 */
function treble(channels, from, to, rate) {
  const w = Math.tan((Math.PI * TREBLE_HZ) / rate);
  const q = Math.SQRT1_2;
  const norm = 1 / (1 + w / q + w * w);
  const b0 = norm;
  const b1 = -2 * norm;
  const b2 = norm;
  const a1 = 2 * (w * w - 1) * norm;
  const a2 = (1 - w / q + w * w) * norm;
  const prime = Math.max(0, Math.round((from - 0.1) * rate));
  const start = Math.max(0, Math.round(from * rate));
  const end = Math.min(channels[0].length, Math.round(to * rate));
  let sum = 0;
  let count = 0;
  for (const data of channels) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = prime; i < end; i += 1) {
      const x0 = data[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
      if (i >= start) {
        sum += y0 * y0;
        count += 1;
      }
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
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
const hole = measure(channels, CUES.drop[0], CUES.drop[1], sampleRate);
check(
  whole.peakAt >= CUES.flash && whole.peakAt < CUES.flash + FLASH_PEAK_SEC,
  `the file's loudest sample is at ${whole.peakAt.toFixed(4)} s, ${((whole.peakAt - CUES.flash) * 1000).toFixed(1)} ms from the flash — it belongs to the chord at ${CUES.flash.toFixed(3)}`,
);
check(
  flashStep >= SYNC.flashStepDb,
  `the flash steps ${flashStep.toFixed(1)} dB across one frame, want at least ${String(SYNC.flashStepDb)}`,
);
check(
  db(hole.rms) <= SYNC.dropDb,
  `the drop in front of the flash is ${db(hole.rms).toFixed(1)} dBFS rms, want no louder than ${String(SYNC.dropDb)}`,
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
  `the turn peaks at ${db(afterTurn.peak).toFixed(1)} dBFS, within 2 dB of the flash — nothing may compete with 21.73`,
);

// The commission, as two assertions. Act three escalates by getting brighter, and a score that
// starts flattening degrees to raise the stakes fails here rather than in review.
const litBefore = treble(channels, CUES.beforeTheBell, CUES.turn, sampleRate);
const litTurn = treble(channels, CUES.turn, CUES.emberwake, sampleRate);
const litTwo = treble(channels, CUES.chimePath, CUES.turn, sampleRate);
const litThree = treble(channels, CUES.emberwake, CUES.magazine, sampleRate);
check(
  litTurn >= litBefore * BRIGHTER.turn,
  `the turn loses ${(db(litBefore) - db(litTurn)).toFixed(1)} dB above 2 kHz against the shot before it — act three opens by lifting, not by darkening`,
);
check(
  litThree >= litTwo * BRIGHTER.actThree,
  `act three loses ${(db(litTwo) - db(litThree)).toFixed(1)} dB above 2 kHz against act two — the escalation has to go up`,
);

// And the ending has to land somewhere that feels good, which at minimum means it is not the
// quietest thing in the film. `score-v2`'s card was 6 dB under its own second act.
const card = measure(channels, CUES.endCard, CUES.endCard + 1, sampleRate);
const actTwo = measure(channels, CUES.chimePath, CUES.turn, sampleRate);
check(
  card.rms >= actTwo.rms,
  `the end card is ${(db(card.rms) - db(actTwo.rms)).toFixed(1)} dB under act two — a resolution has to arrive, not fade in`,
);

// --- the stems -------------------------------------------------------------
const stemFiles = ['stem-pulse', 'stem-melody', 'stem-harmony'].map((name) => join(HERE, `${name}.wav`));
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
  `  the flash: +${flashStep.toFixed(1)} dB across one frame, peak ${((whole.peakAt - CUES.flash) * 1000).toFixed(1)} ms in, ` +
    `the drop in front of it ${db(hole.rms).toFixed(1)} dBFS rms`,
);
console.log(
  `  the black: ${db(black.rms).toFixed(1)} dBFS rms over 500 ms, ${db(blackTail.rms).toFixed(1)} across its last 300`,
);
console.log(
  `  the turn:  ${db(afterTurn.peak).toFixed(1)} dBFS peak against ${db(beforeTurn.peak).toFixed(1)} before it, ` +
    `${db(whole.peak).toFixed(1)} at the flash`,
);
console.log(
  `  above 2 kHz: act two ${db(litTwo).toFixed(1)}, the turn ${db(litTurn).toFixed(1)} against ${db(litBefore).toFixed(1)} ` +
    `for the shot before it, act three ${db(litThree).toFixed(1)} dBFS rms`,
);
console.log(
  `  the card:  ${db(card.rms).toFixed(1)} dBFS rms over its first second, against ${db(actTwo.rms).toFixed(1)} for act two`,
);
if (residual !== null) console.log(`  the stems sum to the master to within ${residual.toFixed(1)} dB`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
console.log('  the master is what it claims to be, and it lands where the picture does.');
