import {
  registerRenderKit,
  registerWorkPanelProvider,
  resolveIcon,
  WORK_PANEL_VERSION,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import {
  createWorkPanelMetricGrid,
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
] as const)('keeps every metric on stable continuation lines in %s mode at 30/44 cells', (mode) => {
  releases.push(useMode(mode));
  const values =
    mode === 'ascii'
      ? {
          tools: 'tools 99',
          tokens: 'in 9.9k out 99',
          context: 'ctx 9.9%',
          speed: 'tok/s 99',
          cost: '$0.99',
          elapsed: 'elapsed 9s',
          model: 'gpt-5·high',
        }
      : {
          tools: '⚒ 99',
          tokens: '↑9.9k ↓99',
          context: '◔ 9.9%',
          speed: '↯ 99',
          cost: '$0.99',
          elapsed: '◷ 9s',
          model: 'gpt-5·high',
        };
  const row = agentRow('a', 'explorer', 'running', values);
  row.metrics = row.metrics?.map((group) =>
    group.key === 'model' ? { ...group, columnsOnly: true } : group,
  );
  releases.push(source('subagents', 'Agents', [row]));
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  for (const width of [30, 44]) {
    const rendered = lines(panel.renderAt(width, 40));
    const continuation = rendered.slice(2, -2).join('\n').replace(/\s+/g, ' ');
    for (const value of Object.values(values))
      expect(continuation).toContain(value);
    for (const line of rendered) expect(panelVisibleWidth(line)).toBe(width);
    expect(
      row.metrics?.find((group) => group.key === 'model')?.columnsOnly,
    ).toBe(true);
  }
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
        metricLayout: 'grid',
        metricGrid: createWorkPanelMetricGrid(rows, panelVisibleWidth),
      }),
    0,
  );
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
    metricLayout: 'grid',
    metricGrid: createWorkPanelMetricGrid(rows, panelVisibleWidth),
  });
  expect(exposed).toHaveLength(measured + 3);
  for (const line of exposed) expect(panelVisibleWidth(line)).toBe(69);
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

it('does not absorb an empty panel into the sidebar body', () => {
  releases.push(source('todos', 'Todos', []));
  expect(sidebar([{ id: 'todos', visible: true }]).sourceIds()).toEqual([]);
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
          elapsed: `${resolveIcon('elapsed', 'elapsed')} 9s`,
        }),
      ],
      detail: () => null,
      armCloseLabel: () => '',
      close() {},
    }),
  );
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const text = () => lines(panel.renderAt(44, 40)).join('\n');
  expect(text()).toContain('elapsed 9s');
  let clock = '◷';
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name) => (name === 'elapsed' ? clock : (undefined as never)),
    }),
    {},
  );
  releases.push(() => withdrawRenderKit(token));
  expect(text()).toContain('◷ 9s');
  expect(text()).not.toContain('elapsed 9s');
  clock = 'CLOCK';
  expect(text()).toContain('CLOCK 9s');
  withdrawRenderKit(token);
  expect(text()).toContain('elapsed 9s');
  expect(text()).not.toContain('CLOCK 9s');
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
] as const)('keeps grid sidebar row heights stable across digit boundaries in %s mode', (mode) => {
  releases.push(useMode(mode));
  for (const width of [30, 44]) {
    const heights: number[] = [];
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
            metricLayout: 'grid',
            metricGrid: createWorkPanelMetricGrid([row], panelVisibleWidth),
          }) + 3,
        );
        heights.push(rendered.length);
      } finally {
        off();
      }
    }
    expect(new Set(heights).size).toBe(1);
  }
});
