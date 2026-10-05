import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyThrownError,
  deriveErrorString,
  normalizeErrorMetadata,
  SubagentStructuredError,
} from '../../src/error-metadata.js';
import type {
  SubagentDefinition,
  SubagentErrorMetadata,
  SubagentsConfig,
} from '../../src/types.js';
import { ModelRuntimeFixture } from '../helpers/model-runtime-fixture.js';

describe('subagent runner structured errors', () => {
  const definition: SubagentDefinition = {
    name: 'sdd-apply',
    description: 'implementation executor',
    filePath: '/tmp/sdd-apply.md',
    instructions: 'return a concise result',
    tools: ['read'],
  };
  const config: SubagentsConfig = {
    timeout_ms: 10_000,
    stall_timeout_ms: 10_000,
    max_concurrency: 1,
    default_tools: ['read'],
    model_profiles: {},
  };

  async function runStructuredSession(
    sessionFactory: () => any,
    overrides: { config?: SubagentsConfig; ctx?: any } = {},
  ) {
    vi.resetModules();
    const createAgentSession = vi.fn(() => ({
      session: {
        getAllTools: () => [{ name: 'read' }],
        ...sessionFactory(),
      },
    }));
    vi.doMock('@earendil-works/pi-coding-agent', () => ({
      ModelRuntime: ModelRuntimeFixture,
      SessionManager: { inMemory: () => ({}) },
      createAgentSession,
    }));
    const { sdkSubagentRunner } = await import('../../src/runner.js');
    return {
      createAgentSession,
      promise: sdkSubagentRunner({
        definition,
        task: 'classify structured runner failure',
        cwd: '/workspace',
        ctx: {
          model: { provider: 'current', id: 'fallback-model' },
          ...overrides.ctx,
        },
        config: overrides.config ?? config,
        signal: new AbortController().signal,
      }),
    };
  }

  it('classifies provider auth/rate/network/api errors, redacts secrets, and bounds metadata', async () => {
    const cases: Array<{ error: unknown; category: string }> = [
      {
        error: new Error(
          `401 invalid api key Bearer sk-secret-${'x'.repeat(60)}`,
        ),
        category: 'provider_auth_error',
      },
      {
        error: new Error('429 rate limit exceeded for quota bucket'),
        category: 'provider_rate_limit',
      },
      {
        error: new Error('ECONNRESET upstream connection reset'),
        category: 'provider_network_error',
      },
      {
        error: new Error('500 internal provider failure'),
        category: 'provider_api_error',
      },
    ];

    for (const testCase of cases) {
      const { promise } = await runStructuredSession(
        () => ({
          subscribe: vi.fn(() => vi.fn()),
          prompt: vi.fn(async () => {
            throw testCase.error;
          }),
          messages: [],
          dispose: vi.fn(async () => undefined),
        }),
        { ctx: { model: undefined } },
      );
      await expect(promise).rejects.toMatchObject({
        error_metadata: expect.objectContaining({
          version: 1,
          category: testCase.category,
        }),
      });
      await promise.catch((error) => {
        expect(error.error_metadata.message.length).toBeLessThanOrEqual(1024);
        expect(error.error_metadata.attempts).toBeUndefined();
        expect(error.error_metadata.message).not.toContain('sk-secret-');
      });
    }
  });

  it('classifies assistant stopReason=error context overflow heuristics', async () => {
    const { promise } = await runStructuredSession(
      () => ({
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(async () => undefined),
        messages: [
          {
            role: 'assistant',
            stopReason: 'error',
            errorMessage: 'prompt is too long: 213462 tokens > 200000 maximum',
            content: [],
          },
        ],
        dispose: vi.fn(async () => undefined),
      }),
      { ctx: { model: undefined } },
    );

    await expect(promise).rejects.toMatchObject({
      error_metadata: expect.objectContaining({
        version: 1,
        category: 'context_overflow',
        phase: 'assistant_final',
      }),
    });
  });

  it('classifies malformed thrown values', async () => {
    const { promise } = await runStructuredSession(
      () => ({
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(async () => {
          throw { problem: 'weird', message: 'opaque payload' };
        }),
        messages: [],
        dispose: vi.fn(async () => undefined),
      }),
      { ctx: { model: undefined } },
    );

    await expect(promise).rejects.toMatchObject({
      error_metadata: expect.objectContaining({
        version: 1,
        category: 'malformed_thrown_value',
      }),
    });
  });

  it('reports pre-abort diagnostics when a settled prompt never resolves', async () => {
    vi.useFakeTimers();
    try {
      let subscriber: ((event: unknown) => void) | undefined;
      let resolvePrompt: (() => void) | undefined;
      const { promise } = await runStructuredSession(
        () => ({
          subscribe: vi.fn((callback: (event: unknown) => void) => {
            subscriber = callback;
            return vi.fn();
          }),
          prompt: vi.fn(async () => {
            subscriber?.({ type: 'agent_start' });
            subscriber?.({
              type: 'tool_execution_start',
              toolCallId: 'read-1',
              toolName: 'read',
              args: { path: 'SECRET_FILE_BODY' },
            });
            subscriber?.({ type: 'agent_settled', reason: 'completed' });
            return new Promise<void>((resolve) => {
              resolvePrompt = resolve;
            });
          }),
          abort: vi.fn(async () => {
            subscriber?.({
              type: 'tool_execution_end',
              toolCallId: 'read-1',
              toolName: 'read',
              isError: true,
            });
            subscriber?.({ type: 'agent_start' });
            resolvePrompt?.();
          }),
          messages: [],
          dispose: vi.fn(async () => undefined),
        }),
        {
          config: { ...config, stall_timeout_ms: 20 },
          ctx: { model: undefined },
        },
      );
      const rejection = promise.catch((error) => error);
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(600);
      const error = await rejection;
      expect(error.error_metadata).toMatchObject({
        version: 1,
        category: 'stall_timeout',
        phase: 'runner_session',
        retryable: false,
        details: {
          stall_timeout_ms: '20',
          ms_since_last_session_event: '500',
          last_session_event_type: 'agent_settled',
          active_tools: 'read (500ms since update)',
          settled_after_last_start: 'true',
          outstanding_orchestrator_questions: '0',
        },
      });
      expect(error.message).toContain(
        'Subagent stalled for 20ms without final response.',
      );
      expect(error.message).toContain('last_event=agent_settled');
      expect(error.message).toContain('last_event_age_ms=500');
      expect(error.message).toContain('active_tools=read (500ms since update)');
      expect(error.message).toContain('settled_after_last_start=true');
      expect(error.message).toContain('outstanding_orchestrator_questions=0');
      expect(error.error_metadata.message).toBe(error.message);
      expect(error.message).not.toContain('SECRET_FILE_BODY');
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists settled-prompt stall diagnostics in task.error across history reopen', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagent-stall-'));
    const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
    const oldHistoryPath = process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
    process.env.PI_CODING_AGENT_DIR = path.join(cwd, 'agent-home');
    process.env.PI_SUBAGENTS_HISTORY_DB_PATH = path.join(cwd, 'history.sqlite');
    fs.mkdirSync(path.join(cwd, '.pi', 'subagents'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', 'sdd-apply.md'),
      '---\nname: sdd-apply\ndescription: implementation executor\ntools: [read]\n---\nreturn a concise result',
    );
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents.json'),
      JSON.stringify({
        ...config,
        stall_timeout_ms: 20,
        enable_ask_orchestrator: false,
      }),
    );
    vi.useFakeTimers();
    vi.resetModules();
    let subscriber: ((event: unknown) => void) | undefined;
    let resolvePrompt: (() => void) | undefined;
    vi.doMock('@earendil-works/pi-coding-agent', async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      ModelRuntime: ModelRuntimeFixture,
      SessionManager: { inMemory: () => ({}) },
      createAgentSession: () => ({
        session: {
          getAllTools: () => [{ name: 'read' }],
          subscribe: (callback: (event: unknown) => void) => {
            subscriber = callback;
            return () => {};
          },
          prompt: async () => {
            subscriber?.({ type: 'agent_start' });
            subscriber?.({ type: 'agent_settled' });
            return new Promise<void>((resolve) => {
              resolvePrompt = resolve;
            });
          },
          abort: async () => resolvePrompt?.(),
          messages: [{ role: 'assistant', content: 'partial text' }],
          dispose: async () => {},
        },
      }),
    }));
    const { sdkSubagentRunner } = await import('../../src/runner.js');
    const { SubagentManager } = await import('../../src/manager.js');
    const { SubagentHistoryStore } = await import('../../src/history.js');
    let thrownMessage: string | undefined;
    const manager = new SubagentManager(async (input) => {
      try {
        return await sdkSubagentRunner(input);
      } catch (error) {
        if (error instanceof Error) thrownMessage = error.message;
        throw error;
      }
    });
    const reopened = new SubagentHistoryStore();
    try {
      const resultPromise = manager.run(
        {
          agent: 'sdd-apply',
          task: 'never resolves after settlement',
          mode: 'task',
        },
        { cwd },
      );
      const outcome = resultPromise.then(
        (result) => ({ result, error: undefined }),
        (error) => ({ result: undefined, error }),
      );
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(600);
      const settled = await outcome;
      expect(settled.error).toBeUndefined();
      const task = settled.result?.results?.[0];
      if (!task) throw new Error('Expected a persisted failed task');
      expect(task.status).toBe('failed');
      expect(task.error).toBe(thrownMessage);
      expect(task.error).toContain('last_event=agent_settled');
      expect(task.error).toContain('last_event_age_ms=500');
      expect(task.error).toContain('active_tools=none');
      expect(task.error).toContain('settled_after_last_start=true');
      expect(task.error).toContain('outstanding_orchestrator_questions=0');
      expect(task.error_metadata).toMatchObject({
        category: 'stall_timeout',
        phase: 'runner_session',
        retryable: false,
        details: {
          last_session_event_type: 'agent_settled',
          ms_since_last_session_event: '500',
          active_tools: 'none',
          settled_after_last_start: 'true',
          outstanding_orchestrator_questions: '0',
        },
      });
      await manager.close();
      const persisted = reopened.getTask(cwd, task.id);
      expect(persisted?.error).toBe(thrownMessage);
      expect(persisted?.error_metadata?.details).toEqual(
        task.error_metadata?.details,
      );
    } finally {
      resolvePrompt?.();
      await manager.close();
      reopened.close();
      vi.useRealTimers();
      if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
      if (oldHistoryPath === undefined)
        delete process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
      else process.env.PI_SUBAGENTS_HISTORY_DB_PATH = oldHistoryPath;
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('distinguishes empty response variants and tool failure vs recovery', async () => {
    const noTools = await runStructuredSession(
      () => ({
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(async () => undefined),
        messages: [],
        dispose: vi.fn(async () => undefined),
      }),
      { ctx: { model: undefined } },
    );
    await expect(noTools.promise).rejects.toMatchObject({
      error_metadata: expect.objectContaining({
        category: 'empty_response_no_tools',
        phase: 'assistant_final',
      }),
    });

    let subscriberAfterTools: ((event: unknown) => void) | undefined;
    const afterTools = await runStructuredSession(
      () => ({
        subscribe: vi.fn((callback: (event: unknown) => void) => {
          subscriberAfterTools = callback;
          return vi.fn();
        }),
        prompt: vi.fn(async () => {
          subscriberAfterTools?.({
            type: 'tool_execution_start',
            toolCallId: 'read-1',
            toolName: 'read',
            args: { path: 'file' },
          });
          subscriberAfterTools?.({
            type: 'tool_execution_end',
            toolCallId: 'read-1',
            toolName: 'read',
            isError: false,
            result: { content: [{ type: 'text', text: 'body' }] },
          });
        }),
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: 'read-1',
                name: 'read',
                arguments: { path: 'file' },
              },
            ],
          },
        ],
        dispose: vi.fn(async () => undefined),
      }),
      { ctx: { model: undefined } },
    );
    await expect(afterTools.promise).rejects.toMatchObject({
      error_metadata: expect.objectContaining({
        category: 'empty_response_after_tools',
        phase: 'assistant_final',
      }),
    });

    let subscriberToolFailure: ((event: unknown) => void) | undefined;
    const toolFailure = await runStructuredSession(
      () => ({
        subscribe: vi.fn((callback: (event: unknown) => void) => {
          subscriberToolFailure = callback;
          return vi.fn();
        }),
        prompt: vi.fn(async () => {
          subscriberToolFailure?.({
            type: 'tool_execution_start',
            toolCallId: 'read-2',
            toolName: 'read',
            args: { path: 'secret.txt' },
          });
          subscriberToolFailure?.({
            type: 'tool_execution_end',
            toolCallId: 'read-2',
            toolName: 'read',
            isError: true,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Authorization: Bearer sk-hidden SECRET_FILE_BODY /tmp/private.txt',
                },
              ],
            },
          });
        }),
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: 'read-2',
                name: 'read',
                arguments: { path: 'secret.txt' },
              },
            ],
          },
        ],
        dispose: vi.fn(async () => undefined),
      }),
      { ctx: { model: undefined } },
    );
    await expect(toolFailure.promise).rejects.toMatchObject({
      error_metadata: expect.objectContaining({
        category: 'tool_failure',
        phase: 'tool_execution',
      }),
    });
    await toolFailure.promise.catch((error) => {
      expect(error.error_metadata.details?.tool_names).toContain('read');
      expect(JSON.stringify(error.error_metadata)).not.toContain('sk-hidden');
      expect(JSON.stringify(error.error_metadata)).not.toContain(
        'SECRET_FILE_BODY',
      );
      expect(JSON.stringify(error.error_metadata)).not.toContain(
        '/tmp/private.txt',
      );
    });

    let subscriberRecovered: ((event: unknown) => void) | undefined;
    const recovered = await runStructuredSession(() => ({
      subscribe: vi.fn((callback: (event: unknown) => void) => {
        subscriberRecovered = callback;
        return vi.fn();
      }),
      prompt: vi.fn(async () => {
        subscriberRecovered?.({
          type: 'tool_execution_start',
          toolCallId: 'read-3',
          toolName: 'read',
          args: { path: 'file' },
        });
        subscriberRecovered?.({
          type: 'tool_execution_end',
          toolCallId: 'read-3',
          toolName: 'read',
          isError: true,
          result: { content: [{ type: 'text', text: 'tool failed' }] },
        });
      }),
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'recovered final answer' }],
        },
      ],
      dispose: vi.fn(async () => undefined),
    }));
    const recoveredResult = await recovered.promise;
    expect(recoveredResult.result).toBe('recovered final answer');
    expect(recoveredResult).not.toHaveProperty('error_metadata');
  });

  it('returns the original selected-model failure without retrying or notifying', async () => {
    vi.resetModules();
    const primaryModel = { provider: 'preferred', id: 'primary-model' };
    const fallbackModel = { provider: 'current', id: 'fallback-model' };
    const createAgentSession = vi.fn().mockReturnValueOnce({
      session: {
        getAllTools: () => [{ name: 'read' }],
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(async () => {
          throw new Error('ECONNRESET primary network failure');
        }),
        messages: [],
        dispose: vi.fn(async () => undefined),
      },
    });
    vi.doMock('@earendil-works/pi-coding-agent', () => ({
      ModelRuntime: ModelRuntimeFixture,
      SessionManager: { inMemory: () => ({}) },
      createAgentSession,
    }));
    const { sdkSubagentRunner } = await import('../../src/runner.js');
    const sliceConfig: SubagentsConfig = {
      ...config,
      model_profiles: {
        'sdd-apply': { model: { provider: 'preferred', id: 'primary-model' } },
      },
    };
    const ctx = {
      model: fallbackModel,
      modelRegistry: {
        find: vi.fn((provider: string, id: string) =>
          provider === 'preferred' && id === 'primary-model'
            ? primaryModel
            : undefined,
        ),
      },
      ui: { notify: vi.fn() },
    };

    const failedPromise = sdkSubagentRunner({
      definition,
      task: 'runner selected-model failure',
      cwd: '/workspace',
      ctx,
      config: sliceConfig,
      signal: new AbortController().signal,
    });
    await expect(failedPromise).rejects.toMatchObject({
      error_metadata: expect.objectContaining({
        category: 'provider_network_error',
        source: expect.objectContaining({ model: 'preferred/primary-model' }),
      }),
    });
    await failedPromise.catch((error) => {
      expect(error.error_metadata.attempts).toBeUndefined();
    });
    expect(createAgentSession).toHaveBeenCalledTimes(1);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it('preserves the original selected-model failure when current model matches preferred', async () => {
    vi.resetModules();
    const sharedModel = { provider: 'preferred', id: 'primary-model' };
    const createAgentSession = vi.fn().mockReturnValueOnce({
      session: {
        getAllTools: () => [{ name: 'read' }],
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(async () => {
          throw new Error('ECONNRESET primary network failure');
        }),
        messages: [],
        dispose: vi.fn(async () => undefined),
      },
    });
    vi.doMock('@earendil-works/pi-coding-agent', () => ({
      ModelRuntime: ModelRuntimeFixture,
      SessionManager: { inMemory: () => ({}) },
      createAgentSession,
    }));
    const { sdkSubagentRunner } = await import('../../src/runner.js');
    const sliceConfig: SubagentsConfig = {
      ...config,
      model_profiles: {
        'sdd-apply': { model: { provider: 'preferred', id: 'primary-model' } },
      },
    };

    const failedPromise = sdkSubagentRunner({
      definition,
      task: 'runner no distinct fallback failure',
      cwd: '/workspace',
      ctx: {
        model: sharedModel,
        modelRegistry: {
          find: vi.fn((provider: string, id: string) =>
            provider === 'preferred' && id === 'primary-model'
              ? sharedModel
              : undefined,
          ),
        },
        ui: { notify: vi.fn() },
      },
      config: sliceConfig,
      signal: new AbortController().signal,
    });

    await expect(failedPromise).rejects.toMatchObject({
      error_metadata: expect.objectContaining({
        category: 'provider_network_error',
        source: expect.objectContaining({ model: 'preferred/primary-model' }),
      }),
    });
    await failedPromise.catch((error) => {
      expect(error.error_metadata.attempts).toBeUndefined();
    });
  });
});
