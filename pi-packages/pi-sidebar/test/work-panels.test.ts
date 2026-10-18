import {
  registerRenderKit,
  registerWorkPanelProvider,
  resolveIcon,
  WORK_PANEL_VERSION,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import {
  createWorkPanelColumnPlan,
  panelVisibleWidth,
  workPanelRowLineCount,
} from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import {
  agentRow,
  FULL_METRICS,
  sidebar,
  source,
  strip,
  useMode,
} from './fixture.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
  vi.useRealTimers();
});

const lines = (text: string[]) => text.map(strip);

it('shows discovered summaries in each work panel header', () => {
  releases.push(
    source('subagents', 'Agents', [agentRow('a', 'one')], {
      running: 1,
      completed: 4,
      failed: 2,
      total: 7,
    }),
    source('todos', 'Todos', [agentRow('t', 'task', 'pending')], {
      completed: 2,
      total: 5,
    }),
    source('background-tasks', 'Background', [agentRow('b', 'build')], {
      running: 1,
      completed: 3,
      failed: 0,
      total: 4,
    }),
  );
  const text = lines(
    sidebar([
      { id: 'subagents', visible: true },
      { id: 'todos', visible: true },
      { id: 'background-tasks', visible: true },
    ]).renderAt(44, 40),
  );
  const heading = (title: string) =>
    text.find((line) => line.includes(title)) ?? '';
  expect(heading('AGENTS')).toMatch(/◐1 ✓4 ✗2 ─╮$/);
  expect(heading('TODOS')).toMatch(/2\/5 ─╮$/);
  expect(heading('BACKGROUND')).toMatch(/◐1 ✓3 ─╮$/);
});

it('omits the header summary when the provider has none', () => {
  releases.push(source('subagents', 'Agents', [agentRow('a', 'one')]));
  const heading = lines(
    sidebar([{ id: 'subagents', visible: true }]).renderAt(44, 40),
  )[0];
  expect(heading).toMatch(/AGENTS ─+╮$/);
});

it('puts the workspace state word in its header', () => {
  const state = (git: 'clean' | 'modified' | 'conflicts') =>
    lines(
      sidebar([{ id: 'workspace', visible: true }], {
        workspace: () => ({
          cwd: '/project',
          branch: 'main',
          git: {
            state: git,
            files: 0,
            untracked: 0,
            binary: 0,
            conflicts: 0,
          },
        }),
      }).renderAt(44, 40),
    )[0];
  expect(state('clean')).toMatch(/Clean ─╮$/);
  expect(state('modified')).toMatch(/Modified ─╮$/);
  expect(state('conflicts')).toMatch(/Conflicts ─╮$/);
});

it.each([
  'nerd',
  'ascii',
] as const)('renders every Agents row on two lines in %s mode at 36/50 cells, dropping line-2 columns panel-wide', (mode) => {
  releases.push(useMode(mode));
  const ascii = mode === 'ascii';
  const values = {
    tools: ascii ? 'tools 99' : '⚒ 99',
    tokens: ascii ? 'in 9.9k out 99' : '↑9.9k ↓99',
    context: ascii ? 'ctx 9.9%' : '◔ 9.9%',
    speed: ascii ? 'tok/s 99' : '↯ 99',
    cost: '$0.99',
    elapsed: ascii ? 'elapsed 9s' : '◷ 9s',
    model: 'gpt-5·high',
  };
  const rows = [
    agentRow('a', 'explorer', 'running', values),
    agentRow('b', 'reviewer', 'completed', values),
  ];
  releases.push(source('subagents', 'Agents', rows));
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const second = (width: number) => {
    const rendered = lines(panel.renderAt(width, 40));
    // top + two lines per row + footer + bottom
    expect(rendered).toHaveLength(rows.length * 2 + 3);
    for (const line of rendered) expect(panelVisibleWidth(line)).toBe(width);
    const body = rendered.slice(1, 1 + rows.length * 2);
    // Line 1: name and the bare elapsed time (the clock icon stays free for timed out).
    expect(body[0]).toMatch(/expl/);
    expect(body[0]).toMatch(/ 9s \|?$|9s │$/);
    expect(body[0]).not.toContain(values.elapsed);
    expect(body[2]).toMatch(/revi/);
    // Reserved digit cells pad inside a value, so detect each column by its marker.
    const markers: Record<string, string> = {
      context: ascii ? 'ctx' : '◔',
      cost: '$',
      speed: ascii ? 'tok/s' : '↯',
      tokens: ascii ? 'in ' : '↑',
      tools: ascii ? 'tools' : '⚒',
      model: 'gpt-5',
    };
    const shown = (line: string) =>
      Object.keys(markers).filter((key) => line.includes(markers[key]));
    // Panel-wide: both rows keep the same line-2 columns; line 1 has none.
    expect(shown(body[1])).toEqual(shown(body[3]));
    expect(shown(body[0])).toEqual([]);
    return shown(body[1]);
  };
  // Measured: the priority prefix that fits the reserved widths at each panel width.
  expect(second(36)).toEqual(['context', 'cost']);
  expect(second(50)).toEqual(['context', 'cost', 'speed']);
});

