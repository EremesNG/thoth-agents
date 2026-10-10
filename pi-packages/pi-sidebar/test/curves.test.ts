import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ASCII_MARKERS,
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
  expect(plot).toContain('1');
  expect(plot).toMatch(/[-+|]/);
  expect(plot).not.toMatch(/[─│╯╭╮╰●┤└]/);
  expect(plot).not.toContain('*');
});

it('lists every plotted task with its total in the legend', () => {
  const data = tracker(
    [task('a', 3, { agent: 'thoth-worker', displayName: 'Alpha' })],
    [
      task('b', 1, {
        agent: 'thoth-reviewer',
        displayName: 'Beta',
        startedAt: 0,
        endedAt: 50,
      }),
    ],
  );
  const view = renderCurvesView(data.ranked(), 60, 30, theme).map(strip);
  const text = view.join('\n');
  expect(text).toContain('Subagent cost curves');
  expect(text).toMatch(/● thoth-worker · Alpha +\$3\.00/);
  expect(text).toMatch(/● thoth-reviewer · Beta +\$1\.00/);
  expect(text).toContain('q/Esc close');
  expect(view.length).toBeLessThanOrEqual(30);
});

it('ellipsizes agent and label together at narrow legend widths without duplicating the agent fallback', () => {
  const data = tracker([
    task('derived', 3, {
      agent: 'thoth-worker',
      displayName: 'pi-panel-standard · UNIT 2 (AC-2)',
    }),
    task('fallback', 1, { agent: 'thoth-worker', displayName: 'thoth-worker' }),
  ]);
  const view = renderCurvesView(data.ranked(), 34, 30, theme).map(strip);
  expect(view.join('\n')).toContain('● thoth-worker · pi-p…');
  expect(view.join('\n')).toMatch(/● thoth-worker +\$1\.00/);
  expect(view.join('\n')).not.toContain('thoth-worker · thoth-worker');
  for (const row of view) expect(panelVisibleWidth(row)).toBe(34);
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
    '● worker · Live',
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
        agent: 'worker',
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

// Tagged theme: every role is observable; fixed hues arrive as raw SGR.
const tagged = { fg: (role: string, text: string) => `<${role}>${text}</>` };
const CELL =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: SGR parsing
  /(?:<(\w+)>|\[38;2;([\d;]+)m)(.)(?:<\/>|\[39m)/gu;
const colorsOf = (row: string) =>
  [...row.matchAll(CELL)].map((m) => ({ color: m[1] ?? m[2], glyph: m[3] }));

it('uses ten distinct colors, and the legend color equals the line color', () => {
  const view = renderCurvesView(productionCostTasks(), 100, 40, tagged);
  const legend = view
    .filter((row) => /Production task/.test(strip(row)))
    .map((row) => colorsOf(row).find((c) => c.glyph === '●')?.color);
  expect(legend).toHaveLength(10);
  expect(new Set(legend).size).toBe(10);
  const ends = view
    .flatMap((row) => colorsOf(row))
    .filter((c) => c.glyph === '●');
  // Endpoint dots are drawn in the legend color of their own series.
  for (const end of ends) expect(legend).toContain(end.color);
});

it('colors every plot cell of a series with that series color, solo or overlapped', () => {
  const series = curveSeries(productionCostTasks());
  const legend = renderCurvesView(productionCostTasks(), 100, 40, tagged)
    .filter((row) => /Production task/.test(strip(row)))
    .map((row) => colorsOf(row).find((c) => c.glyph === '●')?.color);
  for (const line of series) {
    const rows = renderCurvePlot([line], 100, 14, tagged).slice(0, -2);
    const cells = rows.flatMap(colorsOf);
    expect(cells.length).toBeGreaterThan(0);
    // A lone series is index 0; every one of its cells carries that color.
    for (const cell of cells.filter((c) => c.glyph !== '┤'))
      expect(cell.color).toBe(legend[0]);
  }
  // Overlapped plot: no line cell is ever neutral or unstyled.
  const all = renderCurvePlot(series, 100, 14, tagged).slice(0, -2);
  for (const row of all) {
    const plot = row.slice(row.indexOf('┤') + 1);
    const painted = colorsOf(plot).length;
    const glyphs = strip(plot)
      .replace(/<\/?\w*>/g, '')
      .replaceAll(' ', '');
    expect(painted).toBe([...glyphs].length);
    for (const cell of colorsOf(plot)) expect(legend).toContain(cell.color);
  }
});

it('resolves overlaps deterministically: end markers win, then the later series', () => {
  const flat = (cost: number, at: number) => ({
    label: 'x',
    cost,
    points: [
      { at: 0, cost: 0 },
      { at, cost },
    ],
  });
  const a = renderCurvePlot([flat(2, 100), flat(2, 100)], 16, 8, tagged);
  const b = renderCurvePlot([flat(2, 100), flat(2, 100)], 16, 8, tagged);
  expect(a).toEqual(b);
  // Identical curves share every cell, so the later series owns all of them.
  const later = renderCurvePlot([flat(2, 100)], 16, 8, tagged);
  const owners = new Set(
    a
      .slice(0, -2)
      .flatMap((row) => colorsOf(row.slice(row.indexOf('┤') + 1)))
      .map((c) => c.color),
  );
  expect(owners).toEqual(new Set(['warning']));
  expect(later.join()).toContain('<error>');
});

it('keeps ascii series distinguishable with distinct markers in plot and legend', () => {
  releases.push(useMode('ascii'));
  const tasks = productionCostTasks();
  const view = renderCurvesView(tasks, 100, 40, theme).map(strip);
  const legend = view
    .filter((row) => /Production task/.test(row))
    .map((row) => row.match(/(\S) worker · Production/)?.[1]);
  expect(legend).toEqual([...ASCII_MARKERS]);
  const plot = view.join('\n');
  for (const marker of ASCII_MARKERS) expect(plot).toContain(marker);
});

// Real Pi Theme built from the shipped thoth theme, in both color modes.
const BG_KEYS = [
  'selectedBg',
  'searchMatchBg',
  'userMessageBg',
  'customMessageBg',
  'toolPendingBg',
  'toolSuccessBg',
  'toolErrorBg',
];
const thothTheme = (mode: '256color' | 'truecolor') => {
  const json = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL('../../pi-thoth-theme/themes/thoth.json', import.meta.url),
      ),
      'utf-8',
    ),
  ) as {
    vars: Record<string, string | number>;
    colors: Record<string, string | number>;
  };
  const entries = Object.entries(json.colors).map(([key, value]) => [
    key,
    typeof value === 'string' && value in json.vars ? json.vars[value] : value,
  ]);
  const part = (bg: boolean) =>
    Object.fromEntries(
      entries.filter(([k]) => BG_KEYS.includes(k as string) === bg),
    );
  return new Theme(part(false) as never, part(true) as never, mode);
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: SGR parsing
const REAL_CELL = /\u001b\[(38;[25](?:;\d+)+)m([^\u001b])/gu;
const realColors = (rows: string[]) =>
  rows.flatMap((row) =>
    [...row.matchAll(REAL_CELL)].map((m) => ({ color: m[1], glyph: m[2] })),
  );

for (const mode of ['truecolor', '256color'] as const) {
  it(`paints ten distinct series in ${mode} with legend == line color`, () => {
    const real = thothTheme(mode);
    const view = renderCurvesView(productionCostTasks(), 100, 40, real);
    const legend = view
      .filter((row) => /Production task/.test(strip(row)))
      .map((row) => realColors([row]).find((c) => c.glyph === '●')?.color);
    expect(legend).toHaveLength(10);
    expect(new Set(legend).size).toBe(10);
    for (const cell of realColors(view).filter((c) => c.glyph === '●'))
      expect(legend).toContain(cell.color);
    if (mode === '256color') {
      expect(view.join('')).not.toContain('38;2;');
      expect(legend.every((c) => c?.startsWith('38;5;'))).toBe(true);
    } else {
      const rgb = legend.map((c) => (c ?? '').split(';').slice(2).map(Number));
      let nearest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < rgb.length; i++)
        for (let j = i + 1; j < rgb.length; j++)
          nearest = Math.min(
            nearest,
            Math.hypot(...rgb[i].map((v, k) => v - rgb[j][k])),
          );
      expect(nearest).toBeGreaterThan(70);
    }
  });
}
