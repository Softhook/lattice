#!/usr/bin/env node
/**
 * **Prove the harness before trusting it.** Capture the same shot twice into two directories and
 * diff the PNGs byte for byte.
 *
 * This is not a nicety. Everything else here rests on one claim — *the world is a function of its
 * step count, so a slow machine and a fast one produce the same frames* — and a claim that has
 * never been checked is a hope. If two runs of the same command differ, either the kit is reading
 * a clock it should not, or this harness is leaking one, and both of those are more interesting
 * than a trailer.
 *
 * It also reports the frames that are **identical to their predecessor**, which is the other way a
 * capture goes quietly wrong: a shot in which nothing moves reads as a still and costs the edit two
 * seconds it cannot get back. A page whose animation is driven from `setTimeout` rather than rAF
 * produces exactly that, because this harness leaves timers on the real clock on purpose.
 *
 * ```bash
 * node tools/trailer/verify.mjs http://127.0.0.1:8471/x/crowd/ --frames 40 --warmup 4000
 * ```
 *
 * Every flag is forwarded to `capture.mjs` untouched apart from `--out`, which is taken over.
 * Exit `0` when the two runs are byte-identical, `1` when they are not.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const forwarded = process.argv.slice(2).filter((arg, i, all) => arg !== '--out' && all[i - 1] !== '--out');
const keep = process.argv.includes('--keep');

const runs = [mkdtempSync(join(tmpdir(), 'trailer-a-')), mkdtempSync(join(tmpdir(), 'trailer-b-'))];
try {
  for (const out of runs) {
    execFileSync('node', [join(here, 'capture.mjs'), ...forwarded.filter((a) => a !== '--keep'), '--out', out, '--quiet'], {
      stdio: 'inherit',
    });
  }

  const names = readdirSync(runs[0]).filter((n) => n.endsWith('.png')).sort();
  const other = readdirSync(runs[1]).filter((n) => n.endsWith('.png')).sort();
  if (names.length !== other.length) {
    process.stdout.write(`DIFFER: ${names.length} frames in run A, ${other.length} in run B\n`);
    process.exit(1);
  }

  const differing = [];
  let previous = null;
  const still = [];
  for (const name of names) {
    const a = readFileSync(join(runs[0], name));
    const b = readFileSync(join(runs[1], name));
    if (!a.equals(b)) differing.push(name);
    if (previous && previous.equals(a)) still.push(name);
    previous = a;
  }

  const identical = differing.length === 0;
  process.stdout.write(
    `${identical ? 'IDENTICAL' : 'DIFFER'}: ${names.length - differing.length}/${names.length} frames byte-for-byte equal across two runs\n`,
  );
  if (differing.length) {
    process.stdout.write(`  first divergence at ${differing[0]}, ${differing.length} frames differ\n`);
    process.stdout.write(`  run A: ${runs[0]}\n  run B: ${runs[1]}\n`);
  }
  process.stdout.write(
    still.length === 0
      ? '  every frame differs from the one before it — the shot is moving\n'
      : `  ${still.length}/${names.length} frames are identical to their predecessor: ${still.slice(0, 6).join(', ')}${still.length > 6 ? ', …' : ''}\n`,
  );
  process.exit(identical ? 0 : 1);
} finally {
  if (!keep) for (const dir of runs) rmSync(dir, { recursive: true, force: true });
}
