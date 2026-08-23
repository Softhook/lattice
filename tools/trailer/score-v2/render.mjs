#!/usr/bin/env node
/**
 * **Render the trailer score to WAV.** One command, no dependencies, no build step.
 *
 * ```bash
 * node tools/trailer/score-v2/render.mjs
 * ```
 *
 * It serves `packages/audio/dist` and `packages/core/dist` to a headless Chrome behind an import
 * map, renders the score into an `OfflineAudioContext` at 48 kHz stereo faster than real time,
 * and writes the resulting WAVs back here over `POST`. Nothing is installed and nothing is
 * bundled: what renders is the published module graph.
 *
 * ## Why a browser at all
 *
 * `@latticekit/audio`'s whole rendering half is Web Audio. Rendering it in Node would mean
 * re-implementing `BiquadFilterNode` and `exponentialRampToValueAtTime`, and a score that sounded
 * right against my re-implementation and wrong against a browser would be a worse outcome than
 * no score. An `OfflineAudioContext` is the same code path a player hears, run faster than real
 * time.
 *
 * ## What it renders
 *
 * | file | what it is for |
 * |---|---|
 * | `score.wav` | the master. 29.92 s, 48 kHz, stereo, 24-bit |
 * | `stem-pulse.wav` `stem-melody.wav` `stem-floor.wav` | the three layers, so the edit can duck or drop one without a re-render. They sum, sample for sample, to the master |
 * | `check-*.wav` | the determinism passes, deleted unless `--keep` |
 *
 * Impure by nature: opens a socket, spawns a browser, writes files.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

/** Where a browser might be, in the order worth trying. Same list `tools/looking/look.mjs` uses. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) if (candidate && existsSync(candidate)) return candidate;
  return null;
}

/**
 * Every pass, in render order.
 *
 * `dup` and the two `flat` passes are not deliverables — they are the determinism check, and they
 * are rendered in the *same page* as the master so that a difference cannot be blamed on a
 * different browser process.
 */
const PASSES = [
  { name: 'score' },
  { name: 'check-dup' },
  { name: 'check-flat-steady', flat: true },
  { name: 'check-flat-jitter', flat: true, jitter: true },
  { name: 'check-jitter', jitter: true },
  { name: 'stem-pulse', stems: ['pulse'] },
  { name: 'stem-melody', stems: ['melody'] },
  { name: 'stem-floor', stems: ['floor'] },
];

const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };

async function main() {
  const keep = process.argv.includes('--keep');
  const binary = findChrome();
  if (!binary) {
    console.error('render: no Chrome, Chromium or Edge found. Set CHROME_PATH to a browser binary.');
    process.exit(2);
  }

  const written = [];
  const meta = [];
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });

  const serve = (response, path, type) => {
    if (!existsSync(path)) {
      response.writeHead(404).end('no');
      return;
    }
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(readFileSync(path));
  };

  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;

    if (request.method === 'POST') {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        const body = Buffer.concat(chunks);
        if (path === '/log') console.log(`  ${body.toString('utf8')}`);
        else if (path === '/meta') meta.push(JSON.parse(body.toString('utf8')));
        else if (path === '/out') {
          const name = url.searchParams.get('name');
          const file = join(HERE, `${name}.wav`);
          writeFileSync(file, body);
          written.push({ name, file, bytes: body.length, sha: createHash('sha256').update(body).digest('hex') });
        } else if (path === '/done') finish(body.toString('utf8'));
        response.writeHead(204).end();
      });
      return;
    }

    if (path === '/' || path === '/page.html') return serve(response, join(HERE, 'page.html'), MIME['.html']);
    if (path === '/job') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(PASSES));
      return;
    }
    if (path === '/score.mjs' || path === '/wav.mjs') return serve(response, join(HERE, path), MIME['.mjs']);
    if (path.startsWith('/audio/')) return serve(response, join(ROOT, 'packages/audio/dist', path.slice(7)), MIME['.js']);
    if (path.startsWith('/core/')) return serve(response, join(ROOT, 'packages/core/dist', path.slice(6)), MIME['.js']);
    response.writeHead(404).end('no');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const profile = mkdtempSync(join(tmpdir(), 'lattice-score-'));
  const child = spawn(
    binary,
    [
      '--headless=new',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--mute-audio',
      `http://127.0.0.1:${port}/`,
    ],
    { stdio: 'ignore' },
  );

  const timeout = setTimeout(() => finish('timeout'), 180000);
  const outcome = await finished;
  clearTimeout(timeout);
  try {
    child.kill('SIGKILL');
  } catch {
    /* already gone */
  }
  server.close();
  try {
    // A browser profile the browser is still flushing as it dies. A leftover temp directory has
    // no business failing a render that has already written its files.
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* it will be swept with the rest of /tmp */
  }

  if (outcome !== 'ok') {
    console.error(`render: the page reported "${outcome}"`);
    process.exit(1);
  }

  const by = Object.fromEntries(written.map((entry) => [entry.name, entry]));
  console.log('');
  for (const entry of written) console.log(`  ${entry.name.padEnd(18)} ${String(entry.bytes).padStart(9)} B  ${entry.sha.slice(0, 16)}`);

  // --- the determinism result, printed rather than assumed ------------------
  //
  // Two different questions, and they have two different answers, which is the whole reason
  // this prints two columns. **What the package decides** — the stream of `VoicePlan`s, which is
  // pure Tier A policy with an injected clock — is bit-identical every time. **What the browser
  // computes from those decisions** is not: `probe.mjs` shows two renders of two hundred plain
  // oscillators differing by one float32 ULP with no Lattice in the graph at all, and a chain of
  // biquads amplifies that to about −100 dBFS. The kit's determinism claim holds at the layer it
  // is made about; it cannot hold below it, and no audio kit's can.
  const byName = Object.fromEntries(meta.map((entry) => [entry.name, entry]));
  const verdict = (a, b, field) => {
    const left = field === 'bytes' ? by[a]?.sha : byName[a]?.[field];
    const right = field === 'bytes' ? by[b]?.sha : byName[b]?.[field];
    return left !== undefined && left === right ? 'IDENTICAL' : 'DIFFERENT';
  };
  const row = (label, a, b) =>
    console.log(
      `  ${label.padEnd(46)} plans ${verdict(a, b, 'order').padEnd(10)} as a set ${verdict(a, b, 'set').padEnd(10)} samples ${verdict(a, b, 'bytes')}`,
    );
  console.log('');
  row('the same score, rendered twice', 'score', 'check-dup');
  row('steady vs jittering pump, intensity held', 'check-flat-steady', 'check-flat-jitter');
  row('steady vs jittering pump, score as written', 'score', 'check-jitter');
  console.log(
    `\n  voices scheduled: ${String(byName['check-flat-steady']?.voices)} steady, ${String(byName['check-flat-jitter']?.voices)} jittering (intensity held) — ` +
      `${String(byName.score?.voices)} vs ${String(byName['check-jitter']?.voices)} with the intensity moving`,
  );

  if (!keep) {
    for (const entry of written) {
      if (entry.name.startsWith('check-')) unlinkSync(entry.file);
    }
  }
  console.log(`\n  wrote ${join(HERE, 'score.wav')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
