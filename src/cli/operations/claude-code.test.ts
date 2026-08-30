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
import { finalizeHarnessInstall } from '../install-completion';
import {
  getInstallLedgerPath,
  readInstallLedger,
  recordCompletedInstall,
} from '../install-ledger';
import { resolveExecutingPackageVersion } from '../package-version';
import {
  applyClaudeCodePlan,
  buildClaudeCodeInstallPlan,
  buildClaudeCodeModelPlan,
  buildClaudeCodeSyncPlan,
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

function claudeProviderResult() {
  return {
    success: true,
    evidenceValid: true,
    status: 'complete' as const,
    changed: true,
    harness: 'claude' as const,
    target: 'C:/provider/claude',
    steps: [{ name: 'Provider setup', outcome: 'complete' as const }],
    diagnostics: ['provider complete'],
    manualActions: [],
    receipt: null,
    command: 'npx',
    args: ['thoth-mem@latest'],
    exitCode: 0,
  };
}

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
                  name: 'thoth-agents-claude',
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
                  id: 'thoth-agents@thoth-agents-claude',
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
    env: {},
    scope: 'user' as const,
    homeDir: home,
    commandExecutor: commandExecutor(manager),
    runThothMemSetup: () => claudeProviderResult(),
    installLedgerOptions: { homeDir: home, env: {} },
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
  function completeProviderResult() {
    return claudeProviderResult();
  }

  test.each([
    ['install', buildClaudeCodeInstallPlan],
    ['update', buildClaudeCodeUpdatePlan],
  ] as const)('%s keeps native refresh before skills, provider, and ledger', (action, buildPlan) => {
    const effects: string[] = [];
    const nativeExecutor = commandExecutor(manager);
    const trackedExecutor: ClaudeCommandExecutor = (command, args, options) => {
      const key = args.join(' ');
      if (!key.includes(' list ')) effects.push(`native:${key}`);
      return nativeExecutor(command, args, options);
    };
    const installSkill = vi.fn((skill: { name: string }) => {
      effects.push(`external:${skill.name}`);
      return {
        status: 'installed' as const,
        skillPath: join(home, '.claude', 'skills', skill.name),
      };
    });
    const finalize = vi.fn((options) => {
      effects.push('provider-ledger');
      return finalizeHarnessInstall(options);
    });
    const operationContext = {
      ...context(),
      commandExecutor: trackedExecutor,
      resolveExecutingPackageVersion: () => ({
        ok: true as const,
        version: '0.4.8',
        packageRoot: process.cwd(),
      }),
      installRequiredSkill: installSkill,
      finalizeHarnessInstall: finalize,
      installLedgerOptions: { homeDir: home, env: {} },
    };

    const plan = buildPlan(operationContext);
    const titles = plan.items.map(({ title }) => title);

    expect(plan.action).toBe(action);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Install required external skills for Claude Code',
        'Plan provider-owned thoth-mem setup for Claude Code',
        'Record completed Claude Code CLI install',
      ]),
    );
    expect(effects).toEqual([]);
    expect(installSkill).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();

    const result = applyClaudeCodePlan(plan);

    expect(result.applied).toBe(true);
    expect(effects).toEqual([
      'native:plugin marketplace add https://github.com/EremesNG/thoth-agents.git#master --scope user',
      'native:plugin install thoth-agents@thoth-agents-claude --scope user',
      ...[
        'simplify',
        'tdd',
        'progressive-context-router',
        'architectural-grilling',
      ].map((name) => `external:${name}`),
      'provider-ledger',
    ]);
    expect(readInstallLedger({ homeDir: home, env: {} })).toMatchObject({
      status: 'valid',
      ledger: { harnesses: { claude: { version: '0.4.8' } } },
    });
  });

  test('reports incomplete provider finalization after Claude native and skill success', () => {
    const finalize = vi.fn(() => ({
      success: false,
      provider: {
        ...completeProviderResult(),
        success: false,
        status: 'partial' as const,
        diagnostics: ['provider partial'],
        exitCode: 2,
      },
      ledger: {
        status: 'not-attempted' as const,
        path: getInstallLedgerPath({ homeDir: home, env: {} }),
      },
      error: 'provider incomplete',
    }));
    const operationContext = {
      ...context(),
      resolveExecutingPackageVersion: () => ({
        ok: true as const,
        version: '0.4.8',
        packageRoot: process.cwd(),
      }),
      finalizeHarnessInstall: finalize,
      installRequiredSkill: vi.fn(() => ({ status: 'installed' as const })),
      installLedgerOptions: { homeDir: home, env: {} },
    };

    const result = applyClaudeCodePlan(
      buildClaudeCodeUpdatePlan(operationContext),
    );

    expect(result.applied).toBe(false);
    expect(result.summary).toContain('provider incomplete');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'provider partial' }),
      ]),
    );
  });

  test('sync remains narrower and does not advance the Claude CLI ledger', () => {
    manager.marketplace = true;
    manager.plugin = true;
    manager.enabled = true;

    expect(buildClaudeCodeInstallPlan(context()).items[0]?.title).toBe(
      'Verify Claude Code native marketplace and plugin state',
    );

    const result = applyClaudeCodePlan(buildClaudeCodeSyncPlan(context()));

    expect(result.applied).toBe(true);
    expect(readInstallLedger({ homeDir: home, env: {} }).status).toBe(
      'missing',
    );
  });

  test('keeps the CLI-managed version authoritative across native marketplace changes', () => {
    const executing = resolveExecutingPackageVersion();
    expect(executing.ok).toBe(true);
    if (!executing.ok) return;
    const recordedVersion = executing.version === '0.4.7' ? '0.4.6' : '0.4.7';
    expect(
      recordCompletedInstall({
        harness: 'claude',
        version: recordedVersion,
        homeDir: home,
        env: {},
      }).success,
    ).toBe(true);
    const versionTarget = () =>
      getClaudeCodeStatus(context()).targets.find(
        ({ label }) => label === 'CLI-managed install version',
      );

    expect(versionTarget()).toMatchObject({
      state: 'outdated',
      expected: `executing ${executing.version}`,
      observed: `recorded ${recordedVersion}`,
    });

    manager.marketplace = true;
    manager.plugin = true;
    manager.enabled = true;
    expect(getClaudeCodeStatus(context()).state).toBe('missing');
    expect(versionTarget()).toMatchObject({
      state: 'outdated',
      observed: `recorded ${recordedVersion}`,
    });
  });

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
            'claude plugin marketplace add https://github.com/EremesNG/thoth-agents.git#master --scope user',
        }),
        expect.objectContaining({
          title: 'Install required external skills for Claude Code',
        }),
      ]),
    );
    const result = applyClaudeCodePlan(plan);

    expect(result.applied).toBe(true);
    expect(manager.mutations).toEqual([
      'plugin marketplace add https://github.com/EremesNG/thoth-agents.git#master --scope user',
      'plugin install thoth-agents@thoth-agents-claude --scope user',
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
            'claude plugin update thoth-agents@thoth-agents-claude --scope user',
        }),
      ]),
    );

    expect(applyClaudeCodePlan(plan).applied).toBe(true);
    expect(manager.mutations).toContain(
      'plugin update thoth-agents@thoth-agents-claude --scope user',
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
