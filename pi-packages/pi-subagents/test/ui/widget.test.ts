import {
  ensureWorkPanel,
  registerRenderKit,
  registerWorkPanelProvider,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { describe, expect, it, vi } from 'vitest';
import { visibleWidth } from '../../src/render/text-width.js';
import type { SubagentTask } from '../../src/types.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';
import { workPanelSession } from '../helpers/work-panel-fixture.js';

const now = Date.parse('2026-01-01T00:00:12Z');
function task(overrides: Partial<SubagentTask> = {}): SubagentTask {
  return {
    id: 'agent-1',
    agent: 'worker',
    mode: 'background',
    status: 'running',
    task: 'PHASE / CHANGE: inspect a very long migration surface and report back',
    model: 'provider/a-very-long-model-name-that-must-not-displace-metrics',
    created_at: '2026-01-01T00:00:00Z',
    started_at: '2026-01-01T00:00:00Z',
    usage: {
      input: 20000,
      output: 10000,
      cacheRead: 90000,
      cacheWrite: 3800,
      cost: 0,
      turns: 5,
      contextTokens: 0,
    },
    runtime_metrics: {
      toolUses: 5,
      contextPercent: 62,
      generationOutputTokens: 300,
      generationMs: 4000,
    },
    ...overrides,
  };
}
function provider(tasks: SubagentTask[]) {
  return createSubagentsWorkPanelProvider({
    listTasks: () => tasks,
    onTaskUpdate: () => () => {},
    cancel: () => {},
    open: async () => {},
  });
}

describe('Agents work-panel rows', () => {
  it('opts into prompt retention with live and terminal states, completion times and session totals', () => {
    const agents = provider(
      [
        'queued',
        'stopping',
        'running',
        'completed',
        'failed',
        'cancelled',
        'interrupted',
      ].map((status, index) =>
        task({
          id: `${index}`,
          status: status as SubagentTask['status'],
          ended_at: index >= 3 ? '2026-01-01T00:00:09Z' : undefined,
        }),
      ),
    );
    expect(agents.retention).toBe('prompt');
    const rows = agents.listRows(now);
    expect(
      ['0', '1', '2', '3', '4', '5', '6'].map(
        (id) => rows.find((row) => row.id === id)?.state,
      ),
    ).toEqual([
      'running',
      'running',
      'running',
      'done',
      'failed',
      'failed',
      'failed',
    ]);
    expect(rows.find((row) => row.id === '3')?.endedAt).toBe(
      Date.parse('2026-01-01T00:00:09Z'),
    );
    expect(rows.find((row) => row.id === '0')?.endedAt).toBeUndefined();
    expect(agents.summary!()).toMatchObject({
      completed: 1,
      failed: 3,
      running: 3,
      total: 7,
    });
    expect(
      provider([
        task({
          status: 'failed',
          ended_at: 'invalid',
          error: 'timed out after 1000ms',
        }),
      ]).listRows(now)[0],
    ).toMatchObject({ state: 'failed', endedAt: undefined });
  });
  it('summarizes the session, keeps streaming rows stationary and cancels only a still-running task', () => {
    const older = task({ id: 'older', created_at: '2026-01-01T00:00:00Z' });
    const newer = task({ id: 'newer', created_at: '2026-01-01T00:00:01Z' });
    const queued = task({ id: 'queued', status: 'queued' });
    let tasks = [older, newer, queued];
    const cancel = vi.fn();
    const agents = createSubagentsWorkPanelProvider({
      listTasks: () => tasks,
      cancel,
      onTaskUpdate: () => () => {},
      open: async () => {},
    });
    expect(agents).toMatchObject({ version: 1, label: 'Agents', priority: 10 });
    expect(agents.visibleCount()).toBe(3);
    expect(agents.summary!()).toMatchObject({ text: '2 running · 1 queued' });
    expect(agents.listRows(now).map((row) => row.id)).toEqual([
      'newer',
      'older',
      'queued',
    ]);
    tasks = [queued, newer, older];
    older.last_activity_at = '2026-01-01T00:00:59Z';
    expect(agents.listRows(now).map((row) => row.id)).toEqual([
      'newer',
      'older',
      'queued',
    ]);
    expect(tasks.map((item) => item.id)).toEqual(['queued', 'newer', 'older']);
    const row = agents.listRows(now)[0]!;
    expect(agents.armCloseLabel(row)).toBe('cancel');
    expect(agents.close(row.id)).toMatchObject({
      action: 'cancel',
      id: 'newer',
    });
    expect(cancel).toHaveBeenCalledWith('newer', 'cancelled from work panel');
    newer.status = 'completed';
    expect(agents.armCloseLabel(row)).toBe('');
    agents.close(row.id);
    agents.close('queued');
    agents.close('missing');
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('animates only running rows and distinguishes queue, completion, cancellation and failure', () => {
    const rows = provider(
      ['running', 'queued', 'completed', 'cancelled', 'failed'].map(
        (status, index) =>
          task({ id: `${index}`, status: status as SubagentTask['status'] }),
      ),
    ).listRows(now);
    const glyph = (index: number, at: number) => {
      const value = rows.find((row) => row.id === `${index}`)!.statusGlyph;
      return typeof value === 'function' ? value(at) : value;
    };
    expect(glyph(0, 0)).toBe('⠋');
    expect(glyph(0, 100)).toBe('⠙');
    expect([1, 2, 3, 4].map((index) => glyph(index, 0))).toEqual([
      '○',
      '✓',
      '■',
      '✗',
    ]);
    for (const index of [1, 2, 3, 4])
      expect(glyph(index, 100)).toBe(glyph(index, 0));
    expect(provider([]).refreshIntervalMs).toBe(100);
  });
  it.each([
    undefined,
    -1,
    NaN,
    Infinity,
  ])('marks missing or invalid metrics rather than inventing zero (%s)', (value) => {
    const row = provider([
      task({
        started_at: 'invalid',
        usage: { input: value, output: value } as SubagentTask['usage'],
        runtime_metrics: {
          toolUses: value,
          contextPercent: value,
          generationOutputTokens: value,
          generationMs: 1000,
        },
      }),
    ]).listRows(now)[0]!;
    expect(row.render!(100, now).text).toContain(
      'tools ? · ↑? ↓? · ctx ? · ? tok/s · elapsed ?',
    );
  });

  it('preserves measured zeroes, excludes caches and uses average generation time, not wall time or lifetime output', () => {
    const zero = task({
      usage: {
        input: 0,
        output: 0,
        cacheRead: 90000,
        cacheWrite: 3800,
      } as SubagentTask['usage'],
      runtime_metrics: {
        toolUses: 0,
        contextPercent: 0,
        generationOutputTokens: 0,
        generationMs: 1000,
      },
    });
    expect(provider([zero]).listRows(now)[0]!.render!(100, now).text).toContain(
      'tools 0 · ↑0 ↓0 · ctx 0.0% · 0 tok/s · elapsed 12s',
    );
    const measured = task({
      runtime_metrics: { generationOutputTokens: 300, generationMs: 4000 },
    });
    const content = provider([measured]).listRows(now)[0]!.render!(
      100,
      now,
    ).text;
    expect(content).toContain('↑20k ↓10k');
    expect(content).toContain('75 tok/s');
    expect(content).not.toContain('90k');
    expect(content).not.toContain('3.8k');
    measured.runtime_metrics!.generationMs = 0;
    expect(
      provider([measured]).listRows(now)[0]!.render!(100, now).text,
    ).toContain('? tok/s');
  });

  it('freezes terminal elapsed at the recorded end and leaves an unstarted queue unknown', () => {
    const ended = task({
      status: 'completed',
      ended_at: '2026-01-01T00:00:09Z',
    });
    const row = provider([ended]).listRows(now)[0]!;
    expect(row.render!(100, now).text).toContain('elapsed 9s');
    expect(row.render!(100, now + 100000).text).toContain('elapsed 9s');
    ended.ended_at = undefined;
    expect(row.render!(100, now).text).toContain('elapsed ?');
    const queue = task({
      status: 'queued',
      started_at: undefined,
      runtime_metrics: undefined,
      usage: undefined,
    });
    expect(
      provider([queue]).listRows(now)[0]!.render!(100, now).text,
    ).toContain('tools ? · ↑? ↓? · ctx ? · ? tok/s · elapsed ?');
  });

  it('keeps Unicode task labels cell-bounded at tiny widths and prefers the display name to a delegated prompt', () => {
    const row = provider([
      task({
        agent: 'worker-🚀',
        display_name: '日本語\n👩‍💻 e\u0301\t review',
        task: '# delegated task\n' + 'A'.repeat(500),
      }),
    ]).listRows(now)[0]!;
    expect(row.render!(200, now).text).toContain('日本語 👩‍💻 e\u0301 review');
    expect(row.render!(200, now).text).not.toContain('AAA');
    for (const width of [50, 24, 12, 1, 0]) {
      const content = row.render!(width, now);
      for (const line of [content.text, ...(content.extraRows ?? [])]) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
        expect(line).not.toMatch(/[\uD800-\uDBFF]$/u);
      }
    }
  });

  it.each([
    'running',
    'queued',
  ] as const)('keeps a compact dropped-tools warning on %s rows without displacing metrics', (status) => {
    const row = provider([
      task({ status, dropped_tools: ['unavailable_read', 'missing_search'] }),
    ]).listRows(now)[0]!;
    for (const width of [100, 80, 70, 50, 35, 24]) {
      const content = row.render!(width, now);
      expect(content.text).toContain('⚠ 2 dropped');
      expect(content.text).not.toContain('unavailable_read');
      expect(content.text).not.toContain('missing_search');
      const lines = [content.text, ...(content.extraRows ?? [])];
      for (const metric of [
        'tools 5',
        '↑20k ↓10k',
        'ctx 62.0%',
        '75 tok/s',
        status === 'running' ? 'elapsed 12s' : 'elapsed ?',
      ])
        expect(lines.join(' · ')).toContain(metric);
      for (const line of lines)
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      if (width === 100) {
        expect(content.extraRows ?? []).toEqual([]);
        expect(content.text).toContain('…');
      }
      if (width <= 50) expect(content.extraRows?.length).toBeGreaterThan(0);
    }
  });

  it('uses the current theme warning color and protects the warning before a long agent or task label', () => {
    const fg = vi.fn((_role: string, text: string) => `\x1b[33m${text}\x1b[0m`);
    const currentTheme: { fg: (role: string, text: string) => string } = { fg };
    const item = task({
      agent: 'worker-with-an-extremely-long-name',
      dropped_tools: ['missing_read'],
    });
    const agents = createSubagentsWorkPanelProvider({
      listTasks: () => [item],
      onTaskUpdate: () => () => {},
      cancel: () => {},
      open: async () => {},
      theme: () => currentTheme,
    });
    const row = agents.listRows(now)[0]!;
    for (const width of [200, 80, 24, 12]) {
      const content = row.render!(width, now);
      expect(content.text).toContain('\x1b[33m⚠ 1 dropped\x1b[0m');
      expect(visibleWidth(content.text)).toBeLessThanOrEqual(width);
    }
    expect(fg).toHaveBeenCalledWith('warning', '⚠ 1 dropped');
    currentTheme.fg = (_role, text) => `\x1b[93m${text}\x1b[0m`;
    expect(row.render!(200, now).text).toContain('\x1b[93m⚠ 1 dropped\x1b[0m');
    expect(row.render!(1, now).text).toContain('⚠');
    expect(row.render!(0, now)).toEqual({ text: '' });
    item.status = 'completed';
    expect(row.render!(200, now).text).not.toContain('dropped');
    item.status = 'running';
    item.dropped_tools = [];
    expect(row.render!(200, now).text).not.toContain('dropped');
  });

  it('keeps an unstyled warning when no producer theme is supplied, even with a render kit registered', () => {
    const token = registerRenderKit(
      {
        ...createTestRenderKit(),
        fg: (theme, role, text) => theme.fg(role, text),
      },
      {},
    );
    try {
      const row = provider([
        task({ dropped_tools: ['missing_read'] }),
      ]).listRows(now)[0]!;
      expect(row.render!(100, now).text).toContain('⚠ 1 dropped');
    } finally {
      withdrawRenderKit(token);
    }
  });

  it('truncates the task before metrics and uses continuations only when metrics cannot fit inline', () => {
    const row = provider([task()]).listRows(now)[0]!;
    const metrics = [
      'tools 5',
      '↑20k ↓10k',
      'ctx 62.0%',
      '75 tok/s',
      'elapsed 12s',
    ];
    for (const width of [100, 80, 70]) {
      const content = row.render!(width, now);
      expect(content.extraRows ?? []).toEqual([]);
      for (const metric of metrics) expect(content.text).toContain(metric);
      expect(content.text).toContain('worker');
      expect(content.text).toContain('…');
      expect(visibleWidth(content.text)).toBeLessThanOrEqual(width);
    }
    for (const width of [50, 35, 24]) {
      const content = row.render!(width, now);
      expect(content.extraRows?.length).toBeGreaterThan(0);
      expect(content.text).toContain('worker');
      for (const metric of metrics)
        expect(content.extraRows!.join(' · ')).toContain(metric);
      for (const line of [content.text, ...content.extraRows!])
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });
});

it('renders agent identity, task, metrics and dropped tools with distinct roles at wide and narrow widths', async () => {
  const session = workPanelSession(process.cwd());
  const styled: Array<[string, string]> = [];
  session.theme.fg = (role, text) => {
    styled.push([role, text]);
    return text;
  };
  const unregister = registerWorkPanelProvider(
    session.ctx as never,
    provider([task({ dropped_tools: ['missing'] })]),
  );
  const release = await ensureWorkPanel(session.ctx as never);
  const token = registerRenderKit(
    {
      ...createTestRenderKit(),
      fg: (theme, role, text) => theme.fg(role, text),
    },
    {},
  );
  try {
    for (const width of [120, 50]) {
      styled.length = 0;
      const lines = session.render(width);
      expect(styled).toContainEqual(['toolTitle', 'worker']);
      expect(
        styled.some(
          ([role, text]) => role === 'text' && text.includes('PHASE'),
        ),
      ).toBe(true);
      expect(
        styled.some(
          ([role, text]) => role === 'dim' && text.includes('tools 5'),
        ),
      ).toBe(true);
      expect(
        styled.some(
          ([role, text]) => role === 'warning' && text.includes('⚠ 1 dropped'),
        ),
      ).toBe(true);
      expect(lines.every((line: string) => visibleWidth(line) <= width)).toBe(
        true,
      );
      expect(lines.join(' ')).toContain('75 tok/s');
    }
  } finally {
    withdrawRenderKit(token);
    release();
    unregister();
  }
});

it('marks failure counts in the Agents heading as errors, leaving other counters dim', () => {
  expect(
    provider([task(), task({ id: 'failed', status: 'failed' })]).summary!(),
  ).toMatchObject({
    text: '1 running · 1 failed',
    segments: [
      { text: '1 running', role: 'meta' },
      { text: ' · ', role: 'meta' },
      { text: '1 failed', role: 'error' },
    ],
  });
});
