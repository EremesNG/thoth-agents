import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ExtensionAPI,
  ExtensionToolContext,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  getPublishedToolDefinition,
  type QuestionServiceHandle,
  registerQuestionService,
} from '@thoth-agents/pi-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppServerClient } from '../src/app-server-client.js';
import { registerAskCodexTool } from '../src/ask-tool.js';
import type { DesktopStatus } from '../src/binary.js';
import { loadConfig } from '../src/config.js';
import askCodex from '../src/index.js';
import { buildDeveloperInstructions } from '../src/instructions.js';
import type { ServerRequest } from '../src/protocol.js';

const fixture = fileURLToPath(
  new URL('./fixtures/fake-app-server.mjs', import.meta.url),
);
function setup(
  scenario = 'normal',
  overrides = {},
  trace?: string,
  desktopStatus: DesktopStatus = false,
  approvalRequest?: ServerRequest,
) {
  let tool!: ToolDefinition;
  const config = {
    ...loadConfig({ configPath: '/missing', env: {} }),
    ...overrides,
  };
  registerAskCodexTool(
    {
      registerTool: (t: ToolDefinition) => {
        tool = t;
      },
    } as Pick<ExtensionAPI, 'registerTool'>,
    config,
    {
      resolveBinary: () => ({
        path: process.execPath,
        source: 'config' as const,
        warnings: [],
      }),
      desktopRunning: async () => desktopStatus,
      createClient: (options) =>
        new AppServerClient({
          ...options,
          serverRequestHandler: approvalRequest
            ? (_request, context) => {
                if (!options.serverRequestHandler)
                  throw new Error('Missing approval handler');
                return options.serverRequestHandler(approvalRequest, context);
              }
            : options.serverRequestHandler,
          commandPrefixArgs: [fixture],
          env: {
            ...process.env,
            FAKE_SCENARIO: scenario,
            FAKE_TRACE: trace,
            FAKE_DESCENDANT_PID: trace ? `${trace}.pid` : undefined,
          },
        }),
    },
  );
  const ctx = {
    cwd: path.dirname(fixture),
    hasUI: false,
    sessionManager: { getBranch: () => [] },
  } as unknown as ExtensionToolContext;
  return {
    run: (
      params: Record<string, unknown>,
      signal?: AbortSignal,
      update?: Parameters<ToolDefinition['execute']>[3],
    ) => tool.execute('call', params, signal, update, ctx),
    tool,
    ctx,
  };
}
describe('AskCodex', () => {
  let provider: QuestionServiceHandle | undefined;
  afterEach(() => {
    provider?.withdraw();
    provider = undefined;
  });

  it('presents app approvals through the question service with exact identifier and no custom or recommended option', async () => {
    const ask = vi.fn(async () => ({
      status: 'answered' as const,
      answers: {
        approval: {
          status: 'answered' as const,
          values: ['Allow for this session'],
        },
      },
    }));
    provider = registerQuestionService({ ask });
    const { run, ctx } = setup('computer-use', {}, undefined, false, {
      id: 1,
      method: 'mcpServer/elicitation/request',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        serverName: 'node_repl',
        mode: 'form',
        message: 'Approve?',
        requestedSchema: {},
        _meta: {
          connector_id: 'computer-use',
          tool_params: { app: 'packaged!Paint' },
          tool_params_display: [{ name: 'app', value: 'Paint' }],
        },
      },
    });
    ctx.hasUI = true;
    const select = vi.fn();
    ctx.ui = { select } as unknown as typeof ctx.ui;
    const result = await run({ prompt: 'task' });
    expect(result.details).toMatchObject({
      approvals: [{ decision: 'accept-session' }],
    });
    expect(select).not.toHaveBeenCalled();
    expect(ask).toHaveBeenCalledWith(
      ctx,
      {
        questions: [
          {
            id: 'approval',
            header: 'Codex approval',
            type: 'single',
            prompt: 'Allow Codex to use Paint?',
            allowCustom: false,
            options: [
              {
                value: 'Allow for this session',
                label: 'Allow for this session',
                preview: 'App: Paint\n\nIdentifier: packaged!Paint',
              },
              {
                value: 'Decline',
                label: 'Decline',
                preview: 'App: Paint\n\nIdentifier: packaged!Paint',
              },
            ],
          },
        ],
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('preserves an unescaped command, cwd and reason in the service preview', async () => {
    const ask = vi.fn(async () => ({
      status: 'answered' as const,
      answers: {
        approval: { status: 'answered' as const, values: ['Allow once'] },
      },
    }));
    provider = registerQuestionService({ ask });
    const request: ServerRequest = {
      id: 1,
      method: 'item/commandExecution/requestApproval',
      params: {
        kind: 'command',
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'cmd',
        startedAtMs: 0,
        environmentId: null,
        command: 'echo "hello" && cat C:\\work\\notes.txt\necho ```',
        cwd: 'C:\\work',
        reason: 'Read the requested notes',
        availableDecisions: ['accept', 'decline'],
      },
    };
    const { run, ctx } = setup('elicitation', {}, undefined, false, request);
    ctx.hasUI = true;
    const select = vi.fn();
    ctx.ui = { select } as unknown as typeof ctx.ui;
    expect((await run({ prompt: 'task' })).details).toMatchObject({
      approvals: [{ decision: 'accept-once' }],
    });
    expect(ask).toHaveBeenCalledWith(
      ctx,
      {
        questions: [
          {
            id: 'approval',
            header: 'Codex approval',
            type: 'single',
            allowCustom: false,
            prompt: 'Codex wants to run a command outside the sandbox',
            options: ['Allow once', 'Decline'].map((label) => ({
              value: label,
              label,
              preview:
                '````\necho "hello" && cat C:\\work\\notes.txt\necho ```\n````\n\nWorking directory: C:\\work\n\nReason: Read the requested notes',
            })),
          },
        ],
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(select).not.toHaveBeenCalled();
  });

  it.each([
    [
      'once',
      {
        status: 'answered',
        answers: { approval: { status: 'answered', values: ['Allow once'] } },
      },
      'accept-once',
    ],
    [
      'decline',
      {
        status: 'answered',
        answers: { approval: { status: 'answered', values: ['Decline'] } },
      },
      'decline',
    ],
    [
      'unknown',
      {
        status: 'answered',
        answers: { approval: { status: 'answered', values: ['accept'] } },
      },
      'decline',
    ],
    [
      'unoffered session',
      {
        status: 'answered',
        answers: {
          approval: { status: 'answered', values: ['Allow for this session'] },
        },
      },
      'decline',
    ],
    [
      'cancelled',
      {
        status: 'cancelled',
        answers: { approval: { status: 'answered', values: ['Allow once'] } },
      },
      'decline',
    ],
    [
      'skipped',
      {
        status: 'answered',
        answers: { approval: { status: 'skipped', values: ['Allow once'] } },
      },
      'decline',
    ],
    [
      'custom',
      {
        status: 'answered',
        answers: {
          approval: {
            status: 'answered',
            values: ['Allow once'],
            customText: 'yes',
          },
        },
      },
      'decline',
    ],
    [
      'empty custom',
      {
        status: 'answered',
        answers: {
          approval: {
            status: 'answered',
            values: ['Allow once'],
            customText: '',
          },
        },
      },
      'decline',
    ],
    [
      'multiple',
      {
        status: 'answered',
        answers: {
          approval: { status: 'answered', values: ['Allow once', 'Decline'] },
        },
      },
      'decline',
    ],
    ['missing', { status: 'answered', answers: {} }, 'decline'],
    [
      'malformed values',
      {
        status: 'answered',
        answers: { approval: { status: 'answered', values: 'Allow once' } },
      },
      'decline',
    ],
    ['undefined', undefined, 'decline'],
    ['null', null, 'decline'],
    ['throw', new Error('Provider failed'), 'decline'],
  ])('fails closed for service result %s', async (_name, response, decision) => {
    const ask = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    provider = registerQuestionService({ ask } as Parameters<
      typeof registerQuestionService
    >[0]);
    const { run, ctx } = setup('elicitation');
    ctx.hasUI = true;
    const select = vi.fn().mockResolvedValue('Allow once');
    ctx.ui = { select } as unknown as typeof ctx.ui;
    expect((await run({ prompt: 'task' })).details).toMatchObject({
      approvals: [{ decision }],
    });
    expect(select).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])('falls back to native select on unavailable, failing closed if select fails (%s)', async (fails) => {
    provider = registerQuestionService({
      ask: async () => ({ status: 'unavailable', answers: {} }),
    });
    const { run, ctx } = setup('elicitation');
    ctx.hasUI = true;
    const select = fails
      ? vi.fn().mockRejectedValue(new Error('UI closed'))
      : vi.fn().mockResolvedValue('Allow once');
    ctx.ui = { select } as unknown as typeof ctx.ui;
    expect((await run({ prompt: 'task' })).details).toMatchObject({
      approvals: [{ decision: fails ? 'decline' : 'accept-once' }],
    });
    expect(select).toHaveBeenCalledWith(
      'Codex requests elicitation: node_repl: Approve?',
      ['Allow once', 'Decline'],
      { signal: expect.any(AbortSignal) },
    );
  });

  it('does not call a registered provider without UI', async () => {
    const ask = vi.fn();
    provider = registerQuestionService({ ask });
    expect(
      (await setup('elicitation').run({ prompt: 'task' })).details,
    ).toMatchObject({ approvals: [{ decision: 'decline', source: 'no-ui' }] });
    expect(ask).not.toHaveBeenCalled();
  });

  it('passes the approval signal to the service and declines if it aborts before an unavailable response', async () => {
    let received: AbortSignal | undefined;
    provider = registerQuestionService({
      ask: async (_ctx, _request, options) => {
        received = options.signal;
        // Simulate the app-server closing its approval while the provider is pending.
        controller.abort();
        const approvalSignal = received;
        if (!approvalSignal) throw new Error('Missing approval signal');
        await new Promise<void>((resolve) =>
          approvalSignal.addEventListener('abort', () => resolve(), {
            once: true,
          }),
        );
        return { status: 'unavailable', answers: {} };
      },
    });
    const controller = new AbortController();
    const { run, ctx } = setup('elicitation');
    ctx.hasUI = true;
    const select = vi.fn().mockResolvedValue('Allow once');
    ctx.ui = { select } as unknown as typeof ctx.ui;
    const result = await run({ prompt: 'task' }, controller.signal);
    expect(received).toBeInstanceOf(AbortSignal);
    expect(received?.aborted).toBe(true);
    expect(result.details).toMatchObject({
      approvals: [{ decision: 'decline' }],
      aborted: true,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it.each([
    true,
    false,
    'unknown',
  ] as const)('adds the Desktop-running note only for a negative probe (%s)', async (status) => {
    const result = await setup('normal', {}, undefined, status).run({
      prompt: 'task',
    });
    expect(result.details).toMatchObject({
      desktop: { running: status },
      warnings:
        status === false
          ? ['Native-app Computer Use requires Codex Desktop running.']
          : [],
    });
  });
  it('registers by default but not when disabled', () => {
    expect(setup().tool.name).toBe('AskCodex');
    expect(setup('normal', { enabled: false }).tool).toBeUndefined();
  });
  it('registers delegation as a model-only direct tool', () => {
    expect(setup().tool).toMatchObject({
      name: 'AskCodex',
      exposure: 'model-only',
    });
  });
  it('publishes definitions only in UI sessions and withdraws on shutdown', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>();
    askCodex({
      registerTool: vi.fn(),
      on: (name: string, handler: (...args: any[]) => unknown) =>
        handlers.set(name, handler),
    } as unknown as ExtensionAPI);
    expect(getPublishedToolDefinition('AskCodex')).toBeUndefined();
    await handlers.get('session_start')?.({}, { hasUI: false });
    expect(getPublishedToolDefinition('AskCodex')).toBeUndefined();
    await handlers.get('session_start')?.({}, { hasUI: true });
    expect(getPublishedToolDefinition('AskCodex')).toMatchObject({
      name: 'AskCodex',
    });
    await handlers.get('session_shutdown')?.({}, {});
    expect(getPublishedToolDefinition('AskCodex')).toBeUndefined();
  });
  it('does not spawn for an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await setup().run({ prompt: 'task' }, controller.signal);
    expect(result.details).toMatchObject({
      status: 'interrupted',
      aborted: true,
    });
    expect(result.details).not.toHaveProperty('binary');
  });
  it('returns the final answer, durable continuation id and token usage', async () => {
    const result = await setup().run({ prompt: 'hello' });
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('final answer'),
    });
    expect(result.details).toMatchObject({
      conversationId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      usage: { total: { totalTokens: 12 } },
    });
  });
  it('resumes the supplied conversation and sends mode, effort, search and digest', async () => {
    const result = await setup('inspect').run({
      prompt: 'review',
      conversationId: 'thread-1',
      mode: 'plan',
      thinking: 'xhigh',
      webSearch: true,
    });
    const data = JSON.parse(
      (result.content[0] as { text: string }).text.split(
        '\n\nconversationId:',
      )[0],
    );
    expect(data.threadRequest).toMatchObject({
      method: 'thread/resume',
      params: {
        threadId: 'thread-1',
        sandbox: 'read-only',
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        config: { web_search: 'live' },
      },
    });
    expect(data.turnRequest.params).toMatchObject({
      effort: 'xhigh',
      input: [{ text: expect.stringContaining('compact digest') }],
    });
  });
  it('applies configured model, effort, mode and search defaults', async () => {
    const result = await setup('inspect', {
      defaultModel: 'gpt-test',
      defaultEffort: 'minimal',
      defaultMode: 'plan',
      webSearch: 'cached',
    }).run({ prompt: 'review', digest: false });
    const data = JSON.parse(
      (result.content[0] as { text: string }).text.split(
        '\n\nconversationId:',
      )[0],
    );
    expect(data.threadRequest.params).toMatchObject({
      model: 'gpt-test',
      sandbox: 'read-only',
      config: { web_search: 'cached' },
    });
    expect(data.turnRequest.params).toMatchObject({
      model: 'gpt-test',
      effort: 'minimal',
      input: [{ text: 'review' }],
    });
  });
  it('accepts equal thinking/effort synonyms and disables boolean web search', async () => {
    const result = await setup('inspect', { webSearch: 'live' }).run({
      prompt: 'task',
      model: 'gpt-override',
      thinking: 'low',
      effort: 'low',
      webSearch: false,
    });
    const data = JSON.parse(
      (result.content[0] as { text: string }).text.split(
        '\n\nconversationId:',
      )[0],
    );
    expect(data.threadRequest.params.config.web_search).toBe('disabled');
    expect(data.turnRequest.params).toMatchObject({
      model: 'gpt-override',
      effort: 'low',
    });
  });
  it('starts a durable workspace-write thread by default', async () => {
    const result = await setup('inspect').run({ prompt: 'edit' });
    const data = JSON.parse(
      (result.content[0] as { text: string }).text.split(
        '\n\nconversationId:',
      )[0],
    );
    expect(data.threadRequest).toMatchObject({
      method: 'thread/start',
      params: {
        ephemeral: false,
        developerInstructions: buildDeveloperInstructions(),
        sandbox: 'workspace-write',
        config: { web_search: 'disabled' },
      },
    });
    expect(data.turnRequest.params.input[0].text).toBe('edit');
  });
  it.each([
    { thinking: 'high', effort: 'low' },
    { effort: 'max' },
    { prompt: '' },
    { timeoutMinutes: 0 },
    { timeoutMinutes: Infinity },
    { cwd: '/does-not-exist' },
  ])('returns a clear validation error without spawning for %j', async (params) => {
    const result = await setup().run({ prompt: 'task', ...params });
    expect(result.details).toMatchObject({ status: 'failed' });
    expect(result.content[0]).toMatchObject({
      text: expect.stringMatching(/Error:/),
    });
  });
  it.each([
    'timeout',
    'abort',
  ])('interrupts and reports interrupted status on %s', async (reason) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'askcodex-test-'));
    const trace = path.join(dir, 'trace');
    const controller = new AbortController();
    const timer =
      reason === 'abort'
        ? setTimeout(() => controller.abort(), 250)
        : undefined;
    try {
      const result = await setup('interrupt', {}, trace).run(
        { prompt: 'wait', timeoutMinutes: reason === 'timeout' ? 0.005 : 1 },
        controller.signal,
      );
      expect(result.details).toMatchObject({
        status: 'interrupted',
        timedOut: reason === 'timeout',
        aborted: reason === 'abort',
      });
      expect(fs.readFileSync(trace, 'utf8')).toContain('turn/interrupt');
    } finally {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it.each([
    'abort',
    'timeout',
  ])('kills persistent descendants after %s', async (reason) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'askcodex-descendant-'));
    const trace = path.join(dir, 'trace');
    const controller = new AbortController();
    let pid = 0;
    try {
      const result = setup('persistent-descendant', {}, trace).run(
        { prompt: 'wait', timeoutMinutes: reason === 'timeout' ? 0.02 : 1 },
        controller.signal,
      );
      await expect
        .poll(() => fs.existsSync(`${trace}.pid`), { timeout: 10000 })
        .toBe(true);
      pid = Number(fs.readFileSync(`${trace}.pid`, 'utf8'));
      if (reason === 'abort') controller.abort();
      expect((await result).details).toMatchObject({
        status: 'interrupted',
        aborted: reason === 'abort',
        timedOut: reason === 'timeout',
      });
      await expect
        .poll(
          () => {
            try {
              process.kill(pid, 0);
              return 'alive';
            } catch (error) {
              return (error as NodeJS.ErrnoException).code;
            }
          },
          { timeout: 10000 },
        )
        .toBe('ESRCH');
    } finally {
      controller.abort();
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 25000);
  it('declines no-UI elicitation and records the decision', async () => {
    const result = await setup('elicitation').run({ prompt: 'task' });
    expect(result.details).toMatchObject({
      approvals: [{ decision: 'decline', source: 'no-ui' }],
    });
  });
  it('accepts allowlisted Computer Use elicitation for the session', async () => {
    const result = await setup('computer-use', {
      allowedApps: ['notepad.exe'],
    }).run({ prompt: 'task' });
    expect(result.details).toMatchObject({
      approvals: [{ decision: 'accept-session', source: 'allowlist' }],
    });
  });
  it('reports process exit with stderr tail', async () => {
    const result = await setup('exit').run({ prompt: 'task' });
    expect(result.details).toMatchObject({
      status: 'failed',
      stderrTail: expect.stringContaining('diagnostic crash tail'),
    });
  });
  it('uses Pi UI only when available', async () => {
    const { run, ctx } = setup('elicitation');
    ctx.hasUI = true;
    const select = vi.fn().mockResolvedValue('Allow once');
    ctx.ui = { select } as unknown as typeof ctx.ui;
    const result = await run({ prompt: 'task' });
    expect(result.details).toMatchObject({
      approvals: [{ decision: 'accept-once', source: 'user' }],
    });
    expect(select).toHaveBeenCalledWith(expect.any(String), expect.any(Array), {
      signal: expect.any(AbortSignal),
    });
  });
  it('streams elapsed progress and terminates even if interrupt is ignored', async () => {
    const update = vi.fn();
    const result = await setup('ignore-interrupt').run(
      { prompt: 'wait', timeoutMinutes: 0.02 },
      undefined,
      update,
    );
    expect(update).toHaveBeenCalled();
    expect(result.details).toMatchObject({
      status: 'interrupted',
      timedOut: true,
    });
  });
  it('cleans exported context after process failure', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'askcodex-test-'));
    const trace = path.join(dir, 'trace');
    try {
      const result = await setup('exit', {}, trace).run({
        prompt: 'task',
        includeContext: true,
      });
      expect(result.details).toMatchObject({ status: 'failed' });
      const sent = fs
        .readFileSync(trace, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .find((m) => m.method === 'turn/start');
      const scratch = sent.params.input[0].text.match(
        /Pi context file: (.+)/,
      )[1];
      expect(fs.existsSync(scratch)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('reports actionable handshake failures', async () => {
    const result = await setup('unsupported').run({ prompt: 'task' });
    expect(result.content[0]).toMatchObject({
      text: expect.stringMatching(/Desktop-bundled.*ASKCODEX_BIN/),
    });
  });
  it('exports resolved context only when requested and always removes the scratch file', async () => {
    const { run, ctx } = setup('inspect');
    ctx.sessionManager.getBranch = () =>
      [
        {
          type: 'message',
          id: 'a',
          parentId: null,
          timestamp: new Date().toISOString(),
          message: {
            role: 'user',
            content: 'private context',
            timestamp: Date.now(),
          },
        },
      ] as ReturnType<typeof ctx.sessionManager.getBranch>;
    const result = await run({ prompt: 'review', includeContext: true });
    const data = JSON.parse(
      (result.content[0] as { text: string }).text.split(
        '\n\nconversationId:',
      )[0],
    );
    expect(data.context.text).toContain('private context');
    if (process.platform !== 'win32') expect(data.context.mode).toBe(0o600);
    expect(fs.existsSync(data.context.path)).toBe(false);
  });
});
