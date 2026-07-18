import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProviderEvidenceInput } from '../../harness/types';
import {
  applyClaudeCodePlan,
  buildClaudeCodeInstallPlan,
  buildClaudeCodeModelPlan,
  claudeCodeOperationAdapter,
  defaultClaudeCodeModelRoles,
  getClaudeCodeStatus,
  resolveClaudeCodeEffort,
} from './claude-code';
import type { HarnessStatusReport } from './types';

const installRequiredSkillMock = vi.hoisted(() => vi.fn());

vi.mock('../skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skills')>();
  return { ...actual, installRequiredSkill: installRequiredSkillMock };
});

let home: string;

function context() {
  return { cwd: process.cwd(), scope: 'user' as const, homeDir: home };
}

const getClaudeCodeStatusWithEvidence = getClaudeCodeStatus as unknown as (
  operationContext: ReturnType<typeof context>,
  evidence?: ProviderEvidenceInput,
) => HarnessStatusReport;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-ops-'));
  installRequiredSkillMock.mockReset();
  installRequiredSkillMock.mockImplementation((skill, harness, options) => {
    const path = join(
      options.homeDir,
      '.claude',
      'skills',
      skill.skillName,
      'SKILL.md',
    );
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `---\nname: ${skill.skillName}\n---\n`);
    return { skill, harness, skillPath: path, status: 'installed' };
  });
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
    expect(plan.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Install required external skills for Claude Code',
        }),
      ]),
    );
    const result = applyClaudeCodePlan(plan);
    expect(result.applied).toBe(true);
    expect(installRequiredSkillMock).toHaveBeenCalledTimes(4);

    expect(getClaudeCodeStatus(context()).state).toBe('installed');
  });

  test('Claude Code install is incomplete when a required skill fails', () => {
    installRequiredSkillMock.mockReturnValue({ status: 'failed' });

    const result = applyClaudeCodePlan(buildClaudeCodeInstallPlan(context()));

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'critical',
          code: 'claude-code-required-skill-failed',
        }),
      ]),
    );
  });

  test('propagates explicit unsupported provider evidence without changing consumer install state', () => {
    const providerEvidence = {
      state: 'unsupported' as const,
      source: 'harness' as const,
      basis: ['provider capability unavailable for this Claude binding'],
    };

    const status = getClaudeCodeStatusWithEvidence(context(), {
      providerEvidence,
    });

    expect(status.state).toBe('missing');
    expect(status.providerCapability).toEqual(providerEvidence);
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

  test('resolves official alias efforts and intersects concrete model catalog values', () => {
    expect(
      resolveClaudeCodeEffort({
        model: 'opus',
        effort: { kind: 'effort', value: 'max' },
      }),
    ).toEqual({ ok: true, effort: 'max' });
    expect(
      resolveClaudeCodeEffort({
        model: 'anthropic/claude-opus-4.6',
        catalogId: 'anthropic/claude-opus-4.6',
        availableEfforts: ['low', 'high'],
        effort: { kind: 'effort', value: 'high' },
      }),
    ).toEqual({ ok: true, effort: 'high' });
    expect(
      resolveClaudeCodeEffort({
        model: 'anthropic/claude-opus-4.6',
        catalogId: 'anthropic/claude-opus-4.6',
        availableEfforts: ['low', 'high'],
        effort: { kind: 'effort', value: 'max' },
      }),
    ).toMatchObject({
      ok: false,
      code: 'claude-code-effort-catalog-unsupported',
    });
    expect(
      resolveClaudeCodeEffort({
        model: 'opus',
        effort: { kind: 'inherit' },
      }),
    ).toEqual({ ok: true, effort: undefined });
  });

  test('manual concrete model-only plans round-trip without excluded controls', () => {
    const model = 'anthropic/claude-opus-4.6';
    const plan = buildClaudeCodeModelPlan(
      {
        harness: 'claude',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            model,
            catalogId: model,
            effort: { kind: 'inherit' },
          },
        ],
      },
      context(),
    );

    expect(applyClaudeCodePlan(plan).applied).toBe(true);
    expect(applyClaudeCodePlan(plan).applied).toBe(true);
    const output = readFileSync(
      join(home, '.claude', 'skills', 'thoth-agents', 'agents', 'deep.md'),
      'utf8',
    );
    expect(output).toContain(`model: ${model}`);
    expect(output).not.toMatch(/^effort:/m);
    expect(output).not.toContain('toggle');
    expect(output).not.toContain('budget_tokens');
  });

  test('explicit inherit clears Claude effort while model-only changes preserve it', () => {
    const target = join(
      home,
      '.claude',
      'skills',
      'thoth-agents',
      'agents',
      'deep.md',
    );
    const withEffort = buildClaudeCodeModelPlan(
      {
        harness: 'claude',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            model: 'opus',
            effort: { kind: 'effort', value: 'high' },
          },
        ],
      },
      context(),
    );
    expect(applyClaudeCodePlan(withEffort).applied).toBe(true);
    expect(readFileSync(target, 'utf8')).toMatch(/^effort: high$/m);

    const modelOnly = buildClaudeCodeModelPlan(
      {
        harness: 'claude',
        dryRun: true,
        roles: [{ role: 'deep', model: 'sonnet' }],
      },
      context(),
    );
    expect(applyClaudeCodePlan(modelOnly).applied).toBe(true);
    expect(readFileSync(target, 'utf8')).toMatch(/^effort: high$/m);

    const clearEffort = buildClaudeCodeModelPlan(
      {
        harness: 'claude',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            model: 'sonnet',
            effort: { kind: 'inherit' },
          },
        ],
      },
      context(),
    );
    expect(applyClaudeCodePlan(clearEffort).applied).toBe(true);
    expect(readFileSync(target, 'utf8')).not.toMatch(/^effort:/m);
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
