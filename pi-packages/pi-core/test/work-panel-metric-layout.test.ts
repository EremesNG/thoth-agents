import { expect, it } from 'vitest';
import {
  registerRenderKit,
  type WorkPanelMetricGroup,
  type WorkPanelRow,
  withdrawRenderKit,
} from '../src/index.js';
import {
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
  workPanelRowLineCount,
} from '../src/panel.js';
import { createTestRenderKit } from '../src/testing.js';

const formats = {
  tools: [
    'tools 0',
    'tools 9',
    'tools 10',
    'tools 99',
    'tools 100',
    'tools 999',
  ],
  tokens: [
    '↑0 ↓0',
    '↑999 ↓999',
    '↑1.0k ↓1.0k',
    '↑9.9k ↓9.9k',
    '↑10k ↓10k',
    '↑1000k ↓1000k',
    '↑1.0M ↓1.0M',
    '↑99.9M ↓99.9M',
  ],
  context: ['ctx 0.0%', 'ctx 9.9%', 'ctx 10.0%', 'ctx 99.9%', 'ctx 100.0%'],
  speed: ['0 tok/s', '9 tok/s', '99 tok/s', '100 tok/s', '999 tok/s'],
  cost: ['$0.000', '$0.001', '$9.999', '$10.00', '$999.99'],
  elapsed: [
    'elapsed 0s',
    'elapsed 9s',
    'elapsed 9.9s',
    'elapsed 10s',
    'elapsed 59.9s',
    'elapsed 1m 05s',
    'elapsed 59m 59s',
    'elapsed 1h 00m',
    'elapsed 99h 59m',
  ],
} satisfies Partial<Record<NonNullable<WorkPanelMetricGroup['key']>, string[]>>;

function rowFor(key: keyof typeof formats, value: string): WorkPanelRow {
  return {
    id: 'task',
    primary: 'worker',
    identity: [{ text: 'worker', role: 'primary' }],
    metrics: Object.entries(formats).map(([metric, values]) => ({
      key: metric as keyof typeof formats,
      segments: [{ text: metric === key ? value : values[0], role: 'meta' }],
    })),
  };
}

function render(
  row: WorkPanelRow,
  width: number,
  metricLayout: 'greedy' | 'columns' = 'greedy',
) {
  return renderWorkPanelRow(row, {
    width,
    now: 0,
    theme: { fg: (_role, text) => text },
    clip: truncatePanelText,
    measure: panelVisibleWidth,
    metricLayout,
  });
}

it('sweeps every format boundary at widths 20..140 with and without a kit without height flapping', () => {
  for (const withKit of [false, true]) {
    const token = withKit
      ? registerRenderKit(createTestRenderKit(), {})
      : undefined;
    try {
      for (let width = 20; width <= 140; width++) {
        for (const [key, values] of Object.entries(formats)) {
          const heights = values.map((value) => {
            const row = rowFor(key as keyof typeof formats, value);
            const lines = render(row, width);
            expect(workPanelRowLineCount(row, width, panelVisibleWidth)).toBe(
              lines.length,
            );
            return lines.length;
          });
          expect(
            new Set(heights).size,
            `${withKit}/${width}/${key}: ${heights}`,
          ).toBe(1);
        }
      }
    } finally {
      if (token) withdrawRenderKit(token);
    }
  }
}, 60_000);

it('grows monotonically beyond the reserved ranges', () => {
  const beyond = {
    tools: ['999', '1000', '10000', '100000'],
    tokens: ['99.9M', '999.9M', '1000.0M', '10000.0M'],
    context: ['100.0%', '1000.0%', '10000.0%'],
    speed: ['999', '1000', '10000'],
    cost: ['999.99', '1000.00', '10000.00'],
    elapsed: ['99h 59m', '999h 59m', '9999h 59m'],
  };
  for (const withKit of [false, true]) {
    const token = withKit
      ? registerRenderKit(createTestRenderKit(), {})
      : undefined;
    try {
      for (let width = 20; width <= 140; width++)
        for (const [key, values] of Object.entries(beyond)) {
          const heights = values.map(
            (value) =>
              render(rowFor(key as keyof typeof formats, value), width).length,
          );
          expect(heights).toEqual([...heights].sort((a, b) => a - b));
        }
    } finally {
      if (token) withdrawRenderKit(token);
    }
  }
});

