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
import { fixtureProvider, trace } from './fixtures/provider-fixture.js';

const fixtureExtension = fileURLToPath(
  new URL('./fixtures/session-start-provider.ts', import.meta.url),
);
const loadTimeExtension = fileURLToPath(
  new URL('./fixtures/load-time-provider.ts', import.meta.url),
);
const observerExtension = fileURLToPath(
  new URL('./fixtures/lifecycle/observer.ts', import.meta.url),
);
const memoryExtension = fileURLToPath(
  new URL('./fixtures/memory-style.ts', import.meta.url),
);
const captureExtension = fileURLToPath(
  new URL('./fixtures/prompt-capture/index.ts', import.meta.url),
);
const injectorExtension = fileURLToPath(
  new URL('./fixtures/lifecycle/root-injector.ts', import.meta.url),
);
const captureDefinition = {
  name: 'capture-child',
  description: 'Capture inheritance',
  filePath: captureExtension,
  instructions:
    'CHILD POLICY: Reply with the portable child instruction marker.',
  tools: [],
  model: { provider: 'prompt-capture-fixture', id: 'fixture' },
};
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

async function fixture(
  extraExtensions: string[] = [],
  prepare?: (root: string) => string[],
) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pi-subagents-providers-'),
  );
  const extensions = [
    fixtureExtension,
    loadTimeExtension,
    ...extraExtensions,
    ...(prepare?.(root) ?? []),
  ];
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

it.each([
  { selection: 'standalone *', tools: ['*'], missing: ['*'] },
  {
    selection: 'explicit',
    tools: ['read', 'missing_fixture_tool'],
    missing: ['missing_fixture_tool'],
  },
  { selection: 'glob', tools: ['re*', 'missing_*'], missing: ['missing_*'] },
  {
    selection: 'mixed',
    tools: ['*', 'read'],
    missing: ['*', 'missing_fixture_tool'],
  },
])('drops and reports missing tools for $selection selection in a real SDK child, but rejects all-missing selections', async ({
  tools,
  missing,
}) => {
  const parent = await fixture([captureExtension]);
  const activities: any[] = [];
  const active = ['read', 'missing_fixture_tool'];
  const run = (tools: string[]) =>
    parent.run({
      definition: { ...captureDefinition, tools },
      ctx: {
        modelRegistry: parent.modelRegistry,
        settingsManager: parent.settingsManager,
        pi: { getActiveTools: () => active },
      },
      onActivity: (activity) => activities.push(activity),
    });
  try {
    const result = await run(tools);
    expect(result).toMatchObject({ dropped_tools: ['missing_fixture_tool'] });
    expect(activities).toContainEqual(
      expect.objectContaining({ dropped_tools: ['missing_fixture_tool'] }),
    );
    const capture = JSON.parse(result.result);
    expect(
      activities
        .filter((activity) => activity.prompt)
        .every((activity) => !activity.prompt.includes('missing_fixture_tool')),
    ).toBe(true);
    expect(capture.systemPrompt).not.toContain('missing_fixture_tool');
    expect(capture.systemPrompt).not.toContain('AskClaude');
    active.splice(0, 1);
    await expect(run(missing)).rejects.toThrow(
      'missing implementation: missing_fixture_tool',
    );
  } finally {
    await parent.close();
  }
}, 30_000);

it('authenticates and streams through a provider registered only in the parent session_start', async () => {
  const parent = await fixture();
  try {
    const result = await parent.run();
    expect(result.result).toBe('inherited provider streamed');
  } finally {
    await parent.close();
  }
}, 30_000);

it('runs the full listed lifecycle in lean children while stripping unlisted memory hooks', async () => {
  const parent = await fixture([observerExtension, memoryExtension]);
  try {
    await expect(
      parent.run({
        config: { ...config, lifecycle_passthrough: ['@fixture/lifecycle'] },
      }),
    ).resolves.toMatchObject({ result: 'inherited provider streamed' });
    expect(parent.trace()).toEqual([
      'observer:session_start',
      'observer:before_agent_start',
      'observer:agent_start',
      'observer:turn_start',
      'observer:context',
      'stream:inherited provider streamed',
      'observer:agent_end',
      'load-time:session_shutdown',
      'observer:session_shutdown',
    ]);
  } finally {
    await parent.close();
  }
}, 30_000);

