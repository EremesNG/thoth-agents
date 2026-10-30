import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { afterEach, expect, it } from 'vitest';
import { formatUsd, renderCostRows } from '../src/panels/cost.js';
import {
  sidebar,
  snapshot,
  strip,
  task,
  theme,
  tracker,
  useMode,
} from './fixture.js';

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

it('falls back to the bare command when the normal footer decoration does not fit', () => {
  const rows = cost(tracker([task('a', 1)]), 24);
  expect(rows.at(-2)).toContain('/sidebar cost');
  expect(rows.at(-2)).not.toContain('curves');
  expect(rows.at(-2)).not.toContain('…');
  for (const row of rows) expect(panelVisibleWidth(row)).toBe(24);
});

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

it('retains live and history agents for curves while sidebar bars keep only the label', () => {
  const data = tracker(
    [task('live', 3, { agent: 'thoth-worker', displayName: 'Live label' })],
    [task('old', 1, { agent: 'thoth-reviewer', displayName: 'Old label' })],
  );
  expect(data.ranked().map((entry) => entry.agent)).toEqual([
    'thoth-worker',
    'thoth-reviewer',
  ]);
  const rows = cost(data).join('\n');
  expect(rows).toContain('Live label');
  expect(rows).toContain('Old label');
  expect(rows).not.toContain('thoth-worker');
  expect(rows).not.toContain('thoth-reviewer');
  const revision = data.revision;
  data.update(
    snapshot([
      task('live', 3, { agent: 'thoth-oracle', displayName: 'Live label' }),
    ]),
    2000,
  );
  expect(data.revision).toBe(revision + 1);
  expect(data.ranked()[0].agent).toBe('thoth-oracle');
});

// Worked examples from the accepted design: near-equal costs and a long tail.
const FLAT = [
  ['Phase discovery: map cost chart', 0.12],
  ['Final-verification cost chart', 0.12],
  ['Fresh read-only review', 0.11],
  ['Read-only review of plan', 0.06],
  ['Phase implementation', 0.02],
] as const;
const flat = () =>
  tracker(
    FLAT.map(([name, cost], i) => task(`t${i}`, cost, { displayName: name })),
  );
const longTail = () =>
  tracker([
    task('a', 3.42, {
      displayName: 'Phase implementation: cost sidebar share',
    }),
    task('b', 1.96, { displayName: 'Final-verification cost chart' }),
    task('c', 1.31, { displayName: 'Fresh read-only review' }),
    task('d', 0.88, { displayName: 'Phase discovery: map cost chart' }),
    task('e', 0.27, { displayName: 'Hidden largest' }),
    ...Array.from({ length: 18 }, (_, i) => task(`s${i}`, 0.1)),
  ]);
const SEGMENT = /█*▌|█+|░+/g;
const segments = (rows: string[]) =>
  [...rows[1].slice(2, -2).matchAll(SEGMENT)].map((match) => match[0]);

it('splits the bar by share of the total with largest-remainder cells', () => {
  const rows = cost(flat(), 50, 40, 0.43);
  expect(segments(rows).map((segment) => segment.length)).toEqual([
    13, 13, 12, 6, 2,
  ]);
  expect(rows[1]).toBe(
    `│ ${'█'.repeat(12)}▌${'█'.repeat(12)}▌${'█'.repeat(11)}▌${'█'.repeat(5)}▌██ │`,
  );
});

it('ends every segment but the last in a half block so neighbours stay distinct', () => {
  const parts = segments(cost(flat(), 50, 40, 0.43));
  for (const part of parts.slice(0, -1)) expect(part.endsWith('▌')).toBe(true);
  expect(parts.at(-1)).toBe('██');
});

it('never scales the bar by the largest task and keeps one cell for tiny shares', () => {
  const dominant = cost(
    tracker([task('big', 9, { displayName: 'Big' }), task('tiny', 0.01)]),
    50,
    40,
    9.01,
  );
  expect(segments(dominant).map((segment) => segment.length)).toEqual([45, 1]);
  const half = cost(
    tracker([task('a', 4, { displayName: 'A' }), task('b', 1)]),
    50,
    40,
  );
  expect(segments(half).map((segment) => segment.length)).toEqual([37, 9]);
});

