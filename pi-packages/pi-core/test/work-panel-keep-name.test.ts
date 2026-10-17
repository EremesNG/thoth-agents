import { expect, it } from 'vitest';
import type { WorkPanelRow } from '../src/index.js';
import {
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
} from '../src/panel.js';

const warning = ' · ⚠ anthropic/five_hour: rate limited · reset 17:30';
const row: WorkPanelRow = {
  id: 'r',
  primary: 'inspect',
  status: 'running',
  identity: [
    { text: 'thoth-worker', role: 'primary' },
    { text: ' · ', role: 'meta' },
    { text: 'inspect the repo', role: 'secondary' },
    { text: warning, role: 'warning' },
  ],
  metrics: [{ key: 'elapsed', segments: [{ text: '1m 00s', role: 'meta' }] }],
};

const render = (width: number) =>
  renderWorkPanelRow(row, {
    width,
    now: 0,
    theme: { fg: (_role: string, text: string) => text },
    clip: truncatePanelText,
    measure: panelVisibleWidth,
    metricLayout: 'columns',
  });

it('columns layout keeps name and elapsed; summary drops, then warning truncates', () => {
  for (const width of [30, 36, 50, 60]) {
    const lines = render(width);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('thoth-worker');
    expect(lines[0]).toContain('1m 00s');
    expect(lines[0]).not.toContain('inspect');
    expect(panelVisibleWidth(lines[0])).toBeLessThanOrEqual(width);
  }
  expect(render(36)[0]).toMatch(/thoth-worker · .*…/);
});

it('truncates the name only when it alone exceeds the identity budget', () => {
  const line = render(20)[0];
  expect(line).toContain('1m 00s');
  expect(line).toContain('…');
  expect(line).not.toContain('⚠');
});
