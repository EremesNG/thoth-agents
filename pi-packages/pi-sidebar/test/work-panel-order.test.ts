import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import {
  createWorkPanelColumnPlan,
  panelVisibleWidth,
  workPanelRowLineCount,
} from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it } from 'vitest';
import { agentRow, sidebar, source, strip } from './fixture.js';
import { type Mode, oracleRow } from './oracle-row.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
});

type Id = 'subagents' | 'background-tasks' | 'todos';
const LABELS: Record<Id, string> = {
  subagents: 'Agents',
  'background-tasks': 'Background',
  todos: 'Todos',
};

/** One-line row: elapsed is the only metric. */
function item(
  name: string,
  launched: number,
  finished?: { endedAt: number; failed?: boolean },
  id = name,
) {
  return {
    ...agentRow(
      id,
      name,
      finished ? (finished.failed ? 'failed' : 'completed') : 'running',
      { elapsed: '5s' },
    ),
    state: finished
      ? finished.failed
        ? ('failed' as const)
        : ('done' as const)
      : ('running' as const),
    sortStartedAt: launched,
    endedAt: finished?.endedAt,
  };
}

/** Names in render order. */
function order(id: Id, rows: unknown[], width = 50, height = 40) {
  const off = source(id, LABELS[id], rows as never);
  try {
    const text = sidebar([{ id, visible: true }])
      .renderAt(width, height)
      .map(strip);
    return {
      text,
      names: text
        .map((line) => /[✓✗◐⠀-⣿]\s(\w+)/u.exec(line)?.[1])
        .filter(Boolean),
    };
  } finally {
    off();
  }
}

it.each([
  'subagents',
  'background-tasks',
] as const)('%s lists active rows by launch, then the three most recent completions', (id) => {
  const rows = [
    item('f1', 1, { endedAt: 500 }),
    item('b', 20),
    item('f4', 4, { endedAt: 900 }),
    item('f2', 2, { endedAt: 700, failed: true }),
    item('a', 10),
    item('f3', 3, { endedAt: 800 }),
  ];
  // Activity never reorders: the same rows in any provider order render identically.
  const first = order(id, rows).names;
  const second = order(id, [...rows].reverse()).names;
  expect(first).toEqual(['a', 'b', 'f4', 'f3', 'f2']);
  expect(second).toEqual(first);
});

it('breaks ties by id: active ascending, finished descending (the provider direction)', () => {
  const rows = [
    item('x2', 5, { endedAt: 100 }),
    item('x1', 5, { endedAt: 100 }),
    item('x3', 5, { endedAt: 100 }),
    item('x4', 5, { endedAt: 100 }),
    item('y2', 7),
    item('y1', 7),
  ];
  // Four tied completions keep exactly three, highest ids first.
  expect(order('subagents', rows).names).toEqual([
    'y1',
    'y2',
    'x4',
    'x3',
    'x2',
  ]);
});

it('keeps Background W,X,Y,Z completions as Z,Y,X without W', () => {
  const rows = [
    item('W', 1, { endedAt: 10, failed: true }),
    item('X', 2, { endedAt: 20 }),
    item('Y', 3, { endedAt: 30 }),
    item('Z', 4, { endedAt: 40 }),
  ];
  expect(order('background-tasks', rows).names).toEqual(['Z', 'Y', 'X']);
});

it('keeps Todos in launch order, oldest first, with the last three finished', () => {
  const rows = [
    item('t1', 1, { endedAt: 90 }),
    item('t2', 2, { endedAt: 80 }),
    item('t3', 3, { endedAt: 70 }),
    item('t4', 4, { endedAt: 60 }),
    item('t5', 5),
  ];
  expect(order('todos', rows).names).toEqual(['t2', 't3', 't4', 't5']);
});