it('fills the whole inner width at every sidebar width', () => {
  for (const width of [24, 28, 36, 50, 72])
    expect(
      segments(cost(flat(), width, 40, 0.43)).reduce(
        (sum, segment) => sum + segment.length,
        0,
      ),
    ).toBe(width - 4);
});

it('renders the remainder entry of a long tail as a trailing light-shade segment', () => {
  const rows = cost(longTail(), 50, 40, 9.64);
  expect(rows[1]).toBe(
    `│ ${'█'.repeat(15)}▌${'█'.repeat(9)}▌${'█'.repeat(5)}▌███▌${'░'.repeat(10)} │`,
  );
});

it('hands the bar and the legend lines to the panel', () => {
  const view = renderCostRows(flat(), 0.43, 50, theme);
  expect(panelVisibleWidth(view.bar)).toBe(46);
  expect(view.entries).toHaveLength(5);
});

it('falls back to the tracked total when no usage total is available', () => {
  const rows = cost(tracker([task('a', 1.25)]), 44, 40, 0);
  expect(rows[0]).toContain('$1.25');
});

it('fills ascii segments with their legend digit and keys the rows by the same digit', () => {
  releases.push(useMode('ascii'));
  const rows = cost(flat(), 50, 40, 0.43);
  expect(rows[1]).toBe(
    `| ${'1'.repeat(13)}${'2'.repeat(13)}${'3'.repeat(12)}${'4'.repeat(6)}55 |`,
  );
  expect(rows.slice(2, 7)).toEqual([
    '| 1 Final-verification cost chart     28% $0.12  |',
    '| 2 Phase discovery: map cost chart   28% $0.12  |',
    '| 3 Fresh read-only review            26% $0.11  |',
    '| 4 Read-only review of plan          14% $0.06  |',
    '| 5 Phase implementation               5% $0.02  |',
  ]);
  expect(rows.at(-2)).toBe(
    '|                         /sidebar cost > curves |',
  );
});

it('fills the ascii remainder segment and marker with dots', () => {
  releases.push(useMode('ascii'));
  const rows = cost(longTail(), 50, 40, 9.64);
  expect(rows[1]).toBe(
    `| ${'1'.repeat(16)}${'2'.repeat(10)}${'3'.repeat(6)}${'4'.repeat(4)}${'.'.repeat(10)} |`,
  );
  expect(rows[6]).toBe('| . +19 more tasks                    21% $2.07  |');
});

it.each([
  [44],
  [36],
  [30],
  [28],
  [24],
])('renders only ascii glyphs at width %i', (width) => {
  releases.push(useMode('ascii'));
  const rows = cost(longTail(), width);
  expect(rows.join('\n')).not.toMatch(/[█▌░●▸↑╭│╰…]/);
  for (const row of rows) expect(panelVisibleWidth(row)).toBe(width);
});

it('lists the ranked tasks under the bar with marker, name, share and amount', () => {
  const rows = cost(flat(), 50, 40, 0.43);
  expect(rows.slice(2, 7)).toEqual([
    '│ ● Final-verification cost chart     28% $0.12  │',
    '│ ● Phase discovery: map cost chart   28% $0.12  │',
    '│ ● Fresh read-only review            26% $0.11  │',
    '│ ● Read-only review of plan          14% $0.06  │',
    '│ ● Phase implementation               5% $0.02  │',
  ]);
  expect(rows.at(-2)).toBe(
    '│                         /sidebar cost ▸ curves │',
  );
  expect(rows[0]).toMatch(/COST .* \$0\.43 ─╮$/);
});

it('end-truncates labels only to the width the share and amount columns leave', () => {
  const data = tracker([
    task('a', 1, {
      displayName: 'Phase implementation: cost sidebar share bar',
    }),
  ]);
  expect(cost(data, 50)[2]).toBe(
    '│ ● Phase implementation: cost side… 100% $1.00  │',
  );
  expect(cost(data, 36)[2]).toBe('│ ● Phase implementat… 100% $1.00  │');
});

