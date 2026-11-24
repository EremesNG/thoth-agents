import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  type ProviderConfig,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sdkSubagentRunner } from '../../src/runner/sdk-runner.js';
import { fixtureProvider } from './fixtures/provider-fixture.js';

const extension = fileURLToPath(
  new URL('../../../pi-background-tasks/src/index.ts', import.meta.url),
);
const sideEffectTool = 'bg_task_clear';
const reply = 'Fixture completed';
const providerId = 'ordered-tools';
let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-ordered-tools-'));
  const agentDir = path.join(cwd, 'agent');
  fs.mkdirSync(agentDir);
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', path.join(cwd, 'history'));
  vi.stubEnv('PI_SUBAGENTS_HISTORY_DB_PATH', path.join(cwd, 'history.sqlite'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(cwd, { recursive: true, force: true });
});

async function createRuntime(provider: ProviderConfig) {
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(cwd, 'auth.json'),
    allowModelNetwork: false,
  });
  runtime.registerProvider(providerId, provider);
  await runtime.refresh({ allowNetwork: false });
  return runtime;
}

function batchProvider(names: string[]): ProviderConfig {
  const provider = fixtureProvider(reply);
  const finish = provider.streamSimple;
  assert(finish);
  return {
    ...provider,
    streamSimple(model, context, options) {
      if (context.messages.some((message) => message.role === 'toolResult'))
        return finish(model, context, options);
      const stream = createAssistantMessageEventStream();
      const message = {
        role: 'assistant',
        content: names.map((name, index) => ({
          type: 'toolCall' as const,
          id: `ordered-${index}`,
          name,
          arguments: {},
        })),
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
      } as const;
      stream.push({ type: 'done', reason: 'toolUse', message });
      stream.end(message);
      return stream;
    },
  };
}

it.each([
  {
    scenario: 'registered Thoth mode',
    middle: sideEffectTool,
    stripMode: false,
    serial: true,
  },
  {
    scenario: 'same definition without its mode',
    middle: sideEffectTool,
    stripMode: true,
    serial: false,
  },
  {
    scenario: 'read-only tools',
    middle: 'read_middle',
    stripMode: false,
    serial: false,
  },
])('schedules a single Pi tool batch with $scenario', async ({
  middle,
  stripMode,
  serial,
}) => {
  const names = ['read_slow', middle, 'read_fast'];
  const intervals = new Map<string, { start: number; end: number }>();
  const execute = (name: string) => async () => {
    const start = performance.now();
    // Yield one turn so parallel fast calls can finish inside the slow call.
    if (name === 'read_slow') await setImmediate();
    intervals.set(name, { start, end: performance.now() });
    return { content: [{ type: 'text' as const, text: name }], details: {} };
  };
  const settingsManager = SettingsManager.inMemory({
    retry: { enabled: false },
  });
  const modelRuntime = await createRuntime(batchProvider(names));
  const agentDir = path.join(cwd, 'agent');
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    additionalExtensionPaths: middle === sideEffectTool ? [extension] : [],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionsOverride(base) {
      for (const loaded of base.extensions) {
        const registration = loaded.tools.get(sideEffectTool);
        if (!registration) continue;
        // Keep the real registered definition; replace only its body so the
        // test can time it without touching the background-task registry.
        registration.definition = {
          ...registration.definition,
          execute: execute(sideEffectTool),
        };
        if (stripMode) delete registration.definition.executionMode;
      }
      return base;
    },
  });
  await loader.reload();
  const model = modelRuntime.getModel(providerId, 'fixture');
  assert(model);
  const { session, extensionsResult } = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    modelRuntime,
    resourceLoader: loader,
    model,
    sessionManager: SessionManager.inMemory(cwd),
    tools: names,
    customTools: names
      .filter((name) => name !== sideEffectTool)
      .map((name) => ({
        name,
        label: name,
        description: 'Instrumented read-only tool',
        parameters: Type.Object({}),
        execute: execute(name),
      })),
  });
  try {
    expect(extensionsResult.errors).toEqual([]);
    await session.prompt('Run all three calls together.');
    const results = session.agent.state.messages.filter(
      (message) => message.role === 'toolResult',
    );
    expect(results).toHaveLength(names.length);
    expect(results.every((result) => !result.isError)).toBe(true);
    const [slow, middleCall, fast] = names.map((name) => {
      const interval = intervals.get(name);
      assert(interval, `Missing timestamps for ${name}`);
      return interval;
    });
    if (serial) {
      expect(slow.end).toBeLessThanOrEqual(middleCall.start);
      expect(middleCall.end).toBeLessThanOrEqual(fast.start);
    } else {
      for (const call of [middleCall, fast]) {
        expect(call.start).toBeGreaterThanOrEqual(slow.start);
        expect(call.start).toBeLessThan(slow.end);
      }
    }
  } finally {
    session.dispose();
  }
});

it('preserves the registered Thoth mode in a real lean child session', async () => {
  const settingsManager = SettingsManager.inMemory({
    extensions: [extension],
    retry: { enabled: false },
  });
  const modelRuntime = await createRuntime(fixtureProvider(reply));
  const prompt = AgentSession.prototype.prompt;
  const definitions: { name: string; executionMode?: string }[] = [];
  vi.spyOn(AgentSession.prototype, 'prompt').mockImplementation(function (
    this: AgentSession,
    ...args
  ) {
    definitions.push(
      ...this.agent.state.tools.filter((tool) => tool.name === sideEffectTool),
    );
    return prompt.apply(this, args);
  });
  const outcome = await sdkSubagentRunner({
    definition: {
      name: 'lean-tool-mode',
      description: 'Lean child tool-mode fixture',
      filePath: extension,
      instructions: 'Return the fixture response.',
      tools: [sideEffectTool],
      model: { provider: providerId, id: 'fixture' },
    },
    task: 'Report readiness.',
    cwd,
    ctx: { modelRuntime, settingsManager },
    config: {
      timeout_ms: 30_000,
      stall_timeout_ms: 30_000,
      max_concurrency: 1,
      default_tools: [sideEffectTool],
      session_resources: 'lean',
      lifecycle_passthrough: [],
    },
    signal: new AbortController().signal,
  });
  expect(outcome.result).toBe(reply);
  expect(definitions).toMatchObject([
    { name: sideEffectTool, executionMode: 'sequential' },
  ]);
});
