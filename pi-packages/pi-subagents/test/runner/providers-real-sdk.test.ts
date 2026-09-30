import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import { sdkSubagentRunner } from '../../src/runner/sdk-runner.js';
import type { SubagentRunner, SubagentsConfig } from '../../src/types.js';
import { fixtureProvider } from './fixtures/provider-fixture.js';

const fixtureExtension = fileURLToPath(
  new URL('./fixtures/session-start-provider.ts', import.meta.url),
);
const loadTimeExtension = fileURLToPath(
  new URL('./fixtures/load-time-provider.ts', import.meta.url),
);
const config: SubagentsConfig = {
  timeout_ms: 10_000,
  stall_timeout_ms: 10_000,
  max_concurrency: 1,
  default_tools: [],
  model_profiles: {},
  session_resources: 'lean',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function fixture(extraExtensions: string[] = []) {
  const extensions = [fixtureExtension, loadTimeExtension, ...extraExtensions];
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pi-subagents-providers-'),
  );
  const agentDir = path.join(root, 'agent');
  const cwd = path.join(root, 'workspace');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', path.join(root, 'history'));
  const traceFile = path.join(root, 'trace.log');
  fs.writeFileSync(traceFile, '');
  vi.stubEnv('PI_SUBAGENTS_PROVIDER_TRACE', traceFile);
  const settingsManager = SettingsManager.inMemory({
    extensions,
    retry: { enabled: false },
  });
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
  const modelRuntime = await ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(agentDir, 'auth.json'),
  });
  const parent = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    modelRuntime,
    resourceLoader: loader,
    tools: [],
    sessionManager: SessionManager.inMemory(cwd),
  });
  expect(parent.extensionsResult.errors).toEqual([]);
  await parent.session.extensionRunner?.emit({
    type: 'session_start',
    reason: 'startup',
  });
  const modelRegistry = new ModelRegistry(modelRuntime);
  await modelRegistry.refresh({ allowNetwork: false });
  fs.writeFileSync(traceFile, '');
  const run = (overrides: Partial<Parameters<SubagentRunner>[0]> = {}) =>
    sdkSubagentRunner({
      definition: {
        name: 'provider-fixture',
        description: 'Provider inheritance',
        filePath: fixtureExtension,
        instructions: 'Reply using the fixture provider.',
        tools: [],
        model: { provider: 'session-start-fixture', id: 'fixture' },
      },
      task: 'Reply.',
      cwd,
      ctx: { modelRegistry, settingsManager },
      config,
      signal: new AbortController().signal,
      ...overrides,
    });
  return {
    cwd,
    settingsManager,
    modelRegistry,
    run,
    trace: () =>
      fs.readFileSync(traceFile, 'utf8').trim().split('\n').filter(Boolean),
    async close() {
      parent.session.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

it('authenticates and streams through a provider registered only in the parent session_start', async () => {
  const parent = await fixture();
  try {
    const result = await parent.run();
    expect(result.result).toBe('inherited provider streamed');
  } finally {
    await parent.close();
  }
}, 30_000);

it('keeps a child load-time provider ahead of a conflicting parent registration', async () => {
  const parent = await fixture();
  try {
    parent.modelRegistry.registerProvider(
      'load-time-fixture',
      fixtureProvider('parent override streamed'),
    );
    const result = await parent.run({
      definition: {
        name: 'provider-owner',
        description: 'Provider ownership',
        filePath: loadTimeExtension,
        instructions: 'Reply using the fixture provider.',
        tools: [],
        model: { provider: 'load-time-fixture', id: 'fixture' },
      },
    });
    expect(result.result).toBe('child-owned provider streamed');
    expect(
      parent.modelRegistry.getRegisteredProviderConfig('load-time-fixture')
        ?.streamSimple,
    ).not.toBeUndefined();
    const stillParent = await parent.modelRegistry
      .streamSimple(
        parent.modelRegistry.find('load-time-fixture', 'fixture')!,
        { messages: [] },
      )
      .result();
    expect(stillParent.content).toEqual([
      { type: 'text', text: 'parent override streamed' },
    ]);
  } finally {
    await parent.close();
  }
}, 30_000);

it('runs only load-time provider owners shutdown once after a successful inherited-provider run', async () => {
  const parent = await fixture();
  const dispose = vi.spyOn(AgentSession.prototype, 'dispose');
  try {
    await parent.run();
    expect(parent.trace()).toEqual([
      'stream:inherited provider streamed',
      'load-time:session_shutdown',
    ]);
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    await parent.close();
  }
}, 30_000);

it('keeps shutdown stripped without a queued provider-config registration', async () => {
  const nativeExtension = fileURLToPath(
    new URL('./fixtures/native-only-provider.ts', import.meta.url),
  );
  const parent = await fixture([nativeExtension]);
  try {
    expect(
      parent.modelRegistry.getRegisteredNativeProvider('native-only-fixture'),
    ).toBeDefined();
    await expect(parent.run()).resolves.toMatchObject({
      result: 'inherited provider streamed',
    });
    expect(parent.trace()).toEqual([
      'native-only:loaded',
      'stream:inherited provider streamed',
      'load-time:session_shutdown',
    ]);
  } finally {
    await parent.close();
  }
}, 30_000);

it('shuts down and disposes a pre-aborted child exactly once without prompting', async () => {
  const parent = await fixture();
  const dispose = vi.spyOn(AgentSession.prototype, 'dispose');
  const controller = new AbortController();
  controller.abort();
  try {
    await expect(parent.run({ signal: controller.signal })).rejects.toThrow(
      'Subagent was aborted',
    );
    expect(parent.trace()).toEqual(['load-time:session_shutdown']);
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    await parent.close();
  }
}, 30_000);

it.each([
  'failure',
  'cancel',
  'total-timeout',
  'stall-timeout',
] as const)('shuts down and disposes provider owners exactly once on %s', async (ending) => {
  const parent = await fixture();
  const dispose = vi.spyOn(AgentSession.prototype, 'dispose');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = parent.run({
      task: ending === 'failure' ? 'fixture-failure' : 'fixture-wait',
      signal: controller.signal,
      config: {
        ...config,
        stall_timeout_ms: ending === 'stall-timeout' ? 1 : 10_000,
      },
      onActivity(activity) {
        if (activity.message !== 'preparing response') return;
        if (ending === 'cancel') controller.abort('cancelled');
        if (ending === 'total-timeout')
          timer = setTimeout(() => controller.abort('timeout'), 25);
      },
    });
    if (ending === 'cancel' || ending === 'total-timeout') {
      await expect(run).rejects.toThrow('Subagent was aborted');
    } else {
      await expect(run).rejects.toMatchObject({
        error_metadata: {
          category:
            ending === 'failure' ? 'provider_api_error' : 'stall_timeout',
        },
      });
    }
    expect(parent.trace()).toEqual([
      'stream:inherited provider streamed',
      'load-time:session_shutdown',
    ]);
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    await parent.close();
  }
}, 30_000);

it('bounds a hanging provider shutdown at five seconds and still disposes once', async () => {
  const parent = await fixture();
  const dispose = vi.spyOn(AgentSession.prototype, 'dispose');
  const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
  vi.stubEnv('PI_SUBAGENTS_FIXTURE_SHUTDOWN', 'hang');
  const started = Date.now();
  try {
    await expect(parent.run()).resolves.toMatchObject({
      result: 'inherited provider streamed',
    });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(5_000);
    expect(elapsed).toBeLessThan(10_000);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5_000);
    expect(parent.trace()).toEqual([
      'stream:inherited provider streamed',
      'load-time:session_shutdown',
    ]);
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    await parent.close();
  }
}, 30_000);

