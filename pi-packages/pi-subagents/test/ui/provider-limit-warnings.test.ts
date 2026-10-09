import { reportProviderLimit } from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInteractionSessionRegistry } from '../../src/runner/interaction-session-registry.js';
import type { SubagentTask } from '../../src/types.js';
import { SubagentProviderLimitCache } from '../../src/ui/provider-limit-cache.js';
import { SubagentsHistoryPanel } from '../../src/ui/subagents-history-panel.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';

const now = new Date(2026, 0, 1, 12, 0).getTime();
const registry = getInteractionSessionRegistry();
let cache: SubagentProviderLimitCache;
function task(id: string, status: SubagentTask['status']): SubagentTask {
  return {
    id,
    status,
    agent: 'worker',
    mode: 'task',
    task: 'test warning',
    created_at: new Date(now).toISOString(),
  };
}
function report(status: 'allowed_warning' | 'rejected') {
  registry.set('child-a', {
    origin: 'subagent',
    requester: { taskId: 'task-a' },
  });
  reportProviderLimit({
    provider: 'claude-bridge',
    window: '5h',
    sessionId: 'child-a',
    status,
    observedAt: now,
    resetsAt: now + 60_000,
  });
  registry.delete('child-a');
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  cache = new SubagentProviderLimitCache();
});
afterEach(() => {
  cache.dispose();
  registry.clear();
  vi.useRealTimers();
});

describe('subagent rate-limit warnings', () => {
  it.each([
    80, 180,
  ])('shows the same warning in detail opened after child teardown at width %s and clears at reset', (width) => {
    report('allowed_warning');
    const panel = new SubagentsHistoryPanel(
      [task('task-a', 'completed')],
      {
        fg: (_role: string, text: string) => text,
        bold: (text: string) => text,
      },
      () => {},
      () => false,
      (text) => text.length,
      (text, limit) => text.slice(0, limit),
      {},
      42,
      undefined,
      'task-a',
      undefined,
      'x',
      { providerLimits: cache },
    );
    try {
      const warning = 'claude-bridge/5h: rate limit warning · reset 12:01';
      expect(panel.render(width).join('\n')).toContain(`limit: ${warning}`);
      vi.advanceTimersByTime(60_000);
      expect(panel.render(width).join('\n')).not.toContain(
        'rate limit warning',
      );
    } finally {
      panel.dispose();
    }
  });
  it.each([
    'running',
    'completed',
    'failed',
  ] as const)('shows warning data on a %s row without changing task status or other tasks', (status) => {
    const tasks = [task('task-a', status), task('task-b', status)];
    const provider = createSubagentsWorkPanelProvider({
      listTasks: () => tasks,
      onTaskUpdate: () => () => {},
      cancel: () => {},
      open: async () => {},
      providerLimits: cache,
    });
    const changed = vi.fn();
    const unsubscribe = provider.onVisibleChanged?.(changed);
    report('rejected');
    const affected = provider.listRows(now).find((row) => row.id === 'task-a');
    expect(affected?.identity).toContainEqual({
      text: ' · claude-bridge/5h: rate limited · reset 12:01',
      role: 'warning',
    });
    expect(affected?.status).toBe(status);
    expect(tasks[0].status).toBe(status);
    expect(
      provider
        .listRows(now)
        .find((row) => row.id === 'task-b')
        ?.identity?.some(({ role }) => role === 'warning'),
    ).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(
      provider
        .listRows(Date.now())
        .find((row) => row.id === 'task-a')
        ?.identity?.some(({ role }) => role === 'warning'),
    ).toBe(false);
    unsubscribe?.();
  });
});
