import { describe, expect, test } from 'vitest';
import {
  getOperationHarness,
  listOperationHarnesses,
  resolveOperationHarness,
  SUPPORTED_OPERATION_HARNESSES,
} from './index';

describe('operation registry', () => {
  test('lists OpenCode, Codex, Claude Code, and Pi as supported harnesses', () => {
    expect(SUPPORTED_OPERATION_HARNESSES).toEqual([
      'opencode',
      'codex',
      'claude',
      'pi',
    ]);
    expect(listOperationHarnesses().map((harness) => harness.id)).toEqual([
      'opencode',
      'codex',
      'claude',
      'pi',
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
    expect(getOperationHarness('claude')).toMatchObject({
      id: 'claude',
      displayName: 'Claude Code',
      available: true,
    });
    expect(getOperationHarness('pi')).toMatchObject({
      id: 'pi',
      displayName: 'Pi',
      available: true,
    });
  });

  test('returns unavailable metadata for unsupported harness lookup', () => {
    const result = resolveOperationHarness('antigravity');

    expect(result.available).toBe(false);
    expect(result.id).toBe('antigravity');
    expect(result.displayName).toBe('antigravity');
    expect(result.reason).toContain(
      'Supported harnesses: opencode, codex, claude, pi',
    );
  });
});
