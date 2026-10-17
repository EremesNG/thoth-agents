import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ExtensionAPI,
  ExtensionToolContext,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { getPublishedToolDefinition } from '@thoth-agents/pi-core';
import { describe, expect, it, vi } from 'vitest';
import { AppServerClient } from '../src/app-server-client.js';
import { registerAskCodexTool } from '../src/ask-tool.js';
import type { DesktopStatus } from '../src/binary.js';
import { loadConfig } from '../src/config.js';
import askCodex from '../src/index.js';
import { buildDeveloperInstructions } from '../src/instructions.js';

const fixture = fileURLToPath(
  new URL('./fixtures/fake-app-server.mjs', import.meta.url),
);
function setup(
  scenario = 'normal',
  overrides = {},
  trace?: string,
  desktopStatus: DesktopStatus = false,
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
