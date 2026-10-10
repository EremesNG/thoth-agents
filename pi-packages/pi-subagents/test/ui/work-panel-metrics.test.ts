import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { expect, it } from 'vitest';
import type { SubagentTask } from '../../src/types.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';

const task: SubagentTask = {
  id: 'metrics',
  agent: 'worker',
  mode: 'background',
  status: 'running',
  task: 'inspect',
  created_at: '2026-01-01T00:00:00Z',
  started_at: '2026-01-01T00:00:00Z',
  usage: {
    input: 20000,
    output: 10000,
    cost: 1.25,
    cacheRead: 0,
    cacheWrite: 0,
    contextTokens: 0,
    turns: 1,
  },
  runtime_metrics: {
    toolUses: 5,
    contextPercent: 62,
    generationOutputTokens: 300,
    generationMs: 4000,
  },
};
function row(item = task) {
  const result = createSubagentsWorkPanelProvider({
    listTasks: () => [item],
    onTaskUpdate: () => () => {},
    cancel: () => {},
    open: () => {},
  }).listRows(Date.parse('2026-01-01T00:00:12Z'))[0];
  if (!result) throw new Error('Expected metric row');
  return result;
}
it('keys every metric and includes runtime and finished cost with formatted values in single segments', () => {
  for (const status of ['running', 'completed'] as const) {
    const metrics =
      row({ ...task, status, ended_at: '2026-01-01T00:00:09Z' }).metrics ?? [];
    expect(metrics.map(({ key }) => key)).toEqual([
      'tools',
      'tokens',
      'context',
      'speed',
      'cost',
      'elapsed',
    ]);
    expect(metrics.find(({ key }) => key === 'cost')?.segments).toContainEqual({
      text: '1.25',
      role: 'meta',
    });
    expect(
      metrics.find(({ key }) => key === 'context')?.segments,
    ).toContainEqual({ text: '62.0%', role: 'meta' });
  }
});
it.each([
  'nerd',
  'unicode',
  'ascii',
])('uses semantic icons or explicit ASCII labels (%s)', (mode) => {
  const icons = {
    tool: mode === 'ascii' ? '*' : 'TOOL',
    tokensIn: mode === 'ascii' ? '^' : 'IN',
    tokensOut: mode === 'ascii' ? 'v' : 'OUT',
    context: 'CTX',
    throughput: 'SPEED',
    cost: '$',
    elapsed: 'TIME',
  };
  const token = registerRenderKit(
    createTestRenderKit({ icon: (name) => icons[name as keyof typeof icons] }),
    {},
  );
  try {
    const text = row().metrics?.map(({ segments }) =>
      segments.map(({ text }) => text).join(''),
    );
    expect(text).toEqual(
      mode === 'ascii'
        ? [
            'tools 5',
            'in 20k out 10k',
            'ctx 62.0%',
            'tok/s 75',
            '$1.25',
            'elapsed 12s',
          ]
        : [
            'TOOL 5',
            'IN20k OUT10k',
            'CTX 62.0%',
            'SPEED 75',
            '$1.25',
            'TIME 12s',
          ],
    );
  } finally {
    withdrawRenderKit(token);
  }
});
it('omits unavailable history fields and empty groups instead of question marks', () => {
  const history = row({
    ...task,
    status: 'completed',
    started_at: undefined,
    usage: undefined,
    runtime_metrics: undefined,
  });
  expect(history.metrics).toEqual([]);
  expect(JSON.stringify(history)).not.toContain('?');
});
it('uses native elapsed fallback for legacy kits', () => {
  const token = registerRenderKit(
    createTestRenderKit({
      icon: (name) => {
        if (name === 'elapsed') throw new Error('legacy kit');
        return 'icon';
      },
    }),
    {},
  );
  try {
    expect(row().metrics?.at(-1)?.segments[0]?.text).toBe('◷ ');
  } finally {
    withdrawRenderKit(token);
  }
});

it('keeps only available history metrics and omits the missing token half and separators', () => {
  const history = row({
    ...task,
    status: 'completed',
    started_at: undefined,
    runtime_metrics: undefined,
    usage: { input: 20000, cost: 0 } as SubagentTask['usage'],
  });
  expect(
    history.metrics?.map(({ key, segments }) => [
      key,
      segments.map(({ text }) => text).join(''),
    ]),
  ).toEqual([
    ['tokens', '↑20k'],
    ['cost', '$0.00'],
  ]);
});

it('renders actual model and effort in sidebar columns at 44, dropping them before elapsed at 36/30 without changing host rows', async () => {
  const { renderWorkPanelRow, truncatePanelText } = await import(
    '@thoth-agents/pi-core/panel'
  );
  const item = row({
    ...task,
    task: '',
    model: 'anthropic/claude-sonnet-4-5',
    effort: 'high',
    status: 'completed',
    ended_at: '2026-01-01T00:00:09Z',
    runtime_metrics: undefined,
  });
  const render = (width: number, metricLayout: 'greedy' | 'columns') =>
    renderWorkPanelRow(item, {
      width: width - 4, // sidebar chrome
      now: 0,
      theme: { fg: (_role, text) => text },
      clip: truncatePanelText,
      metricLayout,
    }).join('\n');
  expect(render(44, 'columns')).toContain('sonnet·hi');
  for (const width of [36, 30]) {
    expect(render(width, 'columns')).not.toContain('sonnet');
    expect(render(width, 'columns')).toContain('elapsed 9s');
  }
  for (const width of [100, 44, 30]) {
    expect(render(width, 'greedy')).not.toContain('sonnet');
  }
});

it.each([
  ['openai/gpt-5', undefined, 'gpt-5'],
  ['anthropic/claude-opus-4-6', 'xhigh', 'opus·xhi'],
  [undefined, 'high', undefined],
  [' ', 'high', undefined],
] as const)('only displays known model metadata (%s, %s)', (model, effort, expected) => {
  const group = row({ ...task, model, effort }).metrics?.find(
    ({ key }) => key === 'model',
  );
  expect(group?.segments.map(({ text }) => text).join('')).toBe(expected);
  if (group) expect(group.columnsOnly).toBe(true);
});
