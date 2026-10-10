import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { afterEach, expect, it } from 'vitest';
import { costBar, formatUsd } from '../src/panels/cost.js';
import { sidebar, snapshot, strip, task, tracker, useMode } from './fixture.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0).reverse()) off();
});

const cost = (
  data: ReturnType<typeof tracker>,
  width = 44,
  height = 40,
  subagentCost = 0,
) =>
  sidebar([{ id: 'cost', visible: true }], {
    cost: () => data,
    subagentCost: () => subagentCost,
  })
    .renderAt(width, height)
    .map(strip);

it('ranks live and persisted tasks by cost, deduplicating by id with live data winning', () => {
  const data = tracker(
    [
      task('live', 0.5, { displayName: 'Live scan', status: 'running' }),
      task('both', 2, { displayName: 'Rewritten' }),
    ],
    [
      task('old', 3, { displayName: 'Old refactor' }),
      task('both', 1, { displayName: 'Stale name' }),
    ],
  );
  expect(data.ranked().map((entry) => [entry.label, entry.cost])).toEqual([
    ['Old refactor', 3],
    ['Rewritten', 2],
    ['Live scan', 0.5],
  ]);
  expect(data.total()).toBe(5.5);
});

it('labels by display name, falling back to the agent and then the id', () => {
  const data = tracker([
    task('t1', 4, { displayName: ' Named ' }),
    task('t2', 3, { displayName: '  ', agent: 'oracle' }),
    task('t3', 2, { agent: '' as never }),
  ]);
  expect(data.ranked().map((entry) => entry.label)).toEqual([
    'Named',
    'oracle',
    't3',
  ]);
});

it('keeps only the ten most expensive tasks and ignores tasks without cost', () => {
  const data = tracker([
    ...Array.from({ length: 14 }, (_, i) => task(`t${i}`, i + 1)),
    task('free', 0),
    { ...task('none', 1), usage: undefined },
  ]);
  const ranked = data.ranked();
  expect(ranked).toHaveLength(10);
  expect(ranked[0].cost).toBe(14);
  expect(ranked[9].cost).toBe(5);
});

it('bumps its revision only when the ranking inputs change', () => {
  const data = tracker([task('a', 1)]);
  const revision = data.revision;
  data.update(snapshot([task('a', 1)]), 2000);
  expect(data.revision).toBe(revision);
  data.update(snapshot([task('a', 1.5)]), 3000);
  expect(data.revision).toBe(revision + 1);
});

it('scales bars to the largest cost with eighth-block resolution', () => {
  expect(costBar(1, 10)).toBe('██████████');
  expect(costBar(0.5, 10)).toBe('█████');
  expect(costBar(0.55, 10)).toBe('█████▌');
  // 1/8 of a cell is the smallest visible bar.
  expect(costBar(0.001, 10)).toBe('▏');
  expect(costBar(0, 10)).toBe('');
  expect(costBar(1, 0)).toBe('');
});

it('renders bars relative to the maximum with right-aligned costs and a header total', () => {
  const rows = cost(
    tracker([
      task('a', 4, { displayName: 'Big' }),
      task('b', 1, { displayName: 'Small' }),
    ]),
    44,
    40,
    5,
  );
  expect(rows[0]).toMatch(/COST .* \$5\.00 ─╮$/);
  const [big, small] = rows.slice(1, 3);
  expect(big).toMatch(/^│ Big {10}█+ +\$4\.00 │$/);
  expect(small).toMatch(/^│ Small {8}[█▏▎▍▌▋▊▉]+ +\$1\.00 │$/);
  const bar = (row: string) => (row.match(/[█▏▎▍▌▋▊▉]+/) ?? [''])[0];
  expect(panelVisibleWidth(bar(big))).toBeGreaterThan(
    panelVisibleWidth(bar(small)) * 3,
  );
  expect(rows.at(-2)).toContain('/sidebar cost ▸ curves');
  expect(rows.at(-2)).toMatch(/ {3,}\/sidebar/);
});

it('falls back to the tracked total when no usage total is available', () => {
  const rows = cost(tracker([task('a', 1.25)]), 44, 40, 0);
  expect(rows[0]).toContain('$1.25');
});

it.each([
  [44],
  [30],
  [28],
])('renders ascii bars with # at width %i', (width) => {
  releases.push(useMode('ascii'));
  const rows = cost(
    tracker([
      task('a', 4, { displayName: 'Big' }),
      task('b', 2, { displayName: 'Half' }),
    ]),
    width,
  );
  const text = rows.join('\n');
  expect(text).toMatch(/#+/);
  expect(text).not.toMatch(/[█▏▎▍▌▋▊▉▸╭│]/);
  expect(rows.at(-2)).toContain('/sidebar cost > curves');
  for (const row of rows) expect(panelVisibleWidth(row)).toBe(width);
});

it('truncates long labels with an ellipsis inside the label column', () => {
  const rows = cost(
    tracker([task('a', 4, { displayName: 'A very long task display name' })]),
  );
  expect(rows[1]).toMatch(/^│ A very long… /);
});

it('shows one title line carrying the command when there is no cost', () => {
  for (const width of [44, 28]) {
    const rows = cost(tracker([]), width);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('COST');
    expect(rows[0]).toContain('/sidebar cost');
  }
});

it('formats amounts compactly', () => {
  expect(formatUsd(0.004)).toBe('$0.00');
  expect(formatUsd(1.234)).toBe('$1.23');
  expect(formatUsd(12.34)).toBe('$12.3');
  expect(formatUsd(123.4)).toBe('$123');
});

it('bounds recorded samples and tracked tasks', () => {
  const data = tracker([]);
  for (let i = 1; i <= 400; i++)
    data.update(snapshot([task('grow', i, { status: 'running' })]), i * 10);
  const grow = data.ranked()[0];
  expect(grow.samples.length).toBeLessThanOrEqual(120);
  expect(grow.samples[0].cost).toBe(1);
  expect(grow.samples.at(-1)?.cost).toBe(400);
  data.update(
    snapshot(
      Array.from({ length: 300 }, (_, i) => task(`bulk${i}`, 0.001 * (i + 1))),
    ),
    9999,
  );
  expect(data.total()).toBeGreaterThan(400);
  expect(data.ranked()[0].cost).toBe(400);
});
