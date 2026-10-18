import { expect, it } from 'vitest';
import {
  registerRenderKit,
  type WorkPanelRow,
  withdrawRenderKit,
} from '../src/index.js';
import {
  createWorkPanelColumnPlan,
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
  workPanelRowLineCount,
} from '../src/panel.js';
import { createTestRenderKit } from '../src/testing.js';

const plain = { fg: (_role: string, text: string) => text };

function agent(
  id: string,
  status: 'running' | 'completed',
  extra: Record<string, string> = {},
  summary = 'mapping the renderer pipeline',
  elapsed = status === 'running' ? '1m 05s' : '9s',
): WorkPanelRow {
  const metric = (key: string, text: string) => ({
    key: key as never,
    segments: [{ text, role: 'meta' as const }],
  });
  return {
    id,
    primary: summary,
    status,
    identity: [
      { text: 'scout', role: 'primary' },
      { text: ' · ', role: 'meta' },
      { text: summary, role: 'secondary' },
    ],
    metrics: [
      ...Object.entries(extra).map(([key, text]) => metric(key, text)),
      metric('elapsed', elapsed),
    ],
  };
}

const plan = (rows: WorkPanelRow[], width: number, lines?: 1 | 2) =>
  createWorkPanelColumnPlan(
    rows,
    width,
    panelVisibleWidth,
    lines ? { lines } : undefined,
  );
const options = (width: number, metricGrid: ReturnType<typeof plan>) => ({
  width,
  now: 0,
  theme: plain,
  clip: truncatePanelText,
  measure: panelVisibleWidth,
  metricLayout: 'columns' as const,
  metricGrid,
});

function modes(run: () => void) {
  run();
  const token = registerRenderKit(createTestRenderKit(), {});
  try {
    run();
  } finally {
    withdrawRenderKit(token);
  }
}

it('renders the two-line form: identity and elapsed, then metrics under the name', () => {
  modes(() => {
    const rows = [
      agent('a', 'running', { context: 'ctx 41.0%', cost: '$0.42' }),
      agent('b', 'completed', { cost: '$1.10' }),
      agent('c', 'completed'),
    ];
    const grid = plan(rows, 50, 2);
    const [first, second, third] = rows.map((row) =>
      renderWorkPanelRow(row, options(50, grid)),
    );
    expect(first).toHaveLength(2);
    expect(first[0]).toMatch(/scout · mapping.*1m 05s$/u);
    expect(first[1]).toContain('ctx 41.0%');
    // Cost keeps its slot after context; rows lacking context pad the slot.
    expect(second).toHaveLength(2);
    expect(second[1].indexOf('$1.10')).toBe(first[1].indexOf('$0.42'));
    // A row with no metric besides elapsed stays one line.
    expect(third).toHaveLength(1);
    for (const row of rows)
      expect(
        workPanelRowLineCount(row, 50, panelVisibleWidth, {
          metricLayout: 'columns',
          metricGrid: grid,
        }),
      ).toBe(row.id === 'c' ? 1 : 2);
  });
});

it('keeps the line count and line-2 columns when digit widths change', () => {
  modes(() => {
    const render = (speed: string, elapsed: string) => {
      const row = agent(
        'a',
        'running',
        { context: 'ctx 41.0%', cost: '$0.42', speed },
        undefined,
        elapsed,
      );
      return renderWorkPanelRow(row, options(72, plan([row], 72, 2)));
    };
    const a = render('99 tok/s', '9s');
    const b = render('100 tok/s', '10s');
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    for (const lines of [a, b])
      for (const text of ['ctx', '$0', 'tok/s'])
        expect(lines[1]).toContain(text);
  });
});

it('hides a summary under four cells and keeps complete short summaries', () => {
  const metrics = { context: 'ctx 41.0%', cost: '$0.42' };
  const long = agent('a', 'running', metrics, 'reviewing the migration plan');
  const short = agent('b', 'running', metrics, 'ok');
  const render = (row: WorkPanelRow, width: number) =>
    renderWorkPanelRow(row, options(width, plan([row], width, 2)))[0];
  expect(render(short, 28)).toContain('ok');
  for (let width = 22; width <= 30; width++) {
    const tight = render(long, width);
    expect(tight).toContain('scout');
    const fragment = /scout · (\S*?)…?\s+·/u.exec(tight)?.[1];
    // Truncated text shows at least four cells, otherwise the summary and separator go.
    if (fragment !== undefined)
      expect(panelVisibleWidth(`${fragment}…`), tight).toBeGreaterThanOrEqual(
        4,
      );
    expect(tight, String(width)).not.toMatch(/·\s*…/u);
  }
  expect(render(long, 50)).toMatch(/reviewing/u);
});

it('keeps sparse metrics in priority slots for mixed running and finished rows', () => {
  modes(() => {
    const rows = [
      agent('f1', 'completed', { cost: '$1.10' }),
      agent('f2', 'completed', { cost: '$0.20' }),
      agent('r', 'running', { cost: '$0.42', context: 'ctx 41.0%' }),
    ];
    const grid = plan(rows, 120);
    expect(grid.map(({ key }) => key)).toEqual(['context', 'cost', 'elapsed']);
    const [line] = renderWorkPanelRow(rows[2], options(120, grid));
    expect(line.indexOf('ctx 41.0%')).toBeLessThan(line.indexOf('$0.42'));
    expect(line.indexOf('$0.42')).toBeLessThan(line.indexOf('1m 05s'));
  });
});