it.each([
  'subagents',
  'background-tasks',
] as const)('%s hides the oldest completion first under height pressure, then the oldest active', (id) => {
  const rows = [
    item('a1', 1),
    item('a2', 2),
    item('a3', 3),
    item('f1', 4, { endedAt: 100 }),
    item('f2', 5, { endedAt: 200 }),
    item('f3', 6, { endedAt: 300 }),
  ];
  const everything = ['a1', 'a2', 'a3', 'f3', 'f2', 'f1'];
  for (let height = 4; height <= 9; height++) {
    const { names, text } = order(id, rows, 50, height);
    const hidden = everything.filter((name) => !names.includes(name as never));
    const tag = `${id}/${height}`;
    // Visible rows keep their order; hidden ones leave oldest completion, then oldest active.
    expect(names, tag).toEqual(everything.filter((n) => !hidden.includes(n)));
    const hiddenFinished = hidden.filter((name) => name.startsWith('f'));
    const hiddenActive = hidden.filter((name) => name.startsWith('a'));
    // An active row only leaves after every finished one.
    if (hiddenActive.length) expect(hiddenFinished, tag).toHaveLength(3);
    expect([...hiddenFinished].sort(), tag).toEqual(
      ['f1', 'f2', 'f3'].slice(0, hiddenFinished.length),
    );
    expect(hiddenActive, tag).toEqual(
      ['a1', 'a2', 'a3'].slice(0, hiddenActive.length),
    );
    if (hidden.length)
      expect(text.join('\n'), tag).toContain(`+${hidden.length} more`);
  }
});

/** Provider-shaped `thoth-oracle` rows for the two-line cases. */
function oracles(mode: Mode, count: number, sparse = false) {
  return Array.from({ length: count }, (_, index) => {
    const live = index === 0;
    const base = oracleRow(mode, live ? 'running' : 'completed', '2m 10s');
    return {
      ...base,
      id: `o${index}`,
      sortStartedAt: index,
      endedAt: live ? undefined : 1000 + index,
      // Finished rows may lack context while the running row has it.
      metrics: base.metrics.filter(
        (group) => !(sparse && !live && group.key === 'context'),
      ),
    };
  });
}

function useMode(mode: Mode) {
  if (mode === 'kit') {
    const token = registerRenderKit(createTestRenderKit(), {});
    releases.push(() => withdrawRenderKit(token));
  }
}

it.each([
  'native',
  'kit',
] as const)('overflow counts whole two-line %s rows and never splits one', (mode) => {
  useMode(mode);
  const rows = oracles(mode, 4);
  releases.push(source('subagents', 'Agents', rows as never));
  const panel = sidebar([{ id: 'subagents', visible: true }]);
  for (let height = 3; height <= 14; height++) {
    const text = panel.renderAt(60, height).map(strip);
    const tag = `${mode}/${height}`;
    expect(text.length, tag).toBeLessThanOrEqual(height);
    const identity = text.filter((line) => line.includes('oracle')).length;
    const metrics = text.filter((line) => line.includes('ctx 41.0%')).length;
    // Every visible row keeps both of its lines.
    expect(metrics, tag).toBe(identity);
    const more = /\+(\d+) more/.exec(text.join('\n'));
    if (identity < rows.length && height >= 5)
      expect(Number(more?.[1]), tag).toBe(rows.length - identity);
    else if (identity === rows.length) expect(more, tag).toBeNull();
  }
});

it.each([
  'native',
  'kit',
] as const)('keeps a metric present on only some rows in its priority slot (%s)', (mode) => {
  useMode(mode);
  releases.push(source('subagents', 'Agents', oracles(mode, 3, true) as never));
  const text = sidebar([{ id: 'subagents', visible: true }])
    .renderAt(72, 40)
    .map(strip);
  for (const line of text) expect(panelVisibleWidth(line)).toBe(72);
  const metricLines = text.filter((line) => line.includes('0.42'));
  expect(metricLines).toHaveLength(3);
  // The running row's context precedes its cost; finished rows leave the slot blank so
  // cost, speed and tokens line up across all rows.
  expect(metricLines[0]).toContain('ctx 41.0%');
  expect(metricLines[1]).not.toContain('ctx');
  const column = (line: string) => line.indexOf('0.42');
  expect(column(metricLines[0])).toBeLessThan(
    metricLines[0].indexOf(mode === 'native' ? '88 tok/s' : 'tok/s 88'),
  );
  expect(new Set(metricLines.map(column)).size).toBe(1);
  // Elapsed stays on line 1, never after the metrics.
  expect(metricLines.some((line) => /\d+m \d\ds/.test(line))).toBe(false);
});

