import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Cold PowerShell/Add-Type startup can take seconds on hosted Windows.
    testTimeout: 30000,
    hookTimeout: 30000,
    isolate: true,
    include: ['tests/**/*.test.ts'],
  },
});