it('preserves the result and disposes when a provider shutdown handler throws', async () => {
  const parent = await fixture();
  const dispose = vi.spyOn(AgentSession.prototype, 'dispose');
  vi.stubEnv('PI_SUBAGENTS_FIXTURE_SHUTDOWN', 'throw');
  try {
    await expect(parent.run()).resolves.toMatchObject({
      result: 'inherited provider streamed',
    });
    expect(parent.trace()).toEqual([
      'stream:inherited provider streamed',
      'load-time:session_shutdown',
    ]);
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    await parent.close();
  }
}, 30_000);

it('inherits a native parent provider through public APIs without network refresh', async () => {
  const parent = await fixture();
  const refresh = vi.spyOn(ModelRuntime.prototype, 'refresh');
  try {
    const source = parent.modelRegistry.getProvider('session-start-fixture')!;
    parent.modelRegistry.registerProvider({
      ...source,
      id: 'native-fixture',
      name: 'Native fixture',
      getModels: () =>
        source
          .getModels()
          .map((model) => ({ ...model, provider: 'native-fixture' })),
    });
    const result = await parent.run({
      definition: {
        name: 'native-provider',
        description: 'Native inheritance',
        filePath: fixtureExtension,
        instructions: 'Reply using the fixture provider.',
        tools: [],
        model: { provider: 'native-fixture', id: 'fixture' },
      },
    });
    expect(result.result).toBe('inherited provider streamed');
    expect(refresh).toHaveBeenCalledWith({ allowNetwork: false });
    expect(
      refresh.mock.calls.every(([options]) => options?.allowNetwork !== true),
    ).toBe(true);
  } finally {
    await parent.close();
  }
}, 30_000);

it('shuts down and disposes a child rejected before prompting for unavailable tools', async () => {
  const parent = await fixture();
  const dispose = vi.spyOn(AgentSession.prototype, 'dispose');
  try {
    await expect(
      parent.run({
        definition: {
          name: 'invalid-tools',
          description: 'Unavailable tool',
          filePath: fixtureExtension,
          instructions: 'Reply.',
          tools: ['missing_fixture_tool'],
          model: { provider: 'session-start-fixture', id: 'fixture' },
        },
      }),
    ).rejects.toThrow('missing implementation: missing_fixture_tool');
    expect(parent.trace()).toEqual(['load-time:session_shutdown']);
    expect(dispose).toHaveBeenCalledTimes(1);
  } finally {
    await parent.close();
  }
}, 30_000);
