import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  applyClaudeCodePlan,
  buildClaudeCodeInstallPlan,
  buildClaudeCodeModelPlan,
  claudeCodeOperationAdapter,
  defaultClaudeCodeModelRoles,
  getClaudeCodeStatus,
} from './claude-code';

let home: string;

function context() {
  return { cwd: process.cwd(), scope: 'user' as const, homeDir: home };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-ops-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('claudeCodeOperationAdapter', () => {
  test('exposes first-class metadata and the standard action set', () => {
    expect(claudeCodeOperationAdapter.id).toBe('claude');
    expect(claudeCodeOperationAdapter.available).toBe(true);
    expect(claudeCodeOperationAdapter.actions.map((a) => a.kind)).toEqual([
      'status',
      'list',
      'install',
      'update',
      'sync',
      'model-config',
    ]);
  });

  test('reports missing state before install and installed after apply', () => {
    expect(getClaudeCodeStatus(context()).state).toBe('missing');

    const plan = buildClaudeCodeInstallPlan(context());
    expect(plan.canApply).toBe(true);
    const result = applyClaudeCodePlan(plan);
    expect(result.applied).toBe(true);

    expect(getClaudeCodeStatus(context()).state).toBe('installed');
  });

  test('default model roles use the configured per-role defaults', () => {
    const roles = defaultClaudeCodeModelRoles();
    const modelOf = (role: string) => roles.find((r) => r.role === role)?.model;
    expect(modelOf('explorer')).toBe('haiku');
    expect(modelOf('librarian')).toBe('sonnet');
    expect(modelOf('oracle')).toBe('opus');
    expect(modelOf('designer')).toBe('sonnet');
    expect(modelOf('quick')).toBe('haiku');
    expect(modelOf('deep')).toBe('sonnet');
  });

  test('model plan rejects unsupported aliases and roles', () => {
    const plan = buildClaudeCodeModelPlan(
      {
        harness: 'claude',
        dryRun: true,
        roles: [
          { role: 'deep', model: 'opus' },
          { role: 'deep', model: 'gpt-5.4' },
          { role: 'nonexistent', model: 'sonnet' },
        ],
      },
      context(),
    );
    expect(plan.items).toHaveLength(1);
    expect(
      plan.warnings.some(
        (w) => w.code === 'claude-code-unsupported-model-role',
      ),
    ).toBe(true);
  });

  test('rejects applying a non-claude plan', () => {
    const result = applyClaudeCodePlan({
      id: 'x',
      harness: 'codex',
      action: 'install',
      title: 't',
      summary: 's',
      dryRun: true,
      canApply: true,
      targets: [],
      surfaces: [],
      backup: { required: false, strategy: 'none' },
      items: [],
      warnings: [],
      disclaimers: [],
    });
    expect(result.applied).toBe(false);
  });
});
