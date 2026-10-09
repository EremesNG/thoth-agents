import {
  ensureWorkPanel,
  registerRenderKit,
  registerWorkPanelProvider,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubagentTask } from '../../src/types.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';
import { workPanelSession } from '../helpers/work-panel-fixture.js';

const now = Date.parse('2026-01-01T00:00:12Z');
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

function task(): SubagentTask {
  return {
    id: 'one',
    agent: 'worker',
    mode: 'background',
    status: 'running',
    task: 'inspect',
    created_at: '2026-01-01T00:00:00Z',
    started_at: '2026-01-01T00:00:00Z',
    usage: { input: 20000, output: 10000 } as SubagentTask['usage'],
    runtime_metrics: {
      toolUses: 5,
      contextPercent: 62,
      generationOutputTokens: 300,
      generationMs: 4000,
    },
    dropped_tools: ['missing'],
  };
}

// Literal v1 host/provider output captured with git show at
// 91b473d0a77dea2c24ca594b4605b9ecf0641aad before migration.
// Includes the host gutters, summary, responsive metric blocks and height budget.
const nativeGolden = [
  [
    100,
    [
      '◆ Agents · 1 running',
      '  ⠋ worker · inspect · ⚠ 1 dropped · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 12s',
      '← interact',
    ],
  ],
  [
    80,
    [
      '◆ Agents · 1 running',
      '  ⠋ worker · inspect · ⚠ 1 dropped',
      '    tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 12s',
      '← interact',
    ],
  ],
  [
    40,
    [
      '◆ Agents · 1 running',
      '  ⠋ worker · inspect · ⚠ 1 dropped',
      '    tools 5 · ↑20k ↓10k · ctx 62.0%',
      '    75 tok/s · elapsed 12s',
      '← interact',
    ],
  ],
  [
    24,
    [
      '◆ Agents · 1 running',
      '  ⠋ worker · ⚠ 1 dropped',
      '    tools 5 · ↑20k ↓10k',
      '    ctx 62.0% · 75 tok/s',
      '    elapsed 12s',
      '← interact',
    ],
  ],
  [
    12,
    [
      '◆ Agents \x1b[0m...\x1b[0m',
      '  ⠋ ⚠ 1 drop',
      '    tools 5',
      '    ↑20k',
      '    ↓10k',
      '    ctx',
      '    62.0%',
      '    75 tok/s',
      '    elapsed',
      '    12s',
      '← interact',
    ],
  ],
] as const;
const themedGolden = [
  [
    100,
    [
      'Agents · 1 running',
      '  └─ ⠋ worker · inspect · ⚠ 1 dropped · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 12s',
      '← interact',
    ],
  ],
  [
    80,
    [
      'Agents · 1 running',
      '  └─ ⠋ worker · inspect · ⚠ 1 dropped',
      '       tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 12s',
      '← interact',
    ],
  ],
  [
    40,
    [
      'Agents · 1 running',
      '  └─ ⠋ worker · inspect · ⚠ 1 dropped',
      '       tools 5 · ↑20k ↓10k · ctx 62.0%',
      '       75 tok/s · elapsed 12s',
      '← interact',
    ],
  ],
  [
    24,
    [
      'Agents · 1 running',
      '  └─ ⠋ wo… · ⚠ 1 dropped',
      '       tools 5',
      '       ↑20k ↓10k',
      '       ctx 62.0%',
      '       75 tok/s',
      '       elapsed 12s',
      '← interact',
    ],
  ],
  [
    12,
    [
      'Agents · 1 r',
      '  └─ ⠋ ⚠ 1 d',
      '       tools',
      '       5',
      '       ↑20k',
      '       ↓10k',
      '       ctx',
      '       62.0%',
      '       75',
      '       tok/s',
      '       elaps',
      '← interact',
    ],
  ],
] as const;

describe('subagents v2 render parity', () => {
  it.each([
    false,
    true,
  ])('preserves recorded v1 rows (kit: %s) as data-only snapshots', async (themed) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const item = task();
    const agents = createSubagentsWorkPanelProvider({
      listTasks: () => [item],
      onTaskUpdate: () => () => {},
      cancel: () => {},
      open: async () => {},
      theme: () => {
        throw new Error('row data must not read a theme');
      },
    });
    const session = workPanelSession(process.cwd());
    if (themed) {
      const token = registerRenderKit(createTestRenderKit(), {});
      cleanups.push(() => withdrawRenderKit(token));
    }
    cleanups.push(registerWorkPanelProvider(session.ctx as never, agents));
    cleanups.push(await ensureWorkPanel(session.ctx as never));
    const rows = agents.listRows(now);
    expect(rows).toEqual(structuredClone(rows));
    expect(JSON.parse(JSON.stringify(rows))[0]).toMatchObject({
      id: 'one',
      statusGlyph: 'running',
    });
    expect(rows[0]).not.toHaveProperty('render');
    expect(rows[0]?.statusGlyph).toBe('running');
    for (const [width, lines] of themed ? themedGolden : nativeGolden)
      expect(session.render(width)).toEqual(lines);
    vi.setSystemTime(now + 100);
    expect(session.render(100)[1]).toContain('⠙ worker');
    expect(session.render(100)[1]).toContain('elapsed 12s');
    expect(agents.listRows(now + 1500)[0]?.metrics?.at(-1)?.segments).toEqual([
      { text: 'elapsed 13s', role: 'meta' },
    ]);
    expect(rows[0]?.metrics?.at(-1)?.segments).toEqual([
      { text: 'elapsed 12s', role: 'meta' },
    ]);
  });

  it.each([
    false,
    true,
  ])('preserves v1 queue, stopping and terminal glyph/elapsed golden rows (kit: %s)', async (themed) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const item = task();
    item.ended_at = '2026-01-01T00:00:09Z';
    const agents = createSubagentsWorkPanelProvider({
      listTasks: () => [item],
      onTaskUpdate: () => () => {},
      cancel: () => {},
      open: async () => {},
    });
    const session = workPanelSession(process.cwd());
    if (themed) {
      const token = registerRenderKit(createTestRenderKit(), {});
      cleanups.push(() => withdrawRenderKit(token));
    }
    cleanups.push(registerWorkPanelProvider(session.ctx as never, agents));
    cleanups.push(await ensureWorkPanel(session.ctx as never));
    const golden = [
      [
        'queued',
        'Agents · 0 running · 1 queued',
        '○ worker · inspect · ⚠ 1 dropped · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 9s',
      ],
      [
        'stopping',
        'Agents · 0 running · 1 stopping',
        '■ worker · inspect · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 12s',
      ],
      [
        'completed',
        'Agents · 0 running · 1 completed',
        '✓ worker · inspect · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 9s',
      ],
      [
        'failed',
        'Agents · 0 running · 1 failed',
        '✗ worker · inspect · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 9s',
      ],
      [
        'cancelled',
        'Agents · 0 running · 1 cancelled',
        '■ worker · inspect · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 9s',
      ],
      [
        'interrupted',
        'Agents · 0 running · 1 interrupted',
        '■ worker · inspect · tools 5 · ↑20k ↓10k · ctx 62.0% · 75 tok/s · elapsed 9s',
      ],
    ] as const;
    for (const [status, heading, body] of golden) {
      item.status = status;
      const expected = [
        `${themed ? '' : '◆ '}${heading}`,
        `${themed ? '  └─ ' : '  '}${body}`,
        '← interact',
      ];
      expect(session.render(100)).toEqual(expected);
      vi.setSystemTime(now + 100);
      expect(session.render(100)).toEqual(expected);
    }
  });
});