it.each([
  44, 36, 30,
])('measures the same line count it renders at width %i', (width) => {
  const rows = [
    agentRow('a', 'explorer', 'running', FULL_METRICS),
    agentRow('b', 'a-rather-long-agent-name', 'completed', FULL_METRICS),
  ];
  releases.push(source('subagents', 'Agents', rows));
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const rendered = panel.renderAt(width, 40);
  const expected = rows.reduce(
    (sum, row) =>
      sum +
      workPanelRowLineCount(row, width - 4, panelVisibleWidth, {
        metricLayout: 'columns',
        metricGrid: createWorkPanelColumnPlan(
          rows,
          width - 4,
          panelVisibleWidth,
          { lines: 2 },
        ),
      }),
    0,
  );
  // Both rows carry metrics besides elapsed: identity line plus metric line.
  expect(expected).toBe(rows.length * 2);
  // top + rows + footer + bottom
  expect(rendered).toHaveLength(expected + 3);
  for (const line of rendered) expect(panelVisibleWidth(line)).toBe(width);
});

it('recomputes metric widths when an animated row is re-exposed', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const metrics = {
    tools: '⚒ 99',
    tokens: 'inputs ↑9.9k out ↓99',
    context: '◔ 9.9%',
    speed: '↯ 99',
    cost: '$0.99',
    model: 'gpt-5·high',
  };
  const rows = [
    agentRow('a', 'worker', 'running', { ...metrics, elapsed: '99h 59m' }),
  ];
  releases.push(source('subagents', 'Agents', rows));
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  expect(lines(panel.renderAt(69, 40)).join('\n')).toContain('99h 59m');
  // Collapse the panel so animation stops reading the provider.
  panel.renderAt(69, 1);
  vi.setSystemTime(10000);
  rows[0] = agentRow('a', 'worker', 'running', {
    ...metrics,
    elapsed: '100h 00m',
  });
  panel.renderAt(69, 1);
  const exposed = lines(panel.renderAt(69, 40));
  expect(exposed.join('\n')).toContain('100h 00m');
  const fresh = lines(
    sidebar([{ id: 'subagents', visible: true }]).renderAt(69, 40),
  );
  expect(exposed).toEqual(fresh);
  const measured = workPanelRowLineCount(rows[0], 65, panelVisibleWidth, {
    metricLayout: 'columns',
    metricGrid: createWorkPanelColumnPlan(rows, 65, panelVisibleWidth, {
      lines: 2,
    }),
  });
  expect(measured).toBe(2);
  expect(exposed).toHaveLength(measured + 3);
  for (const line of exposed) expect(panelVisibleWidth(line)).toBe(69);
});

