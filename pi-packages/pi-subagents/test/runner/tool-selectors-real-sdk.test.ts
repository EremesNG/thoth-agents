import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { expect, it } from 'vitest';
import { expandToolPatterns } from '../../src/tool-patterns.js';

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
    ];
    rootSession.setActiveToolsByName(
      selection === '*'
        ? [
            ...permitted,
            'subagent_run',
            'ask_user_question',
            'todo',
            'AskClaude',
            'AskAntigravity',
          ]
        : [],
    );
    const rootActiveNames = rootSession.getActiveToolNames();
    if (selection === 'explicit')
      expect(rootActiveNames).not.toContain('inactive_fixture_tool');

    const selectedTools = expandToolPatterns(
      selection === 'explicit' ? permitted : [selection],
      rootActiveNames,
    );
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
    const callableNames = ['inactive_fixture_tool', 'codemode_fixture_tool'];
    for (const name of callableNames) {
      const outcome = await executeNested(name);
      expect(outcome.isError).toBe(false);
      expect(outcome.result.details).toMatchObject({ isError: false });
      expect(outcome.result.content).toContainEqual({
        type: 'text',
        text: `${name} executed`,
      });
    }
    const rejectedNames = [
      'subagent_run',
      'ask_user_question',
      'todo',
      'AskClaude',
      'AskAntigravity',
      'excluded_fixture_tool',
    ];
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
