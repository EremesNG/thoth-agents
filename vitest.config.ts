import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        },
      },
      {
        test: {
          name: 'evals',
          sequence: { groupOrder: 1 },
          environment: 'node',
          include: ['evals/**/*.test.ts'],
          pool: 'forks',
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
  },
});
