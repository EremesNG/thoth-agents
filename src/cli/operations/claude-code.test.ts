import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProviderEvidenceInput } from '../../harness/types';
import type { ClaudeCommandExecutor } from '../claude-code-install';
import {
  applyClaudeCodePlan,
  buildClaudeCodeInstallPlan,
  buildClaudeCodeModelPlan,
  buildClaudeCodeUpdatePlan,
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

interface ManagerState {
  marketplace: boolean;
  plugin: boolean;
  enabled: boolean;
  failInspection?: boolean;
  mutations: string[];
}

let home: string;
let manager: ManagerState;

function commandExecutor(state: ManagerState): ClaudeCommandExecutor {
  return (_command, args) => {
    const key = args.join(' ');
    if (key === 'plugin marketplace list --json') {
      if (state.failInspection) {
        return { exitCode: 1, stdout: '', stderr: 'inspection failed' };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify(
          state.marketplace
            ? [
                {
                  name: 'thoth-agents',
                  source: 'github',
                  repo: 'EremesNG/thoth-agents',
                },
              ]
            : [],
        ),
        stderr: '',
      };
    }
    if (key === 'plugin list --json') {
      if (state.failInspection) {
        return { exitCode: 1, stdout: '', stderr: 'inspection failed' };
      }
      return {
        exitCode: 0,
        stdout: JSON.stringify(
          state.plugin
            ? [
                {
                  id: 'thoth-agents@thoth-agents',
                  scope: 'user',
                  enabled: state.enabled,
                },
              ]
            : [],
        ),
        stderr: '',
      };
    }
    state.mutations.push(key);
    if (key.startsWith('plugin marketplace add ')) state.marketplace = true;
    if (key.startsWith('plugin install ')) {
      state.plugin = true;
      state.enabled = true;
    }
    if (key.startsWith('plugin enable ')) state.enabled = true;
    return { exitCode: 0, stdout: 'ok', stderr: '' };
  };
}

function context() {
  return {
    cwd: process.cwd(),
    scope: 'user' as const,
    homeDir: home,
    commandExecutor: commandExecutor(manager),
  };
}

const getClaudeCodeStatusWithEvidence = getClaudeCodeStatus as unknown as (
  operationContext: ReturnType<typeof context>,
  evidence?: ProviderEvidenceInput,
) => HarnessStatusReport;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-ops-'));
  manager = {
    marketplace: false,
    plugin: false,
    enabled: false,
    mutations: [],
  };
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
  test('exposes native plugin operations and disables cache model rewrites', () => {
    expect(claudeCodeOperationAdapter.id).toBe('claude');
    expect(claudeCodeOperationAdapter.available).toBe(true);
    expect(
      claudeCodeOperationAdapter.actions.map((action) => action.kind),
    ).toEqual(['status', 'list', 'install', 'update', 'sync', 'model-config']);
    expect(
      claudeCodeOperationAdapter.actions.find(
        (action) => action.kind === 'model-config',
      ),
    ).toMatchObject({ supported: false });
  });

  test('reports missing state before native install and installed after apply', () => {
    expect(getClaudeCodeStatus(context()).state).toBe('missing');

    const plan = buildClaudeCodeInstallPlan(context());
    expect(plan.canApply).toBe(true);
    expect(plan.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Register the package-owned thoth-agents Claude marketplace.',
          preview:
            'claude plugin marketplace add EremesNG/thoth-agents --scope user',
        }),
        expect.objectContaining({
          title: 'Install required external skills for Claude Code',
        }),
      ]),
    );
    const result = applyClaudeCodePlan(plan);

    expect(result.applied).toBe(true);
    expect(manager.mutations).toEqual([
      'plugin marketplace add EremesNG/thoth-agents --scope user',
      'plugin install thoth-agents@thoth-agents --scope user',
    ]);
    expect(installRequiredSkillMock).toHaveBeenCalledTimes(4);
    expect(getClaudeCodeStatus(context()).state).toBe('installed');
  });

  test('fails closed when manager inspection is unavailable', () => {
    manager.failInspection = true;

    const status = getClaudeCodeStatus(context());
    const plan = buildClaudeCodeInstallPlan(context());

    expect(status.state).toBe('unknown');
    expect(plan.canApply).toBe(false);
    expect(manager.mutations).toEqual([]);
  });

  test('update delegates plugin refresh to the native manager', () => {
    manager.marketplace = true;
    manager.plugin = true;
    manager.enabled = true;

    const plan = buildClaudeCodeUpdatePlan(context());
    expect(plan.canApply).toBe(true);
    expect(plan.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          preview:
            'claude plugin update thoth-agents@thoth-agents --scope user',
        }),
      ]),
    );

    expect(applyClaudeCodePlan(plan).applied).toBe(true);
    expect(manager.mutations).toContain(
      'plugin update thoth-agents@thoth-agents --scope user',
    );
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

  test('propagates provider evidence without changing consumer install state', () => {
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

  test('default model roles use package-owned per-role defaults', () => {
    const roles = defaultClaudeCodeModelRoles();
    const modelOf = (role: string) =>
      roles.find((entry) => entry.role === role)?.model;
    expect(modelOf('explorer')).toBe('haiku');
    expect(modelOf('librarian')).toBe('sonnet');
    expect(modelOf('oracle')).toBe('opus');
    expect(modelOf('designer')).toBe('sonnet');
    expect(modelOf('quick')).toBe('haiku');
    expect(modelOf('deep')).toBe('sonnet');
  });

  test('model plan is diagnostic-only and never writes manager cache files', () => {
    const plan = buildClaudeCodeModelPlan(
      {
        harness: 'claude',
        dryRun: true,
        roles: [{ role: 'deep', model: 'opus' }],
      },
      context(),
    );

    expect(plan.canApply).toBe(false);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'claude-code-model-cache-owned' }),
      ]),
    );
    expect(applyClaudeCodePlan(plan).applied).toBe(false);
    expect(existsSync(join(home, '.claude', 'plugins'))).toBe(false);
    expect(manager.mutations).toEqual([]);
  });

  test('resolves official alias efforts and intersects concrete catalog values', () => {
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
