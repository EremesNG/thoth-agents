import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_HARNESS,
  resolveHarness,
  SUPPORTED_HARNESSES,
} from './registry';

describe('harness registry', () => {
  test('defaults to OpenCode with no generated artifacts', () => {
    const result = resolveHarness(undefined);

    expect(DEFAULT_HARNESS).toBe('opencode');
    expect(result).toMatchObject({ ok: true, harness: 'opencode' });
    expect(result.artifacts).toEqual([]);
  });

  test('allows explicit Codex selection', () => {
    const result = resolveHarness('codex');

    expect(result).toMatchObject({ ok: true, harness: 'codex' });
    if (result.ok) {
      expect(result.adapter.capabilities.agentDefinitions).toBe('supported');
      expect(result.adapter.capabilities.memoryGovernanceEnforcement).toBe(
        'instruction-only',
      );
    }
  });

  test('rejects Claude, Antigravity, and unknown harnesses without artifacts', () => {
    for (const harness of ['claude', 'antigravity', 'unknown']) {
      const result = resolveHarness(harness);

      expect(result.ok).toBe(false);
      expect(result.artifacts).toEqual([]);
      expect(result.diagnostics[0]).toMatchObject({
        severity: 'error',
        code: 'harness.unsupported',
        requestedHarness: harness,
        supportedHarnesses: SUPPORTED_HARNESSES,
        fallback: 'none',
      });
    }
  });
});
