import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
} from '@earendil-works/pi-ai';
import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  type ProviderConfig,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import { SubagentManager } from '../../src/manager.js';
import { sdkSubagentRunner } from '../../src/runner/sdk-runner.js';
import type { SubagentsConfig } from '../../src/types.js';
import { fixtureProvider } from './fixtures/provider-fixture.js';

const forkExtension = fileURLToPath(
  new URL('../../../pi-background-tasks/src/index.ts', import.meta.url),
);
const processTree = fileURLToPath(
  new URL('./fixtures/node-process-tree.cjs', import.meta.url),
);
const config: SubagentsConfig = {
  timeout_ms: 60_000,
  stall_timeout_ms: 60_000,
  max_concurrency: 3,
  default_tools: ['bg_task_spawn'],
  model_profiles: {},
  session_resources: 'lean',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    // An exited Linux orphan can remain a zombie until init reaps it.
    if (process.platform === 'linux') {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      if (stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z')) return false;
    }
    return true;
  } catch (error) {
    if (
      ['ESRCH', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')
    )
      return false;
    throw error;
  }
}
function pids(files: string[]): number[] {
  return files.flatMap((file) => {
    const recorded = JSON.parse(fs.readFileSync(file, 'utf8'));
    return [recorded.parent, recorded.grandchild];
  });
}
async function stopped(files: string[]): Promise<void> {
  await expect
    .poll(() => pids(files).filter(alive), {
      timeout: 10_000,
      interval: 25,
    })
    .toEqual([]);
}

function backgroundProvider(
  files: string[],
  ending: 'success' | 'failure' | 'wait',
) {
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const finished = fixtureProvider('background fixture completed');
  const provider: ProviderConfig = {
    ...finished,
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: 'assistant',
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        stopReason: 'stop',
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
      if (!context.messages.some((entry) => entry.role === 'toolResult')) {
        message.content = files.map((file, index) => ({
          type: 'toolCall',
          id: `spawn-${index}`,
          name: 'bg_task_spawn',
          arguments: {
            argv: [process.execPath, processTree, file],
            shell: 'none',
            callback: false,
          },
        }));
        message.stopReason = 'toolUse';
        stream.push({ type: 'done', reason: 'toolUse', message });
        stream.end(message);
      } else {
        void (async () => {
          const deadline = Date.now() + 10_000;
          while (!files.every(fs.existsSync)) {
            if (Date.now() >= deadline)
              throw new Error('Fixture jobs did not start');
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          if (!pids(files).every(alive))
            throw new Error('Fixture process tree is not alive');
          ready();
          const finish = (reason: 'error' | 'aborted') => {
            message.stopReason = reason;
            message.errorMessage =
              reason === 'error'
                ? 'Fixture provider failed'
                : 'Fixture aborted';
            stream.push({ type: 'error', reason, error: message });
            stream.end(message);
          };
          if (ending === 'wait') {
            stream.push({ type: 'start', partial: message });
            if (options?.signal?.aborted) finish('aborted');
            else
              options?.signal?.addEventListener(
                'abort',
                () => finish('aborted'),
                { once: true },
              );
          } else if (ending === 'failure') finish('error');
          else {
            message.content = [
              { type: 'text', text: 'background fixture completed' },
            ];
            stream.push({ type: 'done', reason: 'stop', message });
            stream.end(message);
          }
        })().catch((error) => {
          message.stopReason = 'error';
          message.errorMessage = String(error);
          stream.push({ type: 'error', reason: 'error', error: message });
          stream.end(message);
        });
      }
      return stream;
    },
  };
  return { provider, started };
}

async function fixture(hanging = false) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pi-subagents-background-'),
  );
  const agentDir = path.join(root, 'agent');
  const cwd = path.join(root, 'workspace');
  const registryRoot = path.join(root, 'tmp');
  for (const directory of [agentDir, cwd, registryRoot])
    fs.mkdirSync(directory, { recursive: true });
  // The fork's registry derives from os.tmpdir(); never use the operator's registry or HOME.
  for (const key of ['TMP', 'TEMP', 'TMPDIR']) vi.stubEnv(key, registryRoot);
  for (const key of ['HOME', 'USERPROFILE']) vi.stubEnv(key, root);
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', path.join(root, 'history'));
  vi.stubEnv('PI_SUBAGENTS_HISTORY_DB_PATH', path.join(root, 'history.sqlite'));
  const extensions: string[] = [];
  if (hanging) {
    const directory = path.join(root, 'hanging');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      '{"name":"@fixture/hanging"}',
    );
    const entry = path.join(directory, 'index.ts');
    fs.writeFileSync(
      entry,
      `export default function (pi) {
      pi.on('session_shutdown', (_event, ctx) => {
        if (ctx.sessionManager.getSessionId() !== process.env.PI_SUBAGENTS_BACKGROUND_ROOT_ID)
          return new Promise(() => {});
      });
    }`,
    );
    extensions.push(entry);
  }
  extensions.push(forkExtension);
  const settingsManager = SettingsManager.inMemory({
    extensions,
    retry: { enabled: false },
  });
  const modelRuntime = await ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(agentDir, 'auth.json'),
    allowModelNetwork: false,
  });
  const rootFiles = [path.join(root, 'root.json')];
  const rootProvider = backgroundProvider(rootFiles, 'wait');
  modelRuntime.registerProvider('background-root', rootProvider.provider);
  await modelRuntime.refresh({ allowNetwork: false });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    additionalExtensionPaths: extensions,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const parent = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    modelRuntime,
    resourceLoader: loader,
    tools: ['bg_task_spawn'],
    model: modelRuntime.getModel('background-root', 'fixture')!,
    sessionManager: SessionManager.inMemory(cwd),
  });
  expect(parent.extensionsResult.errors).toEqual([]);
  vi.stubEnv(
    'PI_SUBAGENTS_BACKGROUND_ROOT_ID',
    parent.session.sessionManager.getSessionId(),
  );
  await parent.session.extensionRunner!.emit({
    type: 'session_start',
    reason: 'startup',
  });
  let sequence = 0;
  const children: {
    controller: AbortController;
    settled: Promise<any>;
    files: string[];
  }[] = [];
  const managers: SubagentManager[] = [];
  const managedFiles: string[] = [];
  let rootPrompt: Promise<void> | undefined;
  return {
    root,
    cwd,
    settingsManager,
    modelRuntime,
    rootFiles,
    async startRoot() {
      rootPrompt = parent.session.prompt('Spawn the root fixture.');
      await rootProvider.started;
    },
    async child(ending: 'success' | 'failure' | 'wait', count = 1) {
      sequence += 1;
      const id = `background-child-${sequence}`;
      const files = Array.from({ length: count }, (_, index) =>
        path.join(root, `${id}-${index}.json`),
      );
      const provider = backgroundProvider(files, ending);
      modelRuntime.registerProvider(id, provider.provider);
      await modelRuntime.refresh({ allowNetwork: false });
      const controller = new AbortController();
      const settled = sdkSubagentRunner({
        definition: {
          name: id,
          description: 'Background lifecycle fixture',
          filePath: forkExtension,
          instructions: 'Spawn the deterministic fixture jobs.',
          tools: ['bg_task_spawn'],
          model: { provider: id, id: 'fixture' },
        },
        task: 'Spawn the fixtures.',
        cwd,
        ctx: { modelRuntime, settingsManager },
        config: hanging
          ? {
              ...config,
              lifecycle_passthrough: [
                '@fixture/hanging',
                '@thoth-agents/pi-background-tasks',
              ],
            }
          : config,
        signal: controller.signal,
      }).then(
        (result) => ({ result }),
        (error) => ({ error }),
      );
      children.push({ controller, settled, files });
      await Promise.race([
        provider.started,
        settled.then(() => {
          throw new Error('Child ended before fixture jobs started');
        }),
      ]);
      return { controller, settled, files };
    },
    async managedChild() {
      const files = [path.join(root, 'managed-child.json')];
      managedFiles.push(...files);
      const provider = backgroundProvider(files, 'wait');
      modelRuntime.registerProvider('background-managed', provider.provider);
      await modelRuntime.refresh({ allowNetwork: false });
      const directory = path.join(cwd, '.pi', 'subagents');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'managed.md'),
        '---\nname: managed\ndescription: Parent-driven teardown\ntools:\n  - bg_task_spawn\nmodel: background-managed/fixture\n---\nSpawn the fixture.\n',
      );
      fs.writeFileSync(
        path.join(cwd, '.pi', 'subagents.json'),
        JSON.stringify(config),
      );
      const manager = new SubagentManager();
      managers.push(manager);
      const launched = await manager.run(
        { agent: 'managed', task: 'Spawn.', mode: 'background' },
        { cwd, modelRuntime, settingsManager },
      );
      await provider.started;
      return { manager, taskId: launched.task_ids[0]!, files };
    },
    async close() {
      await Promise.all(managers.map((manager) => manager.close()));
      for (const child of children) child.controller.abort();
      await Promise.all(children.map((child) => child.settled));
      await parent.session.abort();
      await rootPrompt;
      await parent.session.extensionRunner!.emit({
        type: 'session_shutdown',
        reason: 'quit',
      });
      parent.session.dispose();
      // Emergency cleanup only after assertions, including when a regression leaves survivors.
      for (const file of [
        ...rootFiles,
        ...managedFiles,
        ...children.flatMap((child) => child.files),
      ]) {
        if (!fs.existsSync(file)) continue;
        for (const pid of pids([file])) {
          if (!alive(pid)) continue;
          try {
            if (process.platform === 'win32')
              execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
                windowsHide: true,
                stdio: 'ignore',
              });
            else process.kill(pid, 'SIGKILL');
          } catch (error) {
            if (alive(pid)) throw error;
          }
        }
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