it('awaits replay then verification then startup before prompting, and passes other events unchanged', async () => {
  const parent = await fixture([observerExtension]);
  const registerProvider = ModelRuntime.prototype.registerProvider;
  vi.spyOn(ModelRuntime.prototype, 'registerProvider').mockImplementation(
    function (this: ModelRuntime, ...args: any[]) {
      if (args[0] === 'session-start-fixture') trace('replay');
      return (registerProvider as any).apply(this, args);
    },
  );
  const getAllTools = AgentSession.prototype.getAllTools;
  vi.spyOn(AgentSession.prototype, 'getAllTools').mockImplementation(function (
    this: AgentSession,
  ) {
    trace('verify');
    return getAllTools.call(this);
  });
  const prompt = AgentSession.prototype.prompt;
  vi.spyOn(AgentSession.prototype, 'prompt').mockImplementation(async function (
    this: AgentSession,
    ...args: Parameters<AgentSession['prompt']>
  ) {
    expect(parent.trace()).toEqual([
      'replay',
      'verify',
      'observer:session_start',
    ]);
    const selectedModel = this.model!;
    await this.setModel(
      parent.modelRegistry.find('load-time-fixture', 'fixture')!,
    );
    await this.setModel(selectedModel);
    const event = {
      type: 'session_before_tree' as const,
      signal: new AbortController().signal,
      preparation: {
        targetId: 'target',
        oldLeafId: null,
        commonAncestorId: null,
        entriesToSummarize: [],
        userWantsSummary: false,
        customInstructions: 'CHILD TREE',
      },
    };
    expect(await this.extensionRunner!.emit(event)).toEqual({ cancel: true });
    expect(event.preparation.customInstructions).toBe('LIVE TREE MUTATION');
    return prompt.apply(this, args);
  });
  try {
    await expect(
      parent.run({
        config: { ...config, lifecycle_passthrough: ['@fixture/lifecycle'] },
      }),
    ).resolves.toMatchObject({ result: 'inherited provider streamed' });
    expect(parent.trace()).toContain('observer:model_select');
    expect(parent.trace()).toContain('observer:session_before_tree');
  } finally {
    await parent.close();
  }
}, 30_000);

it('never passes the adaptive-root package through even with a programmatic trust list', async () => {
  const parent = await fixture([], (root) => {
    const directory = path.join(root, 'adaptive-root');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      '{"name":"thoth-agents"}',
    );
    const extension = path.join(directory, 'index.ts');
    fs.writeFileSync(
      extension,
      `import fs from 'node:fs';
      export default function (pi) {
        for (const type of ['session_start', 'before_agent_start', 'context', 'session_shutdown'])
          pi.on(type, () => fs.appendFileSync(process.env.PI_SUBAGENTS_PROVIDER_TRACE, 'adaptive-root:' + type + '\\n'));
      }`,
    );
    return [extension];
  });
  try {
    await expect(
      parent.run({
        config: { ...config, lifecycle_passthrough: ['thoth-agents'] },
      }),
    ).resolves.toMatchObject({ result: 'inherited provider streamed' });
    expect(
      parent.trace().filter((event) => event.startsWith('adaptive-root:')),
    ).toEqual([]);
  } finally {
    await parent.close();
  }
}, 30_000);

it('records session_start handler errors in task diagnostics without failing the child', async () => {
  const parent = await fixture([observerExtension]);
  const activities: any[] = [];
  vi.stubEnv('PI_SUBAGENTS_FIXTURE_START', 'throw');
  try {
    await expect(
      parent.run({
        config: { ...config, lifecycle_passthrough: ['@fixture/lifecycle'] },
        onActivity: (activity) => activities.push(activity),
      }),
    ).resolves.toMatchObject({ result: 'inherited provider streamed' });
    expect(activities).toContainEqual(
      expect.objectContaining({
        message: expect.stringMatching(/session_start.*Fixture startup failed/),
      }),
    );
    expect(
      parent.trace().filter((event) => event === 'observer:session_shutdown'),
    ).toHaveLength(1);
  } finally {
    await parent.close();
  }
}, 30_000);

