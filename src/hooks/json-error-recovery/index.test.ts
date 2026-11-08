import { describe, expect, test } from 'vitest';
import type { DelegationToolEvent } from '../delegate-task-retry/hook';
import {
  createJsonErrorRecoveryHook,
  JSON_ERROR_PATTERNS,
  JSON_ERROR_REMINDER,
} from './index';

describe('v2 JSON error recovery', () => {
  test.each([
    'JSON parse error',
    'Failed to parse JSON',
    'Invalid JSON',
    'Malformed JSON',
    'Unexpected end of JSON input',
    'SyntaxError: Unexpected token in JSON',
    "JSON expected '}'",
    'JSON unexpected EOF',
  ])('recovers %s once', async (message) => {
    const event = {
      tool: 'subagent',
      status: 'error',
      error: { message, metadata: { retained: true } },
    } as DelegationToolEvent & { status: 'error' };
    const hook = createJsonErrorRecoveryHook();
    await hook(event);
    expect(event.error.message).toContain(JSON_ERROR_REMINDER);
    expect(event.error.metadata).toEqual({ retained: true });
    const delivered = event.error.message;
    await hook(event);
    expect(event.error.message).toBe(delivered);
  });

  test.each([
    {
      tool: 'subagent',
      status: 'completed',
      result: { content: 'Invalid JSON' },
    },
    { tool: 'read', status: 'error', error: { message: 'Invalid JSON' } },
    {
      tool: 'subagent',
      status: 'error',
      error: { message: 'Permission denied' },
    },
  ])('ignores non-error/non-delegation/unrelated events', async (input) => {
    const event = input as DelegationToolEvent;
    const original = structuredClone(event);
    await createJsonErrorRecoveryHook()(event);
    expect(event).toEqual(original);
  });

  test('exports JSON recognition patterns', () => {
    expect(JSON_ERROR_PATTERNS.length).toBeGreaterThan(0);
  });
});
