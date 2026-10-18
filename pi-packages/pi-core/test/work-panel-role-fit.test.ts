import { expect, it } from 'vitest';
import type { WorkPanelRow } from '../src/index.js';
import {
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
} from '../src/panel.js';

const sep = { text: ' · ', role: 'meta' as const };
const row: WorkPanelRow = {
  id: 'r',
  primary: 'inspect',
  status: 'running',
  identity: [
    { text: 'thoth-worker', role: 'primary' },
    sep,
    { text: 'inspect the repository', role: 'secondary' },
    sep,
    { text: '⚠ 2 dropped', role: 'warning' },
    sep,
    {
      text: 'anthropic/five_hour: rate limited · reset 17:30',
      role: 'warning',
    },
  ],
  metrics: [],
};

function render(width: number, layout: 'greedy' | 'columns') {
  const calls: Array<[string, string]> = [];
  const [line] = renderWorkPanelRow(row, {
    width: width + 4,
    now: 0,
    theme: {
      fg: (role: string, text: string) => {
        calls.push([role, text]);
        return text;
      },
    },
    clip: truncatePanelText,
    measure: panelVisibleWidth,
    metricLayout: layout,
  });
  return { line: line.slice(4), calls };
}

/** Role of every identity run after the status glyph, in order. */
const runs = (calls: Array<[string, string]>) =>
  calls.filter(([, text]) => text.trim() !== '' && !/^[◐⠋-⠿]/u.test(text));

it('keeps every role when everything fits', () => {
  const { calls, line } = render(120, 'columns');
  expect(line).toContain(
    'thoth-worker · inspect the repository · ⚠ 2 dropped · anthropic',
  );
  expect(calls.filter(([r]) => r === 'warning').map(([, t]) => t)).toEqual([
    '⚠ 2 dropped',
    'anthropic/five_hour: rate limited · reset 17:30',
  ]);
  for (const [role, text] of calls)
    if (text === ' · ') expect(role).toBe('dim');
});

it('columns layout drops warnings its panel does not admit, with their separators', () => {
  const { calls, line } = render(46, 'columns');
  expect(panelVisibleWidth(line)).toBeLessThanOrEqual(46);
  expect(calls.filter(([r]) => r === 'warning')).toHaveLength(0);
  expect(line).not.toContain('⚠');
  expect(line.trimEnd().endsWith('·')).toBe(false);
});

it('greedy attention segments stay separate and truncate inside the later one', () => {
  const layout = 'greedy';
  const { calls, line } = render(46, layout);
  expect(panelVisibleWidth(line)).toBeLessThanOrEqual(46);
  const warnings = calls.filter(([r]) => r === 'warning');
  expect(warnings[0][1]).toBe('⚠ 2 dropped');
  expect(warnings[1][1].endsWith('')).toBe(true);
  expect(warnings[1][1]).not.toContain('⚠');
  // The separator between the warnings is its own dim run, never part of a warning.
  for (const [role, text] of calls) {
    if (role === 'warning') expect(text.startsWith(' · ')).toBe(false);
    if (text === ' · ') expect(role).toBe('dim');
  }
  expect(calls.filter(([, t]) => t === ' · ').length).toBeGreaterThanOrEqual(1);
  expect(runs(calls).length).toBeGreaterThan(0);
});

it('greedy attention-only fit keeps one warning role per segment, without a leading separator', () => {
  const { calls, line } = render(30, 'greedy');
  expect(line.startsWith('⚠ 2 dropped')).toBe(true);
  expect(calls.filter(([r]) => r === 'warning').length).toBe(2);
  expect(calls[0][1]).not.toBe(' · ');
});
