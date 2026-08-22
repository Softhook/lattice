#!/usr/bin/env node
/**
 * **One sample of a bell, at full scale, before its envelope starts.**
 *
 * `analyze.mjs` found a single-sample impulse of −0.34 at exactly 1.1000 s in a passage whose
 * neighbouring samples are ±0.005 — a click, reproducible across renders and across processes,
 * and present in only one of the 133 notes in the score. This isolates it: one bell, played by
 * `@latticekit/audio` into an otherwise empty `OfflineAudioContext`, at a sweep of start times
 * and with the layers taken away one at a time.
 *
 * ```bash
 * node tools/trailer/score/probe-click.mjs
 * ```
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const CHROME =
  process.env.CHROME_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
    (candidate) => existsSync(candidate),
  );

const PAGE = `<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"@latticekit/audio":"/audio/index.js","@latticekit/core":"/core/index.js"}}</script>
<body><script type="module">
import { createAudio } from '@latticekit/audio';

const RATE = 48000;
const C5 = 523.2511306011972;   // the pitch the click happens on, as score.mjs computes it

/** The five layers of score.mjs's bell, in order, so a subset can be named by index. */
const LAYERS = [
  { wave: 'sine', hz: C5, gain: 0.15, hold: 2.9, cutoff: 2600 },
  { wave: 'sine', hz: C5 * 2, gain: 0.072, hold: 1.25, cutoff: 5200, delay: 0.004 },
  { wave: 'triangle', hz: C5 * 3, gain: 0.032, hold: 0.45, cutoff: 9000 },
  { wave: 'noise', hz: 0, gain: 0.042, hold: 0.045, highpass: 2600, cutoff: 11000 },
  { wave: 'sine', hz: C5 * 5, gain: 0.024, hold: 0.14 },
];

async function run(layers, start, pan) {
  const context = new OfflineAudioContext(2, RATE * 3, RATE);
  let clock = 0;
  const audio = createAudio({
    sounds: { b: { bus: 'sfx', minGapMs: 70, layers: layers.map((index) => LAYERS[index]) } },
    context: () => context,
    now: () => clock,
  });
  audio.mixer.setGain('master', 1);
  audio.unlock();
  clock = start;
  audio.play('b', { at: start, gain: 0.55, pan });
  const buffer = await context.startRendering();
  const data = buffer.getChannelData(1);
  const n = Math.round(start * RATE);
  let worst = 0;
  let worstAt = 0;
  for (let i = Math.max(3, n - 40); i < n + 400; i += 1) {
    const neighbours = Math.max(Math.abs(data[i - 3]), Math.abs(data[i - 2]), Math.abs(data[i + 2]), Math.abs(data[i + 3]));
    const ratio = Math.abs(data[i]) / (neighbours + 1e-12);
    if (Math.abs(data[i]) > 0.004 && ratio > 6 && Math.abs(data[i]) > worst) {
      worst = Math.abs(data[i]);
      worstAt = i - n;
    }
  }
  return worst > 0 ? \`spike \${worst.toFixed(4)} at start+\${worstAt}\` : 'clean';
}

const lines = [];
const VARIANTS = {
  'noise bandpassed': { wave: 'noise', hz: 0, gain: 0.042, hold: 0.045, highpass: 2600, cutoff: 11000 },
  'noise highpass  ': { wave: 'noise', hz: 0, gain: 0.042, hold: 0.045, highpass: 2600 },
  'noise lowpass   ': { wave: 'noise', hz: 0, gain: 0.042, hold: 0.045, cutoff: 11000 },
  'noise unfiltered': { wave: 'noise', hz: 0, gain: 0.042, hold: 0.045 },
  'sine unfiltered ': { wave: 'sine', hz: C5, gain: 0.042, hold: 0.045 },
};

async function one(layer, start, pan = 0.16) {
  const context = new OfflineAudioContext(2, RATE * 2, RATE);
  let clock = 0;
  const audio = createAudio({
    sounds: { b: { bus: 'sfx', minGapMs: 70, layers: [layer] } },
    context: () => context,
    now: () => clock,
  });
  audio.mixer.setGain('master', 1);
  audio.unlock();
  clock = start;
  audio.play('b', { at: start, gain: 0.55, pan });
  const data = (await context.startRendering()).getChannelData(1);
  const n = Math.round(start * RATE);
  let worst = 0;
  for (let i = Math.max(3, n - 20); i < n + 300; i += 1) {
    const near = Math.max(Math.abs(data[i - 3]), Math.abs(data[i - 2]), Math.abs(data[i + 2]), Math.abs(data[i + 3]));
    if (Math.abs(data[i]) > 0.004 && Math.abs(data[i]) > near * 6) worst = Math.max(worst, Math.abs(data[i]));
  }
  return worst;
}

lines.push('--- which chain leaks, at 1.1 s ---');
for (const [name, layer] of Object.entries(VARIANTS)) {
  lines.push('  ' + name + '  ' + ((await one(layer, 1.1)) || 'clean'));
}

lines.push('--- bandpassed noise, start swept in 1 ms steps from 1.05 to 1.15 ---');
const hits = [];
for (let ms = 1050; ms <= 1150; ms += 1) {
  const worst = await one(VARIANTS['noise bandpassed'], ms / 1000);
  if (worst) hits.push(ms / 1000 + '=' + worst.toFixed(3));
}
lines.push('  ' + (hits.length ? hits.join(' ') : 'none'));

lines.push('--- bandpassed noise, start swept in 10 ms steps from 0.00 to 3.00 ---');
const coarse = [];
for (let ms = 0; ms <= 3000; ms += 10) {
  const worst = await one(VARIANTS['noise bandpassed'], ms / 1000);
  if (worst) coarse.push(ms / 1000 + '=' + worst.toFixed(3));
}
lines.push('  ' + (coarse.length ? coarse.join(' ') : 'none') + '   (' + coarse.length + ' of 301)');

await fetch('/done', { method: 'POST', body: lines.join('\\n') });
</script>`;

let finish;
const finished = new Promise((resolve) => {
  finish = resolve;
});
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      finish(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(204).end();
    });
    return;
  }
  const serve = (file) => {
    if (!existsSync(file)) return response.writeHead(404).end('no');
    response.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(file));
  };
  if (url.pathname.startsWith('/audio/')) return serve(join(ROOT, 'packages/audio/dist', url.pathname.slice(7)));
  if (url.pathname.startsWith('/core/')) return serve(join(ROOT, 'packages/core/dist', url.pathname.slice(6)));
  response.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const profile = mkdtempSync(join(tmpdir(), 'lattice-click-'));
const child = spawn(
  CHROME,
  ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--mute-audio', `http://127.0.0.1:${server.address().port}/`],
  { stdio: 'ignore' },
);
setTimeout(() => finish('timeout'), 120000);
console.log(await finished);
child.kill('SIGKILL');
server.close();
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  // A browser profile the browser is still flushing. A leftover temp directory is not a result.
}
