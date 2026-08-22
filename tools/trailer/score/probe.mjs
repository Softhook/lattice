#!/usr/bin/env node
/**
 * **Why two identical offline renders are not bit-identical.** A controlled experiment, run
 * against bare Web Audio with no Lattice in the graph at all.
 *
 * `render.mjs` reported that rendering the same score twice into two `OfflineAudioContext`s
 * produces outputs that differ by about −103 dBFS, at instants that line up with the ends of
 * voices. This narrows that to a cause. Four graphs, each rendered twice and hashed:
 *
 * | graph | what it isolates |
 * |---|---|
 * | `plain` | oscillators with an envelope, stopped, and never disconnected |
 * | `onended` | the same, disconnected from an `onended` handler — which is what `render.ts` does |
 * | `filtered` | the same as `plain`, with a biquad in the chain |
 * | `filtered-onended` | both |
 *
 * If `plain` is stable and `onended` is not, the nondeterminism is a main-thread `disconnect()`
 * racing an audio-thread render, and it belongs to the package rather than to the browser.
 *
 * ```bash
 * node tools/trailer/score/probe.mjs
 * ```
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
    (candidate) => existsSync(candidate),
  );

const PAGE = `<!doctype html><meta charset="utf-8"><body><script type="module">
const RATE = 48000, SECONDS = 4, VOICES = 200;

async function build(kind) {
  const ctx = new OfflineAudioContext(1, RATE * SECONDS, RATE);
  const master = ctx.createGain();
  master.gain.value = 0.2;
  master.connect(ctx.destination);
  for (let i = 0; i < VOICES; i += 1) {
    // Deterministic spacing and pitch — no clock and no randomness anywhere in the graph.
    const start = (i * 977 % 3600) / 1000;
    const end = start + 0.35;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.3, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    const chain = [gain];
    let head = gain;
    if (kind.includes('filtered')) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      lp.connect(head);
      chain.push(lp);
      head = lp;
    }
    gain.connect(master);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 200 + (i % 24) * 17;
    osc.connect(head);
    chain.push(osc);
    if (kind.includes('onended')) {
      osc.onended = () => { for (const node of chain) { try { node.disconnect(); } catch {} } };
    }
    osc.start(start);
    osc.stop(end + 0.02);
  }
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}

async function hash(data) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data.buffer.slice(0)));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const lines = [];
for (const kind of ['plain', 'onended', 'filtered', 'filtered-onended']) {
  const a = await build(kind);
  const b = await build(kind);
  let worst = 0;
  for (let i = 0; i < a.length; i += 1) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  lines.push(kind.padEnd(18) + (await hash(a)) + '  ' + (await hash(b)) +
    '  ' + (worst === 0 ? 'IDENTICAL' : 'differs by ' + worst.toExponential(2)));
}
await fetch('/done', { method: 'POST', body: lines.join('\\n') });
</script>`;

let finish;
const finished = new Promise((resolve) => {
  finish = resolve;
});
const server = createServer((request, response) => {
  if (request.method === 'POST') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      finish(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(204).end();
    });
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const profile = mkdtempSync(join(tmpdir(), 'lattice-probe-'));
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