it.each([
  [30, '+7 more', '/subagents'],
  [44, '+7 more', '/subagents ▸ detail'],
] as const)('preserves the overflow detail command at width %i', (width, more, command) => {
  releases.push(useMode('nerd'));
  releases.push(
    source(
      'subagents',
      'Agents',
      Array.from({ length: 8 }, (_, index) =>
        agentRow(String(index), 'worker'),
      ),
    ),
  );
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const rendered = lines(panel.renderAt(width, 4));
  expect(rendered).toHaveLength(4);
  expect(rendered.at(-2)).toContain(more);
  expect(rendered.at(-2)).toContain(command);
  if (width === 30) expect(rendered.at(-2)).not.toContain('detail');
  for (const line of rendered) expect(panelVisibleWidth(line)).toBe(width);
});

it.each([
  ['nerd', '/subagents ▸ detail'],
  ['ascii', '/subagents > detail'],
] as const)('ends with the detail command footer in %s mode', (mode, footer) => {
  releases.push(useMode(mode));
  releases.push(source('subagents', 'Agents', [agentRow('a', 'one')]));
  const text = lines(
    sidebar([{ id: 'subagents', visible: true }]).renderAt(44, 40),
  );
  expect(text.at(-2)).toContain(footer);
  // Right aligned under the rows.
  expect(text.at(-2)).toMatch(/ {2,}\/subagents/);
});

it.each([
  ['subagents', 'Agents', '/subagents'],
  ['todos', 'Todos', '/todos'],
  ['background-tasks', 'Background', '/bg'],
])('collapses an empty %s panel to one title line with its command', (id, label, command) => {
  releases.push(source(id, label, []));
  for (const width of [44, 30]) {
    const rendered = lines(
      sidebar([{ id, visible: true }]).renderAt(width, 40),
    );
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toContain(label.toUpperCase());
    expect(rendered[0]).toContain(command);
    expect(rendered[0]).not.toContain('detail');
  }
});

it('absorbs an empty single-line panel displayed in the sidebar', () => {
  releases.push(source('todos', 'Todos', []));
  const panel = sidebar([{ id: 'todos', visible: true }]);
  expect(lines(panel.render(44))).toHaveLength(1);
  expect(panel.sourceIds()).toEqual(['todos']);
});

it('absorbs a nonempty panel collapsed to its title by the height budget', () => {
  releases.push(source('subagents', 'Agents', [agentRow('a', 'one')]));
  const panel = sidebar([{ id: 'subagents', visible: true }], {
    height: () => 1,
  });
  const rendered = lines(panel.render(44));
  expect(rendered).toHaveLength(1);
  expect(rendered[0]).toContain('AGENTS');
  expect(rendered[0]).not.toContain('one');
  expect(panel.sourceIds()).toEqual(['subagents']);
});

it('does not absorb a panel excluded by the bounded title prefix', () => {
  releases.push(
    source('subagents', 'Agents', []),
    source('background-tasks', 'Background', []),
  );
  const panel = sidebar(
    [
      { id: 'subagents', visible: true },
      { id: 'background-tasks', visible: true },
    ],
    { height: () => 1 },
  );
  const rendered = lines(panel.render(44));
  expect(rendered).toHaveLength(1);
  expect(rendered[0]).toContain('AGENTS');
  expect(rendered.join('\n')).not.toContain('BACKGROUND');
  expect(panel.sourceIds()).toEqual(['subagents']);
});

it('refreshes finished provider metrics on late kit registration, icon changes and withdrawal', () => {
  releases.push(
    registerWorkPanelProvider({ on() {} } as never, {
      version: WORK_PANEL_VERSION,
      id: 'subagents',
      label: 'Agents',
      priority: 10,
      visibleCount: () => 1,
      listRows: () => [
        agentRow('finished', 'worker', 'completed', {
          tools: `${resolveIcon('elapsed', 'elapsed')} 9`,
        }),
      ],
      detail: () => null,
      armCloseLabel: () => '',
      close() {},
    }),
  );
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const text = () => lines(panel.renderAt(100, 40)).join('\n');
  expect(text()).toContain('elapsed 9');
  let clock = '◷';
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name) => (name === 'elapsed' ? clock : (undefined as never)),
    }),
    {},
  );
  releases.push(() => withdrawRenderKit(token));
  expect(text()).toContain('◷ 9');
  expect(text()).not.toContain('elapsed 9');
  clock = 'CLOCK';
  expect(text()).toContain('CLOCK 9');
  withdrawRenderKit(token);
  expect(text()).toContain('elapsed 9');
  expect(text()).not.toContain('CLOCK 9');
});

