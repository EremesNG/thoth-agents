import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import extension from '../index.js';
import { runSubagentModelsCommand } from '../src/model-profiles-ui.js';
import { buildPrompt } from '../src/runner.js';
import {
  boundThreadSnapshot,
  isValidThreadSnapshot,
  renderThreadBody,
} from '../src/thread-view.js';
import { installSubagentTestEnv } from './helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

describe('subagents smoke', () => {
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
    vi.resetModules();
    const reconcileOrphanedTasks = vi.fn();
    const close = vi.fn();
    const managerInstance = {
      reconcileOrphanedTasks,
      close,
      listSessionTasks: () => [],
    };
    class MockManager {
      constructor() {
        Object.assign(this, managerInstance);
      }
    }
    vi.doMock('../src/manager.js', () => ({ SubagentManager: MockManager }));
    const { default: reloadedExtension } = await import(
      '../src/extension/subagents-extension.js'
    );

    const handlers = new Map<string, Function>();
    const pi = {
      registerMessageRenderer: vi.fn(),
      registerShortcut: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        handlers.set(event, handler);
      }),
    };

    reloadedExtension(pi);
    handlers.get('session_start')?.({}, { cwd: env.tmp, ui: {} });
    handlers.get('session_shutdown')?.({}, { cwd: env.tmp, ui: {} });

    expect(reconcileOrphanedTasks).toHaveBeenCalledWith(env.tmp);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('suppresses stale Pi context errors from delayed background completion delivery', async () => {
    vi.resetModules();
    let onTerminalBackgroundTask:
      | ((task: any, cwd?: string) => void)
      | undefined;
    const managerInstance = {
      reconcileOrphanedTasks: vi.fn(),
      cancelRunning: vi.fn(),
      listSessionTasks: () => [],
    };
    class MockManager {
      constructor(
        _runner?: unknown,
        _max?: unknown,
        completion?: (task: any, cwd?: string) => void,
      ) {
        onTerminalBackgroundTask = completion;
        Object.assign(this, managerInstance);
      }
    }
    vi.doMock('../src/manager.js', () => ({ SubagentManager: MockManager }));
    const { default: reloadedExtension } = await import(
      '../src/extension/subagents-extension.js'
    );

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

    reloadedExtension(pi);

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
    vi.resetModules();
    let onTerminalBackgroundTask:
      | ((task: any, cwd?: string) => void)
      | undefined;
    const managerInstance = {
      reconcileOrphanedTasks: vi.fn(),
      cancelRunning: vi.fn(),
      onTaskUpdate: vi.fn(() => () => undefined),
      listActiveSessionTasks: () => [],
      listSessionTasks: () => [],
    };
    class MockManager {
      constructor(
        _runner?: unknown,
        _max?: unknown,
        completion?: (task: any, cwd?: string) => void,
      ) {
        onTerminalBackgroundTask = completion;
        Object.assign(this, managerInstance);
      }
    }
    vi.doMock('../src/manager.js', () => ({ SubagentManager: MockManager }));
    const { default: reloadedExtension } = await import(
      '../src/extension/subagents-extension.js'
    );

    const handlers = new Map<string, Function>();
    const pi = {
      sendMessage: vi.fn(),
      registerMessageRenderer: vi.fn(),
      registerShortcut: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      on: vi.fn((event: string, handler: Function) => {
        handlers.set(event, handler);
      }),
    };

    reloadedExtension(pi);
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

  it('places the Agents widget above input and stops rendering after shutdown', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    try {
      const listeners: Array<() => void> = [];
      const close = vi.fn(async () => undefined);
      let running = false;
      const listActiveSessionTasks = vi.fn(() =>
        running ? [{ status: 'running' }] : [],
      );
      const interval = vi.spyOn(global, 'setInterval');
      class MockManager {
        reconcileOrphanedTasks() {}
        onTaskUpdate(listener: () => void) {
          listeners.push(listener);
          return () => {
            listeners.splice(listeners.indexOf(listener), 1);
          };
        }
        listActiveSessionTasks = listActiveSessionTasks;
        close = close;
      }
      vi.doMock('../src/manager.js', () => ({ SubagentManager: MockManager }));
      const { default: reloadedExtension } = await import(
        '../src/extension/subagents-extension.js'
      );
      const handlers = new Map<string, Function>();
      const setWidget = vi.fn();
      const pi = {
        registerMessageRenderer: vi.fn(),
        registerShortcut: vi.fn(),
        registerCommand: vi.fn(),
        registerTool: vi.fn(),
        on: vi.fn((event: string, handler: Function) =>
          handlers.set(event, handler),
        ),
      };
      reloadedExtension(pi);
      handlers.get('session_start')?.(
        {},
        { cwd: env.tmp, sessionId: 'session-new', ui: { setWidget } },
      );
      expect(setWidget).toHaveBeenCalledWith(
        'subagents-claude-background',
        expect.any(Function),
        { placement: 'aboveEditor' },
      );
      expect(interval).not.toHaveBeenCalled();
      const requestRender = vi.fn();
      const widgetFactory = setWidget.mock.calls[0]?.[1];
      widgetFactory({ requestRender }, {});
      running = true;
      listeners[0]?.();
      vi.advanceTimersByTime(1000);
      expect(requestRender).toHaveBeenCalledTimes(2);
      running = false;
      listeners[0]?.();
      vi.advanceTimersByTime(2000);
      expect(requestRender).toHaveBeenCalledTimes(3);
      await handlers.get('session_shutdown')?.();
      vi.advanceTimersByTime(2000);
      expect(requestRender).toHaveBeenCalledTimes(3);
      expect(setWidget).toHaveBeenLastCalledWith(
        'subagents-claude-background',
        undefined,
      );
      expect(close).toHaveBeenCalledOnce();
      expect(listeners).toHaveLength(0);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
