import { describe, expect, test } from 'vitest';
import { createDelegateTaskRetryHook, type DelegationToolEvent } from './hook';

describe('native subagent retry guidance', () => {
  test.each([
    'Unknown agent: missing',
    'Invalid arguments: agent is required',
    'Agent orchestrator cannot run as a subagent',
    'Subagent depth limit reached (1)',
    'Subagent denied: worker',
  ])('explains %s once', async (message) => {
    const event = {
      tool: 'subagent',
      status: 'error',
      error: { message, metadata: { retained: true } },
    } as DelegationToolEvent & { status: 'error' };
    const hook = createDelegateTaskRetryHook();
    await hook(event);
    expect(event.error.message).toContain('[subagent retry suggestion]');
    expect(event.error.message).not.toMatch(
      /task_status|task_id|subagent_type/,
    );
    expect(event.error.metadata).toEqual({ retained: true });
    const delivered = event.error.message;
    await hook(event);
    expect(event.error.message).toBe(delivered);
  });

  test('ignores successful child prose and unrelated tool errors', async () => {
    const hook = createDelegateTaskRetryHook();
    const success = {
      tool: 'subagent',
      status: 'completed',
      result: { content: 'Unknown agent: quoted documentation' },
    } as DelegationToolEvent;
    const unrelated = {
      tool: 'read',
      status: 'error',
      error: { message: 'Unknown agent: missing' },
    } as DelegationToolEvent;
    for (const event of [success, unrelated]) {
      const original = structuredClone(event);
      await hook(event);
      expect(event).toEqual(original);
    }
  });
});
