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
} from '../src/panel.js';
import { createTestRenderKit } from '../src/testing.js';

function row(split: boolean): WorkPanelRow {
  return {
    id: 'worker',
    primary: 'worker',
    status: 'running',
    identity: [
      { text: 'worker', role: 'primary' },
      ...(split
        ? [
            { text: ' · ', role: 'meta' as const },
            { text: 'inspect', role: 'secondary' as const },
          ]
        : [{ text: ' · inspect', role: 'secondary' as const }]),
      { text: ' · ⚠ 1 dropped', role: 'warning' },
    ],
    metrics: [
      { key: 'tools', segments: [{ text: 'tools 5', role: 'meta' }] },
      { key: 'tokens', segments: [{ text: '↑20k ↓10k', role: 'meta' }] },
      { key: 'context', segments: [{ text: 'ctx 62.0%', role: 'meta' }] },
      { key: 'speed', segments: [{ text: '75 tok/s', role: 'meta' }] },
      { key: 'elapsed', segments: [{ text: 'elapsed 12s', role: 'meta' }] },
    ],
  };
}

function render(
  r: WorkPanelRow,
  width: number,
  metricLayout: 'greedy' | 'grid' | 'columns',
  fg = (_role: string, text: string) => text,
) {
  return renderWorkPanelRow(r, {
    width,
    now: 0,
    theme: { fg },
    clip: truncatePanelText,
    measure: panelVisibleWidth,
    metricLayout,
  });
}

it.each([
  'greedy',
  'grid',
  'columns',
] as const)('packs split separators identically to combined summaries in %s layout', (layout) => {
  for (const withKit of [false, true]) {
    const token = withKit
      ? registerRenderKit(createTestRenderKit(), {})
      : undefined;
    try {
      for (const width of [24, 36, 50, 100]) {
        expect(render(row(true), width, layout), `${withKit}/${width}`).toEqual(
          render(row(false), width, layout),
        );
        expect(
          createWorkPanelColumnPlan([row(true)], width, panelVisibleWidth),
        ).toEqual(
          createWorkPanelColumnPlan([row(false)], width, panelVisibleWidth),
        );
      }
      if (withKit && layout === 'greedy')
        expect(render(row(true), 24, layout)[0]).toContain('wo… · ⚠ 1 dropped');
      if (!withKit && layout === 'greedy') {
        const lines = render(row(true), 100, layout);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(
          'worker · inspect · ⚠ 1 dropped · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 12s',
        );
      }
    } finally {
      if (token) withdrawRenderKit(token);
    }
  }
});

it.each([
  'greedy',
  'grid',
  'columns',
] as const)('styles the identity separator dim and never leaves it behind after dropping the summary in %s', (layout) => {
  const calls: [string, string][] = [];
  render(row(true), 100, layout, (role, text) => {
    calls.push([role, text]);
    return text;
  });
  expect(calls).toContainEqual(['dim', ' · ']);
  expect(calls).toContainEqual(['text', 'inspect']);
  for (const split of [false, true]) {
    const r = row(split);
    r.identity = [
      { text: 'a-long-worker-name', role: 'primary' },
      ...(split
        ? [
            { text: ' · ', role: 'meta' as const },
            { text: 'inspect', role: 'secondary' as const },
          ]
        : [{ text: ' · inspect', role: 'secondary' as const }]),
    ];
    r.metrics = [];
    for (let width = 20; width <= 36; width++) {
      const [line] = render(r, width, layout);
      expect(line, `${split}/${width}`).not.toMatch(/ ·(?:…|\s*$)/u);
      expect(panelVisibleWidth(line)).toBeLessThanOrEqual(width);
    }
    r.identity = [
      { text: 'worker', role: 'primary' },
      ...(split
        ? [
            { text: ' · ', role: 'meta' as const },
            { text: '', role: 'secondary' as const },
          ]
        : [{ text: ' · ', role: 'secondary' as const }]),
    ];
    expect(render(r, 24, layout)[0]).not.toContain('·');
  }
});
