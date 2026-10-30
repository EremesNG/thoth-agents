import fs from 'node:fs';
import {
  getAnimationLevel,
  registerRenderKit,
  renderToolFooter,
  setAnimationLevel,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { createSubagentRunTool } from '../../src/tools/subagent-run.js';
import { registerSubagentTools } from '../../src/tools.js';
import type { SubagentRunner } from '../../src/types.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

type ForegroundTool = ReturnType<typeof createSubagentRunTool>;
interface ProgressUpdate {
  content: [{ text: string }];
  details: { frame?: number; tasks: Array<{ status: string }> };
}

const env = installSubagentTestEnv();
const theme = { fg: (_role: string, text: string) => text };

afterEach(() => {
  setAnimationLevel('full');
  vi.useRealTimers();
});

async function startForeground(name: 'subagent_run' | 'subagent_continue') {
  env.writeAgent('analyst');
  fs.writeFileSync(
    `${env.tmp}/.pi/subagents.json`,
    JSON.stringify({ enable_continue: true }),
  );
  const nestedSessionPath = `${env.tmp}/animation-session.jsonl`;
  fs.writeFileSync(nestedSessionPath, '{"type":"session"}\n');
  let finish!: (error?: Error) => void;
  const gate = new Promise<void>((resolve, reject) => {
    finish = (error) => (error ? reject(error) : resolve());
  });
  let activity: Parameters<SubagentRunner>[0]['onActivity'];
  const manager = env.createManager(async ({ continuation, onActivity }) => {
    const result = {
      result: 'finished',
      model: 'mock/model',
      fallback_used: false,
      nested_session_path: nestedSessionPath,
    };
    if (name === 'subagent_continue' && !continuation) return result;
    activity = onActivity;
    await gate;
    return result;
  });
  const terminalHandlers: Array<(data: string) => unknown> = [];
  const ctx = {
    cwd: env.tmp,
    ui: {
      onTerminalInput(handler: (data: string) => unknown) {
        terminalHandlers.push(handler);
        return () => {
          terminalHandlers.splice(terminalHandlers.indexOf(handler), 1);
        };
      },
    },
  };
  const initialPromise =
    name === 'subagent_continue'
      ? manager.run({ agent: 'analyst', task: 'initial', mode: 'task' }, ctx)
      : undefined;
  await vi.advanceTimersByTimeAsync(50);
  const initial = await initialPromise;
  vi.setSystemTime(0);
  let tool!: ForegroundTool;
  registerSubagentTools(
    {
      registerTool: (registered: ForegroundTool) => {
        if (registered.name === name) tool = registered;
      },
    },
    manager,
    env.tmp,
  );
  let updatesThrow = false;
  const onUpdate = vi.fn((_update: ProgressUpdate) => {
    if (updatesThrow) throw new Error('renderer disposed');
  });
  const controller = new AbortController();
  const result = tool.execute(
    'animation',
    initial
      ? { task_id: initial.task_ids[0], prompt: 'resume', mode: 'task' }
      : { agent: 'analyst', task: 'work', mode: 'task' },
    controller.signal,
    onUpdate,
    ctx,
  );
  await vi.advanceTimersByTimeAsync(0);
  return {
    tool,
    manager,
    controller,
    terminalHandlers,
    throwOnUpdate: () => {
      updatesThrow = true;
    },
    onUpdate,
    result,
    finish,
    emitActivity: () => activity?.({ message: 'still working' }),
    latest: () => {
      const update = onUpdate.mock.lastCall?.[0];
      if (!update) throw new Error('Expected a foreground progress update');
      return update;
    },
  };
}

describe.each([
  'subagent_run',
  'subagent_continue',
] as const)('%s foreground animation', (name) => {
  it.each([
    ['full', 'completion'],
    ['full', 'error'],
    ['full', 'abort'],
    ['full', 'dispose'],
    ['full', 'handoff'],
    ['full', 'update-error'],
    ['off', 'completion'],
    ['off', 'error'],
    ['off', 'abort'],
    ['off', 'dispose'],
    ['off', 'handoff'],
    ['off', 'update-error'],
  ] as const)('cleans up %s steps on %s', async (level, ending) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setAnimationLevel(level);
    const run = await startForeground(name);
    let closing: Promise<void> | undefined;
    try {
      await vi.advanceTimersByTimeAsync(1000);
      if (ending === 'abort') run.controller.abort();
      if (ending === 'handoff') {
        for (const handler of [...run.terminalHandlers]) handler('\u0008');
      }
      if (ending === 'update-error') {
        run.throwOnUpdate();
        await vi.advanceTimersByTimeAsync(1000);
      }
      if (['abort', 'handoff', 'update-error'].includes(ending)) {
        const count = run.onUpdate.mock.calls.length;
        setAnimationLevel(level === 'off' ? 'minimal' : 'off');
        await vi.advanceTimersByTimeAsync(1000);
        expect(run.onUpdate).toHaveBeenCalledTimes(count);
      }
      if (ending === 'dispose') closing = run.manager.close();
    } finally {
      run.finish(ending === 'error' ? new Error('runner failed') : undefined);
      await vi.advanceTimersByTimeAsync(50);
      await run.result;
      await closing;
    }
    expect(run.terminalHandlers).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    const count = run.onUpdate.mock.calls.length;
    setAnimationLevel('off');
    await vi.advanceTimersByTimeAsync(1000);
    setAnimationLevel('full');
    await vi.advanceTimersByTimeAsync(1000);
    expect(run.onUpdate).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    '◐',
    '*',
  ])('switches a supplied frame to static %s immediately and refreshes elapsed every second at off', async (glyph) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const kit = createTestRenderKit();
    kit.statusGlyph = () => glyph;
    kit.toolFooter = (theme, options) =>
      renderToolFooter(undefined, theme, options);
    const token = registerRenderKit(kit, {});
    const run = await startForeground(name);
    const render = () =>
      run.tool
        .renderResult(run.latest(), { isPartial: true }, theme, {
          executionStarted: true,
          isPartial: true,
          state: { startedAt: 0 },
        })
        .render(240)
        .join('\n');
    try {
      await vi.advanceTimersByTimeAsync(400);
      expect(run.latest().details.frame).toBe(2);
      setAnimationLevel('off');
      expect(run.latest().details.frame).toBeUndefined();
      expect(run.latest().content[0].text).toMatch(
        glyph === '*' ? /^\*/ : /^◐/,
      );
      expect(render()).toContain(`${glyph} agent:`);
      const count = run.onUpdate.mock.calls.length;
      await vi.advanceTimersByTimeAsync(999);
      expect(run.onUpdate).toHaveBeenCalledTimes(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(run.onUpdate).toHaveBeenCalledTimes(count + 1);
      expect(render()).toContain('running · 1s');
      await vi.advanceTimersByTimeAsync(1000);
      expect(run.onUpdate).toHaveBeenCalledTimes(count + 2);
      expect(render()).toContain('running · 2s');
      setAnimationLevel('minimal');
      await vi.advanceTimersByTimeAsync(101);
      expect(run.latest().details.frame).toBe(3);
    } finally {
      run.finish();
      await vi.advanceTimersByTimeAsync(50);
      await run.result;
      withdrawRenderKit(token);
    }
    setAnimationLevel('off');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['default', 200],
    ['full', 200],
    ['reduced', 200],
    ['minimal', 500],
  ] as const)('shows every braille frame in order at %s, independent of lifecycle emissions', async (level, period) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    if (level === 'default') expect(getAnimationLevel()).toBe('full');
    else setAnimationLevel(level);
    const run = await startForeground(name);
    try {
      expect(run.latest().details.tasks[0]?.status).toBe('running');
      const frames: number[] = [run.latest().details.frame ?? -1];
      const glyphs: string[] = [run.latest().content[0].text.slice(0, 1)];
      for (let step = 0; step < 11; step++) {
        const count = run.onUpdate.mock.calls.length;
        await vi.advanceTimersByTimeAsync(step === 0 ? period : period - 150);
        expect(run.onUpdate.mock.calls.length).toBe(count + 1);
        const update = run.latest();
        expect(update.details.frame).toBe(step + 1);
        frames.push(update.details.frame ?? -1);
        glyphs.push(update.content[0].text.slice(0, 1));
        const rendered = run.tool
          .renderResult(update, { isPartial: true }, theme)
          .render(240)
          .join('\n');
        expect(rendered).toContain(`${update.content[0].text[0]} agent:`);
        run.emitActivity();
        await vi.advanceTimersByTimeAsync(150);
        expect(run.latest().details.frame).toBe(update.details.frame);
      }
      expect(frames).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
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
        '⠙',
      ]);
    } finally {
      run.finish();
      await vi.advanceTimersByTimeAsync(50);
      await run.result;
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
