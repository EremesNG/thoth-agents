import { describe, expect, test } from 'vitest';
import {
  DEFAULT_HARNESS,
  resolveHarness,
  SUPPORTED_HARNESSES,
} from './registry';

describe('harness registry', () => {
  test('keeps exactly the three accepted harnesses provider-asset free', () => {
    expect(SUPPORTED_HARNESSES).toEqual(['opencode', 'codex', 'claude']);

    for (const harness of SUPPORTED_HARNESSES) {
      const rendered = resolveHarness(harness);
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) continue;

      const output = rendered.adapter.render({
        projectRoot: process.cwd(),
      });
      const serialized = output.artifacts
        .map((artifact) => `${artifact.path}\n${String(artifact.content)}`)
        .join('\n');

      expect(serialized).not.toContain('thoth_mem');
      expect(serialized).not.toMatch(/skills[\\/]thoth-mem-agents/i);
      expect(serialized).not.toContain('bundled MCP server');
    }
  });

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

  test('allows explicit Claude Code selection as a first-class harness', () => {
    const result = resolveHarness('claude');

    expect(result).toMatchObject({ ok: true, harness: 'claude' });
    if (result.ok) {
      expect(result.adapter.displayName).toBe('Claude Code');
      expect(result.adapter.capabilities).toMatchObject({
        agentDefinitions: 'supported',
        delegatedExecution: 'supported',
        rolePermissions: 'supported',
        parentContextInjection: 'supported',
        memoryGovernanceEnforcement: 'instruction-only',
      });
    }
  });

  test('rejects claude-code, Antigravity, and unknown harnesses without artifacts', () => {
    for (const harness of ['claude-code', 'antigravity', 'unknown']) {
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