it('shows a warning on line 2 in its priority slot once it fits', () => {
  const row = {
    ...oracleRow('native', 'running', '1m 05s', ['⚠ 2 dropped']),
    id: 'w',
  };
  releases.push(source('subagents', 'Agents', [row] as never));
  const at = (width: number) =>
    sidebar([{ id: 'subagents', visible: true }])
      .renderAt(width, 40)
      .map(strip);
  expect(at(60).join('\n')).not.toContain('dropped');
  const wide = at(130);
  expect(wide[1]).not.toContain('dropped');
  expect(wide[2]).toContain('dropped');
  expect(wide[2].indexOf('7')).toBeLessThan(wide[2].indexOf('dropped'));
  expect(wide[2].indexOf('dropped')).toBeLessThan(wide[2].indexOf('gpt-5'));
});

it.each([
  ['todos', 'Todos'],
  ['background-tasks', 'Background'],
] as const)('%s keeps its one-line panel allocation next to Workspace at small heights', (id, label) => {
  releases.push(source(id, label, [item('one', 1)] as never));
  const at = (height: number) =>
    sidebar(
      [
        { id, visible: true },
        { id: 'workspace', visible: true },
      ],
      {
        workspace: () => ({ cwd: '/project' }),
      },
    )
      .renderAt(50, height)
      .map(strip);
  // The previous allocation: the first panel collapses to its title until its row fits.
  const five = at(5);
  expect(five).toHaveLength(5);
  expect(five.join('\n')).not.toContain('one');
  expect(five.join('\n')).toContain('/project');
  const four = at(4);
  expect(four.join('\n')).not.toContain('/project');
  expect(four.join('\n')).not.toContain('one');
  const six = at(6);
  expect(six.join('\n')).toContain('one');
  expect(six.join('\n')).not.toContain('/project');
});

it('Agents keeps a whole two-line row in a tight panel without starving Workspace', () => {
  releases.push(source('subagents', 'Agents', oracles('native', 3) as never));
  const text = sidebar(
    [
      { id: 'subagents', visible: true },
      { id: 'workspace', visible: true },
    ],
    {
      workspace: () => ({ cwd: '/project' }),
    },
  )
    .renderAt(60, 8)
    .map(strip);
  const joined = text.join('\n');
  expect(joined).toContain('oracle');
  expect(joined).toContain('ctx 41.0%');
  // A lone whole row beats a bare count; the row is never split.
  expect(joined.match(/ctx 41\.0%/g)).toHaveLength(1);
  expect(joined).toContain('Path');
});

it.each([
  'native',
  'kit',
] as const)('a model-only row stays one line when line 2 admits no metric it has (%s, 50 cells)', (mode) => {
  useMode(mode);
  const running = oracles(mode, 1)[0];
  const base = oracleRow(mode, 'completed', '3s');
  const cancelled = {
    ...base,
    id: 'cancelled',
    status: 'cancelled',
    statusGlyph: 'cancelled' as never,
    sortStartedAt: 5,
    endedAt: 50,
    metrics: base.metrics.filter(
      (group) => group.key === 'model' || group.key === 'elapsed',
    ),
  };
  releases.push(source('subagents', 'Agents', [running, cancelled] as never));
  const rows = [running, cancelled];
  const text = sidebar([{ id: 'subagents', visible: true }])
    .renderAt(50, 40)
    .map(strip);
  // top + running (2 lines) + cancelled (1 line) + footer + bottom
  expect(text).toHaveLength(2 + 1 + 1 + 1 + 1 + 1 - 1);
  const cancelledAt = text.findIndex((line) => line.includes('3s'));
  expect(text[cancelledAt + 1]).toContain('/subagents');
  expect(text.some((line) => /│\s+│$/.test(line))).toBe(false);
  const grid = createWorkPanelColumnPlan(rows as never, 46, panelVisibleWidth, {
    lines: 2,
  });
  const counts = rows.map((row) =>
    workPanelRowLineCount(row as never, 46, panelVisibleWidth, {
      metricLayout: 'columns',
      metricGrid: grid,
    }),
  );
  expect(counts).toEqual([2, 1]);
});
