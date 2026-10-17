import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    isolate: true,
    include: ['tests/**/*.test.ts'],
  },
});
