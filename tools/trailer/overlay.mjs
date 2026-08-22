/**
 * overlay.mjs — the trailer's words, rendered as transparent PNGs by the same browser that films
 * the shots.
 *
 * ## Why not ffmpeg's drawtext
 *
 * `drawtext` can put a string on a frame, and for one line in one weight it is the right tool.
 * This trailer needs the site's typography — Fraunces at a display size over IBM Plex Mono at a
 * caption size, with the letter-spacing and the color pair the page already uses — and once you
 * are specifying that in filter syntax you have written a worse layout engine than the one
 * already open in the next process. So the captions are HTML, laid out by Chrome, screenshotted
 * with a transparent background, and composited by ffmpeg as images.
 *
 * The fonts are read off disk from `site/public/fonts` and inlined as data URIs, because the
 * renderer must not depend on the network to produce a frame — the same rule the kit applies to
 * itself.
 *
 * ## The rule the captions follow
 *
 * Every number that appears here has to be one somebody can reproduce. `docs/GALLERY.md` and the
 * landing page both hold the line that a figure without a command behind it does not ship, and a
 * trailer is the easiest place in a project to break it — nobody pauses a two-second shot to check
 * whether 900 was really 900. The manifest carries a `source` next to every caption for that
 * reason, and `build.mjs` refuses a caption that has a number in it and no source.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { Session, findChrome, readDevToolsPort, fetchJson } from '../looking/look.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const FONTS = join(REPO, 'site', 'public', 'fonts');

const dataUri = (file) => `data:font/woff2;base64,${readFileSync(join(FONTS, file)).toString('base64')}`;

/**
 * The one stylesheet. Two families, three roles:
 *
 *   display  Fraunces 600     the wordmark and the end card
 *   label    IBM Plex Mono    the tag over a shot — small, wide-tracked, upper case
 *   figure   IBM Plex Mono    the number, which is the only thing allowed to be loud
 *
 * Everything sits on a soft dark scrim rather than directly on the art. A caption laid straight
 * over a dusk palette is legible in the shot you tested and invisible in the next one, and the
 * trailer has eleven of them.
 */
