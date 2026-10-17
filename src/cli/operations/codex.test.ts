import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProviderEvidenceInput } from '../../harness/types';
import { applyCodexSetup, buildCodexSetupPlan } from '../codex-install';
import type { CodexCommandExecutor } from '../codex-plugin-install';
import { finalizeHarnessInstall } from '../install-completion';
import { readInstallLedger, recordCompletedInstall } from '../install-ledger';
import { getShippedModelRoles } from '../model-defaults';
import { resolveExecutingPackageVersion } from '../package-version';
import { buildRestoreModelPlan } from '../tui/operations';
import {
  applyCodexPlan,
  buildCodexInstallPlan,
  buildCodexModelPlan,
  buildCodexSyncPlan,
  buildCodexUpdatePlan,
  getCodexStatus,
  resolveCodexEffort,
} from './codex';
import type { HarnessStatusReport } from './types';

const installRequiredSkillMock = vi.hoisted(() => vi.fn());

vi.mock('../skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skills')>();
  return { ...actual, installRequiredSkill: installRequiredSkillMock };
});

const PACKAGE_ROOT = process.cwd();
const PACKAGE_VERSION_RESULT = resolveExecutingPackageVersion();
const PACKAGE_VERSION = PACKAGE_VERSION_RESULT.ok
  ? PACKAGE_VERSION_RESULT.version
  : '0.0.0';

function requiredSkillPath(home: string, name: string): string {
  return join(home, '.agents', 'skills', name, 'SKILL.md');
}

function writeRequiredSkills(home: string): void {
  for (const name of [
    'simplify',
    'tdd',
    'progressive-context-router',
    'architectural-grilling',
  ]) {
    const path = requiredSkillPath(home, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `---\nname: ${name}\n---\n`);
  }
}

function codexProviderResult() {
  return {
    success: true,
    evidenceValid: true,
    status: 'complete' as const,
    changed: true,
    harness: 'codex' as const,
    target: 'C:/provider/codex',
    steps: [{ name: 'Provider setup', outcome: 'complete' as const }],
    diagnostics: ['provider complete'],
    manualActions: [],
    receipt: null,
    command: 'npx',
    args: ['thoth-mem@latest'],
    exitCode: 0,
  };
}

const installedCodexManagerExecutor: CodexCommandExecutor = (
  _command,
  args,
) => {
  const key = args.join(' ');
  if (key === 'plugin marketplace list --json') {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        marketplaces: [
          {
            name: 'thoth-plugins',
            source: 'https://github.com/EremesNG/thoth-plugins.git',
          },
        ],
      }),
      stderr: '',
    };
  }
  if (key === 'plugin list --available --json') {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        installed: [
          {
            pluginId: 'thoth-agents@thoth-plugins',
            enabled: true,
            version: PACKAGE_VERSION,
          },
        ],
      }),
      stderr: '',
    };
  }
  return { exitCode: 1, stdout: '', stderr: 'unexpected native mutation' };
};

beforeEach(() => {
  installRequiredSkillMock.mockReset();
  installRequiredSkillMock.mockImplementation((skill, harness, options) => {
    const path = requiredSkillPath(options.homeDir, skill.skillName);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `---\nname: ${skill.skillName}\n---\n`);
    return { skill, harness, skillPath: path, status: 'installed' };
  });
});

function context(dir: string, home: string, hookCapable = true) {
  if (hookCapable) seedHookBundle(home);
  return {
    cwd: dir,
    env: {},
    homeDir: home,
    packageRoot: PACKAGE_ROOT,
    codexPluginCommandExecutor: installedCodexManagerExecutor,
    runThothMemSetup: () => codexProviderResult(),
    installLedgerOptions: { homeDir: home, env: {} },
  };
}

const getCodexStatusWithEvidence = getCodexStatus as unknown as (
  operationContext: ReturnType<typeof context>,
  evidence?: ProviderEvidenceInput,
) => HarnessStatusReport;

function setup(dir: string, home: string): void {
  seedHookBundle(home);
  const result = applyCodexSetup(
    buildCodexSetupPlan({
      dryRun: false,
      reset: false,
      scope: 'user',
      projectRoot: dir,
      homeDir: home,
      packageRoot: PACKAGE_ROOT,
      commandExecutor: installedCodexManagerExecutor,
    }),
  );
  expect(result.success).toBe(true);
  writeRequiredSkills(home);
}

function rolePath(home: string, role: string): string {
  return join(home, '.codex', 'agents', `thoth-agents-${role}.toml`);
}

function managedModelsPath(home: string): string {
  return join(home, '.codex', 'agents', '.thoth-agents-managed-models.json');
}

