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
    model: 'anthropic/claude-sonnet-4-5',
    effort: 'high',
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

// Accepted stable packing and semantic metric labels; identity, glyphs and controls stay unchanged.
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
      '    tools 5 · ↑20k ↓10k',
      '    ctx 62.0% · 75 tok/s',
      '    elapsed 12s',
      '← interact',
    ],
  ],
  [
    24,
    [
      '◆ Agents · 1 running',
      '  ⠋ worker · ⚠ 1 dropped',
      '    tools 5',
      '    ↑20k ↓10k',
      '    ctx 62.0%',
      '    75 tok/s',
      '    elapsed 12s',
      '← interact',
    ],
  ],
  [
    12,
    [
      '◆ Agents \u001b[0m...\u001b[0m',
      '  ⠋ ⚠ 1 drop',
      '    tools',
      '    5',
      '    ↑20k',
      '    ↓10k',
      '    ctx',
      '    62.0%',
      '    75',
      '    tok/s',
      '    elapsed',
      '← interact',
    ],
  ],
] as const;
const themedGolden = [
  [
    100,
    [
      'Agents · 1 running',
      '  └─ ⠋ worker · inspect · ⚠ 1 dropped · * 5 · ↑20k ↓10k · ctx 62.0% · tok/s 75 · ◷ 12s',
      '← interact',
    ],
  ],
  [
    80,
    [
      'Agents · 1 running',
      '  └─ ⠋ worker · inspect · ⚠ 1 dropped',
      '       * 5 · ↑20k ↓10k · ctx 62.0% · tok/s 75 · ◷ 12s',
      '← interact',
    ],
  ],
  [
    40,
    [
      'Agents · 1 running',
      '  └─ ⠋ worker · inspect · ⚠ 1 dropped',
      '       * 5 · ↑20k ↓10k',
      '       ctx 62.0% · tok/s 75',
      '       ◷ 12s',
      '← interact',
    ],
  ],
  [
    24,
    [
      'Agents · 1 running',
      '  └─ ⠋ wo… · ⚠ 1 dropped',
      '       * 5',
      '       ↑20k ↓10k',
      '       ctx 62.0%',
      '       tok/s 75',
      '       ◷ 12s',
      '← interact',
    ],
  ],
  [
    12,
    [
      'Agents · 1 r',
      '  └─ ⠋ ⚠ 1 d',
      '       * 5',
      '       ↑20k',
      '       ',
      '       ↓10k',
      '       ',
      '       ctx',
      '       62.0%',
      '       ',
      '       tok/s',
      '← interact',
    ],
  ],
] as const;

describe('subagents v2 render parity', () => {
  it.each([
    false,
    true,
  ])('keeps identity and controls with stable keyed metric packing (kit: %s)', async (themed) => {
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
    expect(session.render(100).join(' ')).toContain(
      themed ? '◷ 12s' : 'elapsed 12s',
    );
    expect(agents.listRows(now + 1500)[0]?.metrics?.at(-1)?.segments).toEqual([
      { text: themed ? '◷ ' : 'elapsed ', role: 'meta' },
      { text: '13s', role: 'meta' },
    ]);
    expect(rows[0]?.metrics?.at(-1)?.segments).toEqual([
      { text: themed ? '◷ ' : 'elapsed ', role: 'meta' },
      { text: '12s', role: 'meta' },
    ]);
  });

  it.each([
    false,
    true,
  ])('preserves queue, stopping and terminal glyph/elapsed golden rows (kit: %s)', async (themed) => {
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
        `${themed ? '  └─ ' : '  '}${themed ? body.replace('tools 5', '* 5').replace('75 tok/s', 'tok/s 75').replace('elapsed ', '◷ ') : body}`,
        '← interact',
      ];
      expect(session.render(100)).toEqual(expected);
      vi.setSystemTime(now + 100);
      expect(session.render(100)).toEqual(expected);
    }
  });
});