const CSS = () => `
@font-face { font-family: 'Fraunces'; src: url('${dataUri('fraunces-600.woff2')}') format('woff2'); font-weight: 600; }
@font-face { font-family: 'Plex'; src: url('${dataUri('ibm-plex-mono-400.woff2')}') format('woff2'); font-weight: 400; }
@font-face { font-family: 'Plex'; src: url('${dataUri('ibm-plex-mono-600.woff2')}') format('woff2'); font-weight: 600; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; background: transparent; }
body { display: flex; font-family: 'Plex', ui-monospace, monospace; -webkit-font-smoothing: antialiased; }

/* A caption sits bottom-left with a gradient that dies out well before the middle of the frame,
   so the art keeps the two thirds of the picture that matter. */
.caption { align-self: flex-end; padding: 0 0 68px 72px; }
.caption .label { font-size: 19px; font-weight: 600; letter-spacing: 0.20em; text-transform: uppercase; color: #f0b429; }
.caption .figure { font-family: 'Fraunces', Georgia, serif; font-size: 62px; line-height: 1.06; color: #fdfcfb; margin-top: 10px; letter-spacing: -0.015em; }
.caption .sub { font-size: 20px; color: rgba(253,252,251,0.74); margin-top: 12px; letter-spacing: 0.01em; }
.scrim { position: fixed; inset: 0; background:
   linear-gradient(to top, rgba(8,7,12,0.86) 0%, rgba(8,7,12,0.52) 22%, rgba(8,7,12,0) 46%),
   linear-gradient(to right, rgba(8,7,12,0.60) 0%, rgba(8,7,12,0) 52%); z-index: -1; }

/* A card fills the frame and is its own background — used for the open and the close. */
.card { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #08070c; text-align: center; }
.card .mark { font-family: 'Fraunces', Georgia, serif; font-size: 126px; color: #fdfcfb; letter-spacing: -0.03em; line-height: 1; }
.card .rule { width: 76px; height: 2px; background: #f0b429; margin: 34px 0; }
.card .line { font-size: 25px; color: rgba(253,252,251,0.80); letter-spacing: 0.01em; }
.card .cmd { margin-top: 40px; font-size: 25px; font-weight: 600; color: #f0b429; background: rgba(240,180,41,0.09);
             border: 1px solid rgba(240,180,41,0.30); border-radius: 8px; padding: 15px 26px; }
.card .url { margin-top: 30px; font-size: 22px; color: rgba(253,252,251,0.58); letter-spacing: 0.04em; }
.card .foot { margin-top: 16px; font-size: 17px; color: rgba(253,252,251,0.38); letter-spacing: 0.02em; }

/* The wordmark over the opening shot. Left-anchored rather than centred, because the demo's
   composition puts its shrine top-left and its lit road bottom-right, and a centred mark lands
   in the one place both are trying to occupy. */
.mark-over { align-self: center; padding-left: 88px; }
.mark-over .name { font-family: 'Fraunces', Georgia, serif; font-size: 104px; color: #fdfcfb; letter-spacing: -0.03em; line-height: 1; }
.mark-over .tag { margin-top: 18px; font-size: 23px; letter-spacing: 0.14em; text-transform: uppercase; color: #f0b429; }

/* The turn. A sentence a person typed, set as a prompt rather than as prose — this is the one
   place in the film where the words are the subject and the picture is the consequence. */
.sentence { flex: 1; display: flex; flex-direction: column; justify-content: center; background: #08070c; padding: 0 132px; }
.sentence .caret { font-size: 21px; color: #f0b429; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 26px; }
.sentence .said { font-size: 38px; line-height: 1.5; color: #fdfcfb; }
.sentence .said .dim { color: rgba(253,252,251,0.42); }
`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function captionHtml(spec) {
  if (spec.kind === 'card') {
    return `<style>${CSS()}</style><div class="card">
      <div class="mark">${esc(spec.mark ?? '')}</div>
      ${spec.rule === false ? '' : '<div class="rule"></div>'}
      ${spec.line ? `<div class="line">${esc(spec.line)}</div>` : ''}
      ${spec.cmd ? `<div class="cmd">${esc(spec.cmd)}</div>` : ''}
      ${spec.url ? `<div class="url">${esc(spec.url)}</div>` : ''}
      ${spec.foot ? `<div class="foot">${esc(spec.foot)}</div>` : ''}
    </div>`;
  }
  if (spec.kind === 'wordmark') {
    return `<style>${CSS()}</style><div class="scrim"></div><div class="mark-over">
      <div class="name">${esc(spec.mark ?? 'Lattice')}</div>
      ${spec.tag ? `<div class="tag">${esc(spec.tag)}</div>` : ''}
    </div>`;
  }
  if (spec.kind === 'sentence') {
    return `<style>${CSS()}</style><div class="sentence">
      ${spec.caret ? `<div class="caret">${esc(spec.caret)}</div>` : ''}
      <div class="said">${esc(spec.said ?? '')}</div>
    </div>`;
  }
  return `<style>${CSS()}</style><div class="scrim"></div><div class="caption">
    ${spec.label ? `<div class="label">${esc(spec.label)}</div>` : ''}
    ${spec.figure ? `<div class="figure">${esc(spec.figure)}</div>` : ''}
    ${spec.sub ? `<div class="sub">${esc(spec.sub)}</div>` : ''}
  </div>`;
}

/**
 * Render a batch of caption specs to PNGs in one browser. One browser for the batch rather than
 * one per caption: Chrome takes about a second to start and there are a dozen of these.
 */
export async function renderOverlays(specs, { width = 1920, height = 1080, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const binary = findChrome();
  if (!binary) throw new Error('overlay: no Chrome found');

  const userDataDir = mkdtempSync(join(tmpdir(), 'lattice-overlay-'));
  const child = spawn(binary, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    const port = await readDevToolsPort(userDataDir, 20000);
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    const session = await Session.attach(page.webSocketDebuggerUrl);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    // The whole point: a PNG with an alpha channel, so ffmpeg can lay it over the art.
    await session.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

    const written = [];
    for (const spec of specs) {
      const html = captionHtml(spec);
      const loaded = new Promise((resolve) => session.on('Page.loadEventFired', resolve));
      await session.send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
      await Promise.race([loaded, new Promise((r) => setTimeout(r, 8000))]);
      // Fonts are inlined, so this is layout settling rather than a network wait.
      await new Promise((r) => setTimeout(r, 260));
      const { data } = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const file = join(outDir, `${spec.id}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      written.push(file);
    }
    return written;
  } finally {
    try { child.kill('SIGKILL'); } catch { /* gone */ }
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* cheap */ }
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const specs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const outDir = process.argv[3] ?? '/tmp/trailer/overlays';
  renderOverlays(specs, { outDir })
    .then((f) => process.stdout.write(`${f.length} overlays -> ${outDir}\n`))
    .catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}