it('projects the child instructions through a parent-only capture-dependent provider with default passthrough', async () => {
  const parent = await fixture([captureExtension]);
  try {
    const result = await parent.run({ definition: captureDefinition });
    const capture = JSON.parse(result.result);
    expect(capture.projected).toBe(captureDefinition.instructions);
    expect(capture.systemPrompt).toContain(captureDefinition.instructions);
    expect(capture.hooks).toEqual([
      'before_agent_start',
      'agent_start',
      'turn_start',
    ]);
    expect(parent.trace()).toContain('capture:session_start');
  } finally {
    await parent.close();
  }
}, 30_000);

it('fails closed without lifecycle passthrough for a parent-only capture-dependent provider', async () => {
  const parent = await fixture([captureExtension]);
  try {
    await expect(
      parent.run({
        definition: captureDefinition,
        config: { ...config, lifecycle_passthrough: [] },
      }),
    ).rejects.toMatchObject({
      error_metadata: {
        category: 'provider_api_error',
        retryable: false,
        message: expect.stringContaining('prompt-capture:'),
      },
    });
    expect(parent.trace().some((event) => event.startsWith('capture:'))).toBe(
      false,
    );
  } finally {
    await parent.close();
  }
}, 30_000);

it('clones all listed prompt-shaping events per handler, honors only before_provider_request replacements and discards other overrides without losing AbortSignals', async () => {
  const parent = await fixture([injectorExtension, captureExtension]);
  const originalPrompt = AgentSession.prototype.prompt;
  vi.spyOn(AgentSession.prototype, 'prompt').mockImplementation(async function (
    this: AgentSession,
    ...args: Parameters<AgentSession['prompt']>
  ) {
    const runner = this.extensionRunner!;
    const signal = new AbortController().signal;
    const callback = () => 'live callback';
    const payload = {
      messages: [{ content: 'CHILD PAYLOAD' }],
      signal,
      callback,
    };
    // Only before_provider_request returns are honored; in-place clone mutation never escapes.
    expect(await runner.emitBeforeProviderRequest(payload)).toEqual({
      messages: ['ROOT REPLACEMENT'],
    });
    expect(payload.messages).toEqual([{ content: 'CHILD PAYLOAD' }]);
    expect(payload.signal).toBe(signal);
    expect(payload.callback).toBe(callback);
    const headers = { 'x-child': 'CHILD HEADER' };
    expect(await runner.emitBeforeProviderHeaders(headers)).toBe(headers);
    expect(headers).toEqual({ 'x-child': 'CHILD HEADER' });
    const images = [
      { type: 'image' as const, data: 'CHILD IMAGE', mimeType: 'image/png' },
    ];
    expect(await runner.emitInput('CHILD INPUT', images, 'extension')).toEqual({
      action: 'continue',
    });
    expect(images[0].data).toBe('CHILD IMAGE');
    return originalPrompt.apply(this, args);
  });
  try {
    const result = await parent.run({
      definition: captureDefinition,
      config: {
        ...config,
        lifecycle_passthrough: [
          '@fixture/lifecycle',
          '@thoth-agents/pi-claude-bridge',
        ],
      },
    });
    const capture = JSON.parse(result.result);
    expect(
      parent.trace().filter((event) => event.startsWith('injector:')),
    ).toEqual([
      'injector:before_provider_request',
      'injector:before_provider_headers',
      'injector:input',
      'injector:input',
      'injector:before_agent_start',
      'injector:agent_start',
      'injector:turn_start',
      'injector:context',
      'injector:context_with_system',
      'injector:before_provider_headers',
    ]);
    expect(capture.projected).toBe(captureDefinition.instructions);
    expect(capture.systemPrompt).toContain(captureDefinition.instructions);
    expect(capture.systemPrompt).not.toContain('ROOT');
    expect(JSON.stringify(capture.messages)).not.toContain('ROOT');
  } finally {
    await parent.close();
  }
}, 30_000);