it.each([
  [50, 30],
  [36, 14],
])('keeps whole labels of up to the guaranteed width at %i columns', (width, cells) => {
  const name = 'N'.repeat(cells);
  const rows = cost(tracker([task('a', 1, { displayName: name })]), width);
  expect(rows[2]).toContain(` ${name}`);
  expect(rows[2]).not.toContain('…');
  const longer = cost(
    tracker([task('a', 1, { displayName: 'N'.repeat(cells + 40) })]),
    width,
  );
  expect(longer[2]).toContain('…');
});

it('right-aligns amounts and marks shares below one percent', () => {
  const rows = cost(
    tracker([
      task('a', 123.4, { displayName: 'Large' }),
      task('b', 0.5, { displayName: 'Medium' }),
      task('c', 0.01, { displayName: 'Tiny' }),
    ]),
    50,
  );
  expect(rows.slice(2, 5)).toEqual([
    '│ ● Large                            100%  $123  │',
    '│ ● Medium                            <1% $0.50  │',
    '│ ● Tiny                              <1% $0.01  │',
  ]);
});

it('rounds each share on its own, so shares may not add up to 100', () => {
  const rows = cost(
    tracker(
      [task('a', 1), task('b', 1), task('c', 1)].map((t, i) => ({
        ...t,
        displayName: `T${i}`,
      })),
    ),
    50,
  );
  expect(rows.slice(2, 5).map((row) => row.match(/\d+%/)?.[0])).toEqual([
    '33%',
    '33%',
    '33%',
  ]);
});

it('shows at most five entries: five tasks stand alone', () => {
  const rows = cost(flat(), 50, 40, 0.43).join('\n');
  expect(rows).not.toContain('more task');
  expect(rows).not.toContain('░');
  expect(rows.match(/●/g)).toHaveLength(5);
});

it('folds the tasks beyond the top four into a remainder entry with the leftover share and amount', () => {
  const rows = cost(longTail(), 50, 40, 9.64);
  expect(rows.slice(2, 7)).toEqual([
    '│ ● Phase implementation: cost side…  35% $3.42  │',
    '│ ● Final-verification cost chart     20% $1.96  │',
    '│ ● Fresh read-only review            14% $1.31  │',
    '│ ● Phase discovery: map cost chart    9% $0.88  │',
    '│ ░ +19 more tasks                    21% $2.07  │',
  ]);
  expect(rows.at(-2)).toContain('/sidebar cost ▸ curves');
});

it.each([
  [6, '+2 more tasks'],
  [5, '+1 more task'],
])('counts %i tracked tasks as hidden tasks in the remainder', (count, label) => {
  // Five equal tasks fit on their own, so one more cent makes the fifth hidden.
  const tasks = Array.from({ length: count }, (_, i) =>
    task(`t${i}`, 1, { displayName: `T${i}` }),
  );
  const rows = cost(tracker(tasks), 50, 40, count === 5 ? count + 0.01 : count);
  expect(rows.join('\n')).toContain(`░ ${label}`);
  expect(rows.join('\n').match(/●/g)).toHaveLength(4);
});

it('names untracked cost other when every tracked task is already shown', () => {
  const data = tracker([
    task('a', 0.6, { displayName: 'First' }),
    task('b', 0.4, { displayName: 'Second' }),
  ]);
  const rows = cost(data, 50, 40, 1.5);
  expect(rows.slice(2, 5)).toEqual([
    '│ ● First                             40% $0.60  │',
    '│ ● Second                            27% $0.40  │',
    '│ ░ other                             33% $0.50  │',
  ]);
  // Under half a cent is rounding noise and creates no remainder.
  const noisy = cost(data, 50, 40, 1.004).join('\n');
  expect(noisy).not.toContain('other');
  expect(noisy).not.toContain('░');
});