it.each([
  'nerd',
  'unicode',
  'ascii',
] as const)('uses static status glyphs and status roles in %s headers, fitting 30/44 cells', (mode) => {
  if (mode === 'ascii') releases.push(useMode('ascii'));
  const kit = createTestRenderKit();
  const plainGlyph = kit.statusGlyph;
  const calls: string[] = [];
  kit.statusGlyph = (theme, status) => {
    calls.push(status);
    if (mode === 'ascii')
      return status === 'running' ? '*' : status === 'completed' ? 'v' : 'x';
    return plainGlyph(theme, status);
  };
  const token = registerRenderKit(kit, {});
  releases.push(() => withdrawRenderKit(token));
  releases.push(
    source('subagents', 'Agents', [agentRow('a', 'one')], {
      running: 1,
      completed: 22,
      failed: 1,
    }),
    source('background-tasks', 'Background', [agentRow('b', 'build')], {
      running: 1,
      completed: 22,
      failed: 1,
    }),
  );
  const styled: Array<[string, string]> = [];
  kit.fg = (_theme, role, text) => {
    styled.push([role, text]);
    return text;
  };
  const panel = sidebar(
    [
      { id: 'subagents', visible: true },
      { id: 'background-tasks', visible: true },
    ],
    {
      theme: {
        fg: (role, text) => {
          styled.push([role, text]);
          return text;
        },
      },
    },
  );
  const expected = mode === 'ascii' ? '*1 v22 x1' : '◐1 ✓22 ✗1';
  for (const width of [30, 44]) {
    const rendered = lines(panel.renderAt(width, 40));
    for (const title of ['AGENTS', 'BACKGROUND']) {
      const heading = rendered.find((line) => line.includes(title)) ?? '';
      expect(heading).toContain(expected);
      expect(panelVisibleWidth(heading)).toBe(width);
    }
  }
  expect(styled).toContainEqual(['accent', mode === 'ascii' ? '*1' : '◐1']);
  expect(styled).toContainEqual(['success', mode === 'ascii' ? 'v22' : '✓22']);
  expect(styled).toContainEqual(['error', mode === 'ascii' ? 'x1' : '✗1']);
  expect(calls).toContain('running');
});

it('omits zero status counts, including an all-zero header summary', () => {
  releases.push(
    source('subagents', 'Agents', [agentRow('a', 'one')], {
      running: 0,
      completed: 0,
      failed: 0,
    }),
  );
  const heading = lines(
    sidebar([{ id: 'subagents', visible: true }]).renderAt(30, 40),
  )[0];
  expect(heading).toMatch(/AGENTS ─+╮$/);
  expect(heading).not.toContain('0');
});

