import { describe, expect, test } from 'vitest';
import type { OperationPlan } from './types';
import * as operationTypes from './types';

type EvidenceInput = {
  providerEvidence?: {
    state: 'supported' | 'degraded' | 'unsupported';
    source: 'provider' | 'harness' | 'none';
    basis: string[];
  };
};

function classifyEvidence(input: EvidenceInput = {}): unknown {
  const classifier = (
    operationTypes as unknown as {
      classifyProviderCapabilityEvidence?: (value: EvidenceInput) => unknown;
    }
  ).classifyProviderCapabilityEvidence;

  return classifier?.(input) ?? 'missing-provider-evidence-classifier';
}

describe('OperationPlan', () => {
  test('classifies complete caller-supplied evidence as supported', () => {
    expect(
      classifyEvidence({
        providerEvidence: {
          state: 'supported',
          source: 'provider',
          basis: ['documented provider outcome evidence'],
        },
      }),
    ).toEqual({
      state: 'supported',
      source: 'provider',
      basis: ['documented provider outcome evidence'],
    });
  });

  test('classifies partial caller-supplied evidence as degraded', () => {
    expect(
      classifyEvidence({
        providerEvidence: {
          state: 'degraded',
          source: 'harness',
          basis: ['persistence evidenced; continuity not evidenced'],
        },
      }),
    ).toEqual({
      state: 'degraded',
      source: 'harness',
      basis: ['persistence evidenced; continuity not evidenced'],
    });
  });

  test('fails contradictory caller-supplied evidence closed as unsupported', () => {
    expect(
      classifyEvidence({
        providerEvidence: {
          state: 'supported',
          source: 'none',
          basis: ['consumer package presence only'],
        },
      }),
    ).toEqual({ state: 'unsupported', source: 'none', basis: [] });
  });

  test('fails stale or unsubstantiated caller evidence closed as unsupported', () => {
    expect(
      classifyEvidence({
        providerEvidence: {
          state: 'supported',
          source: 'provider',
          basis: [],
        },
      }),
    ).toEqual({ state: 'unsupported', source: 'none', basis: [] });
  });

  test('defaults omitted evidence to unsupported without changing consumer state', () => {
    expect(classifyEvidence()).toEqual({
      state: 'unsupported',
      source: 'none',
      basis: [],
    });
  });

  test('returns ephemeral evidence reports without retaining prior caller evidence', () => {
    const supplied = {
      providerEvidence: {
        state: 'supported' as const,
        source: 'provider' as const,
        basis: ['provider-observed continuity'],
      },
    };

    const first = classifyEvidence(supplied);
    const second = classifyEvidence();

    expect(first).toEqual(supplied.providerEvidence);
    expect(first).not.toBe(supplied.providerEvidence);
    expect(second).toEqual({
      state: 'unsupported',
      source: 'none',
      basis: [],
    });
  });

  test('models dry-run preview safety metadata as first-class fields', () => {
    const plan: OperationPlan = {
      id: 'codex-sync-preview',
      harness: 'codex',
      action: 'sync',
      title: 'Sync Codex managed agent files',
      summary: 'Preview generated Codex subagent updates.',
      dryRun: true,
      canApply: false,
      targets: [
        {
          kind: 'file',
          path: 'C:\\Users\\Ada\\.codex\\agents\\deep.toml',
          label: 'deep subagent TOML',
          state: 'drift',
        },
      ],
      surfaces: [
        {
          id: 'codex-agent-toml',
          label: 'Codex agent TOML files',
          state: 'drift',
        },
      ],
      backup: {
        required: true,
        strategy: 'managed-backup-file',
        destinations: [
          {
            path: 'C:\\Users\\Ada\\.codex\\agents\\deep.toml.bak',
            label: 'deep TOML backup',
          },
        ],
      },
      items: [
        {
          title: 'Rewrite deep subagent model line',
          target: {
            kind: 'file',
            path: 'C:\\Users\\Ada\\.codex\\agents\\deep.toml',
          },
          state: 'drift',
          preview: 'model = "gpt-5.1"',
          backup: {
            required: true,
            strategy: 'managed-backup-file',
          },
        },
      ],
      warnings: [
        {
          severity: 'important',
          message: 'Codex root orchestration remains instruction-level.',
        },
      ],
      disclaimers: [
        {
          message: 'Preview only; no TOML files were written.',
        },
      ],
    };

    expect(plan.dryRun).toBe(true);
    expect(plan.canApply).toBe(false);
    expect(plan.targets[0]?.path).toContain('\\.codex\\');
    expect(plan.surfaces[0]?.id).toBe('codex-agent-toml');
    expect(plan.backup.required).toBe(true);
    expect(plan.warnings[0]?.severity).toBe('important');
    expect(plan.disclaimers[0]?.message).toContain('Preview');
  });
});
