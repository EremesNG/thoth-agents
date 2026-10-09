// biome-ignore-all lint/suspicious/noExplicitAny: Pi extension host boundary.
import { reportProviderLimit } from '@thoth-agents/pi-core';
import { expect, it, vi } from 'vitest';
import subagentsExtension from '../../src/extension/subagents-extension.js';
import { getInteractionSessionRegistry } from '../../src/runner/interaction-session-registry.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';
import { workPanelSession } from '../helpers/work-panel-fixture.js';

const env = installSubagentTestEnv();

it('captures before tools can launch children and passes retained warnings to detail after teardown, refreshing at reset', async () => {
  const now = Date.now();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const registry = getInteractionSessionRegistry();
  const history = env.createHistoryStore();
  history.upsertTask(env.tmp, {
    id: 'task-a',
    agent: 'worker',
    mode: 'task',
    status: 'completed',
    task: 'finished child',
    created_at: new Date(now).toISOString(),
    session_id: 'parent-a',
  });
  const handlers = new Map<string, Set<(...args: any[]) => any>>();
  const fire = async (event: string) => {
    for (const handler of [...(handlers.get(event) ?? [])])
      await handler({}, fixture.ctx);
  };
  let open: (...args: any[]) => Promise<void> = async () => {};
  let reported = false;
  subagentsExtension({
    registerTool: () => {
      if (reported) return;
      reported = true;
      registry.set('early-child', {
        origin: 'subagent',
        requester: { taskId: 'task-a' },
      });
      reportProviderLimit({
        provider: 'claude-bridge',
        window: '5h',
        sessionId: 'early-child',
        status: 'rejected',
        observedAt: now,
        resetsAt: now + 60_000,
      });
      registry.delete('early-child');
    },
    registerCommand: (name: string, command: any) => {
      if (name === 'subagents') open = command.handler;
    },
    registerShortcut: () => {},
    on: (event: string, handler: (...args: any[]) => any) => {
      const listeners = handlers.get(event) ?? new Set();
      handlers.set(event, listeners);
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  });
  const fixture = workPanelSession(env.tmp, 'parent-a');
  let opening: Promise<void> | undefined;
  try {
    await fire('session_start');
    opening = open('', fixture.ctx);
    await vi.waitFor(() => expect(fixture.ui.custom).toHaveBeenCalled(), {
      timeout: 2000,
    });
    expect(fixture.panelRender(180).join('\n')).toContain(
      'rate limited · reset',
    );
    fixture.tui.requestRender.mockClear();
    registry.set('active-child', {
      origin: 'subagent',
      requester: { taskId: 'task-a' },
    });
    reportProviderLimit({
      provider: 'claude-bridge',
      window: '5h',
      sessionId: 'active-child',
      status: 'allowed_warning',
      observedAt: now,
      resetsAt: now + 60_000,
    });
    registry.delete('active-child');
    expect(fixture.tui.requestRender).toHaveBeenCalled();
    expect(fixture.panelRender(180).join('\n')).toContain('rate limit warning');
    vi.advanceTimersByTime(60_000);
    expect(fixture.panelRender(180).join('\n')).not.toContain(
      'rate limit warning',
    );
    fixture.key('\u001b');
    await opening;
    opening = undefined;
  } finally {
    if (opening) {
      fixture.key('\u001b');
      await opening;
    }
    await fire('session_shutdown');
    registry.delete('early-child');
    registry.delete('active-child');
    vi.useRealTimers();
  }
});
