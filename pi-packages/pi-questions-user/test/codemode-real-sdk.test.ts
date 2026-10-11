import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  getCurrentTools,
} from '@earendil-works/pi-ai';
import { getModel } from '@earendil-works/pi-ai/compat';
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  type ExtensionFactory,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';
import { createQuestionTool, TOOL_NAME } from '../src/index.js';

it.each([
  'on',
  'only',
  undefined,
] as const)('keeps questions directly callable and outside scripts with codemode %s', async (mode) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-questions-codemode-'));
  const agentDir = path.join(cwd, 'agent');
  fs.mkdirSync(agentDir);
  let executions = 0;
  const questions: ExtensionFactory = (pi) => {
    const tool = createQuestionTool();
    pi.registerTool({
      ...tool,
      execute: async (...args) => {
        executions++;
        return tool.execute(...args);
      },
    });
    // This direct tool must be hidden in `only`, proving request projection ran.
    pi.registerTool({
      name: 'script_callable',
      label: 'Script callable',
      description: 'A script-callable projection control.',
      parameters: tool.parameters,
      execute: async () => ({
        content: [{ type: 'text', text: 'control' }],
        details: {},
      }),
    });
  };
  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    extensionFactories: [
      questions,
      ...(mode ? [createCodemodeExtension({ mode })] : []),
    ],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  let session:
    | Awaited<ReturnType<typeof createAgentSession>>['session']
    | undefined;
  try {
    await loader.reload();
    const created = await createAgentSession({
      cwd,
      agentDir,
      resourceLoader: loader,
      settingsManager,
      sessionManager: SessionManager.inMemory(cwd),
      model: getModel('openai', 'gpt-4o-mini'),
      tools: [TOOL_NAME, 'script_callable', ...(mode ? ['codemode'] : [])],
    });
    session = created.session;
    expect(created.extensionsResult.errors).toEqual([]);
    const declarations: string[][] = [];
    let turn = 0;
    const params = {
      questions: [
        { id: 'q', header: 'Question', prompt: 'Continue?', type: 'confirm' },
      ],
    };
    session.agent.getApiKey = () => 'offline';
    session.agent.streamFunction = (model, context) => {
      declarations.push(
        getCurrentTools(context.messages).map((tool) => tool.name),
      );
      const scriptTurn = Boolean(mode) && turn === 0;
      const directTurn = turn === (mode ? 1 : 0);
      const stopReason = scriptTurn || directTurn ? 'toolUse' : 'stop';
      const message: AssistantMessage = {
        role: 'assistant',
        api: model.api,
        provider: model.provider,
        model: model.id,
        timestamp: 0,
        stopReason,
        content:
          scriptTurn || directTurn
            ? [
                {
                  type: 'toolCall',
                  id: `call-${turn}`,
                  name: scriptTurn ? 'codemode' : TOOL_NAME,
                  arguments: scriptTurn
                    ? {
                        code: `await tools.ask_user_question(${JSON.stringify(params)});`,
                      }
                    : params,
                },
              ]
            : [{ type: 'text', text: 'done' }],
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      if (mode && turn === 1) expect(executions).toBe(0);
      turn++;
      const stream = createAssistantMessageEventStream();
      stream.push({ type: 'done', reason: stopReason, message });
      stream.end();
      return stream;
    };
    // Use the public agent loop: no UI/network, with session-installed projections
    // and tool hooks intact. The extension's no-UI before-start policy is unrelated.
    await session.agent.prompt('Exercise the question tool boundary.');
    expect(session.agent.state.errorMessage).toBeUndefined();
    expect(declarations.length).toBe(mode ? 3 : 2);
    for (const names of declarations) {
      expect(names).toContain(TOOL_NAME);
      if (mode === 'only') expect(names).not.toContain('script_callable');
      else expect(names).toContain('script_callable');
    }
    expect(executions).toBe(1);
    const results = session.messages.filter(
      (message) => message.role === 'toolResult',
    );
    if (mode) {
      expect(results[0]).toMatchObject({
        toolName: 'codemode',
        isError: true,
        details: { calls: [] },
      });
      expect(JSON.stringify(results[0])).toContain(
        'tools.ask_user_question does not exist',
      );
    }
    expect(results.at(-1)).toMatchObject({
      toolName: TOOL_NAME,
      isError: false,
      details: { cancelled: true, error: 'no_ui' },
    });
  } finally {
    await session?.dispose();
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}, 30_000);
