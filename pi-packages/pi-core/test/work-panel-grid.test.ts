import { visibleWidth } from '@earendil-works/pi-tui';
import { afterEach, expect, it } from 'vitest';
import { registerRenderKit, withdrawRenderKit } from '../src/render-kit.js';
import { createTestRenderKit } from '../src/testing.js';
import type { WorkPanelRow } from '../src/work-panel.js';
import {
  createWorkPanelMetricGrid,
  renderWorkPanelRow,
  workPanelRowLineCount,
} from '../src/work-panel-render.js';

const releases: Array<() => void> = [];
afterEach(() => {
  for (const off of releases.splice(0)) off();
});
const theme = { fg: (_role: string, text: string) => text };
const row = (tools: string, cost: string, ascii = false): WorkPanelRow => ({
  id: tools,
  primary: 'task',
  status: 'completed',
  identity: [
    { text: 'worker', role: 'primary' },
    { text: ' task', role: 'secondary' },
  ],
  metrics: [
    { key: 'cost', segments: [{ text: `$${cost}`, role: 'meta' }] },
    {
      key: 'tools',
      segments: [{ text: `${ascii ? 'tools' : '⚒'} ${tools}`, role: 'meta' }],
    },
    {
      key: 'elapsed',
      segments: [{ text: `${ascii ? 'elapsed' : '◷'} 9s`, role: 'meta' }],
    },
    {
      key: 'model',
      columnsOnly: true,
      segments: [{ text: 'a-model-name-that-is-long·high', role: 'meta' }],
    },
  ],
});
const render = (
  data: WorkPanelRow,
  width: number,
  grid: ReturnType<typeof createWorkPanelMetricGrid>,
) =>
  renderWorkPanelRow(data, {
    width,
    now: 0,
    theme,
    measure: visibleWidth,
    clip: (text) => text,
    metricLayout: 'grid',
    metricGrid: grid,
  });

it.each([
  false,
  true,
])('shares reserved columns across rows, wraps at 30 and inlines at 100 (ascii=%s)', (ascii) => {
  const token = registerRenderKit(createTestRenderKit(), {});
  releases.push(() => withdrawRenderKit(token));
  const rows = [row('9', '0.99', ascii), row('100', '1.00', ascii)];
  const grid = createWorkPanelMetricGrid(rows, visibleWidth);
  expect(grid.map(({ key }) => key)).toEqual([
    'tools',
    'cost',
    'elapsed',
    'model',
  ]);
  for (const width of [30, 44, 100]) {
    const rendered = rows.map((data) => render(data, width, grid));
    expect(rendered[0].length).toBe(rendered[1].length);
    rows.forEach((data, i) => {
      expect(
        workPanelRowLineCount(data, width, visibleWidth, {
          metricLayout: 'grid',
          metricGrid: grid,
        }),
      ).toBe(rendered[i].length);
    });
    for (const lines of rendered) {
      expect(lines.join('\n')).toContain('a-model-name-th…');
      for (const line of lines)
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
    expect(rendered[0].findIndex((line) => line.includes('$'))).toBe(
      rendered[1].findIndex((line) => line.includes('$')),
    );
    expect(rendered[0].find((line) => line.includes('$'))?.indexOf('$')).toBe(
      rendered[1].find((line) => line.includes('$'))?.indexOf('$'),
    );
    if (width === 100) expect(rendered[0]).toHaveLength(1);
    if (width === 30) expect(rendered[0].length).toBeGreaterThan(2);
  }
});

it('keeps missing fields as empty cells and retains entirely empty continuation lines', () => {
  const full = row('100', '1.00');
  const empty = { ...full, metrics: [] };
  const grid = createWorkPanelMetricGrid([full, empty], visibleWidth);
  for (const width of [30, 44, 100]) {
    expect(render(empty, width, grid).length).toBe(
      render(full, width, grid).length,
    );
    expect(
      workPanelRowLineCount(empty, width, visibleWidth, {
        metricLayout: 'grid',
        metricGrid: grid,
      }),
    ).toBe(render(empty, width, grid).length);
  }
});

it('grows the shared column beyond its numeric reservation without losing digits', () => {
  const heights: number[] = [];
  for (const tools of ['99', '100', '1000', '10000', '100000', '1000000']) {
    const rows = [row(tools, '1.00'), row('9', '0.99')];
    const grid = createWorkPanelMetricGrid(rows, visibleWidth);
    const rendered = render(rows[0], 30, grid);
    expect(rendered.join('\n')).toContain(tools);
    expect(render(rows[1], 30, grid).length).toBe(rendered.length);
    heights.push(rendered.length);
  }
  expect(heights.slice(1).every((height, i) => height >= heights[i])).toBe(
    true,
  );
});

it.each([
  false,
  true,
])('sweeps within-reservation values without height changes and matches measured/rendered heights (ascii=%s)', (ascii) => {
  const token = registerRenderKit(createTestRenderKit(), {});
  releases.push(() => withdrawRenderKit(token));
  for (let width = 20; width <= 140; width++) {
    const heights = ['9', '99', '100', '999'].map((tools) => {
      const data = row(tools, tools === '9' ? '0.99' : '10.0', ascii);
      const grid = createWorkPanelMetricGrid([data], visibleWidth);
      const rendered = render(data, width, grid);
      expect(
        workPanelRowLineCount(data, width, visibleWidth, {
          metricLayout: 'grid',
          metricGrid: grid,
        }),
      ).toBe(rendered.length);
      expect(rendered.every((line) => visibleWidth(line) <= width)).toBe(true);
      return rendered.length;
    });
    expect(new Set(heights).size).toBe(1);
  }
});

it('decides inline layout from width and grid only, not identity lengths', () => {
  const token = registerRenderKit(createTestRenderKit(), {});
  releases.push(() => withdrawRenderKit(token));
  const short = row('9', '0.99');
  const long = {
    ...short,
    identity: [
      {
        text: 'a-very-long-worker-agent-name-with-details',
        role: 'primary' as const,
      },
      { text: ' task', role: 'secondary' as const },
    ],
  };
  const grid = createWorkPanelMetricGrid([short, long], visibleWidth);
  for (const width of [30, 60, 75, 100]) {
    expect(render(short, width, grid).length).toBe(
      render(long, width, grid).length,
    );
  }
});

it('retains legacy unkeyed metrics instead of silently dropping them in grid mode', () => {
  const data = row('9', '0.99');
  data.metrics = [{ segments: [{ text: 'elapsed 12s', role: 'meta' }] }];
  expect(
    render(data, 50, createWorkPanelMetricGrid([data], visibleWidth)).join(
      '\n',
    ),
  ).toContain('elapsed 12s');
});