it('drops the share column below an inner width of 28', () => {
  const data = tracker([task('a', 1, { displayName: 'Label' })]);
  // Inner 28 keeps the share beside a 14-cell label; inner 27 gives it back.
  expect(cost(data, 32)[2]).toMatch(/^│ ● Label {10}100% \$1\.00 {2}│$/);
  const narrow = cost(data, 31);
  expect(narrow[2]).toMatch(/^│ ● Label {14}\$1\.00 {2}│$/);
  for (const row of narrow) expect(panelVisibleWidth(row)).toBe(31);
  expect(narrow.join('\n')).not.toContain('%');
  expect(cost(data, 24).join('\n')).not.toContain('%');
});

it('keys segments and rows by rank color, with the remainder and shares muted', () => {
  const tagged = { fg: (role: string, text: string) => `<${role}>${text}</>` };
  const view = renderCostRows(longTail(), 9.64, 50, tagged);
  const roles = [...view.bar.matchAll(/<(\w+)>[^<]+<\/>/g)].map((m) => m[1]);
  expect(roles).toEqual(['warning', 'success', 'mdCode', 'mdLink', 'muted']);
  const markers = view.entries.map((line) => line.match(/^<(\w+)>/)?.[1]);
  expect(markers).toEqual(roles);
  // Names and amounts are default text; the share is muted.
  expect(strip(view.entries[0])).toMatch(
    /^<warning>●<\/> Phase implementation: cost side… <muted> 35%<\/> \$3\.42/,
  );
  expect(view.entries[4]).toMatch(
    /^<muted>░<\/> <muted>\+19 more tasks +<\/> <muted> 21%<\/> <muted>\$2\.07<\/>/,
  );
  // The fifth rank has no theme role, so it keeps its fixed hue.
  const flatView = renderCostRows(flat(), 0.43, 50, tagged);
  expect(flatView.bar).toContain('\x1b[38;2;180;142;240m');
});

