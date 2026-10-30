import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { sdkSubagentRunner } from '../src/runner/sdk-runner.js';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';

vi.mock('@earendil-works/pi-coding-agent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@earendil-works/pi-coding-agent')>()),
  ...(await import('./runner/fixtures/resource-loader-fixture.js'))
    .emptyFullResourceSdk,
  ModelRuntime: (await import('./helpers/model-runtime-fixture.js'))
    .ModelRuntimeFixture,
  SessionManager: {
    create: () => ({ path: '' }),
    inMemory: () => ({}),
  },
  createAgentSession: async (options: { tools: string[] }) => ({
    session: {
      messages: [{ role: 'assistant', content: 'done' }],
      getAllTools: () => options.tools.map((name) => ({ name })),
      extensionRunner: {
        onError: () => () => {},
        emit: async () => {},
      },
      subscribe: () => () => {},
      prompt: async () => {},
      dispose: () => {},
    },
  }),
}));

const env = installSubagentTestEnv();

it('explicitly flags each SDK startup lifecycle activity and writes each once', async () => {
  env.writeAgent('worker');
  fs.writeFileSync(
    path.join(env.tmp, '.pi', 'subagents.json'),
    JSON.stringify({ session_resources: 'full' }),
  );
  const history = env.createHistoryStore();
  const writes = vi.spyOn(history, 'upsertTask');
  const activities: Array<{
    message: string;
    persist?: boolean;
    writes: number;
  }> = [];
  const manager = env.createManager(
    (input) =>
      sdkSubagentRunner({
        ...input,
        onActivity(activity) {
          const before = writes.mock.calls.length;
          input.onActivity?.(activity);
          activities.push({
            message: activity.message,
            persist: activity.persist,
            writes: writes.mock.calls.length - before,
          });
        },
      }),
    history,
  );
  const run = await manager.run(
    { agent: 'worker', task: 'work', mode: 'task' },
    {
      cwd: env.tmp,
      sessionId: 'parent',
      model: { provider: 'mock', id: 'model' },
    },
  );
  expect(run.results?.[0].status).toBe('completed');
  expect(
    activities.filter(({ message }) =>
      [
        'orchestrator prompt prepared',
        'starting worker with model mock/model',
        'nested session ready',
      ].includes(message),
    ),
  ).toEqual([
    { message: 'orchestrator prompt prepared', persist: true, writes: 1 },
    {
      message: 'starting worker with model mock/model',
      persist: true,
      writes: 1,
    },
    { message: 'nested session ready', persist: true, writes: 1 },
  ]);
});
