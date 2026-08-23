import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * The showcase's dev server and static build.
 *
 * `base: './'` because this ships at `/play/emberwake/` rather than at a domain root, and an
 * absolute `/assets/…` there is a blank page with two 404s in the network panel — the one boot
 * failure that produces no console error at all.
 *
 * `fs.allow` reaches the repository root because `@latticekit/*` resolves through the root
 * `node_modules` symlinks into each package's `dist`, which is outside this folder and therefore
 * outside Vite's default allow-list. Package **dist**, deliberately, and not source: a showcase
 * that only renders against `src/` is a showcase nobody else can reproduce. Build the kit first.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  base: './',
  server: { port: 5190, strictPort: true, fs: { allow: [repoRoot] } },
  build: { target: 'es2022' },
});
