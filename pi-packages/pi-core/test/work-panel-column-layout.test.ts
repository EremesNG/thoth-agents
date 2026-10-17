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

function row(
  overrides: Partial<WorkPanelRow> = {},
  speed = '9 tok/s',
  elapsed = '9s',
): WorkPanelRow {
  return {
    id: 'agent',
    primary: 'scout',
    status: 'running',
    identity: [
      { text: 'scout', role: 'primary' },
      { text: ' · ', role: 'meta' },
      { text: 'mapping the renderer pipeline', role: 'secondary' },
    ],
    metrics: [
      { key: 'model', segments: [{ text: 'sonnet-5 high', role: 'meta' }] },
      {
        key: 'tokens',
        segments: [
          { text: '↑9', role: 'meta', direction: 'in' },
          { text: ' ', role: 'meta' },
          { text: '↓9', role: 'meta', direction: 'out' },
        ],
      },
      { key: 'tools', segments: [{ text: 'tools 3', role: 'meta' }] },
      { key: 'context', segments: [{ text: 'ctx 9.9%', role: 'meta' }] },
      { key: 'speed', segments: [{ text: speed, role: 'meta' }] },
      { key: 'cost', segments: [{ text: '$0.001', role: 'meta' }] },
      { key: 'elapsed', segments: [{ text: elapsed, role: 'meta' }] },
    ],
    ...overrides,
  };
}

const codes = [
  'accent',
  'success',
  'warning',
  'error',
  'muted',
  'dim',
  'text',
  'toolTitle',
];
const ESC = String.fromCharCode(27);
// Invisible-width ANSI so clipping behaves like production; parsed back to role/text pairs.
const marked = {
  fg: (role: string, text: string) =>
    `${ESC}[${30 + codes.indexOf(role)}m${text}${ESC}[39m`,
};
const spans = (line: string) =>
  [
    ...line.matchAll(
      new RegExp(`${ESC}\\[(\\d+)m([^${ESC}]*)${ESC}\\[39m`, 'g'),
    ),
  ].map(([, code, text]) => `<${codes[Number(code) - 30]}:${text}>`);
const plain = { fg: (_role: string, text: string) => text };

function render(r: WorkPanelRow, width: number, theme = plain) {
  return renderWorkPanelRow(r, {
    width,
    now: 0,
    theme,
    clip: truncatePanelText,
    measure: panelVisibleWidth,
    metricLayout: 'columns',
  });
}

const keys = (r: WorkPanelRow, width: number) =>
  createWorkPanelColumnPlan([r], width, panelVisibleWidth).map(
    ({ key }) => key,
  );

it('drops speed, context, tools, cost, model, tokens in order and stays on one line', () => {
  const seen = new Map<number, string[]>();
  for (const width of [36, 50, 64, 72]) seen.set(width, keys(row(), width));
  // Progressively narrower plans only ever remove columns in the contract order.
  const order = [
    'speed',
    'context',
    'tools',
    'cost',
    'model',
    'tokens',
  ] as const;
  let previous = new Set(keys(row(), 140));
  expect(previous.size).toBe(7);
  for (let width = 140; width >= 20; width--) {
    const current = new Set(keys(row(), width));
    expect(current.has('elapsed')).toBe(true);
    const dropped = [...previous].filter((key) => !current.has(key));
    for (const key of dropped)
      for (const earlier of order.slice(
        0,
        order.indexOf(key as (typeof order)[number]),
      ))
        expect(current.has(earlier), `${width}: ${key} before ${earlier}`).toBe(
          false,
        );
    previous = current;
  }
  expect(seen.get(36)).not.toContain('speed');
  expect(seen.get(36)).not.toContain('context');
  expect(seen.get(36)).not.toContain('tools');
  expect(seen.get(72)?.length).toBeGreaterThan(seen.get(50)?.length ?? 0);
  for (const withKit of [false, true]) {
    const token = withKit
      ? registerRenderKit(createTestRenderKit(), {})
      : undefined;
    try {
      for (const width of [36, 50, 64, 72]) {
        const lines = render(row(), width);
        expect(lines, `${withKit}/${width}`).toHaveLength(1);
        expect(panelVisibleWidth(lines[0])).toBeLessThanOrEqual(width);
        expect(lines[0]).toContain('scout');
        expect(lines[0]).toContain('9s');
        expect(
          workPanelRowLineCount(row(), width, panelVisibleWidth, {
            metricLayout: 'columns',
          }),
        ).toBe(1);
      }
      expect(render(row(), 140)[0]).toContain('sonnet-5 …');
    } finally {
      if (token) withdrawRenderKit(token);
    }
  }
});

it('keeps visible columns and line count across digit boundaries', () => {
  for (const width of [36, 50, 64, 72, 100]) {
    const a = row({}, '99 tok/s', '9s');
    const b = row({}, '100 tok/s', '10s');
    expect(keys(a, width)).toEqual(keys(b, width));
    const first = render(a, width);
    const second = render(b, width);
    expect(second).toHaveLength(1);
    expect(first).toHaveLength(1);
    expect(panelVisibleWidth(second[0])).toBe(panelVisibleWidth(first[0]));
  }
});

it('shares one column decision across rows with different content', () => {
  const rows = [row(), row({ metrics: row().metrics?.slice(0, 2) })];
  const plan = createWorkPanelColumnPlan(rows, 64, panelVisibleWidth);
  const widths = rows.map((r) =>
    renderWorkPanelRow(r, {
      width: 64,
      now: 0,
      theme: plain,
      clip: truncatePanelText,
      measure: panelVisibleWidth,
      metricLayout: 'columns',
      metricGrid: plan,
    }),
  );
  expect(widths.every((lines) => lines.length === 1)).toBe(true);
  expect(new Set(widths.map(([line]) => panelVisibleWidth(line))).size).toBe(1);
});

it('colors each element by state with existing theme roles', () => {
  const cases = [
    { status: 'running', glyph: 'accent', elapsed: 'accent', summary: 'text' },
    { status: 'completed', glyph: 'success', elapsed: 'dim', summary: 'muted' },
    { status: 'failed', glyph: 'error', elapsed: 'error', summary: 'muted' },
    {
      status: 'timedOut',
      glyph: 'warning',
      elapsed: 'warning',
      summary: 'muted',
    },
    { status: 'cancelled', glyph: 'muted', elapsed: 'muted', summary: 'muted' },
  ];
  for (const withKit of [false]) {
    const token = undefined as ReturnType<typeof registerRenderKit> | undefined;
    try {
      for (const { status, glyph, elapsed, summary } of cases) {
        const line = spans(render(row({ status }), 120, marked)[0]).join('');
        const tag = `${withKit}/${status}`;
        expect(line, tag).toContain(`<${elapsed}:9s>`);
        expect(line, tag).toContain(`<toolTitle:scout>`);
        expect(line, tag).toContain(`<${summary}:mapping the renderer`);
        expect(line, tag).toContain('<accent:↑9>');
        expect(line, tag).toContain('<success:↓9>');
        expect(line, tag).toContain('<warning:$0.001>');
        expect(line, tag).toContain('<muted:sonnet-5 …>');
        expect(line, tag).toContain('<dim:tools 3>');
        expect(line, tag).toContain('<dim: · >');
        expect(line, tag).not.toContain(ESC);
        if (!withKit) expect(line, tag).toMatch(new RegExp(`<${glyph}:.>`));
      }
    } finally {
      if (token) withdrawRenderKit(token);
    }
  }
});
