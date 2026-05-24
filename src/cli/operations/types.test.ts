import { describe, expect, test } from 'vitest';
import type { OperationPlan } from './types';

describe('OperationPlan', () => {
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
