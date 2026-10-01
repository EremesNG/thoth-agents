import fs from 'node:fs';
import path from 'node:path';
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

// Reuse the extension module graph with a fresh, complete fake for each test.
vi.mock('../src/manager.js', () => ({ SubagentManager: vi.fn() }));

function createExtensionManagerFake() {
  return {
    reconcileOrphanedTasks: vi.fn(),
    close: vi.fn(async () => undefined),
    cancelRunning: vi.fn(),
    onTaskUpdate: vi.fn((_listener: () => void) => () => undefined),
    listActiveSessionTasks: vi.fn(() => [] as SubagentTask[]),
    listSessionTasks: vi.fn(() => [] as SubagentTask[]),
    getTask: vi.fn((_id: string) => undefined as SubagentTask | undefined),
    cancel: vi.fn(),
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

  it('places the Agents widget above input and stops rendering after shutdown', async () => {
    vi.useFakeTimers();
    try {
      const listeners: Array<() => void> = [];
      const { close, listActiveSessionTasks } = managerInstance;
      let running = false;
      let queued = false;
      listActiveSessionTasks.mockImplementation(
        () =>
          (running
            ? [{ status: 'running' }]
            : queued
              ? [{ status: 'queued' }]
              : []) as SubagentTask[],
      );
      const interval = vi.spyOn(global, 'setInterval');
      managerInstance.onTaskUpdate.mockImplementation((listener) => {
        listeners.push(listener);
        return () => {
          listeners.splice(listeners.indexOf(listener), 1);
        };
      });
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
      extension(pi);
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
      queued = true;
      listeners[0]?.();
      expect(interval).not.toHaveBeenCalled();
      const requestRender = vi.fn();
      const widgetFactory = setWidget.mock.calls[0]?.[1];
      widgetFactory({ requestRender }, {});
      queued = false;
      running = true;
      listeners[0]?.();
      vi.advanceTimersByTime(100);
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

  it('opens full history from the widget overflow and retains an active task beyond 100 newer completed tasks', async () => {
    const completedTasks = Array.from({ length: 110 }, (_, index) => ({
      id: `completed-${index + 1}`,
      agent: 'finished-worker',
      mode: 'background',
      status: 'completed',
      task: `completed task ${index + 1}`,
      created_at: new Date(Date.now() - index * 1000).toISOString(),
    }));
    const activeTasks = Array.from({ length: 4 }, (_, index) => ({
      id: `active-${index + 1}`,
      agent: `active-worker-${index + 1}`,
      mode: 'background',
      status: 'running',
      task: `active task ${index + 1}`,
      created_at: new Date(Date.now() - 200_000 - index * 1000).toISOString(),
    }));
    const olderActiveTask = {
      id: 'active-old',
      agent: 'older-active-worker',
      mode: 'background',
      status: 'running',
      task: 'OLDER_ACTIVE_TASK_SENTINEL',
      created_at: '2020-01-01T00:00:00.000Z',
    };
    const allTasks = [
      ...completedTasks,
      ...activeTasks,
      olderActiveTask,
    ] as SubagentTask[];
    managerInstance.listActiveSessionTasks.mockReturnValue([
      ...activeTasks,
      olderActiveTask,
    ] as SubagentTask[]);
    managerInstance.listSessionTasks.mockReturnValue(allTasks);
    managerInstance.getTask.mockImplementation((id) =>
      allTasks.find((task) => task.id === id),
    );

    const handlers = new Map<string, Function>();
    let terminalInput: ((data: string) => unknown) | undefined;
    let panelComponent: any;
    const finishCustomUi = vi.fn();
    const custom = vi.fn(async (factory: Function) => {
      panelComponent = factory(
        {
          mode: 'fullscreen',
          terminal: { rows: 40 },
          requestRender: vi.fn(),
        },
        { fg: (_name: string, text: string) => text },
        undefined,
        finishCustomUi,
      );
    });
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
    extension(pi);
    const ctx = {
      cwd: env.tmp,
      sessionId: 'session-overflow-history',
      ui: {
        setWidget,
        onTerminalInput: (handler: (data: string) => unknown) => {
          terminalInput = handler;
          return () => {
            terminalInput = undefined;
          };
        },
        getEditorText: () => '',
        custom,
      },
    };

    try {
      handlers.get('session_start')?.({}, ctx);
      expect(terminalInput).toBeDefined();
      for (let i = 0; i < 4; i++) {
        expect(terminalInput?.('\u001b[B')).toEqual({ consume: true });
      }
      expect(terminalInput?.('\r')).toEqual({
        consume: true,
        action: { type: 'open-history' },
      });
      await vi.waitFor(() => expect(custom).toHaveBeenCalledOnce());

      for (let i = 0; i < 104; i++) panelComponent.handleInput('\u001b[C');
      const rendered = panelComponent.render(160).join('\n');
      expect(rendered).toContain('/105');
      expect(rendered).toContain('OLDER_ACTIVE_TASK_SENTINEL');
    } finally {
      panelComponent?.handleInput('q');
      await handlers.get('session_shutdown')?.({}, ctx);
    }
  });
});
