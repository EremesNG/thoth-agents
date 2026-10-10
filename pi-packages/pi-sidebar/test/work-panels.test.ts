import {
  registerRenderKit,
  registerWorkPanelProvider,
  resolveIcon,
  WORK_PANEL_VERSION,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import {
  panelVisibleWidth,
  workPanelRowLineCount,
} from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
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
  expect(heading('AGENTS')).toMatch(/1·4·2 ─╮$/);
  expect(heading('TODOS')).toMatch(/2\/5 ─╮$/);
  expect(heading('BACKGROUND')).toMatch(/1·3·0 ─╮$/);
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

it('drops tokens, then cost, then model as width shrinks while elapsed stays', () => {
  releases.push(
    source('subagents', 'Agents', [
      agentRow('a', 'explorer', 'running', FULL_METRICS),
    ]),
  );
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  const row = (width: number) => strip(panel.renderAt(width, 40)[1]);
  expect(row(72)).toContain('↑12k');
  expect(row(72)).toContain('$0.42');
  expect(row(56)).not.toContain('↑12k');
  expect(row(56)).toContain('$0.42');
  expect(row(56)).toContain('gpt-5');
  expect(row(50)).not.toContain('$0.42');
  expect(row(50)).toContain('gpt-5');
  expect(row(40)).not.toContain('gpt-5');
  for (const width of [72, 56, 50, 44, 40, 36, 30, 28])
    expect(row(width)).toContain('1m 05s');
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
      }),
    0,
  );
  // top + rows + footer + bottom
  expect(rendered).toHaveLength(expected + 3);
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
