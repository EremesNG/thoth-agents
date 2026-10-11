import { defineConfig } from 'vitest/config';

if (!process.env.THOTH_EVAL_MODEL?.trim()) {
  console.error(
    'Live Pi evaluations require THOTH_EVAL_MODEL=provider/model (explicit opt-in; costs real money).\n' +
      'Optional: THOTH_EVAL_AUTH (read-only auth source; default ~/.pi/agent/auth.json), THOTH_EVAL_CASE (case id), ' +
      'THOTH_EVAL_MAX_TURNS (30), THOTH_EVAL_CASE_USD (1), THOTH_EVAL_RUN_USD (5), THOTH_EVAL_TIME_MS (600000), ' +
      'THOTH_EVAL_SPECIALIST_MODEL (temporary provider/model override).',
  );
  process.exit(1);
}

export default defineConfig({
  test: {
    name: 'live-pi',
    environment: 'node',
    include: ['evals/pi/*.live.ts'],
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { concurrent: false },
    testTimeout:
      Math.max(600000, Number(process.env.THOTH_EVAL_TIME_MS) || 600000) +
      120000,
    hookTimeout: 30000,
  },
});