it('right-aligns stable sidebar columns and drops tokens, cost, model before elapsed', () => {
  const row: WorkPanelRow = {
    id: 'columns',
    primary: 'worker',
    metrics: [
      { key: 'model', segments: [{ text: 'sonnet high', role: 'meta' }] },
      { key: 'tokens', segments: [{ text: '↑9 ↓9', role: 'meta' }] },
      { key: 'cost', segments: [{ text: '$0.001', role: 'meta' }] },
      { key: 'elapsed', segments: [{ text: '9s', role: 'meta' }] },
    ],
  };
  const wide = render(row, 70, 'columns');
  expect(wide).toHaveLength(1);
  expect(wide[0]).toContain('sonnet high');
  expect(panelVisibleWidth(wide[0])).toBe(70);
  const narrower = render(row, 44, 'columns').join('\n');
  expect(narrower).not.toContain('↑9');
  expect(narrower).toContain('$0.001');
  const narrow = render(row, 24, 'columns').join('\n');
  expect(narrow).not.toContain('$0.001');
  expect(narrow).not.toContain('sonnet');
  expect(narrow).toContain('9s');
  for (const withKit of [false, true]) {
    const token = withKit
      ? registerRenderKit(createTestRenderKit(), {})
      : undefined;
    try {
      for (let width = 20; width <= 140; width++) {
        expect(
          workPanelRowLineCount(row, width, panelVisibleWidth, {
            metricLayout: 'columns',
          }),
        ).toBe(render(row, width, 'columns').length);
        expect(
          render(row, width, 'columns').every(
            (line) => panelVisibleWidth(line) <= width,
          ),
        ).toBe(true);
      }
    } finally {
      if (token) withdrawRenderKit(token);
    }
  }
});

it('reserves compact continuations too, and never pads greedy metric text', () => {
  for (const withKit of [false, true]) {
    const token = withKit
      ? registerRenderKit(
          createTestRenderKit({
            icon: (name) => {
              if (name === 'separator') return '|';
              throw new Error('unsupported icon');
            },
          }),
          {},
        )
      : undefined;
    try {
      for (let width = 20; width <= 140; width++) {
        const heights = formats.elapsed.map((value) => {
          const row: WorkPanelRow = {
            id: 'compact',
            primary: 'worker',
            metrics: [
              {
                key: 'elapsed',
                segments: [{ text: value, role: 'meta' }],
                continuation: [
                  { text: value.replace('elapsed ', '◷ '), role: 'meta' },
                ],
              },
              {
                key: 'tokens',
                segments: [{ text: 'in 9 out 10', role: 'meta' }],
              },
            ],
          };
          const lines = render(row, width);
          expect(lines.join('')).not.toContain('\0');
          expect(lines.every((line) => panelVisibleWidth(line) <= width)).toBe(
            true,
          );
          return lines.length;
        });
        expect(new Set(heights).size).toBe(1);
      }
      expect(render(rowFor('speed', '9 tok/s'), 140).join('')).toContain(
        '9 tok/s',
      );
      expect(render(rowFor('speed', '9 tok/s'), 140).join('')).not.toContain(
        '9  tok/s',
      );
    } finally {
      if (token) withdrawRenderKit(token);
    }
  }
});

it('keeps columns-only metrics out of greedy inline and wrapped host layouts', () => {
  const row: WorkPanelRow = {
    id: 'model',
    primary: 'worker',
    identity: [{ text: 'worker', role: 'primary' }],
    metrics: [
      {
        key: 'model',
        columnsOnly: true,
        segments: [{ text: 'sonnet·hi', role: 'meta' }],
      } as WorkPanelMetricGroup,
      { key: 'elapsed', segments: [{ text: 'elapsed 9s', role: 'meta' }] },
    ],
  };
  const withoutModel = { ...row, metrics: row.metrics?.slice(1) };
  for (const width of [24, 44, 100]) {
    expect(render(row, width)).toEqual(render(withoutModel, width));
    expect(workPanelRowLineCount(row, width)).toBe(
      workPanelRowLineCount(withoutModel, width),
    );
  }
  expect(render(row, 100, 'columns').join('')).toContain('sonnet·hi');
});
