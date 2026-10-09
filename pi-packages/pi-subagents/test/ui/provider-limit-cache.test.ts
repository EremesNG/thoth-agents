import { reportProviderLimit } from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInteractionSessionRegistry } from '../../src/runner/interaction-session-registry.js';
import { SubagentProviderLimitCache } from '../../src/ui/provider-limit-cache.js';

const registry = getInteractionSessionRegistry();
let cache: SubagentProviderLimitCache;
const now = new Date(2026, 0, 1, 12, 0).getTime();
function child(sessionId: string, taskId: string) {
  registry.set(sessionId, { origin: 'subagent', requester: { taskId } });
}
function report(
  sessionId: string,
  status: 'allowed' | 'allowed_warning' | 'rejected' = 'rejected',
  window = '5h',
) {
  expect(
    reportProviderLimit({
      provider: 'claude-bridge',
      window,
      sessionId,
      status,
      observedAt: now,
      resetsAt: now + 60_000,
    }),
  ).toBe(true);
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

describe('subagent provider-limit capture', () => {
  it('keeps report and reset notifications working when a UI consumer throws', () => {
    child('child-a', 'task-a');
    cache.onChange(() => {
      throw new Error('closed UI');
    });
    const notify = vi.fn();
    cache.onChange(notify);
    report('child-a');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it('ignores unattributed root reports and clears only the reporting task/window on allowed', () => {
    report('root');
    expect(cache.warningText('task-a')).toBeUndefined();
    child('child-a', 'task-a');
    report('child-a', 'rejected', '5h');
    report('child-a', 'allowed_warning', 'weekly');
    report('child-a', 'allowed', '5h');
    expect(cache.warningText('task-a')).toBe(
      'claude-bridge/weekly: rate limit warning · reset 12:01',
    );
    registry.delete('child-a');
    report('child-a', 'allowed', 'weekly');
    expect(cache.warningText('task-a')).toContain('weekly: rate limit warning');
  });

  it('handles missing resets, already-expired reports, and long reset windows without timer overflow', () => {
    child('child-a', 'task-a');
    const entry = {
      provider: 'claude-bridge',
      window: '5h',
      sessionId: 'child-a',
      status: 'rejected',
      observedAt: now,
    };
    reportProviderLimit(entry);
    expect(cache.warningText('task-a')).toBe('claude-bridge/5h: rate limited');
    reportProviderLimit({ ...entry, resetsAt: now });
    expect(cache.warningText('task-a')).toBeUndefined();
    reportProviderLimit({ ...entry, resetsAt: now + 3_000_000_000 });
    const notify = vi.fn();
    cache.onChange(notify);
    vi.advanceTimersByTime(1);
    expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_000_000_000);
    expect(cache.warningText('task-a')).toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('disposes capture and reset refreshes independently of consumer subscriptions', () => {
    child('child-a', 'task-a');
    report('child-a');
    const notify = vi.fn();
    cache.onChange(notify);
    cache.dispose();
    report('child-a');
    vi.advanceTimersByTime(60_000);
    expect(notify).not.toHaveBeenCalled();
    expect(cache.warningText('task-a')).toBeUndefined();
  });
  it('bounds retained observations to the 512 most recently reported task/window pairs', () => {
    child('old-child', 'old-task');
    report('old-child');
    child('new-child', 'new-task');
    for (let index = 0; index < 512; index++)
      report('new-child', 'rejected', `window-${index}`);
    expect(cache.warningText('old-task')).toBeUndefined();
    expect(cache.warningText('new-task')?.split('; ')).toHaveLength(512);
    report('new-child', 'allowed_warning', 'window-0');
    report('new-child', 'rejected', 'extra-window');
    expect(cache.warningText('new-task')).toContain(
      'window-0: rate limit warning',
    );
    expect(cache.warningText('new-task')).not.toContain('/window-1:');
    expect(cache.warningText('new-task')?.split('; ')).toHaveLength(512);
  });
  it('notifies on reports and at reset without activity or row ownership of capture', () => {
    child('child-a', 'task-a');
    report('child-a', 'allowed_warning');
    const notify = vi.fn();
    const unsubscribe = cache.onChange(notify);
    expect(cache.warningText('task-a')).toContain('rate limit warning');
    report('child-a', 'rejected');
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
    report('child-a', 'allowed_warning');
    const laterNotify = vi.fn();
    cache.onChange(laterNotify);
    registry.delete('child-a');
    vi.advanceTimersByTime(60_000);
    expect(laterNotify).toHaveBeenCalledTimes(1);
    expect(cache.warningText('task-a')).toBeUndefined();
  });
  it('captures a final report synchronously before child teardown and retains it when another child replaces the account window', () => {
    child('child-a', 'task-a');
    report('child-a');
    registry.delete('child-a');
    child('child-b', 'task-b');
    report('child-b', 'allowed');
    expect(cache.warningText('task-a')).toBe(
      'claude-bridge/5h: rate limited · reset 12:01',
    );
    expect(cache.warningText('task-b')).toBeUndefined();
    expect(cache.warningText('unaffected')).toBeUndefined();
  });
});
