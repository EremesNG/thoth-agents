import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    pi: 'src/pi.ts',
    'cli/index': 'src/cli/index.ts',
    'cli/tui/index': 'src/cli/tui/index.tsx',
  },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: true,
  external: ['@earendil-works/pi-ai', '@earendil-works/pi-tui'],
  sourcemap: false,
  dts: false,
});
