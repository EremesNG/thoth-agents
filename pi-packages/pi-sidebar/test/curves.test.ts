import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import {
  curveSeries,
  openCostCurves,
  renderCurvePlot,
  renderCurvesView,
} from '../src/curves.js';
import {
  productionCostTasks,
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

const progressing = () => {
  const data = tracker([]);
  for (const [at, cost] of [
    [1000, 0.1],
    [2000, 0.5],
    [3000, 1],
  ] as const)
    data.update(
      snapshot([
        task('live', cost, {
          status: 'running',
          displayName: 'Live',
          startedAt: 1000,
        }),
      ]),
      at,
    );
  return data;
};

it('plots samples against each task start, with the axis spanning the longest task duration', () => {
  const data = progressing();
  data.update(
    snapshot([
      task('late', 2, {
        startedAt: 86000000,
        endedAt: 86005000,
      }),
    ]),
    86005000,
  );
  const series = curveSeries(data.ranked(), 6000);
  expect(series[0].points).toEqual([
    { at: 0, cost: 0 },
    { at: 5000, cost: 2 },
  ]);
  expect(series[1].points).toEqual([
    { at: 0, cost: 0 },
    { at: 0, cost: 0.1 },
    { at: 1000, cost: 0.5 },
    { at: 2000, cost: 1 },
    { at: 5000, cost: 1 },
  ]);
  expect(renderCurvePlot(series, 30, 8, theme).map(strip).at(-1)).toMatch(
    /0 +5s$/,
  );
});

it('draws a straight start-to-end segment for tasks without samples', () => {
  const data = tracker(
    [],
    [task('old', 2, { displayName: 'Old', startedAt: 100, endedAt: 900 })],
  );
  expect(data.ranked()[0].samples).toEqual([]);
  expect(curveSeries(data.ranked(), 4000)[0].points).toEqual([
    { at: 0, cost: 0 },
    { at: 800, cost: 2 },
  ]);
});

it('prefixes a zero point when the first sample came after the task started', () => {
  const data = tracker(
    [task('late', 1, { status: 'running', createdAt: 0, startedAt: 500 })],
    [],
    4000,
  );
  expect(curveSeries(data.ranked(), 4000)[0].points).toEqual([
    { at: 0, cost: 0 },
    { at: 3500, cost: 1 },
  ]);
});

it('renders box-drawing lines with axis labels and an end marker', () => {
  const plot = renderCurvePlot(
    curveSeries(progressing().ranked(), 3000),
    30,
    8,
    theme,
  );
  const text = plot.map(strip);
  expect(text).toHaveLength(8);
  expect(text[0]).toMatch(/^\$1\.00┤/);
  expect(text[5]).toMatch(/^\$0\.00┤/);
  expect(text.join('\n')).toMatch(/[─╯╭│]/);
  expect(text.join('\n')).toContain('●');
  expect(text[6]).toMatch(/^ +└─+$/);
  expect(text[7]).toMatch(/0 +2s$/);
});

it('renders ASCII-only lines using * + - |', () => {
  releases.push(useMode('ascii'));
  const plot = renderCurvePlot(
    curveSeries(progressing().ranked(), 3000),
    30,
    8,
    theme,
  )
    .map(strip)
    .join('\n');
  expect(plot).toContain('*');
  expect(plot).toMatch(/[-+|]/);
  expect(plot).not.toMatch(/[─│╯╭╮╰●┤└]/);
});

it('lists every plotted task with its total in the legend', () => {
  const data = tracker(
    [task('a', 3, { displayName: 'Alpha' })],
    [task('b', 1, { displayName: 'Beta', startedAt: 0, endedAt: 50 })],
  );
  const view = renderCurvesView(data.ranked(), 60, 30, theme).map(strip);
  const text = view.join('\n');
  expect(text).toContain('Subagent cost curves');
  expect(text).toMatch(/● Alpha +\$3\.00/);
  expect(text).toMatch(/● Beta +\$1\.00/);
  expect(text).toContain('q/Esc close');
  expect(view.length).toBeLessThanOrEqual(30);
});

it('says so when nothing has been spent', () => {
  const view = renderCurvesView([], 60, 20, theme).map(strip).join('\n');
  expect(view).toContain('No subagent cost recorded yet.');
});

it('fits short terminals by dropping the legend first', () => {
  const data = tracker(
    Array.from({ length: 6 }, (_, i) =>
      task(`t${i}`, i + 1, { displayName: `T${i}` }),
    ),
  );
  for (const height of [20, 12, 8, 5, 3]) {
    const view = renderCurvesView(data.ranked(), 50, height, theme);
    expect(view.length).toBeLessThanOrEqual(height);
  }
});

function overlayHarness() {
  let component:
    | { render(width: number): string[]; handleInput?(data: string): void }
    | undefined;
  const custom = vi.fn(async (factory: any) => {
    return await new Promise((resolve) => {
      Promise.resolve(
        factory(
          {
            mode: 'fullscreen',
            terminal: { rows: 40, write() {} },
            requestRender() {},
          },
          theme,
          {},
          resolve,
        ),
      ).then((created) => {
        component = created;
      });
    });
  });
  return {
    ctx: { ui: { custom } } as unknown as ExtensionContext,
    custom,
    get component() {
      return component;
    },
  };
}

it.each([
  ['q', 'q'],
  ['Escape', '\u001b'],
])('opens an owned overlay and closes it on %s', async (_name, key) => {
  const harness = overlayHarness();
  const data = progressing();
  const done = openCostCurves(harness.ctx, data);
  await vi.waitFor(() => expect(harness.component).toBeDefined());
  expect(harness.custom).toHaveBeenCalledOnce();
  expect(harness.component?.render(80).map(strip).join('\n')).toContain(
    '● Live',
  );
  harness.component?.handleInput?.('x');
  let closed = false;
  void done.then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  harness.component?.handleInput?.(key);
  await expect(done).resolves.toBeUndefined();
});

it('reads fresh tracker data on every render while open', async () => {
  const harness = overlayHarness();
  const data = tracker([]);
  const done = openCostCurves(harness.ctx, data);
  await vi.waitFor(() => expect(harness.component).toBeDefined());
  expect(harness.component?.render(80).map(strip).join('\n')).toContain(
    'No subagent cost',
  );
  data.update(snapshot([task('a', 2, { displayName: 'Arrived' })]), 5000);
  expect(harness.component?.render(80).map(strip).join('\n')).toContain(
    'Arrived',
  );
  harness.component?.handleInput?.('q');
  await done;
});

it.each([
  [60000, '60s'],
  [120000, '2m'],
  [7200000, '2.0h'],
])('labels an elapsed duration of %i ms as %s', (elapsed, label) => {
  const data = tracker(
    [],
    [task('history', 1, { createdAt: 86000000, endedAt: 86000000 + elapsed })],
  );
  const series = curveSeries(data.ranked());
  expect(series[0].points).toEqual([
    { at: 0, cost: 0 },
    { at: elapsed, cost: 1 },
  ]);
  expect(renderCurvePlot(series, 30, 8, theme).map(strip).at(-1)).toContain(
    label,
  );
});

it('preserves empty plot cells for production-shaped history curves', () => {
  const start = 1791600000000;
  const data = tracker(
    [],
    Array.from({ length: 10 }, (_, i) =>
      task(`persisted-${i}`, 4.62 - i * 0.25, {
        startedAt: start + i * 10000,
        endedAt: start + i * 10000 + (i + 1) * 120000,
      }),
    ),
  );
  const plot = renderCurvePlot(curveSeries(data.ranked()), 114, 16, theme).map(
    strip,
  );
  // Blank x coordinates must occupy cells, not collapse toward the y axis.
  expect(plot.slice(0, -2).every((row) => row.length === 114)).toBe(true);
  expect(plot[0].indexOf('●')).toBe(17);
  expect(plot[0].slice(6, 15)).toBe(' '.repeat(9));
});

it('normalizes unordered absolute cumulative samples, preserving origin and final cost', () => {
  expect(
    curveSeries([
      {
        id: 'a',
        label: 'A',
        start: 1791600000000,
        end: 1791600003000,
        cost: 4,
        samples: [
          { at: 1791600002000, cost: 3 },
          { at: 1791600000000, cost: 1 },
          { at: 1791600001000, cost: 2 },
          { at: 1791600002500, cost: 2.5 },
        ],
      },
    ])[0].points,
  ).toEqual([
    { at: 0, cost: 0 },
    { at: 0, cost: 1 },
    { at: 1000, cost: 2 },
    { at: 2000, cost: 3 },
    { at: 2500, cost: 3 },
    { at: 3000, cost: 4 },
  ]);
});

it('connects short task endpoints and retains both paths at intersections', () => {
  const plot = renderCurvePlot(
    [
      {
        label: 'short',
        cost: 2,
        points: [
          { at: 0, cost: 0 },
          { at: 1, cost: 2 },
        ],
      },
      {
        label: 'long',
        cost: 2,
        points: [
          { at: 0, cost: 0 },
          { at: 100, cost: 2 },
        ],
      },
    ],
    16,
    8,
    theme,
  ).map(strip);
  // A sub-cell duration still gets a continuous vertical path to its end.
  expect(plot.slice(0, 6).every((row) => row[6] !== ' ')).toBe(true);
  expect(plot[5][6]).toBe('└'); // shared origin retains up and right connections
});

it('renders each production-shaped task as a connected monotonic origin-to-end path', () => {
  const series = curveSeries(productionCostTasks());
  for (const line of series) {
    const plot = renderCurvePlot([line], 46, 12, theme).map(strip).slice(0, 10);
    // Every elapsed column has a connected cell; rising y never goes backward.
    let previous = 9;
    for (let col = 6; col < 46; col++) {
      const occupied = plot
        .map((row, i) => (row[col] !== ' ' ? i : -1))
        .filter((i) => i >= 0);
      expect(occupied.length).toBeGreaterThan(0);
      expect(Math.max(...occupied)).toBe(previous);
      previous = Math.min(...occupied);
    }
    expect(plot[9][6]).not.toBe(' ');
    expect(plot[0][45]).toBe('●');
  }
});