function roleModel(content: string): string | undefined {
  return /^model\s*=\s*"([^"]+)"\s*$/m.exec(content)?.[1];
}

describe('Codex operations adapter', () => {
  test.each([
    ['install', buildCodexInstallPlan],
    ['update', buildCodexUpdatePlan],
  ] as const)('%s runs native manager before managed setup, skills, provider, and ledger', (action, buildPlan) => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-parity-'));
    try {
      const home = join(dir, 'home');
      const effects: string[] = [];
      let marketplace = false;
      let plugin = false;
      const commandExecutor: CodexCommandExecutor = (_command, args) => {
        const key = args.join(' ');
        if (key === 'plugin marketplace list --json') {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              marketplaces: marketplace
                ? [
                    {
                      name: 'thoth-plugins',
                      source: 'https://github.com/EremesNG/thoth-plugins.git',
                    },
                  ]
                : [],
            }),
            stderr: '',
          };
        }
        if (key === 'plugin list --available --json') {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              installed: plugin
                ? [
                    {
                      pluginId: 'thoth-agents@thoth-plugins',
                      enabled: true,
                      version: '0.4.8',
                    },
                  ]
                : [],
            }),
            stderr: '',
          };
        }
        effects.push(
          key.startsWith('plugin marketplace add')
            ? 'native-marketplace'
            : 'native-plugin',
        );
        if (key.startsWith('plugin marketplace add')) marketplace = true;
        if (key.startsWith('plugin add')) plugin = true;
        return { exitCode: 0, stdout: '{}', stderr: '' };
      };
      const applyManagedSetup = vi.fn(() => {
        effects.push('agent-pack');
        return { success: true, changed: [], diagnostics: [] };
      });
      const installSkill = vi.fn((skill: { name: string }) => {
        effects.push(`external:${skill.name}`);
        return {
          status: 'installed' as const,
          skillPath: join(home, '.agents', 'skills', skill.name),
        };
      });
      const finalize = vi.fn((options) => {
        effects.push('provider-ledger');
        return finalizeHarnessInstall(options);
      });
      const operationContext = {
        ...context(dir, home),
        resolveExecutingPackageVersion: () => ({
          ok: true as const,
          version: '0.4.8',
          packageRoot: process.cwd(),
        }),
        codexPluginCommandExecutor: commandExecutor,
        applyCodexSetup: applyManagedSetup,
        installRequiredSkill: installSkill,
        finalizeHarnessInstall: finalize,
        installLedgerOptions: { homeDir: home, env: {} },
      };

      const plan = buildPlan(operationContext);
      const titles = plan.items.map(({ title }) => title);

      expect(plan.action).toBe(action);
      expect(titles[0]).toContain('marketplace');
      expect(titles).toEqual(
        expect.arrayContaining([
          'Install required external skills for Codex',
          'Plan provider-owned thoth-mem setup for Codex',
          'Record completed Codex CLI install',
        ]),
      );
      expect(effects).toEqual([]);
      expect(applyManagedSetup).not.toHaveBeenCalled();
      expect(installSkill).not.toHaveBeenCalled();
      expect(finalize).not.toHaveBeenCalled();

      const result = applyCodexPlan(plan);

      expect(result.applied).toBe(true);
      expect(effects).toEqual([
        'native-marketplace',
        'native-plugin',
        'agent-pack',
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
        ledger: { harnesses: { codex: { version: '0.4.8' } } },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails before Codex managed files when native manager apply fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-native-fail-'));
    try {
      const home = join(dir, 'home');
      const commandExecutor: CodexCommandExecutor = (_command, args) => {
        const key = args.join(' ');
        if (key.includes(' list')) {
          return {
            exitCode: 0,
            stdout: key.startsWith('plugin marketplace')
              ? '{"marketplaces":[]}'
              : '{"installed":[]}',
            stderr: '',
          };
        }
        return { exitCode: 1, stdout: '', stderr: 'native failure' };
      };
      const applyManagedSetup = vi.fn();
      const finalize = vi.fn();
      const operationContext = {
        ...context(dir, home),
        resolveExecutingPackageVersion: () => ({
          ok: true as const,
          version: '0.4.8',
          packageRoot: process.cwd(),
        }),
        codexPluginCommandExecutor: commandExecutor,
        applyCodexSetup: applyManagedSetup,
        finalizeHarnessInstall: finalize,
      };

      const result = applyCodexPlan(buildCodexUpdatePlan(operationContext));

      expect(result.applied).toBe(false);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('native failure'),
          }),
        ]),
      );
      expect(applyManagedSetup).not.toHaveBeenCalled();
      expect(finalize).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports the authoritative CLI-managed version independently of native marketplace state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ledger-status-'));
    try {
      const home = join(dir, 'home');
      const executing = resolveExecutingPackageVersion();
      expect(executing.ok).toBe(true);
      if (!executing.ok) return;
      const versionTarget = () =>
        getCodexStatus(context(dir, home)).targets.find(
          ({ label }) => label === 'CLI-managed install version',
        );

      expect(versionTarget()).toMatchObject({
        state: 'missing',
        expected: `executing ${executing.version}`,
        observed: 'recorded missing',
      });

      const recordedVersion = executing.version === '0.4.7' ? '0.4.6' : '0.4.7';
      expect(
        recordCompletedInstall({
          harness: 'codex',
          version: recordedVersion,
          homeDir: home,
          env: {},
        }).success,
      ).toBe(true);
      expect(versionTarget()).toMatchObject({
        state: 'outdated',
        expected: `executing ${executing.version}`,
        observed: `recorded ${recordedVersion}`,
      });

      setup(dir, home);
      expect(getCodexStatus(context(dir, home)).state).toBe('installed');
      expect(versionTarget()).toMatchObject({
        state: 'outdated',
        observed: `recorded ${recordedVersion}`,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('resolves only exact catalog efforts in the documented Codex surface', () => {
    const base = {
      role: 'worker',
      model: 'gpt-5.6-sol',
      catalogId: 'openai/gpt-5.6-sol',
      availableEfforts: ['none', 'max', 'ultra', 'future-level'],
    };
    expect(
      resolveCodexEffort({
        ...base,
        effort: { kind: 'effort', value: 'ultra' },
      }),
    ).toEqual({ ok: true, value: 'ultra' });
    expect(
      resolveCodexEffort({
        ...base,
        effort: { kind: 'effort', value: 'future-level' },
      }),
    ).toMatchObject({ ok: false, code: 'codex-effort-undocumented' });
    expect(
      resolveCodexEffort({
        ...base,
        availableEfforts: ['none', 'max'],
        effort: { kind: 'effort', value: 'ultra' },
      }),
    ).toMatchObject({ ok: false, code: 'codex-effort-model-unsupported' });
    expect(
      resolveCodexEffort({ ...base, effort: { kind: 'inherit' } }),
    ).toEqual({ ok: true, value: undefined });
  });
  test('Codex status classifies managed runtime surfaces without inspecting plugin-manager cache', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      expect(getCodexStatus(context(dir, home)).state).toBe('missing');

      setup(dir, home);
      expect(getCodexStatus(context(dir, home)).state).toBe('installed');

      writeFileSync(
        rolePath(home, 'worker'),
        readFileSync(rolePath(home, 'worker'), 'utf8').replace(
          'name = "worker"',
          'name = "worker-drift"',
        ),
      );
      expect(getCodexStatus(context(dir, home)).state).toBe('drift');

      setup(dir, home);
      writeFileSync(managedModelsPath(home), '{ invalid json');
      const unknown = getCodexStatus(context(dir, home));
      expect(unknown.state).toBe('unknown');
      expect(
        unknown.diagnostics.some((diagnostic) =>
          diagnostic.message.includes('operator-edited or unattributed'),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports degraded provider evidence without degrading installed consumer state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-evidence-'));
    try {
      const home = join(dir, 'home');
      setup(dir, home);
      const providerEvidence = {
        state: 'degraded' as const,
        source: 'harness' as const,
        basis: ['persistence evidenced; continuity not evidenced'],
      };

      const status = getCodexStatusWithEvidence(context(dir, home), {
        providerEvidence,
      });

      expect(status.state).toBe('installed');
      expect(status.providerCapability).toEqual(providerEvidence);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex update and sync plans wrap setup dry-runs without writing files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      const update = buildCodexUpdatePlan(context(dir, home));
      const sync = buildCodexSyncPlan(context(dir, home));

      expect(update.harness).toBe('codex');
      expect(update.action).toBe('update');
      expect(update.dryRun).toBe(true);
      expect(update.canApply).toBe(true);
      expect(update.warnings.map((item) => item.message).join('\n')).toContain(
        '/plugins',
      );
      expect(
        update.disclaimers.map((item) => item.message).join('\n'),
      ).toContain('Role permissions');
      expect(sync.action).toBe('sync');
      expect(
        sync.items.some((item) =>
          item.title.includes('Materialize Codex role'),
        ),
      ).toBe(true);
      expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false);

      expect(applyCodexPlan(sync).applied).toBe(true);
      expect(readInstallLedger({ homeDir: home, env: {} }).status).toBe(
        'missing',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex install plan wraps setup dry-run and can be applied', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      const plan = buildCodexInstallPlan(context(dir, home));

      expect(plan.harness).toBe('codex');
      expect(plan.action).toBe('install');
      expect(plan.dryRun).toBe(true);
      expect(plan.canApply).toBe(true);
      expect(plan.title).toContain('Install');
      expect(plan.items[0]?.title).toBe(
        'Verify Codex native plugin manager state',
      );
      expect(plan.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Install required external skills for Codex',
          }),
        ]),
      );
      expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false);

      const applied = applyCodexPlan(plan);
      expect(applied.applied).toBe(true);
      expect(existsSync(rolePath(home, 'worker'))).toBe(true);
      expect(installRequiredSkillMock).toHaveBeenCalledTimes(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex install is incomplete when a required skill fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-required-skill-'));
    try {
      const home = join(dir, 'home');
      installRequiredSkillMock.mockReturnValue({ status: 'failed' });

      const applied = applyCodexPlan(buildCodexInstallPlan(context(dir, home)));

      expect(applied.applied).toBe(false);
      expect(applied.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'critical',
            code: 'codex-required-skill-failed',
          }),
        ]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex model plan targets only generated subagent model lines and managed state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      const plan = buildCodexModelPlan(
        {
          harness: 'codex',
          dryRun: true,
          roles: [
            { role: 'worker', model: 'openai/gpt-5.5' },
            {
              role: 'designer',
              provider: 'openai',
              model: 'gpt-5.4-mini',
              catalogId: 'openai/gpt-5.4-mini',
              availableEfforts: ['medium'],
              effort: { kind: 'effort', value: 'medium' },
            },
            { role: 'orchestrator', model: 'gpt-5.5' },
          ],
        },
        context(dir, home),
      );

      expect(plan.action).toBe('model-config');
      expect(plan.canApply).toBe(true);
      expect(plan.items).toHaveLength(2);
      expect.soft(plan.items[0]?.preview).toContain('"model":"gpt-5.5"');
      expect.soft(plan.items[1]?.preview).toContain('"model":"gpt-5.4-mini"');
      expect(plan.items[1]?.preview).toContain('"effort":"medium"');
      expect(plan.warnings.map((item) => item.message).join('\n')).toContain(
        'orchestrator',
      );
      expect(plan.disclaimers.map((item) => item.message).join('\n')).toContain(
        'generated subagent TOML model lines',
      );
      expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Codex apply requires explicit applyable plans and preserves user-owned TOML fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-ops-'));
    try {
      const home = join(dir, 'home');
      const unsafe = {
        ...buildCodexUpdatePlan(context(dir, home)),
        canApply: false,
      };
      expect(applyCodexPlan(unsafe).applied).toBe(false);
      expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false);

      const update = buildCodexUpdatePlan(context(dir, home));
      const applied = applyCodexPlan(update);
      expect(applied.applied).toBe(true);
      expect(existsSync(rolePath(home, 'worker'))).toBe(true);
      expect(
        applyCodexPlan({ ...buildCodexUpdatePlan(context(dir, home)) }).applied,
      ).toBe(false);
      expect(
        applyCodexPlan({
          ...buildCodexInstallPlan(context(dir, home)),
          canApply: false,
        }).applied,
      ).toBe(false);

      const workerPath = rolePath(home, 'worker');
      const workerBefore = readFileSync(workerPath, 'utf8').replace(
        'sandbox_mode = "workspace-write"',
        'sandbox_mode = "read-only"',
      );
      writeFileSync(workerPath, workerBefore);
      const modelPlan = buildCodexModelPlan(
        {
          harness: 'codex',
          dryRun: true,
          roles: [{ role: 'worker', model: 'openai/gpt-5.4-mini' }],
        },
        context(dir, home),
      );
      const modelApplied = applyCodexPlan(modelPlan);
      expect(modelApplied.applied).toBe(true);
      const workerAfter = readFileSync(workerPath, 'utf8');
      expect(roleModel(workerAfter)).toBe('gpt-5.4-mini');
      expect(workerAfter).toContain('sandbox_mode = "read-only"');
      expect(workerAfter).toContain('model_reasoning_effort = "max"');
      expect(workerAfter).not.toContain('toggle');
      expect(workerAfter).not.toContain('budget_tokens');

      const clearPlan = buildCodexModelPlan(
        {
          harness: 'codex',
          dryRun: true,
          roles: [
            {
              role: 'worker',
              model: 'openai/gpt-5.4-mini',
              effort: { kind: 'inherit' },
            },
          ],
        },
        context(dir, home),
      );
      expect(applyCodexPlan(clearPlan).applied).toBe(true);
      expect(readFileSync(workerPath, 'utf8')).not.toContain(
        'model_reasoning_effort',
      );
      expect(readFileSync(managedModelsPath(home), 'utf8')).toContain(
        'gpt-5.4-mini',
      );
      expect(readFileSync(managedModelsPath(home), 'utf8')).not.toContain(
        'openai/gpt-5.4-mini',
      );
      expect(getCodexStatus(context(dir, home)).state).toBe('drift');

      setup(dir, home);
      expect(roleModel(readFileSync(workerPath, 'utf8'))).toBe('gpt-5.4-mini');
      expect(readFileSync(workerPath, 'utf8')).not.toContain(
        'model_reasoning_effort',
      );
      // Sync no longer erases the operator's sandbox change.
      expect(readFileSync(workerPath, 'utf8')).toContain(
        'sandbox_mode = "read-only"',
      );
      expect(getCodexStatus(context(dir, home)).state).toBe('drift');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('restores Codex defaults without replacing unrelated TOML settings', () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-restore-'));
  try {
    setup(home, home);
    const defaults = getShippedModelRoles('codex');
    const before = defaults.map((role) => {
      const path = rolePath(home, role.role);
      const content = readFileSync(path, 'utf8')
        .replace(/^model = .*$/m, 'model = "custom-model"')
        .replace(
          /^model_reasoning_effort = .*$/m,
          'model_reasoning_effort = "high"',
        );
      writeFileSync(path, content);
      return content;
    });
    const configPath = join(home, '.codex', 'config.toml');
    const configBefore = readFileSync(configPath, 'utf8');
    const plan = buildRestoreModelPlan(
      'codex',
      ['gpt-6-luna', 'gpt-6.1-sol'].map((model) => ({
        id: `openai/${model}`,
        catalogId: `openai/${model}`,
        label: model,
        provider: 'openai',
        source: 'remote' as const,
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      })),
      {
        ...context(home, home),
        codexHome: join(home, '.codex'),
      },
    );
    expect(plan.canApply).toBe(true);
    defaults.forEach((role, index) => {
      expect(readFileSync(rolePath(home, role.role), 'utf8')).toBe(
        before[index],
      );
    });
    expect(applyCodexPlan(plan).applied).toBe(true);
    defaults.forEach((role, index) => {
      const after = readFileSync(rolePath(home, role.role), 'utf8');
      expect(roleModel(after)).toBe(role.model);
      expect(after).toContain(
        `model_reasoning_effort = "${role.effort?.kind === 'effort' ? role.effort.value : ''}"`,
      );
      const unrelated = (text: string) =>
        text.replace(/^model(?:_reasoning_effort)? = .*$/gm, '');
      expect(unrelated(after)).toBe(unrelated(before[index] ?? ''));
    });
    expect(readFileSync(configPath, 'utf8')).toBe(configBefore);
    setup(home, home);
    for (const role of defaults)
      expect(roleModel(readFileSync(rolePath(home, role.role), 'utf8'))).toBe(
        role.model,
      );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

describe('Codex hook migration operations', () => {
  test.each([
    'missing',
    'disabled',
    'legacy',
  ])('sync rejects a %s plugin and preserves the root file', (kind) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-sync-gate-'));
    const home = join(dir, 'home');
    const target = join(home, '.codex', 'AGENTS.md');
    const legacy =
      '<!-- thoth-agents:codex-root:start -->old<!-- thoth-agents:codex-root:end -->';
    try {
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, legacy);
      const commandExecutor: CodexCommandExecutor = (_command, args) => ({
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(
          args.includes('marketplace')
            ? { marketplaces: [] }
            : {
                installed:
                  kind === 'missing'
                    ? []
                    : [
                        {
                          pluginId: 'thoth-agents@thoth-plugins',
                          enabled: kind !== 'disabled',
                          version: PACKAGE_VERSION,
                        },
                      ],
              },
        ),
      });
      const plan = buildCodexSyncPlan({
        ...context(dir, home, false),
        codexPluginCommandExecutor: commandExecutor,
      });
      expect(plan.canApply).toBe(false);
      expect(plan.warnings.map((w) => w.message).join('\n')).toContain(
        'thoth-agents update --agent=codex',
      );
      expect(applyCodexPlan(plan).applied).toBe(false);
      expect(readFileSync(target, 'utf8')).toBe(legacy);
      expect(existsSync(rolePath(home, 'worker'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function seedHookBundle(home: string): void {
  const root = join(
    home,
    '.codex/plugins/cache/thoth-plugins/thoth-agents',
    PACKAGE_VERSION,
    'codex-hooks',
  );
  mkdirSync(join(root, 'payloads'), { recursive: true });
  for (const file of [
    'hooks.json',
    'context.cjs',
    ...['root', 'designer', 'explorer', 'librarian', 'oracle', 'worker'].map(
      (role) => `payloads/${role}.md`,
    ),
  ])
    writeFileSync(join(root, file), 'fixture');
}

describe('Codex migration execution ordering', () => {
  test.each([
    'install',
    'update',
  ] as const)('%s verifies the hook bundle only after the plugin step and migrates the legacy block', (action) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-migration-order-'));
    const home = join(dir, 'home');
    const target = join(home, '.codex/AGENTS.md');
    const events: string[] = [];
    try {
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(
        target,
        'operator\r\n<!-- thoth-agents:codex-root:start -->legacy<!-- thoth-agents:codex-root:end -->\r\n',
      );
      const operationContext = {
        ...context(dir, home, false),
        codexPluginCommandExecutor: ((command, args, options) => {
          events.push(args.join(' '));
          return installedCodexManagerExecutor(command, args, options);
        }) as CodexCommandExecutor,
        applyCodexPluginSetup: () => {
          events.push('plugin-step');
          seedHookBundle(home);
          return { success: true, changed: [], diagnostics: [] };
        },
      };
      const plan = (
        action === 'install' ? buildCodexInstallPlan : buildCodexUpdatePlan
      )(operationContext);
      events.length = 0;
      const result = applyCodexPlan(plan);
      expect(result.applied).toBe(true);
      expect(events).toEqual([
        'plugin-step',
        'plugin marketplace list --json',
        'plugin list --available --json',
      ]);
      expect(readFileSync(target, 'utf8')).toBe('operator\r\n\r\n');
      expect(readFileSync(`${target}.bak`, 'utf8')).toContain('legacy');
      const sync = buildCodexSyncPlan(operationContext);
      expect(sync.canApply).toBe(true);
      expect(applyCodexPlan(sync).applied).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('operator\r\n\r\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('sync removes the legacy block with a hook-capable plugin and reports the backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-sync-migrate-'));
  const home = join(dir, 'home');
  const target = join(home, '.codex/AGENTS.md');
  try {
    const operationContext = context(dir, home);
    writeFileSync(
      target,
      'before\r\n<!-- thoth-agents:codex-root:start -->edited legacy<!-- thoth-agents:codex-root:end -->\r\nafter',
    );
    const plan = buildCodexSyncPlan(operationContext);
    expect(plan.canApply).toBe(true);
    const result = applyCodexPlan(plan);
    expect(result.applied).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('before\r\n\r\nafter');
    expect(result.warnings.map((w) => w.message).join('\n')).toContain(
      `Removed legacy Codex root block from ${target}; backup: ${target}.bak`,
    );
    const status = getCodexStatus(operationContext);
    expect(status.targets.some((t) => t.path === target)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('explicit legacy recovery permits only signature-matched role drift', async () => {
  const { renderLegacyCodexAgentArtifacts } = await import(
    '../../harness/adapters/codex'
  );
  const home = mkdtempSync(join(tmpdir(), 'codex-recovery-plan-'));
  const agents = join(home, '.codex', 'agents');
  mkdirSync(agents, { recursive: true });
  const path = join(agents, 'thoth-agents-worker.toml');
  const original = String(
    renderLegacyCodexAgentArtifacts().find((a) =>
      a.path.endsWith('worker.toml'),
    )?.content,
  ).replace('Be concise.', 'Historical revision. Be concise.');
  writeFileSync(path, original);
  const context = {
    cwd: home,
    homeDir: home,
    packageRoot: PACKAGE_ROOT,
    codexPluginCommandExecutor: installedCodexManagerExecutor,
  };
  try {
    expect(buildCodexUpdatePlan(context).canApply).toBe(false);
    expect(
      buildCodexUpdatePlan({ ...context, replaceLegacyAgents: true }).canApply,
    ).toBe(true);
    writeFileSync(
      path,
      original.replace('You are worker.', 'Operator content.'),
    );
    expect(
      buildCodexUpdatePlan({ ...context, replaceLegacyAgents: true }).canApply,
    ).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

describe('released 0.7.0 migration through public operations', () => {
  async function legacyInstall(home: string, overrides = false) {
    const { LEGACY_CODEX_AGENT_ARTIFACTS } = await import(
      '../../harness/adapters/codex-legacy-agents'
    );
    const models: Record<string, string> = {};
    for (const artifact of LEGACY_CODEX_AGENT_ARTIFACTS) {
      const path = join(home, artifact.path);
      mkdirSync(join(path, '..'), { recursive: true });
      const key = path.split(/[\/]/).at(-1);
      const model = roleModel(artifact.content);
      if (!key || !model) throw new Error('Legacy role model is missing');
      models[key] = model;
      writeFileSync(
        path,
        overrides
          ? artifact.content
              .replace(/^model = .*$/m, 'model = "operator-model"')
              .replace(
                /^model_reasoning_effort = .*$/m,
                'model_reasoning_effort = "high"',
              )
          : artifact.content,
      );
    }
    writeFileSync(
      managedModelsPath(home),
      JSON.stringify({ version: 1, models }),
    );
    writeFileSync(
      join(home, '.codex/AGENTS.md'),
      'operator\n<!-- thoth-agents:codex-root:start -->released root<!-- thoth-agents:codex-root:end -->\n',
    );
  }

  test.each([
    ['update', buildCodexUpdatePlan],
    ['sync', buildCodexSyncPlan],
  ] as const)('%s migrates released roles, state and root without opt-in', async (_action, buildPlan) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-released-migrate-'));
    const home = join(dir, 'home');
    try {
      await legacyInstall(home);
      const operationContext = context(dir, home);
      const plan = buildPlan(operationContext);
      expect(plan.canApply).toBe(true);
      expect(applyCodexPlan(plan).applied).toBe(true);
      for (const role of [
        'explorer',
        'librarian',
        'oracle',
        'designer',
        'worker',
      ]) {
        expect(readFileSync(rolePath(home, role), 'utf8')).not.toContain(
          'developer_instructions = """',
        );
        expect(readFileSync(`${rolePath(home, role)}.bak`, 'utf8')).toContain(
          'developer_instructions',
        );
      }
      expect(readFileSync(join(home, '.codex/AGENTS.md'), 'utf8')).toBe(
        'operator\n\n',
      );
      expect(
        readFileSync(join(home, '.codex/AGENTS.md.bak'), 'utf8'),
      ).toContain('released root');
      const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      expect(Object.keys(state.roleDigests)).toHaveLength(5);
      expect(Object.keys(state.roleStructureDigests)).toHaveLength(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    'exact-digest',
    'structure-digest',
    'invalid-state',
  ] as const)('handles %s ownership during migration', async (kind) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-owned-migration-'));
    const home = join(dir, 'home');
    try {
      await legacyInstall(home);
      const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      if (kind === 'invalid-state')
        state.models = { 'thoth-agents-worker.toml': 42 };
      else {
        const digests = Object.fromEntries(
          ['explorer', 'librarian', 'oracle', 'designer', 'worker'].map(
            (role) => {
              const content = `${readFileSync(rolePath(home, role), 'utf8')}# prior owned rendering
`;
              writeFileSync(rolePath(home, role), content);
              const bytes =
                kind === 'structure-digest'
                  ? content.replace(
                      /^model(?:_reasoning_effort)?\s*=.*(?:\r?\n|$)/gm,
                      '',
                    )
                  : content;
              return [
                `thoth-agents-${role}.toml`,
                createHash('sha256').update(bytes).digest('hex'),
              ];
            },
          ),
        );
        state[
          kind === 'structure-digest' ? 'roleStructureDigests' : 'roleDigests'
        ] = digests;
      }
      writeFileSync(managedModelsPath(home), JSON.stringify(state));
      const plan = buildCodexUpdatePlan(context(dir, home));
      expect(plan.canApply).toBe(kind !== 'invalid-state');
      expect(applyCodexPlan(plan).applied).toBe(kind !== 'invalid-state');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('preserves operator model and effort selections during released migration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-released-models-'));
    const home = join(dir, 'home');
    try {
      await legacyInstall(home, true);
      const plan = buildCodexUpdatePlan(context(dir, home));
      expect(plan.canApply).toBe(true);
      expect(applyCodexPlan(plan).applied).toBe(true);
      for (const role of [
        'explorer',
        'librarian',
        'oracle',
        'designer',
        'worker',
      ]) {
        const content = readFileSync(rolePath(home, role), 'utf8');
        expect(content).toContain(
          'Role instructions are delivered as developer context',
        );
        expect(roleModel(content)).toBe('operator-model');
        expect(content).toContain('model_reasoning_effort = "high"');
        expect(content).not.toContain('developer_instructions = """');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    'edited',
    'prerequisite',
  ] as const)('rejects %s migration without changing released files', async (kind) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-released-blocked-'));
    const home = join(dir, 'home');
    try {
      await legacyInstall(home);
      if (kind === 'edited')
        writeFileSync(
          rolePath(home, 'worker'),
          readFileSync(rolePath(home, 'worker'), 'utf8').replace(
            'You are worker.',
            'Operator instructions.',
          ),
        );
      const paths = [
        managedModelsPath(home),
        join(home, '.codex/AGENTS.md'),
        ...['explorer', 'librarian', 'oracle', 'designer', 'worker'].map(
          (role) => rolePath(home, role),
        ),
      ];
      const before = paths.map((path) => readFileSync(path, 'utf8'));
      const operationContext = context(dir, home, kind !== 'prerequisite');
      const plan =
        kind === 'edited'
          ? buildCodexUpdatePlan(operationContext)
          : buildCodexSyncPlan(operationContext);
      expect(plan.canApply).toBe(false);
      expect(applyCodexPlan(plan).applied).toBe(false);
      expect(paths.map((path) => readFileSync(path, 'utf8'))).toEqual(before);
      if (kind === 'edited')
        expect(
          getCodexStatus(operationContext)
            .diagnostics.map((w) => w.message)
            .join('\n'),
        ).toContain('Preserved operator-edited or unattributed');
      expect(existsSync(join(home, '.codex/AGENTS.md.bak'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('current Codex state through public operations', () => {
  test.each([
    ['update', buildCodexUpdatePlan, false],
    ['sync', buildCodexSyncPlan, false],
    ['update with CLI override', buildCodexUpdatePlan, true],
    ['sync with CLI override', buildCodexSyncPlan, true],
  ] as const)('%s accepts semantic state and ownership-approved digest refreshes', (_action, buildPlan, cliOverride) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-current-state-'));
    const home = join(dir, 'home');
    try {
      const operationContext = { ...context(dir, home), trustHooks: true };
      writeFileSync(
        join(
          home,
          '.codex/plugins/cache/thoth-plugins/thoth-agents',
          PACKAGE_VERSION,
          'codex-hooks/hooks.json',
        ),
        readFileSync(join(PACKAGE_ROOT, 'plugin/codex-hooks/hooks.json')),
      );
      expect(
        applyCodexPlan(buildCodexInstallPlan(operationContext)),
      ).toMatchObject({ applied: true });
      const assertCurrent = () => {
        expect(getCodexStatus(operationContext).state).toBe('installed');
        const plan = buildPlan(operationContext);
        expect(plan.canApply).toBe(true);
        expect(applyCodexPlan(plan).applied).toBe(true);
      };
      assertCurrent();
      if (cliOverride) {
        const modelPlan = buildCodexModelPlan(
          {
            harness: 'codex',
            dryRun: false,
            roles: [
              {
                role: 'worker',
                model: 'operator-cli-model',
                catalogId: 'openai/operator-cli-model',
                availableEfforts: ['high'],
                effort: { kind: 'effort', value: 'high' },
              },
            ],
          },
          operationContext,
        );
        expect(applyCodexPlan(modelPlan).applied).toBe(true);
        assertCurrent();
      }
      const statePath = managedModelsPath(home);
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      state.ownedHookTrustKeys = [...state.ownedHookTrustKeys].reverse();
      state.models = Object.fromEntries(Object.entries(state.models).reverse());
      writeFileSync(
        statePath,
        JSON.stringify(Object.fromEntries(Object.entries(state).reverse())),
      );
      assertCurrent();
      const path = rolePath(home, 'worker');
      for (const [field, value] of [
        ['model', 'operator-toml-model'],
        ['model_reasoning_effort', 'low'],
      ]) {
        const beforeState = JSON.parse(readFileSync(statePath, 'utf8'));
        const edited = readFileSync(path, 'utf8').replace(
          new RegExp(`^${field} = .*`, 'm'),
          `${field} = "${value}"`,
        );
        writeFileSync(path, edited);
        assertCurrent();
        expect(readFileSync(path, 'utf8')).toBe(edited);
        const afterState = JSON.parse(readFileSync(statePath, 'utf8'));
        expect(afterState.roleDigests['thoth-agents-worker.toml']).not.toBe(
          beforeState.roleDigests['thoth-agents-worker.toml'],
        );
        expect(afterState.roleDigests['thoth-agents-worker.toml']).toBe(
          createHash('sha256').update(edited).digest('hex'),
        );
        assertCurrent();
      }
      const edited = readFileSync(path, 'utf8').replace(
        /^description = .*$/m,
        'description = "Operator description"',
      );
      writeFileSync(path, edited);
      expect(getCodexStatus(operationContext).state).toBe('drift');
      const blocked = buildPlan(operationContext);
      expect(blocked.canApply).toBe(false);
      expect(applyCodexPlan(blocked).applied).toBe(false);
      expect(readFileSync(path, 'utf8')).toBe(edited);
      expect(
        getCodexStatus(operationContext)
          .diagnostics.map((d) => d.message)
          .join(String.fromCharCode(10)),
      ).toContain('Preserved operator-edited or unattributed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