it('reports the tasks behind every legend line so folding can count them', () => {
  const view = renderCostRows(longTail(), 9.64, 50, theme);
  expect(view.tasks).toEqual([1, 1, 1, 1, 19]);
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

it('uses startedAt over createdAt when a queued task starts, even without a cost change', () => {
  const data = tracker(
    [task('queued', 1, { status: 'queued', createdAt: 100 })],
    [],
    200,
  );
  data.update(
    snapshot([
      task('queued', 1, { status: 'running', createdAt: 100, startedAt: 1000 }),
    ]),
    2000,
  );
  expect(data.ranked()[0].start).toBe(1000);
});

it('shows only five legend entries while retaining ten tasks for the curves overlay', () => {
  const data = tracker(
    Array.from({ length: 12 }, (_, i) => task(`t${i}`, i + 1)),
  );
  const rows = cost(data);
  expect(rows.filter((row) => /^│ [●░] /.test(row))).toHaveLength(5);
  expect(rows.join('\n')).toContain('+8 more tasks');
  expect(data.ranked()).toHaveLength(10);
  expect(data.count()).toBe(12);
});

const flags = (data: ReturnType<typeof tracker>) =>
  Object.fromEntries(data.ranked().map((entry) => [entry.id, entry.running]));

it.each([
  ['queued', true],
  ['running', true],
  ['stopping', true],
  ['completed', false],
  ['failed', false],
  ['cancelled', false],
  ['interrupted', false],
] as const)('treats a live %s task as running: %s', (status, running) => {
  const data = tracker([task('a', 1, { status })]);
  expect(flags(data)).toEqual({ a: running });
  expect(data.active()).toBe(running);
});

it('does not treat history entries as running, even with a stale running status', () => {
  const data = tracker([], [task('old', 1, { status: 'running' })]);
  expect(flags(data)).toEqual({ old: false });
  expect(data.active()).toBe(false);
});

it('lets the live snapshot decide when a task is in both lists', () => {
  const data = tracker(
    [task('both', 1, { status: 'running' })],
    [task('both', 1, { status: 'completed' })],
  );
  expect(flags(data)).toEqual({ both: true });
});

it('bumps its revision when a running state changes without any cost change', () => {
  const data = tracker([task('a', 1, { status: 'running' })]);
  const revision = data.revision;
  data.update(snapshot([task('a', 1, { status: 'running' })]), 2000);
  expect(data.revision).toBe(revision);
  data.update(snapshot([task('a', 1, { status: 'completed' })]), 3000);
  expect(data.revision).toBe(revision + 1);
  expect(data.active()).toBe(false);
  data.update(snapshot([task('a', 1, { status: 'completed' })]), 4000);
  expect(data.revision).toBe(revision + 1);
});

it('clears running for a task that left the live snapshot without ever ending', () => {
  const data = tracker([
    task('gone', 2, { status: 'running' }),
    task('stays', 1, { status: 'running' }),
  ]);
  expect(data.ranked().every((entry) => entry.end === undefined)).toBe(true);
  const revision = data.revision;
  data.update(snapshot([task('stays', 1, { status: 'running' })]), 2000);
  expect(flags(data)).toEqual({ gone: false, stays: true });
  expect(data.revision).toBe(revision + 1);
  data.update(snapshot([]), 3000);
  expect(flags(data)).toEqual({ gone: false, stays: false });
  expect(data.active()).toBe(false);
  expect(data.revision).toBe(revision + 2);
  // The task stays tracked and ranked for the legend and the curves.
  expect(data.ranked().map((entry) => entry.id)).toEqual(['gone', 'stays']);
});

it('starts running again when a tracked task reappears in the live snapshot', () => {
  const data = tracker([task('a', 1, { status: 'running' })]);
  data.update(snapshot([]), 2000);
  data.update(snapshot([task('a', 1, { status: 'running' })]), 3000);
  expect(flags(data)).toEqual({ a: true });
});

const live = () =>
  tracker([
    task('a', 0.12, { displayName: 'Alpha', status: 'running' }),
    task('b', 0.11, { displayName: 'Beta' }),
  ]);

it('marks running entries in a trailing column that every entry reserves', () => {
  const rows = cost(live(), 50, 40, 0.23);
  expect(rows[2]).toBe('│ ● Alpha                             52% $0.12↑ │');
  expect(rows[3]).toBe('│ ● Beta                              48% $0.11  │');
  // Finishing the task only blanks the reserved cell; nothing reflows.
  const done = cost(
    tracker([
      task('a', 0.12, { displayName: 'Alpha' }),
      task('b', 0.11, { displayName: 'Beta' }),
    ]),
    50,
    40,
    0.23,
  );
  expect(rows.slice(1).map((row) => row.replace('↑', ' '))).toEqual(
    done.slice(1),
  );
});

it('shows the arrow after the header total while any task runs and only then', () => {
  expect(cost(live(), 50, 40, 0.23)[0]).toMatch(/COST .* \$0\.23↑ ─╮$/);
  const idle = cost(tracker([task('a', 0.12), task('b', 0.11)]), 50, 40, 0.23);
  expect(idle[0]).toMatch(/COST .* \$0\.23 ─╮$/);
  expect(idle.join('\n')).not.toContain('↑');
});

it('keeps the remainder entry free of markers while the header still reports a hidden running task', () => {
  const data = tracker([
    ...Array.from({ length: 5 }, (_, i) =>
      task(`big${i}`, 5 - i * 0.1, { displayName: `Big ${i}` }),
    ),
    task('small', 0.5, { displayName: 'Small', status: 'running' }),
  ]);
  const rows = cost(data, 50, 40);
  expect(rows[0]).toMatch(/↑ ─╮$/);
  expect(rows.filter((row) => row.includes('↑'))).toHaveLength(1);
  expect(rows.find((row) => row.includes('more task'))).not.toContain('↑');
});

it('uses a caret as the running arrow in ascii mode', () => {
  releases.push(useMode('ascii'));
  const rows = cost(live(), 50, 40, 0.23);
  expect(rows[0]).toMatch(/\$0\.23\^ -\+$/);
  expect(rows[2]).toBe('| 1 Alpha                             52% $0.12^ |');
  expect(rows.join('\n')).not.toContain('↑');
});

it('paints the arrow with the accent color', () => {
  const tagged = { fg: (role: string, text: string) => `<${role}>${text}</>` };
  const view = renderCostRows(live(), 0.23, 50, tagged);
  expect(view.entries[0]).toContain('<accent>↑</>');
  expect(view.entries[1]).not.toContain('↑');
});