it.each([
  'nerd',
  'ascii',
] as const)('keeps two-line sidebar row heights and line-2 columns stable across digit boundaries in %s mode', (mode) => {
  releases.push(useMode(mode));
  for (const width of [30, 44]) {
    const heights: number[] = [];
    const columns: boolean[][] = [];
    for (const metricValues of [
      {
        tools: '99',
        tokens: ['9.9k', '99'],
        context: '9.9%',
        speed: '99',
        cost: '0.99',
        elapsed: '9s',
      },
      {
        tools: '100',
        tokens: ['10.0k', '100'],
        context: '10.0%',
        speed: '100',
        cost: '1.00',
        elapsed: '10s',
      },
      {
        tools: '101',
        tokens: ['10k', '101'],
        context: '11.0%',
        speed: '101',
        cost: '1.01',
        elapsed: '1m 05s',
      },
    ]) {
      const ascii = mode === 'ascii';
      const row = agentRow('a', 'explorer', 'running', {
        tools: `${ascii ? 'tools' : '⚒'} ${metricValues.tools}`,
        tokens: `${ascii ? 'in ' : '↑'}${metricValues.tokens[0]} ${ascii ? 'out ' : '↓'}${metricValues.tokens[1]}`,
        context: `${ascii ? 'ctx' : '◔'} ${metricValues.context}`,
        speed: `${ascii ? 'tok/s' : '↯'} ${metricValues.speed}`,
        cost: `$${metricValues.cost}`,
        elapsed: `${ascii ? 'elapsed' : '◷'} ${metricValues.elapsed}`,
        model: 'gpt-5·high',
      });
      const off = source('subagents', 'Agents', [row]);
      try {
        const rendered = sidebar([{ id: 'subagents', visible: true }]).renderAt(
          width,
          40,
        );
        expect(rendered.length).toBe(
          workPanelRowLineCount(row, width - 4, panelVisibleWidth, {
            metricLayout: 'columns',
            metricGrid: createWorkPanelColumnPlan(
              [row],
              width - 4,
              panelVisibleWidth,
              { lines: 2 },
            ),
          }) + 3,
        );
        // top + identity line + metric line + footer + bottom
        expect(rendered.length).toBe(5);
        heights.push(rendered.length);
        const metricLine = strip(rendered[2]);
        columns.push(
          ['%', '$', '↯|tok/s', '↑|in '].map((pattern) =>
            new RegExp(pattern).test(metricLine),
          ),
        );
      } finally {
        off();
      }
    }
    expect(new Set(heights).size).toBe(1);
    expect(
      columns.every((visible) => visible.join() === columns[0].join()),
    ).toBe(true);
    expect(columns[0].slice(0, 2)).toEqual([true, true]);
  }
});

it('lists active rows first, then the three most recently finished, uniformly without changing totals', () => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  // Launch order is the reverse of completion order to prove completion ranks the finished.
  const finished = (
    id: string,
    launched: number,
    endedAt: number,
    failed = false,
  ) => ({
    ...agentRow(id, id, failed ? 'failed' : 'completed'),
    state: failed ? ('failed' as const) : ('done' as const),
    sortStartedAt: launched,
    endedAt,
  });
  releases.push(
    source(
      'subagents',
      'Agents',
      [
        finished('expired', 6, 40_000),
        finished('older', 5, 90_000),
        finished('newest', 1, 99_000),
        finished('middle', 4, 95_000),
        finished('failure', 3, 80_000, true),
        { ...agentRow('live', 'live'), sortStartedAt: 9 },
      ],
      { running: 1, completed: 4, failed: 1, total: 6 },
    ),
  );
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const text = () =>
    lines(panel.renderAt(44, 40)).join(String.fromCharCode(10));
  expect(text()).toContain('live');
  expect(text()).not.toContain('failure');
  expect(text()).toContain('newest');
  expect(text()).toContain('middle');
  expect(text()).toContain('older');
  expect(text()).not.toContain('expired');
  expect(text()).toContain('◐1 ✓4 ✗1');
  // Active first even though it launched last, then finished by completion, newest first.
  expect(text().indexOf('live')).toBeLessThan(text().indexOf('newest'));
  expect(text().indexOf('newest')).toBeLessThan(text().indexOf('middle'));
  expect(text().indexOf('middle')).toBeLessThan(text().indexOf('older'));
  expect(panel.hasAnimation()).toBe(true);
  vi.setSystemTime(111_000);
  const retained = text();
  expect(retained).not.toContain('failure');
  expect(retained).toContain('older');
  expect(retained).toContain('newest');
  expect(retained).toContain('middle');
  expect(retained).not.toContain('+');
});

