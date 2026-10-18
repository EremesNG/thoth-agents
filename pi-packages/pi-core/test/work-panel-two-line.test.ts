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

const tagged = { fg: (role: string, text: string) => `<${role}>${text}</>` };
const roleOptions = (width: number, metricGrid: ReturnType<typeof plan>) => ({
  ...options(width, metricGrid),
  theme: tagged,
});
/** Role of every non-blank run on a tagged line. */
const rolesOf = (line: string) =>
  [...line.matchAll(/<(\w+)>([^<]*)<\/>/gu)]
    .filter(([, , text]) => text.trim())
    .map(([, role]) => role);

function metricRow(
  status: 'running' | 'completed',
  groups: Record<string, { text: string; pending?: boolean }>,
): WorkPanelRow {
  const row = agent('r', status);
  return {
    ...row,
    metrics: [
      ...Object.entries(groups).map(([key, { text, pending }]) => ({
        key: key as never,
        ...(pending ? { pending } : {}),
        segments: [{ text, role: 'meta' as const }],
      })),
      ...(row.metrics ?? []),
    ],
  };
}

it('blanks pending line-2 metrics at their reserved width without moving columns', () => {
  modes(() => {
    const launched = metricRow('running', {
      context: { text: 'ctx ?', pending: true },
      cost: { text: '$0.00', pending: true },
      model: { text: 'gpt-5' },
    });
    const finished = metricRow('completed', {
      context: { text: 'ctx 41.0%' },
      cost: { text: '$0.00' },
      model: { text: 'gpt-5' },
    });
    const grid = plan([launched, finished], 50, 2);
    const [a, b] = [launched, finished].map(
      (row) => renderWorkPanelRow(row, options(50, grid))[1],
    );
    expect(a).not.toMatch(/\?|\$0\.00/u);
    expect(b).toContain('$0.00');
    expect(a.indexOf('gpt-5')).toBe(b.indexOf('gpt-5'));
    expect(panelVisibleWidth(a)).toBe(panelVisibleWidth(b));
  });
});

it('keeps pending groups visible outside the two-line columns layout', () => {
  const row = metricRow('running', {
    context: { text: 'ctx ?', pending: true },
  });
  const greedy = renderWorkPanelRow(row, {
    ...options(50, plan([row], 50)),
    metricLayout: 'greedy',
  });
  expect(greedy.join('\n')).toContain('ctx ?');
  const columns = renderWorkPanelRow(row, options(60, plan([row], 60)));
  expect(columns.join('\n')).toContain('ctx ?');
});

it.each([
  ['69.9', 'dim'],
  ['70.0', 'warning'],
  ['89.9', 'warning'],
  ['90.0', 'error'],
] as const)('colors running context %s%% as %s', (value, role) => {
  const row = metricRow('running', { context: { text: `ctx ${value}%` } });
  const line = renderWorkPanelRow(row, roleOptions(50, plan([row], 50, 2)))[1];
  expect(line).toContain(`<${role}>ctx ${value}%`);
});

it('renders every line-2 metric of a finished row in the dim role', () => {
  const row = metricRow('completed', {
    context: { text: 'ctx 95.0%' },
    cost: { text: '$0.42' },
    speed: { text: '12 tok/s' },
    tokens: { text: '↑1k ↓2' },
    model: { text: 'gpt-5' },
  });
  const rows = renderWorkPanelRow(row, roleOptions(90, plan([row], 90, 2)));
  expect(rows[1]).toContain('$0.42');
  expect(new Set(rolesOf(rows[1]))).toEqual(new Set(['dim']));
  const running = metricRow('running', { cost: { text: '$0.42' } });
  expect(
    renderWorkPanelRow(running, roleOptions(50, plan([running], 50, 2)))[1],
  ).toContain('<warning>$0.42');
});

it('draws an all-pending line 2 as blank spaces of the full width', () => {
  modes(() => {
    const pending = (text: string) => ({ text, pending: true });
    const launched = metricRow('running', {
      context: pending('ctx ?'),
      cost: pending('$0.00'),
      speed: pending('? tok/s'),
    });
    const finished = metricRow('completed', {
      context: { text: 'ctx 41.0%' },
      cost: { text: '$0.42' },
      speed: { text: '12 tok/s' },
    });
    const grid = plan([launched, finished], 60, 2);
    const [a, b] = [launched, finished].map(
      (row) => renderWorkPanelRow(row, options(60, grid))[1],
    );
    expect(a.trim()).toBe('');
    expect(a).not.toContain('·');
    expect(panelVisibleWidth(a)).toBe(panelVisibleWidth(b));
  });
});

it('shows one separator between visible values around a pending slot', () => {
  modes(() => {
    const mixed = metricRow('running', {
      context: { text: 'ctx 41.0%' },
      cost: { text: '$0.00', pending: true },
      speed: { text: '12 tok/s' },
    });
    const full = metricRow('completed', {
      context: { text: 'ctx 41.0%' },
      cost: { text: '$0.42' },
      speed: { text: '12 tok/s' },
    });
    const grid = plan([mixed, full], 60, 2);
    const [a, b] = [mixed, full].map(
      (row) => renderWorkPanelRow(row, options(60, grid))[1],
    );
    expect(a.match(/·/gu)).toHaveLength(1);
    expect(a.indexOf('12 tok/s')).toBe(b.indexOf('12 tok/s'));
    expect(panelVisibleWidth(a)).toBe(panelVisibleWidth(b));
    const lead = metricRow('running', {
      context: { text: 'ctx ?', pending: true },
      cost: { text: '$0.42' },
      speed: { text: '12 tok/s' },
    });
    const [c] = [lead].map(
      (row) => renderWorkPanelRow(row, options(60, grid))[1],
    );
    expect(c.match(/·/gu)).toHaveLength(1);
  });
});