it.each([
  ['missing', undefined],
  ['invalid JSON', '{'],
  ['missing name', '{}'],
  ['non-string name', '{"name":42}'],
  ['foreign nearest package', '{"name":"@fixture/listed-foreign"}'],
  ['unreadable', '{"name":"@fixture/listed"}'],
  ['missing manifest target', '{"name":"@fixture/listed"}'],
] as const)(
  'fails closed for a %s manifest without inheriting an outer package name',
  async (kind, manifest) => {
    let manifestPath = '';
    const parent = await fixture([], (root) => {
      const extensionDir = path.join(root, 'package', 'nested');
      fs.mkdirSync(extensionDir, { recursive: true });
      if (kind !== 'missing')
        fs.writeFileSync(
          path.join(root, 'package', 'package.json'),
          '{"name":"@fixture/listed"}',
        );
      manifestPath = path.join(extensionDir, 'package.json');
      if (manifest !== undefined) fs.writeFileSync(manifestPath, manifest);
      const extensionPath = path.join(extensionDir, 'observer.ts');
      fs.writeFileSync(
        extensionPath,
        `import fs from 'node:fs';
      export default function (pi) {
        pi.on('before_agent_start', () => fs.appendFileSync(process.env.PI_SUBAGENTS_PROVIDER_TRACE, 'foreign:before_agent_start\\n'));
      }`,
      );
      return [extensionPath];
    });
    const readFileSync = fs.readFileSync;
    if (kind === 'unreadable' || kind === 'missing manifest target') {
      vi.spyOn(fs, 'readFileSync').mockImplementation(((
        file: fs.PathOrFileDescriptor,
        ...args: any[]
      ) => {
        if (String(file) === manifestPath)
          throw Object.assign(new Error('Permission denied'), {
            code: kind === 'unreadable' ? 'EACCES' : 'ENOENT',
          });
        return (readFileSync as any)(file, ...args);
      }) as typeof fs.readFileSync);
    }
    try {
      await expect(
        parent.run({
          config: { ...config, lifecycle_passthrough: ['@fixture/listed'] },
        }),
      ).resolves.toMatchObject({ result: 'inherited provider streamed' });
      expect(parent.trace()).not.toContain('foreign:before_agent_start');
    } finally {
      vi.restoreAllMocks();
      await parent.close();
    }
  },
  30_000,
);