it.each([
  ['subagents', 4000],
  ['background-tasks', 4000],
  ['todos', 4000],
  ['subagents', 100_000],
  ['background-tasks', 100_000],
  ['todos', 100_000],
] as const)('retains three finished %s rows at time %i without idle redraws', (id, now) => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const listRows = vi.fn(() => [
    {
      ...agentRow('older', 'older item', 'completed'),
      sortStartedAt: 1000,
      endedAt: 1000,
    },
    {
      ...agentRow('newest', 'newest item', 'completed'),
      sortStartedAt: 3000,
      endedAt: 3000,
    },
    {
      ...agentRow('middle', 'middle item', 'completed'),
      sortStartedAt: 2000,
      endedAt: 2000,
    },
    {
      ...agentRow('failed', 'failure item', 'failed'),
      state: 'failed' as const,
      sortStartedAt: 0,
      endedAt: 0,
      expiresAt: 100,
    },
  ]);
  releases.push(
    registerWorkPanelProvider({ on() {} } as never, {
      version: WORK_PANEL_VERSION,
      id,
      label: 'Work',
      priority: 10,
      visibleCount: () => 4,
      listRows,
      summary: () => ({ running: 0, completed: 3, failed: 1, total: 4 }),
      detail: () => null,
      armCloseLabel: () => '',
      close() {},
    }),
  );
  const panel = sidebar([{ id, visible: true }]);
  const first = panel.renderAt(44, 40);
  const text = lines(first).join(String.fromCharCode(10));
  expect(text).not.toContain('failure item');
  expect(text).toContain('newest item');
  expect(text).toContain('middle item');
  expect(text).toContain('older item');
  expect(text).not.toContain('more');
  const order = ['older item', 'middle item', 'newest item'];
  // Todos keep launch order (oldest first); Agents and Background list recent completions first.
  if (id !== 'todos') order.reverse();
  expect(text.indexOf(order[0])).toBeLessThan(text.indexOf(order[1]));
  expect(text.indexOf(order[1])).toBeLessThan(text.indexOf(order[2]));
  expect(lines(first)[0]).toContain(id === 'todos' ? '3/4' : '✓3 ✗1');
  expect(panel.hasAnimation(44)).toBe(false);
  vi.setSystemTime(200_000);
  expect(panel.renderAt(44, 40)).toBe(first);
  expect(listRows).toHaveBeenCalledTimes(1);
});

const MIXED = { running: 1, queued: 2, completed: 3, failed: 1, cancelled: 4 };

it('shows queued and cancelled counts in the header, queued only from 36 cells', () => {
  releases.push(source('subagents', 'Agents', [agentRow('a', 'one')], MIXED));
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const wide = lines(panel.renderAt(40, 40))[0];
  expect(wide).toContain('◐1 ○2 ✓3 ✗1 ■4');
  expect(panelVisibleWidth(wide)).toBe(40);
  const narrow = lines(panel.renderAt(30, 40))[0];
  expect(narrow).not.toContain('○');
  expect(narrow).toContain('◐1 ✓3 ✗1');
  expect(panelVisibleWidth(narrow)).toBe(30);
});

it('drops ■ before other counts when the header is tight and omits zero queued/cancelled', () => {
  releases.push(
    source('background-tasks', 'Background', [agentRow('b', 'x')], {
      running: 1,
      queued: 2,
      completed: 12,
      failed: 1,
      cancelled: 140,
    }),
  );
  const tight = lines(
    sidebar([{ id: 'background-tasks', visible: true }]).renderAt(36, 40),
  )[0];
  expect(tight).toContain('◐1 ○2 ✓12 ✗1');
  expect(tight).not.toContain('■');
  releases.pop()?.();
  releases.push(
    source('background-tasks', 'Background', [agentRow('b', 'x')], {
      running: 1,
      completed: 0,
      failed: 0,
      queued: 0,
      cancelled: 0,
    }),
  );
  const zero = lines(
    sidebar([{ id: 'background-tasks', visible: true }]).renderAt(40, 40),
  )[0];
  expect(zero).toContain('◐1');
  expect(zero).not.toMatch(/[○■✓✗]/);
});

it('styles the cancelled count muted', () => {
  releases.push(source('subagents', 'Agents', [agentRow('a', 'one')], MIXED));
  const styled: Array<[string, string]> = [];
  const panel = sidebar([{ id: 'subagents', visible: true }], {
    theme: {
      fg: (role, text) => {
        styled.push([role, text]);
        return text;
      },
    },
  });
  panel.renderAt(50, 40);
  expect(styled).toContainEqual(['muted', '■4']);
  expect(styled).toContainEqual(['dim', '○2']);
});
