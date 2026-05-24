import { describe, expect, test } from 'vitest';
import {
  getOperationHarness,
  listOperationHarnesses,
  resolveOperationHarness,
  SUPPORTED_OPERATION_HARNESSES,
} from './index';

describe('operation registry', () => {
  test('lists only OpenCode and Codex as supported harnesses', () => {
    expect(SUPPORTED_OPERATION_HARNESSES).toEqual(['opencode', 'codex']);
    expect(listOperationHarnesses().map((harness) => harness.id)).toEqual([
      'opencode',
      'codex',
    ]);
    expect(listOperationHarnesses().every((harness) => harness.available)).toBe(
      true,
    );
  });

  test('exposes placeholder metadata without real adapter implementations', () => {
    expect(getOperationHarness('opencode')).toMatchObject({
      id: 'opencode',
      displayName: 'OpenCode',
      available: true,
    });
    expect(getOperationHarness('codex')).toMatchObject({
      id: 'codex',
      displayName: 'Codex',
      available: true,
    });
  });

  test('returns unavailable metadata for unsupported harness lookup', () => {
    const result = resolveOperationHarness('claude');

    expect(result.available).toBe(false);
    expect(result.id).toBe('claude');
    expect(result.displayName).toBe('claude');
    expect(result.reason).toContain('Supported harnesses: opencode, codex');
  });
});