it('realpaths a symlinked standalone extension before checking its foreign manifest', async (test) => {
  let symlinkError: unknown;
  const parent = await fixture([], (root) => {
    const listed = path.join(root, 'listed');
    const foreign = path.join(root, 'foreign');
    fs.mkdirSync(listed);
    fs.mkdirSync(foreign);
    fs.writeFileSync(
      path.join(listed, 'package.json'),
      '{"name":"@fixture/listed"}',
    );
    fs.writeFileSync(
      path.join(foreign, 'package.json'),
      '{"name":"@fixture/foreign"}',
    );
    const target = path.join(foreign, 'observer.ts');
    fs.writeFileSync(
      target,
      `import fs from 'node:fs';
      export default function (pi) {
        pi.on('before_agent_start', () => fs.appendFileSync(process.env.PI_SUBAGENTS_PROVIDER_TRACE, 'foreign:before_agent_start\\n'));
      }`,
    );
    const link = path.join(listed, 'standalone.ts');
    try {
      fs.symlinkSync(target, link, 'file');
    } catch (error) {
      if (process.platform !== 'win32') throw error;
      symlinkError = error;
      return [];
    }
    return [link];
  });
  try {
    if (symlinkError)
      test.skip(
        `Windows cannot create a file symlink: ${String(symlinkError)}`,
      );
    await expect(
      parent.run({
        config: { ...config, lifecycle_passthrough: ['@fixture/listed'] },
      }),
    ).resolves.toMatchObject({ result: 'inherited provider streamed' });
    expect(parent.trace()).not.toContain('foreign:before_agent_start');
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

it.each([
  'success',
  'failure',
  'cancel',
  'total-timeout',
  'stall-timeout',
  'pre-aborted',
  'verification-failure',
] as const)('shuts down listed lifecycle extensions exactly once on %s', async (ending) => {
  const parent = await fixture([observerExtension]);
  const dispose = vi.spyOn(AgentSession.prototype, 'dispose');
  const controller = new AbortController();
  if (ending === 'pre-aborted') controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = parent.run({
      definition: {
        name: 'listed-fixture',
        description: 'Listed shutdown coverage',
        filePath: fixtureExtension,
        instructions: 'Reply.',
        tools:
          ending === 'verification-failure' ? ['missing_fixture_tool'] : [],
        model: { provider: 'session-start-fixture', id: 'fixture' },
      },
      task:
        ending === 'failure'
          ? 'fixture-failure'
          : ['cancel', 'total-timeout', 'stall-timeout'].includes(ending)
            ? 'fixture-wait'
            : 'Reply.',
      signal: controller.signal,
      config: {
        ...config,
        lifecycle_passthrough: ['@fixture/lifecycle'],
        stall_timeout_ms: ending === 'stall-timeout' ? 1 : 10_000,
      },
      onActivity(activity) {
        if (activity.message !== 'preparing response') return;
        if (ending === 'cancel') controller.abort();
        if (ending === 'total-timeout')
          timer = setTimeout(() => controller.abort('timeout'), 25);
      },
    });
    if (ending === 'success')
      await expect(run).resolves.toMatchObject({
        result: 'inherited provider streamed',
      });
    else if (ending === 'verification-failure')
      await expect(run).rejects.toThrow(
        'missing implementation: missing_fixture_tool',
      );
    else if (ending === 'failure' || ending === 'stall-timeout')
      await expect(run).rejects.toMatchObject({
        error_metadata: {
          category:
            ending === 'failure' ? 'provider_api_error' : 'stall_timeout',
        },
      });
    else await expect(run).rejects.toThrow('Subagent was aborted');
    expect(
      parent.trace().filter((event) => event === 'observer:session_shutdown'),
    ).toHaveLength(1);
    expect(
      parent.trace().filter((event) => event === 'observer:session_start'),
    ).toHaveLength(ending === 'verification-failure' ? 0 : 1);
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

it('emits default background package shutdown handlers once before ordinary SDK shutdown', async () => {
  const parent = await fixture([], (root) => {
    const directory = path.join(root, 'background');
    fs.mkdirSync(directory);
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      '{"name":"@thoth-agents/pi-background-tasks"}',
    );
    const entry = path.join(directory, 'index.ts');
    fs.writeFileSync(
      entry,
      `import fs from 'node:fs';
      export default function (pi) {
        for (const label of ['one', 'two']) pi.on('session_shutdown', (event, ctx) => {
          if (event.reason !== 'quit' || !ctx.sessionManager.getSessionId()) throw new Error('Missing child context');
          fs.appendFileSync(process.env.PI_SUBAGENTS_PROVIDER_TRACE, 'background:' + label + '\\n');
        });
      }`,
    );
    return [entry];
  });
  try {
    await parent.run();
    expect(parent.trace()).toEqual([
      'stream:inherited provider streamed',
      'background:one',
      'background:two',
      'load-time:session_shutdown',
    ]);
  } finally {
    await parent.close();
  }
}, 30_000);

const codexPayloadExtension = fileURLToPath(
  new URL('./fixtures/codex-payload-provider.ts', import.meta.url),
);
const openAiFastExtension = fileURLToPath(
  new URL('../../../pi-openai-fast/src/index.ts', import.meta.url),
);

it.each([
  ['gpt-fixture-fast', { model: 'gpt-fixture', service_tier: 'priority' }],
  ['gpt-fixture', { model: 'gpt-fixture' }],
])(
  'sends the final provider payload of a child selecting %s through the real pi-openai-fast extension',
  async (id, expected) => {
    const parent = await fixture([codexPayloadExtension, openAiFastExtension]);
    try {
      const result = await parent.run({
        definition: {
          name: 'fast-child',
          description: 'Fast variant child',
          filePath: codexPayloadExtension,
          instructions: 'Reply.',
          tools: [],
          model: { provider: 'codex-payload-fixture', id },
        },
      });
      expect(JSON.parse(result.result)).toMatchObject(expected);
      if (id === 'gpt-fixture')
        expect(JSON.parse(result.result)).not.toHaveProperty('service_tier');
    } finally {
      await parent.close();
    }
  },
  30_000,
);
