import type {
  ExtensionAPI,
  ExtensionToolContext,
  Theme,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  getAnimationLevel,
  registerRenderKit,
  setAnimationLevel,
  type ThothRenderKit,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppServerClient } from '../src/app-server-client.js';
import { registerAskCodexTool } from '../src/ask-tool.js';
import { loadConfig } from '../src/config.js';
import type {
  Turn,
  TurnCompletedNotification,
  TurnStatus,
} from '../src/protocol.js';

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const theme = {
  fg: (_role: string, text: string) => text,
  bg: (_role: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;
const cleanups: Array<() => Promise<void>> = [];
const registrations: ReturnType<typeof registerRenderKit>[] = [];
const clockKey = Symbol.for('thoth.pi-core.animation-clock.v2');

function turn(status: TurnStatus): Turn {
  return {
    id: 'turn-1',
    rootTurnId: null,
    status,
    items: [{ id: 'answer', type: 'agentMessage', text: 'final answer' }],
    itemsView: 'full',
    error: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
  };
}

function createHarness(staticGlyph = '◐') {
  const kit: ThothRenderKit = {
    version: 1,
    card: (_theme, options) => [...(options.body as string[])],
    collapse: (_theme, rows) => [...rows],
    cachedComponent: (render) => ({ render, invalidate() {} }),
    indicator: (_theme, _context, options) => ({
      glyph: frames[(options?.frame ?? 0) % frames.length],
      elapsed: '',
      text: 'running',
    }),
    statusGlyph: () => staticGlyph,
    widgetHeading: () => '',
    treeRow: () => '',
    fg: (_theme, _role, text) => text,
  };
  registrations.push(registerRenderKit(kit, {}));
  let complete!: (status?: TurnStatus) => void;
  let fail!: (error: Error) => void;
  const finished = new Promise<TurnCompletedNotification>((resolve, reject) => {
    complete = (status = 'completed') =>
      resolve({ threadId: 'thread-1', turn: turn(status) });
    fail = reject;
  });
  const notifications = new Map<string, (params: never) => void>();
  const client = {
    onNotification: (method: string, listener: (params: never) => void) => {
      notifications.set(method, listener);
    },
    initialize: async () => {},
    threadStart: async () => ({ thread: { id: 'thread-1' } }),
    turnStart: async () => ({ turn: turn('inProgress') }),
    waitForTurnCompleted: () => finished,
    turnInterrupt: async () => {
      complete('interrupted');
    },
    close: vi.fn(async () => {}),
    stderrTail: '',
  };
  let tool!: ToolDefinition;
  registerAskCodexTool(
    {
      registerTool: (definition: ToolDefinition) => {
        tool = definition;
      },
    } as Pick<ExtensionAPI, 'registerTool'>,
    loadConfig({ configPath: '/missing', env: {} }),
    {
      resolveBinary: () => ({ path: 'codex', source: 'config', warnings: [] }),
      desktopRunning: async () => true,
      createClient: () => client as unknown as AppServerClient,
    },
  );
  const controller = new AbortController();
  const update = vi.fn<NonNullable<Parameters<ToolDefinition['execute']>[3]>>();
  const result = tool.execute(
    'call',
    { prompt: 'task' },
    controller.signal,
    update,
    {
      cwd: process.cwd(),
      hasUI: false,
    } as ExtensionToolContext,
  );
  const renderUpdate = (index: number) => {
    if (!tool.renderResult) throw new Error('Missing result renderer');
    return tool
      .renderResult(
        update.mock.calls[index][0],
        { expanded: true, isPartial: true },
        theme,
        { state: {}, isPartial: true } as never,
      )
      .render(80)
      .join('\n');
  };
  cleanups.push(async () => {
    complete();
    await result;
  });
  return {
    complete,
    fail,
    controller,
    update,
    result,
    renderUpdate,
    client,
    notifications,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  for (const token of registrations.splice(0)) withdrawRenderKit(token);
  // A leaked level subscription would recreate its refresh timer here.
  setAnimationLevel('off');
  expect(vi.getTimerCount()).toBe(0);
  delete (globalThis as Record<symbol, unknown>)[clockKey];
  vi.useRealTimers();
});

it.each([
  [undefined, 200],
  ['full', 200],
  ['reduced', 200],
  ['minimal', 500],
] as const)('renders every consecutive frame at %s (one step per %i ms)', async (level, periodMs) => {
  if (level !== undefined) setAnimationLevel(level);
  else expect(getAnimationLevel()).toBe('full');
  const harness = createHarness();
  expect(harness.update).not.toHaveBeenCalled();
  const glyphs: string[] = [];
  for (let step = 0; step < 11; step++) {
    await vi.advanceTimersByTimeAsync(periodMs);
    expect(harness.update).toHaveBeenCalledTimes(step + 1);
    glyphs.push(harness.renderUpdate(step).split(' ')[0]);
  }
  expect(glyphs).toEqual([
    '⠋',
    '⠙',
    '⠹',
    '⠸',
    '⠼',
    '⠴',
    '⠦',
    '⠧',
    '⠇',
    '⠏',
    '⠋',
  ]);
});

it.each([
  '◐',
  '*',
])('at off shows %s and refreshes elapsed time and status only every second', async (glyph) => {
  setAnimationLevel('off');
  const harness = createHarness(glyph);
  await vi.advanceTimersByTimeAsync(999);
  expect(harness.update).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(harness.update).toHaveBeenCalledTimes(1);
  expect(harness.update.mock.calls[0][0]).toMatchObject({
    content: [{ type: 'text', text: '1s · initializing' }],
    details: { status: 'inProgress', elapsedMs: 1000 },
  });
  expect(harness.renderUpdate(0)).toContain(`${glyph} AskCodex 1s`);
  harness.notifications.get('item/started')?.({
    item: { type: 'commandExecution', command: 'git status' },
  } as never);
  harness.notifications.get('item/agentMessage/delta')?.({
    delta: 'Still working',
  } as never);
  await vi.advanceTimersByTimeAsync(999);
  expect(harness.update).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(harness.update).toHaveBeenCalledTimes(2);
  expect(harness.update.mock.calls[1][0]).toMatchObject({
    content: [
      {
        type: 'text',
        text: '2s · commandExecution: git status · Still working',
      },
    ],
    details: { status: 'inProgress', elapsedMs: 2000 },
  });
  expect(harness.renderUpdate(1)).toContain(`${glyph} AskCodex 2s`);
});

it('renders the native static running glyph without a render kit', async () => {
  setAnimationLevel('off');
  const harness = createHarness();
  const token = registrations.pop();
  if (token) withdrawRenderKit(token);
  await vi.advanceTimersByTimeAsync(1000);
  expect(harness.renderUpdate(0)).toContain('◐ AskCodex 1s');
});

it('switches cadence and resumes the next frame after off without wall-clock skips', async () => {
  const harness = createHarness();
  await vi.advanceTimersByTimeAsync(200);
  expect(harness.renderUpdate(0)).toContain('⠋ AskCodex');
  setAnimationLevel('off');
  // Existing partial results also render statically as soon as the level changes.
  expect(harness.renderUpdate(0)).toContain('◐ AskCodex');
  await vi.advanceTimersByTimeAsync(999);
  expect(harness.update).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(harness.update).toHaveBeenCalledTimes(2);
  expect(harness.renderUpdate(1)).toContain('◐ AskCodex 1.2s');
  setAnimationLevel('minimal');
  await vi.advanceTimersByTimeAsync(500);
  expect(harness.update).toHaveBeenCalledTimes(3);
  expect(harness.renderUpdate(2)).toContain('⠙ AskCodex');
  setAnimationLevel('reduced');
  await vi.advanceTimersByTimeAsync(200);
  expect(harness.update).toHaveBeenCalledTimes(4);
  expect(harness.renderUpdate(3)).toContain('⠹ AskCodex');
});

it.each([
  ['full', 'completed'],
  ['full', 'failed'],
  ['full', 'interrupted'],
  ['off', 'completed'],
  ['off', 'failed'],
  ['off', 'interrupted'],
] as const)('cleans up updates and subscriptions at %s after %s', async (level, status) => {
  setAnimationLevel(level);
  const harness = createHarness();
  await vi.advanceTimersByTimeAsync(level === 'off' ? 1000 : 200);
  expect(harness.update).toHaveBeenCalledTimes(1);
  if (status === 'failed') harness.fail(new Error('Codex disconnected'));
  else if (status === 'interrupted') harness.controller.abort();
  else harness.complete();
  const result = await harness.result;
  expect(result.details).toMatchObject({
    status,
    aborted: status === 'interrupted',
    errors: status === 'failed' ? ['Codex disconnected'] : [],
  });
  expect(result.details).not.toHaveProperty('frame');
  expect(harness.client.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  setAnimationLevel(level === 'off' ? 'minimal' : 'off');
  await vi.advanceTimersByTimeAsync(2000);
  expect(harness.update).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
