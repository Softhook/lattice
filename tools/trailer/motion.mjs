#!/usr/bin/env node
/**
 * **Is anything actually happening?** The fraction of pixels that changed between the first frame
 * of a shot and each later one, and the fraction that changed frame to frame.
 *
 * A shot can be byte-different every frame and still be dead: a clock digit ticking in the corner
 * of an otherwise frozen world changes forty pixels out of nine hundred thousand and satisfies
 * every automatic check there is. This prints the number so that "it moves" is a measurement and
 * not an impression, and it is the check that decides whether a shot earns its seconds.
 *
 * The PNG decoder is `tools/looking/look.mjs`'s, imported rather than copied — that file exports
 * `decodePng`, so there is nothing to duplicate and nothing of somebody else's to edit.
 *
 * ```bash
 * node tools/trailer/motion.mjs tools/trailer/shots/02-crowd
 * ```
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const lookPath =
  process.env.LOOK_MJS ?? join(dirname(dirname(fileURLToPath(import.meta.url))), 'looking/look.mjs');
const { decodePng } = await import(lookPath);

/** Fraction of pixels whose RGB differs by more than `tolerance` on any channel. */
function changed(a, b, tolerance = 6) {
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > tolerance ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > tolerance ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > tolerance
    ) {
      count++;
    }
  }
  return count / (a.data.length / 4);
}

const dir = process.argv[2];
const names = readdirSync(dir).filter((n) => /^frame-\d+\.png$/.test(n)).sort();
if (names.length < 2) {
  process.stdout.write(`${dir}: ${names.length} frames — nothing to compare\n`);
  process.exit(0);
}

const at = (i) => decodePng(readFileSync(join(dir, names[i])));
const first = at(0);
const last = at(names.length - 1);
const middle = at(Math.floor(names.length / 2));
// Consecutive motion is sampled rather than exhaustive: a hundred and eighty full-frame diffs is
// twenty seconds of decoding for a number whose shape is obvious from six.
const stride = Math.max(1, Math.floor(names.length / 6));
const consecutive = [];
for (let i = stride; i < names.length; i += stride) consecutive.push(changed(at(i - 1), at(i)));

const pct = (v) => `${(v * 100).toFixed(2)}%`;
process.stdout.write(
  `${dir}\n` +
    `  ${names.length} frames\n` +
    `  first→last    ${pct(changed(first, last))}\n` +
    `  first→middle  ${pct(changed(first, middle))}\n` +
    `  frame→frame   min ${pct(Math.min(...consecutive))}  max ${pct(Math.max(...consecutive))}\n`,
);
