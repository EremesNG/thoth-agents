import fs from 'node:fs';
import path from 'node:path';
import {
  getWorkPanelLifecycle,
  registerRenderKit,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import extension from '../index.js';
import { SubagentManager } from '../src/manager.js';
import { runSubagentModelsCommand } from '../src/model-profiles-ui.js';
import { buildPrompt } from '../src/runner.js';
import * as subagentRendering from '../src/thread-view.js';
import {
  boundThreadSnapshot,
  isValidThreadSnapshot,
  renderThreadBody,
} from '../src/thread-view.js';
import type { SubagentTask } from '../src/types.js';
import { registerSubagentsPanelOpener } from '../src/ui/panel-overlay.js';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';
import { workPanelSession } from './helpers/work-panel-fixture.js';

// Reuse the extension module graph with a fresh, complete fake for each test.
vi.mock('../src/manager.js', () => ({ SubagentManager: vi.fn() }));

function createExtensionManagerFake() {
  return {
    reconcileOrphanedTasks: vi.fn(),
    close: vi.fn(async () => undefined),
    cancelRunning: vi.fn(),
    onTaskUpdate: vi.fn((_listener: () => void) => () => undefined),
    listActiveSessionTasks: vi.fn(() => [] as SubagentTask[]),
    snapshotSessionTaskCounts: vi.fn(() => ({
      counts: {},
      statusesById: new Map(),
    })),
    listSessionTasks: vi.fn(() => [] as SubagentTask[]),
    getTask: vi.fn((_id: string) => undefined as SubagentTask | undefined),
    cancel: vi.fn(),
  };
}

function extensionEventBus() {
  const handlers = new Map<string, Function>();
  const listeners = new Map<string, Set<Function>>();
  const on = (event: string, handler: Function) => {
    const callbacks = listeners.get(event) ?? new Set<Function>();
    listeners.set(event, callbacks);
    callbacks.add(handler);
    handlers.set(event, async (...args: unknown[]) => {
      for (const callback of [...callbacks]) await callback(...args);
    });
    return () => {
      callbacks.delete(handler);
    };
  };
  return {
    handlers,
    on,
    count: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

const env = installSubagentTestEnv();
let managerInstance: ReturnType<typeof createExtensionManagerFake>;
let onTerminalBackgroundTask: ((task: any, cwd?: string) => void) | undefined;

beforeEach(() => {
  managerInstance = createExtensionManagerFake();
  vi.mocked(SubagentManager).mockImplementation(
    class {
      constructor(
        _runner?: unknown,
        _history?: unknown,
        completion?: (task: any, cwd?: string) => void,
      ) {
        onTerminalBackgroundTask = completion;
        Object.assign(this, managerInstance);
      }
    } as unknown as typeof SubagentManager,
  );
  vi.spyOn(
    subagentRendering,
    'preloadPiComponentsForSubagentRendering',
  ).mockResolvedValue(false);
});

afterEach(() => {
  registerSubagentsPanelOpener(undefined);
  onTerminalBackgroundTask = undefined;
  vi.mocked(SubagentManager).mockReset();
  vi.doUnmock('../src/manager.js');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('subagents smoke', () => {
  it('binds prompt lifecycle for the active UI session and releases subscriptions on replacement and shutdown', async () => {
    const { handlers, on, count } = extensionEventBus();
    extension({ registerTool: vi.fn(), on });
    const first = workPanelSession(env.tmp, 'lifecycle-first');
    let idle = true;
    const ctx = { ...first.ctx, isIdle: () => idle };
    const second = workPanelSession(env.tmp, 'lifecycle-second');
    const nextCtx = { ...second.ctx, isIdle: () => idle };
    try {
      await handlers.get('session_start')?.({}, ctx);
      expect(count('input')).toBe(1);
      await handlers.get('input')?.(
        { source: 'interactive', text: 'inspect work' },
        ctx,
      );
      await handlers.get('before_agent_start')?.(
        { prompt: 'inspect work' },
        ctx,
      );
      idle = false;
      await handlers.get('agent_start')?.({}, ctx);
      expect(getWorkPanelLifecycle(ctx as never)).toMatchObject({
        epoch: 1,
        busy: true,
      });
      idle = true;
      await handlers.get('agent_settled')?.({}, ctx);
      expect(getWorkPanelLifecycle(ctx as never).busy).toBe(false);
      await handlers.get('session_start')?.({}, nextCtx);
      expect(count('input')).toBe(1);
      await handlers.get('input')?.(
        { source: 'rpc', text: 'next work' },
        nextCtx,
      );
      await handlers.get('before_agent_start')?.(
        { prompt: 'next work' },
        nextCtx,
      );
      expect(getWorkPanelLifecycle(nextCtx as never).epoch).toBe(1);
      expect(getWorkPanelLifecycle(ctx as never).epoch).toBe(0);
    } finally {
      await handlers.get('session_shutdown')?.({}, nextCtx);
    }
    expect(count('input')).toBe(0);
    expect(count('before_agent_start')).toBe(0);
    expect(count('agent_start')).toBe(0);
    expect(count('agent_settled')).toBe(0);
  });
  it('shows only live/current prompt outcomes while busy, collapses when idle and opens existing history from Enter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { handlers, on } = extensionEventBus();
    extension({ registerTool: vi.fn(), on });
    const fixture = workPanelSession(env.tmp, 'retention-session');
    let idle = true;
    const ctx = { ...fixture.ctx, isIdle: () => idle };
    const makeTask = (
      id: string,
      status: SubagentTask['status'],
      ended_at?: string,
    ): SubagentTask => ({
      id,
      agent: id,
      mode: 'background',
      status,
      task: `task ${id}`,
      created_at: '2025-12-31T23:59:00Z',
      ended_at,
    });
    let tasks = [
      makeTask('old-done', 'completed', '2025-12-31T23:59:59Z'),
      makeTask('old-failed', 'failed', '2025-12-31T23:59:59Z'),
    ];
    managerInstance.listActiveSessionTasks.mockImplementation(() => tasks);
    managerInstance.listSessionTasks.mockImplementation(() => tasks);
    try {
      await handlers.get('session_start')?.({}, ctx);
      expect(fixture.render().join(' ')).toContain(
        'Agents · 1 done · 1 failed',
      );
      fixture.key('\u001b[D');
      expect(fixture.render()).toHaveLength(2);
      expect(fixture.render().join(' ')).toContain('Enter history');
      expect(fixture.render().join(' ')).not.toContain('x close');
      expect(fixture.key('\r')).toEqual({ consume: true });
      await Promise.resolve();
      await Promise.resolve();
      expect(fixture.ui.custom).toHaveBeenCalledOnce();
      expect(fixture.panelRender().join(' ')).toContain('task old-done');
      fixture.key('q');
      await Promise.resolve();
      await Promise.resolve();
      await handlers.get('input')?.(
        { source: 'interactive', text: 'new prompt' },
        ctx,
      );
      await handlers.get('before_agent_start')?.({ prompt: 'new prompt' }, ctx);
      idle = false;
      await handlers.get('agent_start')?.({}, ctx);
      tasks = [
        ...tasks,
        makeTask('live-work', 'running'),
        makeTask('queued-work', 'queued'),
        makeTask('stopping-work', 'stopping'),
        makeTask('current-failed', 'cancelled', '2026-01-01T00:00:01Z'),
        ...[1, 2, 3, 4].map((index) =>
          makeTask(`done-${index}`, 'completed', `2026-01-01T00:00:0${index}Z`),
        ),
      ];
      const busy = fixture.render(300).join(' ');
      for (const label of [
        'live-work',
        'queued-work',
        'stopping-work',
        'current-failed',
        'done-2',
        'done-3',
        'done-4',
      ])
        expect(busy).toContain(label);
      for (const label of ['old-done', 'old-failed', 'done-1', '+'])
        expect(busy).not.toContain(label);
      for (const item of tasks)
        if (['running', 'queued', 'stopping'].includes(item.status)) {
          item.status = 'completed';
          item.ended_at = '2026-01-01T00:00:05Z';
        }
      idle = true;
      await handlers.get('agent_settled')?.({}, ctx);
      expect(fixture.render().join(' ')).toContain(
        'Agents · 8 done · 2 failed',
      );
      expect(fixture.render().join(' ')).not.toContain('live-work');
    } finally {
      fixture.key('q');
      await handlers.get('session_shutdown')?.({}, ctx);
    }
  });

  it('keeps root and deep import smoke reachable', () => {
    expect(typeof extension).toBe('function');
    expect(typeof runSubagentModelsCommand).toBe('function');
    expect(typeof buildPrompt).toBe('function');
  });

  it('validates and bounds v1 subagent thread snapshots safely', () => {
    const snapshot = {
      version: 1,
      source: 'events',
      items: [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'hello from assistant' }],
          },
        },
        {
          type: 'tool',
          name: 'read',
          status: 'completed',
          arguments: { path: 'README.md' },
          result: {
            content: [{ type: 'text', text: 'file body' }],
            isError: false,
          },
        },
        {
          type: 'bash',
          command: 'npm test',
          output: 'passed',
          status: 'completed',
          exitCode: 0,
        },
        { type: 'error', text: 'safe error row' },
      ],
    };

    expect(isValidThreadSnapshot(snapshot)).toBe(true);
    expect(
      renderThreadBody(snapshot as any, {
        visibleWidth: (text) => text.length,
        truncateToWidth: (text, width) => text.slice(0, width),
        cwd: env.tmp,
      }).join('\n'),
    ).toContain('hello from assistant');
    expect(
      renderThreadBody(snapshot as any, {
        visibleWidth: (text) => text.length,
        truncateToWidth: (text, width) => text.slice(0, width),
        cwd: env.tmp,
      }).join('\n'),
    ).toContain('read completed');

    const bounded = boundThreadSnapshot(
      {
        version: 1,
        source: 'events',
        items: [{ type: 'status', text: 'x'.repeat(5000) }],
      } as any,
      { textLimit: 32 },
    );
    expect(bounded?.items[0]).toMatchObject({
      type: 'status',
      text: expect.stringMatching(/…$/),
    });
    expect((bounded?.items[0] as any).text.length).toBeLessThanOrEqual(32);
  });

  it('subagent models command uses custom modal overlay and saves project-local dirty rows locally', async () => {
    fs.writeFileSync(
      path.join(env.tmp, '.pi', 'subagents', 'analyst.md'),
      `---\nname: analyst\ndescription: analyst\nscope: project\n---\nbody`,
    );
    const notifications: any[] = [];
    let capturedOptions: any;
    const custom = async (factory: any, options: any) => {
      capturedOptions = options;
      const done = () => undefined;
      factory({ requestRender: () => undefined }, {}, undefined, done);
      return {
        action: 'save',
        dirtyProfiles: {
          analyst: {
            model: { provider: 'openai', id: 'gpt-5.5' },
            effort: 'high',
          },
        },
      };
    };
    const message = await runSubagentModelsCommand({
      cwd: env.tmp,
      modelRegistry: {
        getAvailable: async () => [
          { provider: 'openai', id: 'gpt-5.5', label: 'gpt-5.5' },
        ],
      },
      ui: { custom, notify: (...args: any[]) => notifications.push(args) },
    });

    expect(capturedOptions).toEqual({
      overlay: true,
      overlayOptions: {
        anchor: 'center',
        width: '96%',
        maxHeight: '90%',
        minWidth: 96,
      },
    });
    expect(message).toBe(
      `Saved subagent model profiles to ${path.join(env.tmp, '.pi', 'subagents.json')}.`,
    );
    expect(notifications).toEqual([[message, 'info']]);
  });

  it('builds a delegated user prompt without embedding subagent system instructions', () => {
    const prompt = buildPrompt(
      {
        name: 'analyst',
        description: 'analysis',
        filePath: '/tmp/analyst.md',
        instructions: 'SYSTEM ONLY',
        tools: ['read'],
      } as any,
      'inspect the repo',
      undefined,
      ['read'],
    );
    expect(prompt).toBe('## delegated task\ninspect the repo');
    expect(prompt).not.toContain('SYSTEM ONLY');
  });

  it('reconciles orphaned tasks on session start and closes the manager on session shutdown', async () => {
    const { reconcileOrphanedTasks, close } = managerInstance;
    const { handlers, on } = extensionEventBus();
    const pi = {
      registerMessageRenderer: vi.fn(),
      registerShortcut: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      on: vi.fn(on),
    };

    extension(pi);
    handlers.get('session_start')?.({}, { cwd: env.tmp, ui: {} });
    await handlers.get('session_shutdown')?.({}, { cwd: env.tmp, ui: {} });

    expect(reconcileOrphanedTasks).toHaveBeenCalledWith(env.tmp);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('suppresses stale Pi context errors from delayed background completion delivery', async () => {
    const pi = {
      sendMessage: vi.fn(() => {
        throw new Error(
          'This extension ctx is stale after session replacement or reload',
        );
      }),
      registerMessageRenderer: vi.fn(),
      registerShortcut: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    };

    extension(pi);

    expect(() =>
      onTerminalBackgroundTask?.(
        {
          id: 'subtask_stale',
          agent: 'discovery',
          status: 'completed',
          mode: 'background',
          result: 'done',
        },
        env.tmp,
      ),
    ).not.toThrow();
    expect(pi.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not deliver a background completion to a replaced Pi session', async () => {
    const { handlers, on } = extensionEventBus();
    const pi = {
      sendMessage: vi.fn(),
      registerMessageRenderer: vi.fn(),
      registerShortcut: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      on: vi.fn(on),
    };

    extension(pi);
    handlers.get('session_start')?.(
      {},
      { cwd: env.tmp, sessionId: 'session-new', ui: { setWidget: vi.fn() } },
    );

    onTerminalBackgroundTask?.(
      {
        id: 'subtask_old',
        agent: 'discovery',
        status: 'completed',
        mode: 'background',
        result: 'done',
        session_id: 'session-old',
      },
      env.tmp,
    );
    expect(pi.sendMessage).not.toHaveBeenCalled();

    onTerminalBackgroundTask?.(
      {
        id: 'subtask_new',
        agent: 'discovery',
        status: 'completed',
        mode: 'background',
        result: 'done',
        session_id: 'session-new',
      },
      env.tmp,
    );
    expect(pi.sendMessage).toHaveBeenCalledTimes(1);
  });

  it.each([
    false,
    true,
  ])('refreshes and animates only while a child runs, then disposes the provider (KIT=%s)', async (withKit) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = withKit
      ? registerRenderKit(createTestRenderKit(), {})
      : undefined;
    let notify: (() => void) | undefined;
    managerInstance.onTaskUpdate.mockImplementation((listener) => {
      notify = listener;
      return () => {
        notify = undefined;
      };
    });
    const task: SubagentTask = {
      id: 'live',
      agent: 'worker',
      mode: 'background',
      status: 'queued',
      task: 'work',
      created_at: '2026-01-01T00:00:00Z',
    };
    managerInstance.listActiveSessionTasks.mockReturnValue([task]);
    const fixture = workPanelSession(env.tmp);
    const { handlers, on } = extensionEventBus();
    extension({
      registerTool: vi.fn(),
      on,
    });
    try {
      await handlers.get('session_start')?.({}, fixture.ctx);
      expect(fixture.render().join(' ')).toContain('○');
      expect(vi.getTimerCount()).toBe(0);
      task.status = 'running';
      notify?.();
      expect(fixture.render().join(' ')).toContain('⠋');
      vi.advanceTimersByTime(100);
      expect(fixture.render().join(' ')).toContain('⠙');
      expect(vi.getTimerCount()).toBe(1);
      task.status = 'completed';
      task.ended_at = '2026-01-01T00:00:00.100Z';
      notify?.();
      const terminal = fixture.render();
      const requests = fixture.tui.requestRender.mock.calls.length;
      vi.advanceTimersByTime(2000);
      expect(fixture.render()).toEqual(terminal);
      expect(terminal.join(' ')).toContain('Agents · 1 done · 0 failed');
      expect(fixture.tui.requestRender).toHaveBeenCalledTimes(requests);
      expect(vi.getTimerCount()).toBe(0);
      task.status = 'running';
      notify?.();
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      await handlers.get('session_shutdown')?.({}, fixture.ctx);
      if (token) withdrawRenderKit(token);
    }
    expect(vi.getTimerCount()).toBe(0);
    expect(notify).toBeUndefined();
    expect(fixture.listenerCount()).toBe(0);
  });

  it('opens the selected task, awaits panel closure and lets the existing panel receive its keys', async () => {
    const tasks: SubagentTask[] = ['first', 'second'].map((id, index) => ({
      id,
      agent: id,
      mode: 'background',
      status: 'running',
      task: `task ${id}`,
      created_at: `2026-01-01T00:00:0${2 - index}Z`,
    }));
    managerInstance.listActiveSessionTasks.mockReturnValue(tasks);
    managerInstance.listSessionTasks.mockReturnValue(tasks);
    managerInstance.getTask.mockImplementation((id) =>
      tasks.find((task) => task.id === id),
    );
    const fixture = workPanelSession(env.tmp);
    const { handlers, on } = extensionEventBus();
    extension({
      registerTool: vi.fn(),
      on,
    });
    try {
      await handlers.get('session_start')?.({}, fixture.ctx);
      fixture.key('\u001b[D');
      fixture.key('\u001b[B');
      expect(fixture.key('\r')).toEqual({ consume: true });
      await vi.waitFor(() => expect(fixture.ui.custom).toHaveBeenCalledOnce());
      expect(fixture.panelRender().join(' ')).toContain('task second');
      expect(fixture.key('x')).toBeUndefined();
      expect(fixture.key('x')).toBeUndefined();
      expect(managerInstance.cancel).toHaveBeenCalledWith(
        'second',
        'cancelled from subagents detail view',
      );
      expect(fixture.key('\u001b[D')).toBeUndefined();
      expect(fixture.panelRender().join(' ')).toContain('task first');
      // Even if focus/overlay hooks transiently report the root, open() must stay pending.
      fixture.focusEditor();
      fixture.setOverlay(false);
      await Promise.resolve();
      expect(fixture.key('\u001b[D')).toBeUndefined();
      fixture.focusPanel();
      expect(fixture.key('q')).toBeUndefined();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(fixture.key('\u001b[A')).toBeUndefined();
      expect(fixture.key('\u001b[D')).toEqual({ consume: true });
    } finally {
      fixture.focusPanel();
      fixture.key('q');
      await handlers.get('session_shutdown')?.({}, fixture.ctx);
    }
  });

  it('uses the host two-press confirmation to cancel a running task, not a queue or terminal row', async () => {
    const task: SubagentTask = {
      id: 'cancel-me',
      agent: 'worker',
      mode: 'background',
      status: 'running',
      task: 'work',
      created_at: '2026-01-01T00:00:00Z',
    };
    managerInstance.listActiveSessionTasks.mockReturnValue([task]);
    const fixture = workPanelSession(env.tmp);
    const { handlers, on } = extensionEventBus();
    extension({
      registerTool: vi.fn(),
      on,
    });
    try {
      await handlers.get('session_start')?.({}, fixture.ctx);
      fixture.key('\u001b[D');
      fixture.key('x');
      expect(managerInstance.cancel).not.toHaveBeenCalled();
      expect(fixture.ui.setStatus).toHaveBeenCalledWith(
        'thoth-work-panel-close',
        'Press x again to cancel worker',
      );
      fixture.key('x');
      expect(managerInstance.cancel).toHaveBeenCalledWith(
        'cancel-me',
        'cancelled from work panel',
      );
      for (const status of ['queued', 'completed'] as const) {
        task.status = status;
        fixture.key('x');
        fixture.key('x');
      }
      expect(managerInstance.cancel).toHaveBeenCalledTimes(1);
    } finally {
      await handlers.get('session_shutdown')?.({}, fixture.ctx);
    }
  });

  it('replaces a session provider without leaving stale input interception or task subscriptions', async () => {
    const listeners = new Set<() => void>();
    managerInstance.onTaskUpdate.mockImplementation((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    });
    const first = workPanelSession(env.tmp, 'first-session');
    const second = workPanelSession(env.tmp, 'second-session');
    const { handlers, on } = extensionEventBus();
    extension({
      registerTool: vi.fn(),
      on,
    });
    try {
      await handlers.get('session_start')?.({}, first.ctx);
      expect(first.listenerCount()).toBe(1);
      await handlers.get('session_start')?.({}, second.ctx);
      expect(first.listenerCount()).toBe(0);
      expect(second.listenerCount()).toBe(1);
      expect(listeners.size).toBe(1);
    } finally {
      await handlers.get('session_shutdown')?.({}, second.ctx);
    }
    expect(second.listenerCount()).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it('releases an in-flight host installation when the session shuts down before ensure resolves', async () => {
    const fixture = workPanelSession(env.tmp);
    const { handlers, on } = extensionEventBus();
    extension({
      registerTool: vi.fn(),
      on,
    });
    const starting = handlers.get('session_start')?.({}, fixture.ctx);
    await handlers.get('session_shutdown')?.({}, fixture.ctx);
    await starting;
    expect(fixture.listenerCount()).toBe(0);
    expect(fixture.render()).toEqual([]);
  });

  it('shows session Agents through the shared host, leaving history keys unfocused', async () => {
    managerInstance.listActiveSessionTasks.mockReturnValue([
      {
        id: 'running',
        agent: 'worker',
        mode: 'background',
        status: 'running',
        task: 'work',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'queued',
        agent: 'reviewer',
        mode: 'background',
        status: 'queued',
        task: 'wait',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const fixture = workPanelSession(env.tmp);
    const { handlers, on } = extensionEventBus();
    extension({
      registerTool: vi.fn(),
      on,
    });
    try {
      await handlers.get('session_start')?.({}, fixture.ctx);
      expect(fixture.render().join(' ')).toContain(
        'Agents · 1 running · 1 queued',
      );
      expect(managerInstance.listActiveSessionTasks).toHaveBeenCalledWith(
        env.tmp,
        'work-session',
      );
      expect(fixture.ui.setWidget).toHaveBeenCalledTimes(1);
      expect(fixture.ui.setWidget.mock.calls[0]?.[0]).toBe('thoth-work-panel');
      expect(fixture.ui.setEditorComponent).toHaveBeenCalledTimes(1);
      expect(fixture.listenerCount()).toBe(1);
      expect(fixture.key('[A')).toBeUndefined();
      expect(fixture.key('[B')).toBeUndefined();
      fixture.setText(' ');
      expect(fixture.key('\u001b[D')).toBeUndefined();
      fixture.setText('');
      expect(fixture.key('\u001b[D')).toEqual({ consume: true });
      expect(fixture.key('\u001b')).toEqual({ consume: true });
    } finally {
      await handlers.get('session_shutdown')?.({}, fixture.ctx);
    }
    expect(fixture.listenerCount()).toBe(0);
  });
});
