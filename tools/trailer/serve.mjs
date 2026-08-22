#!/usr/bin/env node
/**
 * **A static server for `site/dist`, in forty lines and no dependencies.**
 *
 * `vite preview` would also do it, and needs the site's own config, its own port policy, and a
 * child process whose lifetime somebody has to own across nine shots. This serves a directory.
 *
 * Capturing over the network was the alternative and is worse for a reason that has nothing to do
 * with speed: a shot is only reproducible if the bytes are. `site/dist` on this disk is a fixed
 * artifact; `https://lattice.plausible.ventures` is whatever was deployed the day you looked, and
 * a determinism claim made across it is a claim about somebody else's CDN.
 *
 * ```bash
 * node tools/trailer/serve.mjs site/dist 8471
 * ```
 *
 * Impure by nature: opens a listening socket, reads a directory.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

export function serve(root, port) {
  const base = resolve(root);
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // `normalize` on the joined path is the whole of the traversal defence; a request for
    // `/../../etc/passwd` resolves outside `base` and is refused rather than served.
    let path = normalize(join(base, decodeURIComponent(url.pathname)));
    if (!path.startsWith(base)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) {
      res.writeHead(404).end(`not found: ${url.pathname}`);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(path).pipe(res);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const root = process.argv[2] ?? 'site/dist';
  const port = Number(process.argv[3] ?? 8471);
  await serve(root, port);
  process.stdout.write(`serving ${resolve(root)} on http://127.0.0.1:${port}\n`);
}
