import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @latticekit/* to workspace source so edits to the kit
      // reflect immediately without a build step.
      '@latticekit/core':    resolve(__dirname, '../packages/core/src/index.ts'),
      '@latticekit/iso':     resolve(__dirname, '../packages/iso/src/index.ts'),
      '@latticekit/draw':    resolve(__dirname, '../packages/draw/src/index.ts'),
      '@latticekit/loop':    resolve(__dirname, '../packages/loop/src/index.ts'),
      '@latticekit/input':   resolve(__dirname, '../packages/input/src/index.ts'),
      '@latticekit/audio':   resolve(__dirname, '../packages/audio/src/index.ts'),
      '@latticekit/persist': resolve(__dirname, '../packages/persist/src/index.ts'),
      '@latticekit/sim':     resolve(__dirname, '../packages/sim/src/index.ts'),
      '@latticekit/ui':      resolve(__dirname, '../packages/ui/src/index.ts'),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
});
