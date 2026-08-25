import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @latticekit/* to workspace source so edits to the kit
      // reflect immediately without a build step.
      '@latticekit/core':    fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
      '@latticekit/iso':     fileURLToPath(new URL('../packages/iso/src/index.ts', import.meta.url)),
      '@latticekit/draw':    fileURLToPath(new URL('../packages/draw/src/index.ts', import.meta.url)),
      '@latticekit/loop':    fileURLToPath(new URL('../packages/loop/src/index.ts', import.meta.url)),
      '@latticekit/input':   fileURLToPath(new URL('../packages/input/src/index.ts', import.meta.url)),
      '@latticekit/audio':   fileURLToPath(new URL('../packages/audio/src/index.ts', import.meta.url)),
      '@latticekit/persist': fileURLToPath(new URL('../packages/persist/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
});