it('stops multiple child job trees before disposal despite a preceding hanging passthrough shutdown', async () => {
  const parent = await fixture(true);
  const disposedAlive: number[][] = [];
  const dispose = AgentSession.prototype.dispose;
  let files: string[] = [];
  vi.spyOn(AgentSession.prototype, 'dispose').mockImplementation(function (
    this: AgentSession,
  ) {
    disposedAlive.push(pids(files).filter(alive));
    dispose.call(this);
  });
  try {
    const child = await parent.child('success', 2);
    files = child.files;
    expect(await child.settled).toMatchObject({
      result: { result: 'background fixture completed' },
    });
    expect(disposedAlive).toEqual([[]]);
    await stopped(files);
  } finally {
    vi.restoreAllMocks();
    await parent.close();
  }
}, 40_000);

it.each([
  'success',
  'failure',
  'cancel',
] as const)('stops a real child job parent and grandchild on %s without stopping sibling or root jobs', async (ending) => {
  const parent = await fixture();
  try {
    await parent.startRoot();
    const sibling = await parent.child('wait');
    const child = await parent.child(ending === 'cancel' ? 'wait' : ending);
    if (ending === 'cancel') child.controller.abort();
    const outcome = await child.settled;
    if (ending === 'success')
      expect(outcome).toMatchObject({
        result: { result: 'background fixture completed' },
      });
    else if (ending === 'failure')
      expect(outcome).toMatchObject({
        error: { error_metadata: { category: 'provider_api_error' } },
      });
    else
      expect(outcome).toMatchObject({
        error: { message: 'Subagent was aborted' },
      });
    await stopped(child.files);
    expect(
      pids([...parent.rootFiles, ...sibling.files]).filter(alive),
    ).toHaveLength(4);
    sibling.controller.abort();
    await sibling.settled;
    await stopped(sibling.files);
    expect(pids(parent.rootFiles).filter(alive)).toHaveLength(2);
  } finally {
    await parent.close();
  }
}, 60_000);

it('parent-driven manager teardown stops child job trees while root jobs continue', async () => {
  const parent = await fixture();
  try {
    await parent.startRoot();
    const child = await parent.managedChild();
    expect(child.manager.getTask(child.taskId)?.status).toBe('running');
    await child.manager.close();
    await stopped(child.files);
    expect(child.manager.getTask(child.taskId)?.status).toBe('interrupted');
    expect(pids(parent.rootFiles).filter(alive)).toHaveLength(2);
  } finally {
    await parent.close();
  }
}, 60_000);
