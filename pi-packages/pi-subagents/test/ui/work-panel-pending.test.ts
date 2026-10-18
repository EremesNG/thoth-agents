import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import {
  createWorkPanelColumnPlan,
  panelVisibleWidth,
  renderWorkPanelRow,
  truncatePanelText,
} from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, it } from 'vitest';
import type { SubagentTask } from '../../src/types.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';

const base: SubagentTask = {
  id: 'launched',
  agent: 'thoth-worker',
  mode: 'background',
  status: 'running',
  task: 'inspect',
  model: 'openai/gpt-5',
  created_at: '2026-01-01T00:00:00Z',
  started_at: '2026-01-01T00:00:00Z',
};
const usage = (input: number, output: number, cost: number) =>
  ({
    input,
    output,
    cost,
    cacheRead: 0,
    cacheWrite: 0,
    contextTokens: 0,
    turns: 1,
  }) as SubagentTask['usage'];
const running75: SubagentTask = {
  ...base,
  id: 'busy',
  usage: usage(12000, 345, 0.42),
  runtime_metrics: {
    toolUses: 7,
    contextPercent: 75,
    generationOutputTokens: 300,
    generationMs: 4000,
  },
};
const finished: SubagentTask = {
  ...running75,
  id: 'done',
  status: 'completed',
  ended_at: '2026-01-01T00:00:09Z',
  runtime_metrics: { ...running75.runtime_metrics, contextPercent: 95 },
};

function rows(tasks: SubagentTask[]) {
  return createSubagentsWorkPanelProvider({
    listTasks: () => tasks,
    onTaskUpdate: () => () => {},
    cancel: () => {},
    open: () => {},
  }).listRows(Date.parse('2026-01-01T00:00:12Z'));
}
const pendingKeys = (task: SubagentTask) =>
  (rows([task])[0].metrics ?? [])
    .filter(({ pending }) => pending)
    .map(({ key }) => key);

it('marks only metrics without real data as pending on a running task', () => {
  expect(pendingKeys(base)).toEqual(['tools', 'tokens', 'context', 'speed']);
  expect(pendingKeys({ ...base, usage: usage(0, 0, 0) })).toEqual([
    'tools',
    'tokens',
    'context',
    'speed',
    'cost',
  ]);
  expect(pendingKeys(running75)).toEqual([]);
  // Real zero in one token direction is data; finished rows keep true zeros.
  expect(pendingKeys({ ...base, usage: usage(0, 5, 1) })).not.toContain(
    'tokens',
  );
  expect(
    pendingKeys({
      ...base,
      status: 'completed',
      ended_at: '2026-01-01T00:00:09Z',
      usage: usage(0, 0, 0),
    }),
  ).toEqual([]);
});

it.each([
  'native',
  'kit',
] as const)('renders a just-launched row blank on line 2, aligned with a finished row (%s)', (mode) => {
  const token =
    mode === 'kit' ? registerRenderKit(createTestRenderKit(), {}) : undefined;
  try {
    const items = rows([base, running75, finished]);
    const width = 50;
    const metricGrid = createWorkPanelColumnPlan(
      items,
      width,
      panelVisibleWidth,
      { lines: 2 },
    );
    const [launched, busy, done] = items.map((item) =>
      renderWorkPanelRow(item, {
        width: width - 4,
        now: Date.parse('2026-01-01T00:00:12Z'),
        theme: { fg: (_role, text) => text },
        clip: truncatePanelText,
        measure: panelVisibleWidth,
        metricLayout: 'columns',
        metricGrid,
      }),
    );
    expect(launched).toHaveLength(2);
    expect(launched[1]).not.toContain('·');
    expect(launched[1].trim()).toBe('');
    expect(launched[1]).not.toMatch(/\?|\$0\.00|↑0|\^0/u);
    expect(busy[1]).toContain('75.0%');
    expect(done[1]).toContain('$0.42');
    expect(panelVisibleWidth(launched[1])).toBe(panelVisibleWidth(done[1]));
    expect(launched[1].indexOf('gpt-5')).toBe(done[1].indexOf('gpt-5'));
  } finally {
    if (token) withdrawRenderKit(token);
  }
});
