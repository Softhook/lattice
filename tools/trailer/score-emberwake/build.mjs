#!/usr/bin/env node
/**
 * **The one command.** Everything in this directory, from scratch.
 *
 * ```bash
 * node tools/trailer/score-emberwake/build.mjs
 * ```
 *
 * Four steps, in order, and it stops at the first one that fails:
 *
 * | step | what it produces |
 * |---|---|
 * | `tsc --build` | `packages/{audio,core}/dist` — the module graph the render actually imports |
 * | `render.mjs` | `score.wav`, three stems, and the determinism verdict |
 * | `analyze.mjs` | the measurements and `score.png` |
 * | the gate | a non-zero exit if the master is not `DURATION_SEC` / 48 kHz / stereo, or if any sample reached full scale |
 *
 * The build step is here rather than assumed because the render serves `dist` over HTTP and a
 * stale `dist` is the one failure mode that produces a *plausible* wrong answer: the score renders,
 * the numbers look fine, and what was measured is last week's package.
 *
 * `--skip-build` skips only the first step, for the tuning loop where nothing under `packages/`
 * has moved and forty seconds of `tsc` is forty seconds.
 *
 * Impure: spawns processes, writes files.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeWav } from './wav.mjs';
import { DURATION_SEC } from './score.mjs';

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

function step(label, command, args, cwd) {
  process.stdout.write(`\n── ${label}\n`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nbuild: ${label} failed with status ${String(result.status)}`);
    process.exit(result.status ?? 1);
  }
}

const skipBuild = process.argv.includes('--skip-build');
if (!skipBuild) step('tsc --build', 'npm', ['run', 'build'], ROOT);
step('render', process.execPath, [join(HERE, 'render.mjs')], ROOT);
step('analyze', process.execPath, [join(HERE, 'analyze.mjs')], ROOT);

// --- the gate --------------------------------------------------------------
// Every one of these is a thing that has silently been wrong in a delivered master somewhere, and
// every one of them is one line to check. The peak in particular: `encodeWav` clamps, so a mix
// that went over full scale reads back as exactly full scale and looks fine.
process.stdout.write('\n── gate\n');
const master = join(HERE, 'score.wav');
if (!existsSync(master)) {
  console.error('build: render produced no score.wav');
  process.exit(1);
}
const { channels, sampleRate, frames } = decodeWav(readFileSync(master));
const seconds = frames / sampleRate;
let peak = 0;
let atFullScale = 0;
for (const data of channels) {
  for (let i = 0; i < frames; i += 1) {
    const magnitude = data[i] < 0 ? -data[i] : data[i];
    if (magnitude > peak) peak = magnitude;
    if (magnitude >= 0.99999) atFullScale += 1;
  }
}

const failures = [];
if (Math.abs(seconds - WANT.seconds) > 1e-6) failures.push(`length is ${seconds.toFixed(6)} s, want ${WANT.seconds.toFixed(6)}`);
if (sampleRate !== WANT.rate) failures.push(`sample rate is ${sampleRate}, want ${WANT.rate}`);
if (channels.length !== WANT.channels) failures.push(`${channels.length} channels, want ${WANT.channels}`);
if (atFullScale > 0) failures.push(`${atFullScale} samples at or above full scale`);
if (peak < PEAK_WINDOW.min || peak > PEAK_WINDOW.max) {
  failures.push(`peak is ${(20 * Math.log10(peak)).toFixed(2)} dBFS, want between ${(20 * Math.log10(PEAK_WINDOW.min)).toFixed(1)} and ${(20 * Math.log10(PEAK_WINDOW.max)).toFixed(1)}`);
}

console.log(
  `  ${seconds.toFixed(3)} s  ${sampleRate} Hz  ${channels.length} ch  ` +
    `peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS  ${atFullScale} samples at full scale`,
);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}
console.log('  the master is what it claims to be.');
