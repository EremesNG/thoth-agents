import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { expect, it, vi } from 'vitest';
import { loadSubagents, subagentSourceWarnings } from '../../src/config.js';
import { sdkSubagentRunner } from '../../src/runner/sdk-runner.js';
import { expandToolPatterns } from '../../src/tool-patterns.js';

interface PermittedChildRegistryCase {
  selection: string;
  tools: string[];
  expected: string[];
  enabled?: boolean;
  active?: string[];
  registered?: string[] | null;
  defaultTools?: string[];
  denials?: string;
  dropped?: string[];
  opening?: string;
  closing?: string;
  newline?: string;
  blockedOverride?: {
    frontmatter: string;
    diagnostic: string;
    opening?: string;
    closing?: string;
  };
}

it.each<PermittedChildRegistryCase>([
  {
    selection: 'explicit',
    tools: ['read', 'ask_orchestrator'],
    expected: ['read', 'ask_orchestrator'],
  },
  {
    selection: 'only explicit',
    tools: ['ask_orchestrator'],
    expected: ['ask_orchestrator'],
  },
  {
    selection: 'explicit omitting',
    tools: ['read'],
    expected: ['read', 'ask_orchestrator'],
  },
  {
    selection: 'disabled',
    tools: ['read', 'ask_orchestrator'],
    enabled: false,
    expected: ['read'],
  },
  {
    selection: '* glob without root ask tool',
    tools: ['*'],
    expected: ['read', 'bash', 'ask_orchestrator'],
  },
  {
    selection: 'glob',
    tools: ['read', 'ask_*'],
    expected: ['read', 'ask_orchestrator'],
  },
  {
    selection: 'mixed explicit',
    tools: ['*', 'ask_orchestrator'],
    expected: ['read', 'bash', 'ask_orchestrator'],
  },
  {
    selection: 'defaults',
    tools: [],
    defaultTools: ['read'],
    expected: ['read', 'ask_orchestrator'],
  },
  { selection: 'empty default', tools: [], expected: ['ask_orchestrator'] },
  {
    selection: 'empty active inventory with registered tools',
    tools: ['*'],
    active: [],
    expected: ['read', 'bash', 'ask_orchestrator'],
  },
  {
    selection: 'empty registered inventory',
    tools: ['*'],
    registered: [],
    expected: ['ask_orchestrator'],
  },
  {
    selection: 'unavailable registered inventory with *',
    tools: ['*'],
    registered: null,
    expected: ['ask_orchestrator'],
  },
  {
    selection: 'unavailable registered inventory with family glob',
    tools: ['agent_browser_*'],
    registered: null,
    expected: ['ask_orchestrator'],
  },
  {
    selection:
      'unavailable registered inventory keeps exact names and missing reports',
    tools: ['*', 'read', 'not_installed_fixture'],
    registered: null,
    enabled: false,
    dropped: ['not_installed_fixture'],
    expected: ['read'],
  },
  {
    selection: 'denied injected string',
    tools: ['*'],
    denials: 'disallowed_tools: ask_orchestrator',
    expected: ['read', 'bash'],
  },
  ...['--- ', '---\t', '--- # comment', '\uFEFF--- '].flatMap((opening) =>
    ['\n', '\r\n'].map((newline) => ({
      selection: `B6 denial with opening ${JSON.stringify(opening)} and newline ${JSON.stringify(newline)}`,
      opening,
      newline,
      tools: ['*'],
      denials: 'disallowed_tools: ask_orchestrator',
      expected: ['read', 'bash'],
    })),
  ),
  {
    selection: 'B6 SDK-visible denial in an adjacent opening comment',
    opening: '---#disallowed_tools: ask_orchestrator',
    tools: ['*'],
    expected: ['read', 'bash'],
  },
  {
    selection: 'B6 denial with a commented closing delimiter',
    opening: '--- # opening comment',
    closing: '--- # closing comment',
    newline: '\r\n',
    tools: ['*'],
    denials: 'disallowed_tools: ask_orchestrator',
    expected: ['read', 'bash'],
  },
  ...[
    {
      selection: 'invalid opening',
      opening: '---x',
      diagnostic: 'invalid YAML frontmatter opening',
    },
    {
      selection: 'unterminated commented opening',
      opening: '--- # opening comment',
      closing: '',
      diagnostic: 'unterminated YAML frontmatter',
    },
  ].map(({ selection, ...delimiters }) => ({
    selection: `B6 ${selection} blocks a permissive filename fallback`,
    tools: ['*'],
    denials: 'disallowed_tools: ask_orchestrator',
    blockedOverride: {
      ...delimiters,
      frontmatter:
        'name: worker\ntools: read\ndisallowed_tools: ask_orchestrator',
    },
    expected: ['read', 'bash'],
  })),
  {
    selection:
      'denial-bearing name mismatch blocks a permissive filename fallback',
    tools: ['*'],
    denials: 'disallowed_tools: ask_orchestrator',
    blockedOverride: {
      frontmatter:
        'name: analyst\ntools: "*"\ndisallowed_tools: ask_orchestrator',
      diagnostic: 'rename the file to analyst.md or change name',
    },
    expected: ['read', 'bash'],
  },
  {
    selection:
      'tagged ordered-map override blocks a permissive filename fallback',
    tools: ['*'],
    denials: 'disallowed_tools: ask_orchestrator',
    blockedOverride: {
      frontmatter:
        '!!omap\n- name: worker\n- tools: read\n- disallowed_tools: ask_orchestrator',
      diagnostic:
        'agent frontmatter does not support YAML anchors, aliases, merge keys or tags',
    },
    expected: ['read', 'bash'],
  },
  ...[
    ['merge-key override', '<<: {disallowed_tools: ask_orchestrator}'],
    [
      'alias-key duplicate override',
      '&key disallowed_tools: ask_orchestrator\n*key : []',
    ],
    ['anchored value override', 'disallowed_tools: &deny ask_orchestrator'],
    ['alias value override', 'disallowed_tools: *missing'],
    ['custom-tagged value override', 'disallowed_tools: !foo ask_orchestrator'],
    [
      'explicit-string-tag override',
      'disallowed_tools: !!str ask_orchestrator',
    ],
  ].map(([selection, fields]) => ({
    selection: `${selection} blocks a permissive filename fallback`,
    tools: ['*'],
    denials: 'disallowed_tools: ask_orchestrator',
    blockedOverride: {
      frontmatter: `name: worker\ntools: "*"\n${fields}`,
      diagnostic:
        'agent frontmatter does not support YAML anchors, aliases, merge keys or tags',
    },
    expected: ['read', 'bash'],
  })),
  {
    selection: 'denied injected YAML list',
    tools: ['read', 'ask_*'],
    denials: 'disallowed_tools:\n  - ask_orchestrator',
    expected: ['read'],
  },
  {
    selection: 'denied ordinary wildcard',
    tools: ['*'],
    denials: 'disallowed_tools: bash',
    expected: ['read', 'ask_orchestrator'],
  },
  {
    selection: 'denied ordinary glob',
    tools: ['*ash', 'read'],
    denials: 'disallowed_tools: bash',
    expected: ['read', 'ask_orchestrator'],
  },
  {
    selection: 'denied ordinary explicit',
    tools: ['read', 'bash'],
    denials: 'disallowed_tools: bash',
    expected: ['read', 'ask_orchestrator'],
  },
  {
    selection: 'denied ordinary default',
    tools: [],
    defaultTools: ['read', 'bash'],
    denials: 'disallowed_tools: bash',
    expected: ['read', 'ask_orchestrator'],
  },
  {
    selection: 'uninstalled denied name',
    tools: ['read'],
    denials: 'disallowed_tools: not_installed_fixture',
    expected: ['read', 'ask_orchestrator'],
  },
  {
    selection: 'uninstalled denied selected name',
    tools: ['read', 'not_installed_fixture'],
    denials: 'disallowed_tools: not_installed_fixture',
    expected: ['read', 'ask_orchestrator'],
  },
  {
    selection: 'missing ordinary tools with injected implementation',
    tools: ['not_installed_fixture'],
    dropped: ['not_installed_fixture'],
    expected: ['ask_orchestrator'],
  },
  {
    selection: 'disabled wildcard with root ask tool',
    tools: ['*'],
    enabled: false,
    active: ['read', 'bash', 'ask_orchestrator'],
    expected: ['read', 'bash'],
  },
])('uses one effective permitted child registry: $selection', async ({
  tools,
  enabled = true,
  expected,
  active = ['read', 'bash'],
  registered: inventory = ['read', 'bash'],
  defaultTools = [],
  denials = '',
  dropped = [],
  opening = '---',
  closing = '---',
  newline = '\n',
  blockedOverride,
}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-ask-sdk-'));
  const cwd = path.join(root, 'workspace');
  const agentDir = path.join(root, 'agent');
  fs.mkdirSync(path.join(cwd, '.pi', 'subagents'), { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents', 'analyst.md'),
    [
      opening,
      'name: analyst',
      `tools: ${JSON.stringify(tools.join(', '))}`,
      denials,
      closing,
      'bounded analysis',
    ].join(newline),
  );
  if (blockedOverride) {
    fs.mkdirSync(path.join(agentDir, 'subagents'), { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'subagents', 'worker.md'),
      '---\nname: worker\ntools: read\n---\nPermissive worker fallback',
    );
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'worker.md'),
      [
        blockedOverride.opening ?? '---',
        blockedOverride.frontmatter,
        blockedOverride.closing ?? '---',
        'Invalid denial-bearing override',
      ].join('\n'),
    );
  }
  const { AgentSession, ModelRuntime, SettingsManager } = await import(
    '@earendil-works/pi-coding-agent'
  );
  const askQuestion = vi.fn(async () => 'use runtime scope');
  const reportProgress = vi.fn();
  const close = vi.fn();
  const registered: string[] = [];
  let childResult: any;
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', path.join(root, 'history'));
  const prompt = vi
    .spyOn(AgentSession.prototype, 'prompt')
    .mockImplementation(async function (
      this: InstanceType<typeof AgentSession>,
    ) {
      registered.push(...this.getAllTools().map((tool) => tool.name));
      const tool = this.agent.state.tools.find(
        (tool) => tool.name === 'ask_orchestrator',
      );
      if (tool) {
        childResult = await tool.execute(
          'question',
          { kind: 'question', message: 'Which scope?' },
          new AbortController().signal,
        );
        await tool.execute(
          'progress',
          { kind: 'progress', message: 'Scope selected' },
          new AbortController().signal,
        );
      }
      this.agent.state.messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
      } as AssistantMessage);
    });
  try {
    const definitions = loadSubagents(cwd);
    const modelRuntime = await ModelRuntime.create({
      modelsPath: null,
      authPath: path.join(agentDir, 'auth.json'),
      allowModelNetwork: false,
    });
    const result = await sdkSubagentRunner({
      // A leaked worker fallback must be exercised, not hidden by the analyst.
      definition:
        definitions.find(({ name }) => name === 'worker') ?? definitions[0],
      task: 'align',
      taskId: 'subtask_effective',
      cwd,
      ctx: {
        modelRuntime,
        settingsManager: SettingsManager.inMemory({}),
        pi: {
          getActiveTools: () => active,
          ...(inventory === null ? {} : { getAllTools: () => inventory }),
        },
      },
      config: {
        timeout_ms: 10000,
        stall_timeout_ms: 10000,
        max_concurrency: 1,
        default_tools: defaultTools,
        model_profiles: {},
        session_resources: 'lean',
        enable_ask_orchestrator: enabled,
      },
      signal: new AbortController().signal,
      orchestratorChannel: {
        askQuestion,
        reportProgress,
        close,
        onPendingChange: () => () => {},
      },
    });
    expect(registered.sort()).toEqual([...expected].sort());
    if (blockedOverride) {
      expect(definitions).toEqual([
        expect.objectContaining({
          name: 'analyst',
          filePath: path.join(cwd, '.pi', 'subagents', 'analyst.md'),
          disallowed_tools: ['ask_orchestrator'],
        }),
      ]);
      expect(subagentSourceWarnings(cwd)).toEqual([
        expect.stringContaining(blockedOverride.diagnostic),
      ]);
      expect(subagentSourceWarnings(cwd)[0]).toContain(
        path.join(cwd, '.pi', 'subagents', 'worker.md'),
      );
    }
    expect(result.dropped_tools).toEqual(dropped);
    if (expected.includes('ask_orchestrator')) {
      expect(childResult.content).toContainEqual({
        type: 'text',
        text: 'use runtime scope',
      });
      expect(askQuestion).toHaveBeenCalledWith(
        'Which scope?',
        expect.any(AbortSignal),
      );
      expect(reportProgress).toHaveBeenCalledWith('Scope selected');
    } else {
      expect(askQuestion).not.toHaveBeenCalled();
      expect(reportProgress).not.toHaveBeenCalled();
    }
  } finally {
    prompt.mockRestore();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
it.each([
  {
    selection: '*',
    tools: ['*'],
    expected: [
      'read',
      'agent_browser_probe',
      'agent_browser_action',
      'ask_orchestrator',
    ],
  },
  {
    selection: 'agent_browser_*',
    tools: ['agent_browser_*'],
    expected: [
      'agent_browser_probe',
      'agent_browser_action',
      'ask_orchestrator',
    ],
  },
  {
    selection: 'exact inactive name',
    tools: ['agent_browser_action'],
    expected: ['agent_browser_action', 'ask_orchestrator'],
  },
  {
    selection: 'default_tools family glob',
    tools: [],
    expected: [
      'agent_browser_probe',
      'agent_browser_action',
      'ask_orchestrator',
    ],
  },
])('passes root-inactive registered tools to a real SDK child for $selection', async ({
  tools,
  expected,
}) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pi-subagents-registered-'),
  );
  const agentDir = path.join(root, 'agent');
  const cwd = path.join(root, 'workspace');
  const extensionPath = path.join(root, 'browser-tools.ts');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(
    extensionPath,
    `export default function (pi) {
      for (const [name, exposure] of [
        ['agent_browser_probe', 'model'],
        ['agent_browser_action', 'deferred'],
        ['agent_browser_denied', 'deferred'],
        ['subagent_run', 'model-only'],
      ]) pi.registerTool({
        name, exposure, label: name, description: 'Returns a fixture marker.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => ({ content: [{ type: 'text', text: name + ' executed' }] }),
      });
    }`,
  );
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', path.join(root, 'history'));
  const {
    AgentSession,
    createAgentSession,
    DefaultResourceLoader,
    ModelRuntime,
    SessionManager,
    SettingsManager,
  } = await import('@earendil-works/pi-coding-agent');
  const settingsManager = SettingsManager.inMemory({
    extensions: [extensionPath],
  });
  const modelRuntime = await ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(agentDir, 'auth.json'),
    allowModelNetwork: false,
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    additionalExtensionPaths: [extensionPath],
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
    tools: [
      'read',
      'agent_browser_probe',
      'agent_browser_action',
      'agent_browser_denied',
      'subagent_run',
    ],
    sessionManager: SessionManager.inMemory(cwd),
  });
  const registered: string[] = [];
  let active: string[] = [];
  let actionResult: unknown;
  const prompt = vi
    .spyOn(AgentSession.prototype, 'prompt')
    .mockImplementation(async function (
      this: InstanceType<typeof AgentSession>,
    ) {
      registered.push(...this.getAllTools().map((tool) => tool.name));
      this.setActiveToolsByName(['agent_browser_action']);
      active = this.getActiveToolNames();
      const action = this.agent.state.tools.find(
        (tool) => tool.name === 'agent_browser_action',
      );
      actionResult = await action?.execute(
        'action',
        {},
        new AbortController().signal,
      );
      this.agent.state.messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
      } as AssistantMessage);
    });
  try {
    expect(parent.extensionsResult.errors).toEqual([]);
    parent.session.setActiveToolsByName(['read', 'agent_browser_probe']);
    expect(parent.session.getActiveToolNames()).not.toContain(
      'agent_browser_action',
    );
    expect(parent.session.getAllTools().map((tool) => tool.name)).toContain(
      'agent_browser_action',
    );
    const result = await sdkSubagentRunner({
      definition: {
        name: 'browser-child',
        description: 'Browser child',
        filePath: path.join(root, 'browser-child.md'),
        instructions: 'Use selected tools.',
        tools,
        disallowed_tools: ['agent_browser_denied'],
      },
      task: 'Use browser tools.',
      cwd,
      ctx: {
        modelRuntime,
        settingsManager,
        pi: {
          getActiveTools: () => parent.session.getActiveToolNames(),
          getAllTools: () => parent.session.getAllTools(),
        },
      },
      config: {
        timeout_ms: 10000,
        stall_timeout_ms: 10000,
        max_concurrency: 1,
        default_tools: ['agent_browser_*'],
        model_profiles: {},
        session_resources: 'lean',
      },
      signal: new AbortController().signal,
    });
    expect([...registered].sort()).toEqual([...expected].sort());
    expect(active).toContain('agent_browser_action');
    expect(actionResult).toMatchObject({
      content: [{ type: 'text', text: 'agent_browser_action executed' }],
    });
    expect(result).toMatchObject({ result: 'done', dropped_tools: [] });
  } finally {
    prompt.mockRestore();
    await parent.session.dispose();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

it.each([
  { enabled: false, tools: ['ask_orchestrator'], denied: [] },
  { enabled: true, tools: ['read'], denied: ['read', 'ask_orchestrator'] },
  { enabled: false, tools: ['*'], denied: [] },
  { enabled: false, tools: ['agent_browser_*'], denied: [] },
])('rejects an empty effective permitted selection before SDK launch: %o', async ({
  enabled,
  tools,
  denied,
}) => {
  await expect(
    sdkSubagentRunner({
      definition: {
        name: 'empty',
        description: 'empty',
        filePath: '/empty.md',
        instructions: 'Reply.',
        tools,
        disallowed_tools: denied,
      },
      task: 'reply',
      cwd: '.',
      ctx: { pi: { getActiveTools: () => [] } },
      config: {
        timeout_ms: 1000,
        stall_timeout_ms: 1000,
        max_concurrency: 1,
        default_tools: [],
        model_profiles: {},
        enable_ask_orchestrator: enabled,
      },
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow('effective permitted tool selection is empty');
});

it('distinguishes queued, extension-handled and rejected steering in the real SDK', async () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pi-subagents-native-steer-'),
  );
  const agentDir = path.join(fixtureRoot, 'agent');
  const cwd = path.join(fixtureRoot, 'workspace');
  const extensionPath = path.join(fixtureRoot, 'input-fixture.ts');
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(
    extensionPath,
    `export default function (pi) {
    pi.on('input', async (event) => event.text === 'extension input'
      ? { action: 'handled' } : { action: 'continue' });
    pi.registerCommand('fixture_command', {
      description: 'Fixture command that cannot be queued', handler: async () => {},
    });
  }`,
  );
  process.env.PI_CODING_AGENT_DIR = agentDir;
  let session:
    | import('@earendil-works/pi-coding-agent').AgentSession
    | undefined;
  try {
    const { DefaultResourceLoader, SessionManager, createAgentSession } =
      await import('@earendil-works/pi-coding-agent');
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      noExtensions: true,
      additionalExtensionPaths: [extensionPath],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const created = await createAgentSession({
      cwd,
      agentDir,
      resourceLoader: loader,
      tools: [],
      sessionManager: SessionManager.inMemory(cwd),
    });
    session = created.session;
    expect(created.extensionsResult.errors).toEqual([]);
    await expect(session.steer('queued input')).resolves.toBe('queued');
    await expect(session.steer('extension input')).resolves.toBe('handled');
    await expect(session.steer('/fixture_command')).rejects.toThrow(
      'cannot be queued',
    );
    expect(session.clearQueue()).toEqual({
      steering: ['queued input'],
      followUp: [],
    });
    expect(session.messages).toEqual([]);
  } finally {
    await session?.dispose();
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}, 30_000);

it.each([
  '*',
  'explicit',
])('restricts the child registry and nested calls for %s selection', async (selection) => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pi-subagents-tool-selector-'),
  );
  const agentDir = path.join(fixtureRoot, 'agent');
  const cwd = path.join(fixtureRoot, 'workspace');
  const extensionDir = path.join(agentDir, 'extensions');
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  fs.mkdirSync(extensionDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(
    path.join(extensionDir, 'inactive-tool.ts'),
    `export default function (pi) {
      for (const [name, exposure] of [
        ['inactive_fixture_tool', 'deferred'],
        ['codemode_fixture_tool', 'codemode'],
        ['excluded_fixture_tool', 'deferred'],
        ['subagent_run', 'deferred'],
        ['ask_user_question', 'codemode'],
        ['todo', 'deferred'],
        ['AskClaude', 'deferred'],
        ['AskAntigravity', 'deferred'],
      ]) pi.registerTool({
        name, exposure, label: name, description: 'Returns its fixture marker.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => ({ content: [{ type: 'text', text: name + ' executed' }] }),
      });
      pi.registerTool({
        name: 'fixture_caller', label: 'Nested caller', description: 'Runs selected nested tool calls.',
        parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        execute: async (_id, args, _signal, _update, ctx) => {
          const outcome = await ctx.executeTool(args.name, {});
          return { content: outcome.result.content, details: { isError: outcome.isError } };
        },
      });
    }`,
  );
  fs.writeFileSync(
    path.join(agentDir, 'settings.json'),
    JSON.stringify({
      extensions: [path.join(extensionDir, 'inactive-tool.ts')],
    }),
  );
  process.env.PI_CODING_AGENT_DIR = agentDir;

  let rootSession: any;
  let childSession: any;
  try {
    const {
      DefaultResourceLoader,
      SessionManager,
      createAgentSession,
      getAgentDir,
    } = await import('@earendil-works/pi-coding-agent');
    const { runToolCall } = await import('@earendil-works/pi-agent-core');
    const createLoader = async () => {
      const loader = new DefaultResourceLoader({
        cwd,
        agentDir: getAgentDir(),
        noExtensions: true,
        additionalExtensionPaths: [path.join(extensionDir, 'inactive-tool.ts')],
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      });
      await loader.reload();
      return loader;
    };

    const root = await createAgentSession({
      cwd,
      resourceLoader: await createLoader(),
      sessionManager: SessionManager.inMemory(cwd),
    });
    rootSession = root.session;
    const permitted = [
      'fixture_caller',
      'inactive_fixture_tool',
      'codemode_fixture_tool',
      'ask_user_question',
      'todo',
      'AskClaude',
      'AskAntigravity',
    ];
    rootSession.setActiveToolsByName(['fixture_caller']);
    expect(rootSession.getActiveToolNames()).not.toContain(
      'inactive_fixture_tool',
    );

    const selectedTools = expandToolPatterns(
      selection === 'explicit' ? permitted : [selection],
      rootSession.getAllTools().map((tool: { name: string }) => tool.name),
    ).filter((name) => name !== 'excluded_fixture_tool');
    expect(
      selectedTools,
      JSON.stringify({ agentDir, errors: root.extensionsResult.errors }),
    ).toContain('inactive_fixture_tool');

    const child = await createAgentSession({
      cwd,
      resourceLoader: await createLoader(),
      sessionManager: SessionManager.inMemory(cwd),
      tools: selectedTools,
    });
    childSession = child.session;
    childSession.setActiveToolsByName(['fixture_caller']);
    expect(childSession.getActiveToolNames()).not.toContain(
      'inactive_fixture_tool',
    );
    expect(childSession.getActiveToolNames()).not.toContain(
      'codemode_fixture_tool',
    );
    const childRegistered = childSession
      .getAllTools()
      .map((tool: { name: string }) => tool.name);
    expect([...childRegistered].sort()).toEqual([...selectedTools].sort());
    const assistantMessage: AssistantMessage = {
      role: 'assistant',
      content: [],
      api: 'openai-completions',
      provider: 'test',
      model: 'fixture',
      stopReason: 'toolUse',
      timestamp: 0,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    childSession.agent.state.messages = [assistantMessage];
    const executeNested = async (name: string) =>
      runToolCall(
        {
          type: 'toolCall',
          id: `fixture-${name}`,
          name: 'fixture_caller',
          arguments: { name },
        },
        {
          tools: childSession.agent.state.tools,
          assistantMessage,
          context: {
            messages: childSession.messages,
            tools: childSession.agent.state.tools,
          },
          beforeToolCall: childSession.agent.beforeToolCall,
          afterToolCall: childSession.agent.afterToolCall,
        },
      );
    const callableNames = [
      'inactive_fixture_tool',
      'codemode_fixture_tool',
      'ask_user_question',
      'todo',
      'AskClaude',
      'AskAntigravity',
    ];
    for (const name of callableNames) {
      const outcome = await executeNested(name);
      expect(outcome.isError).toBe(false);
      expect(outcome.result.details).toMatchObject({ isError: false });
      expect(outcome.result.content).toContainEqual({
        type: 'text',
        text: `${name} executed`,
      });
    }
    const rejectedNames = ['subagent_run', 'excluded_fixture_tool'];
    for (const name of rejectedNames) {
      expect(childRegistered).not.toContain(name);
      const outcome = await executeNested(name);
      expect(outcome.result.details).toMatchObject({ isError: true });
      expect(outcome.result.content).toContainEqual({
        type: 'text',
        text: `Tool ${name} not found`,
      });
    }
  } finally {
    await childSession?.dispose?.();
    await rootSession?.dispose?.();
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}, 30_000);

it('keeps orchestration controls model-visible and refuses nested execution before their handlers run', async () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pi-subagents-model-only-'),
  );
  const agentDir = path.join(fixtureRoot, 'agent');
  const cwd = path.join(fixtureRoot, 'workspace');
  const extensionDir = path.join(agentDir, 'extensions');
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  fs.mkdirSync(extensionDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  const registryPath = path
    .resolve('src/tools/registry.ts')
    .replaceAll('\\', '/');
  fs.writeFileSync(
    path.join(extensionDir, 'orchestration-tools.ts'),
    `import { registerSubagentTools } from ${JSON.stringify(registryPath)};
    export default function (pi) {
      let executions = 0;
      const registration = {
        registerTool(tool) {
          pi.registerTool({ ...tool, execute: async (...args) => {
            executions++;
            return tool.execute(...args);
          } });
        },
      };
      registerSubagentTools(registration, { listAgents: () => [] }, ${JSON.stringify(cwd)});
      pi.registerTool({
        name: 'fixture_caller', label: 'Nested caller', description: 'Runs a nested orchestration call.',
        parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        execute: async (_id, args, _signal, _update, ctx) => {
          const outcome = await ctx.executeTool(args.name, {
            task_id: 'fixture', agent: 'fixture', task: 'bounded task', message: 'hello',
          });
          return { content: outcome.result.content, details: { isError: outcome.isError, executions } };
        },
      });
    }`,
  );
  fs.writeFileSync(
    path.join(agentDir, 'subagents.json'),
    JSON.stringify({ enable_continue: true }),
  );
  fs.writeFileSync(
    path.join(agentDir, 'settings.json'),
    JSON.stringify({
      extensions: [path.join(extensionDir, 'orchestration-tools.ts')],
    }),
  );
  process.env.PI_CODING_AGENT_DIR = agentDir;

  let session: any;
  try {
    const { DefaultResourceLoader, SessionManager, createAgentSession } =
      await import('@earendil-works/pi-coding-agent');
    const { runToolCall } = await import('@earendil-works/pi-agent-core');
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      noExtensions: true,
      additionalExtensionPaths: [
        path.join(extensionDir, 'orchestration-tools.ts'),
      ],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const created = await createAgentSession({
      cwd,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(cwd),
    });
    session = created.session;
    expect(created.extensionsResult.errors).toEqual([]);
    const controls = [
      'subagent_list_agents',
      'subagent_run',
      'subagent_continue',
      'subagent_status',
      'subagent_result',
      'subagent_list_tasks',
      'subagent_cancel',
      'subagent_send_message',
    ];
    const modelTools = session.agent.state.tools.map(
      (tool: { name: string }) => tool.name,
    );
    for (const name of controls) {
      expect(session.getActiveToolNames()).toContain(name);
      expect(modelTools).toContain(name);
    }
    const assistantMessage: AssistantMessage = {
      role: 'assistant',
      content: [],
      api: 'openai-completions',
      provider: 'test',
      model: 'fixture',
      stopReason: 'toolUse',
      timestamp: 0,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    session.agent.state.messages = [assistantMessage];
    const executeModelTool = (name: string, args: Record<string, string>) =>
      runToolCall(
        {
          type: 'toolCall',
          id: `fixture-${name}`,
          name,
          arguments: args,
        },
        {
          tools: session.agent.state.tools,
          assistantMessage,
          context: {
            messages: session.messages,
            tools: session.agent.state.tools,
          },
          beforeToolCall: session.agent.beforeToolCall,
          afterToolCall: session.agent.afterToolCall,
        },
      );
    for (const name of controls) {
      const outcome = await executeModelTool('fixture_caller', { name });
      expect(outcome.isError).toBe(false);
      expect(outcome.result.details).toEqual({ isError: true, executions: 0 });
      expect(outcome.result.content).toContainEqual({
        type: 'text',
        text: `Tool ${name} not found`,
      });
      expect(session.getToolDefinition(name)).toMatchObject({
        exposure: 'model-only',
      });
      expect(session.getCallableToolNames()).not.toContain(name);
    }
    const direct = await executeModelTool('subagent_list_agents', {});
    expect(direct.isError).toBe(false);
    expect(direct.result.details).toMatchObject({ agents: [] });
    const afterDirect = await executeModelTool('fixture_caller', {
      name: 'subagent_list_agents',
    });
    expect(afterDirect.result.details).toEqual({
      isError: true,
      executions: 1,
    });
  } finally {
    await session?.dispose?.();
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}, 30_000);
