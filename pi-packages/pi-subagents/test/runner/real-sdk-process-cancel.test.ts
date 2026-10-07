import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai';
import {
  ModelRegistry,
  ModelRuntime,
  type ProviderConfig,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';
import { fixtureProvider } from './fixtures/provider-fixture.js';

const env = installSubagentTestEnv();
afterEach(() => vi.unstubAllEnvs());
const processTreeFixture = fileURLToPath(
  new URL('./fixtures/node-process-tree.cjs', import.meta.url),
);

function bashToolProvider(command: string): ProviderConfig {
  const finished = fixtureProvider('Process fixture finished');
  const finish = finished.streamSimple;
  if (!finish) throw new Error('Fixture provider must support streamSimple.');
  return {
    ...finished,
    streamSimple(model, context, options) {
      if (context.messages.some((message) => message.role === 'toolResult'))
        return finish(model, context, options);
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'spawn-process-tree',
            name: 'bash',
            arguments: { command },
          },
        ],
        api: model.api,
        provider: model.provider,
        model: model.id,
        stopReason: 'toolUse',
        timestamp: Date.now(),
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      stream.push({ type: 'done', reason: 'toolUse', message });
      stream.end(message);
      return stream;
    },
  };
}

function bashQuote(file: string): string {
  const portable =
    process.platform === 'win32' ? file.replace(/\\/g, '/') : file;
  return `'${portable.replace(/'/g, `'"'"'`)}'`;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

function cleanUpProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    // A process can exit between the survivor assertion and emergency cleanup.
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

it('cancels a real SDK bash task, kills its node parent and grandchild, and persists cancelled', async () => {
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', path.join(env.tmp, 'history'));
  const pidFile = path.join(env.tmp, 'process-tree-pids.json');
  // Keep bash waiting for node, rather than letting a shell exec optimization
  // replace it; this exercises the actual Pi bash descendant cleanup path.
  const command = `${[process.execPath, processTreeFixture, pidFile].map(bashQuote).join(' ')}; wait`;
  fs.writeFileSync(
    path.join(env.tmp, '.pi', 'subagents', 'bash-cancel.md'),
    '---\nname: bash-cancel\ndescription: Real bash cancellation fixture\ntools:\n  - bash\nmodel: bash-cancel-fixture/fixture\n---\nRun the fixture bash command.\n',
  );
  fs.writeFileSync(
    path.join(env.tmp, '.pi', 'subagents.json'),
    JSON.stringify({
      timeout_ms: 60_000,
      stall_timeout_ms: 60_000,
      session_resources: 'lean',
      lifecycle_passthrough: [],
    }),
  );
  const settingsManager = SettingsManager.inMemory({
    extensions: [],
    retry: { enabled: false },
  });
  const modelRuntime = await ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(env.tmp, 'auth.json'),
  });
  const modelRegistry = new ModelRegistry(modelRuntime);
  modelRegistry.registerProvider(
    'bash-cancel-fixture',
    bashToolProvider(command),
  );
  await modelRegistry.refresh({ allowNetwork: false });

  // No custom runner or tool implementation: the manager creates a real SDK child
  // and that child's built-in bash tool owns the process tree.
  const manager = env.createManager();
  let pids: number[] = [];
  try {
    const launched = await manager.run(
      {
        agent: 'bash-cancel',
        task: 'Run the process tree.',
        mode: 'background',
      },
      { cwd: env.tmp, modelRegistry, settingsManager },
    );
    const taskId = launched.task_ids[0];
    if (!taskId) throw new Error('Fixture task was not launched.');
    await expect
      .poll(
        () => {
          if (!fs.existsSync(pidFile)) return false;
          const recorded = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
          pids = [recorded.parent, recorded.grandchild];
          return pids.every(
            (pid) => Number.isInteger(pid) && pid > 0 && processExists(pid),
          );
        },
        { timeout: 10_000, interval: 25 },
      )
      .toBe(true);
    expect(new Set(pids).size).toBe(2);
    expect(manager.getTask(taskId)).toMatchObject({
      status: 'running',
      live_activity: {
        current: { kind: 'tool_running', tool_names: ['bash'] },
      },
    });

    expect(manager.cancel(taskId)).toMatchObject({
      id: taskId,
      status: 'stopping',
    });

    // Pi launches taskkill asynchronously on Windows. Measure every recorded PID
    // globally (including reparented descendants); terminal task status is no proof.
    await expect
      .poll(() => pids.filter(processExists), {
        timeout: 10_000,
        interval: 25,
      })
      .toEqual([]);

    // This is a separate store/SQLite connection, not the manager's task cache.
    const history = env.createHistoryStore();
    await expect
      .poll(() => history.getTask(env.tmp, taskId)?.status, {
        timeout: 10_000,
        interval: 25,
      })
      .toBe('cancelled');
    expect(history.getTask(env.tmp, taskId)).toMatchObject({
      id: taskId,
      status: 'cancelled',
      error: 'Subagent cancelled: cancelled',
    });
  } finally {
    // Emergency cleanup happens only after the survivor assertions, never before.
    manager.cancelRunning();
    for (const pid of pids) cleanUpProcess(pid);
    await manager.close();
  }
}, 40_000);
