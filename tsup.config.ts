import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
    'cli/tui/index': 'src/cli/tui/index.tsx',
  },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: true,
  sourcemap: false,
  dts: false,
});
