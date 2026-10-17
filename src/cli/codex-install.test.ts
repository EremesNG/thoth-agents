import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderLegacyCodexAgentArtifacts } from '../harness/adapters/codex';
import {
  applyCodexManagedModelOverrides,
  applyCodexSetup,
  buildCodexSetupPlan,
  CODEX_ROLE_NAMES,
  formatCodexSetupPlan,
  parseRoleTomlEffort,
  replaceRoleTomlEffort,
} from './codex-install';
import { uninstallCodex } from './codex-lifecycle';
import * as pluginInstall from './codex-plugin-install';
import * as managedStateIo from './managed-state-io';

const FORBIDDEN_CODEX_ADAPTATION_MARKERS = [
  '<codex-adaptation>',
  '</codex-adaptation>',
  '<codex-root-adaptation>',
  '</codex-root-adaptation>',
  'codex-adaptation',
  'codex-root-adaptation',
  'Codex prompt notes',
  'Codex root coordination notes',
  'opencode-role-contract',
  'OpenCode role contract',
  'adapted from OpenCode',
  'same behavior in Codex',
  'Codex adaptation',
  'OpenCode-equivalent',
] as const;

const PACKAGE_ROOT = process.cwd();

function expectNoLeakedCodexAdaptationMarkers(content: string): void {
  for (const marker of FORBIDDEN_CODEX_ADAPTATION_MARKERS) {
    expect(content).not.toContain(marker);
  }
}

function rolePath(home: string, role: string): string {
  return join(home, '.codex', 'agents', `thoth-agents-${role}.toml`);
}

function legacyRoleContent(role: string): string {
  const artifact = renderLegacyCodexAgentArtifacts().find((a) =>
    a.path.endsWith(`thoth-agents-${role}.toml`),
  );
  if (!artifact?.content) throw new Error(`Missing legacy role ${role}`);
  return String(artifact.content);
}

function managedModelsPath(home: string): string {
  return join(home, '.codex', 'agents', '.thoth-agents-managed-models.json');
}

function roleModel(content: string): string | undefined {
  return /^model\s*=\s*"([^"]+)"\s*$/m.exec(content)?.[1];
}

function replaceRoleModel(content: string, model: string): string {
  return content.replace(/^model\s*=\s*"[^"]+"\s*$/m, `model = "${model}"`);
}

function readManagedModels(home: string): Record<string, string> {
  return readManagedModelState(home).models;
}

function readManagedModelState(home: string): {
  models: Record<string, string>;
  configuredModels?: Record<string, string>;
} {
  return JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
}

function applyFreshCodexSetup(dir: string, home: string, reset = false): void {
  const result = applyCodexSetup(
    buildCodexSetupPlan({
      dryRun: false,
      reset,
      scope: 'user',
      projectRoot: dir,
      homeDir: home,
      packageRoot: PACKAGE_ROOT,
    }),
  );

  expect(result.success).toBe(true);
}

describe('Codex install setup plan', () => {
  test('explicit legacy recovery backs up intermediate prompts, preserving them by default and refusing non-thoth content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-legacy-opt-in-'));
    const home = join(dir, 'home');
    const path = rolePath(home, 'worker');
    mkdirSync(dirname(path), { recursive: true });
    const original = legacyRoleContent('worker').replace(
      'Be concise.',
      'Historical build. Be concise.',
    );
    writeFileSync(path, original);
    const config = {
      reset: false,
      scope: 'user' as const,
      projectRoot: dir,
      homeDir: home,
      packageRoot: PACKAGE_ROOT,
    };
    try {
      expect(
        buildCodexSetupPlan(config).items.find((i) => i.targetPath === path)
          ?.action,
      ).toBe('preserve-role-toml');
      const plan = buildCodexSetupPlan({
        ...config,
        replaceLegacyAgents: true,
      });
      expect(plan.items.find((i) => i.targetPath === path)?.action).toBe(
        'write-role-toml',
      );
      expect(applyCodexSetup(plan).success).toBe(true);
      expect(readFileSync(`${path}.bak`, 'utf8')).toBe(original);
      expect(readFileSync(path, 'utf8')).not.toContain('Historical build.');
      writeFileSync(
        path,
        original.replace('You are worker.', 'Operator instructions.'),
      );
      expect(
        buildCodexSetupPlan({
          ...config,
          replaceLegacyAgents: true,
        }).items.find((i) => i.targetPath === path)?.action,
      ).toBe('preserve-role-toml');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    'AGENTS.md',
    'config.toml',
    'agents/thoth-agents-worker.toml',
    'agents/.thoth-agents-managed-models.json',
    'agents/.thoth-agents-install-recovery.json',
  ])('fails closed before migration for an unsafe %s backup', (relative) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-unsafe-backup-'));
    const home = join(dir, 'home');
    try {
      applyFreshCodexSetup(dir, home);
      const root = join(home, '.codex/AGENTS.md');
      const original =
        '<!-- thoth-agents:codex-root:start -->legacy<!-- thoth-agents:codex-root:end -->';
      writeFileSync(root, original);
      const target = join(home, '.codex', relative);
      if (relative.endsWith('recovery.json'))
        writeFileSync(target, JSON.stringify({ version: 1, roles: {} }));
      const unrelated = join(dir, 'operator.txt');
      writeFileSync(unrelated, 'untouched');
      rmSync(`${target}.bak`, { force: true });
      symlinkSync(unrelated, `${target}.bak`);
      const before = readFileSync(target, 'utf8');
      const result = applyCodexSetup(
        buildCodexSetupPlan({
          reset: true,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
          replaceLegacyAgents: true,
        }),
      );
      expect(result.success).toBe(false);
      expect(readFileSync(unrelated, 'utf8')).toBe('untouched');
      expect(readFileSync(root, 'utf8')).toBe(original);
      expect(readFileSync(target, 'utf8')).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    vi.spyOn(pluginInstall, 'checkCodexHookCapability').mockReturnValue({
      success: true,
      diagnostics: [],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  test.each([
    'thoth-agents@thoth-plugins',
    'thoth-agents@personal',
  ])('records capacity and consented trust for %s while preserving operator changes', (pluginId) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-consent-'));
    const home = join(dir, 'home');
    const bundlePath = join(dir, 'installed');
    mkdirSync(join(home, '.codex'), { recursive: true });
    mkdirSync(join(bundlePath, 'codex-hooks'), { recursive: true });
    const declarations = readFileSync(
      join(PACKAGE_ROOT, 'plugin/codex-hooks/hooks.json'),
      'utf8',
    );
    writeFileSync(join(bundlePath, 'codex-hooks/hooks.json'), declarations);
    vi.mocked(pluginInstall.checkCodexHookCapability).mockReturnValue({
      success: true,
      diagnostics: [],
      bundlePath,
    });
    const configPath = join(home, '.codex/config.toml');
    writeFileSync(
      configPath,
      '[agents]\nmax_concurrent_threads_per_session = 3\n',
    );
    try {
      applyFreshCodexSetup(dir, home);
      expect(readFileSync(configPath, 'utf8')).not.toContain('[hooks.state.');
      expect(
        JSON.parse(readFileSync(managedModelsPath(home), 'utf8'))
          .priorThreadsValue,
      ).toBe('3');
      const config = {
        reset: false,
        scope: 'user' as const,
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
        trustHooks: true,
        pluginId,
      };
      const beforeTrust = readFileSync(configPath, 'utf8');
      const beforeState = readFileSync(managedModelsPath(home), 'utf8');
      const dryPlan = buildCodexSetupPlan({ ...config, dryRun: true });
      expect(formatCodexSetupPlan(dryPlan)).toContain(
        'With consent, trust installed',
      );
      expect(formatCodexSetupPlan(dryPlan)).toContain(
        'max_concurrent_threads_per_session = 6',
      );
      expect(applyCodexSetup(dryPlan).changed).toEqual([]);
      expect(readFileSync(configPath, 'utf8')).toBe(beforeTrust);
      expect(readFileSync(managedModelsPath(home), 'utf8')).toBe(beforeState);
      expect(applyCodexSetup(buildCodexSetupPlan(config)).success).toBe(true);
      const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      expect(state.priorThreadsValue).toBe('3');
      expect(state.ownedHookTrustKeys).toHaveLength(2);
      expect(readFileSync(configPath, 'utf8')).toContain(
        `[hooks.state."${pluginId}:codex-hooks/hooks.json:session_start:0:0"]`,
      );
      expect(pluginInstall.checkCodexHookCapability).toHaveBeenLastCalledWith(
        expect.objectContaining({ pluginId }),
      );
      writeFileSync(
        configPath,
        readFileSync(configPath, 'utf8').replace('= 6', '= 9'),
      );
      const update = applyCodexSetup(buildCodexSetupPlan(config));
      expect(update.success).toBe(true);
      expect(update.diagnostics.join('\n')).toContain(
        'Preserved operator-modified',
      );
      expect(readFileSync(configPath, 'utf8')).toContain('= 9');
      expect(
        JSON.parse(readFileSync(managedModelsPath(home), 'utf8'))
          .priorThreadsValue,
      ).toBe('3');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('model overrides retain capacity and hook ownership through uninstall', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-model-uninstall-'));
    const codexHome = join(dir, 'codex-home');
    const bundlePath = join(PACKAGE_ROOT, 'plugin');
    mkdirSync(codexHome, { recursive: true });
    const configPath = join(codexHome, 'config.toml');
    writeFileSync(
      configPath,
      `[agents]
max_concurrent_threads_per_session = 3
`,
    );
    vi.mocked(pluginInstall.checkCodexHookCapability).mockReturnValue({
      success: true,
      diagnostics: [],
      bundlePath,
    });
    const config = {
      reset: false,
      scope: 'user' as const,
      projectRoot: dir,
      homeDir: dir,
      codexHome,
      packageRoot: PACKAGE_ROOT,
      trustHooks: true,
    };
    try {
      expect(applyCodexSetup(buildCodexSetupPlan(config)).success).toBe(true);
      const statePath = join(
        codexHome,
        'agents/.thoth-agents-managed-models.json',
      );
      const installed = JSON.parse(readFileSync(statePath, 'utf8'));
      expect(installed.priorThreadsValue).toBe('3');
      expect(installed.ownedHookTrustKeys).toHaveLength(2);
      expect(
        applyCodexManagedModelOverrides(config, [
          { role: 'worker', model: 'gpt-5' },
        ]).success,
      ).toBe(true);
      const result = uninstallCodex(
        {
          cwd: dir,
          homeDir: dir,
          codexHome,
          installLedgerOptions: { homeDir: dir, env: {} },
          codexPluginCommandExecutor: () => ({
            exitCode: 0,
            stdout: '{}',
            stderr: '',
          }),
          nodeAvailable: () => true,
        },
        false,
      );
      expect(result.success).toBe(true);
      const restored = readFileSync(configPath, 'utf8');
      expect(restored).toContain('max_concurrent_threads_per_session = 3');
      for (const key of installed.ownedHookTrustKeys)
        expect(restored).not.toContain(key);
      expect(restored).not.toContain('trusted_hash');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('keeps model-only edits managed but preserves description edits without adopting them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-owned-'));
    const home = join(dir, 'home');
    try {
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'worker');
      const initialState = JSON.parse(
        readFileSync(managedModelsPath(home), 'utf8'),
      );
      writeFileSync(
        target,
        replaceRoleTomlEffort(
          replaceRoleModel(readFileSync(target, 'utf8'), 'custom-model'),
          'high',
        ),
      );
      applyFreshCodexSetup(dir, home);
      const updated = readFileSync(target, 'utf8');
      expect(roleModel(updated)).toBe('custom-model');
      expect(parseRoleTomlEffort(updated)).toBe('high');
      const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      expect(state.roleDigests['thoth-agents-worker.toml']).toBe(
        createHash('sha256').update(updated).digest('hex'),
      );
      expect(state.roleStructureDigests).toEqual(
        initialState.roleStructureDigests,
      );
      const edited = updated.replace(
        /^description = .*$/m,
        'description = "operator description"',
      );
      writeFileSync(target, edited);
      const config = {
        reset: false,
        scope: 'user' as const,
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      };
      const result = applyCodexSetup(buildCodexSetupPlan(config));
      expect(result.success).toBe(true);
      expect(result.diagnostics.join('\n')).toMatch(/operator-edited/);
      expect(readFileSync(target, 'utf8')).toBe(edited);
      expect(
        applyCodexManagedModelOverrides(config, [
          { role: 'worker', model: 'explicit-model' },
        ]).success,
      ).toBe(true);
      const after = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      expect(after.roleDigests).toEqual(state.roleDigests);
      expect(after.roleStructureDigests).toEqual(state.roleStructureDigests);
      applyFreshCodexSetup(dir, home, true);
      expect(readFileSync(target, 'utf8')).toContain(
        'description = "operator description"',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('migrates exact legacy TOMLs, persists digests, preserves edits and handles old journals', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-thin-'));
    const home = join(dir, 'home');
    const digest = (text: string) =>
      createHash('sha256').update(text).digest('hex');
    try {
      const legacy = renderLegacyCodexAgentArtifacts();
      const roles: Record<string, string> = {};
      for (const artifact of legacy) {
        const target = join(home, artifact.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, String(artifact.content));
        roles[basename(target)] = digest(String(artifact.content));
      }
      const journal = join(
        home,
        '.codex/agents/.thoth-agents-install-recovery.json',
      );
      writeFileSync(journal, JSON.stringify({ version: 1, roles }));
      const edited = rolePath(home, 'oracle');
      const operatorText = `${readFileSync(edited, 'utf8')}# operator edit\n`;
      writeFileSync(edited, operatorText);
      const config = {
        scope: 'user' as const,
        reset: false,
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      };
      vi.mocked(pluginInstall.checkCodexHookCapability).mockReturnValueOnce({
        success: false,
        diagnostics: [],
        error: 'Run update to install hook-capable plugin.',
      });
      const blocked = applyCodexSetup(buildCodexSetupPlan(config));
      expect(blocked.success).toBe(false);
      expect(blocked.changed).toEqual([]);
      expect(readFileSync(rolePath(home, 'worker'), 'utf8')).toContain(
        '<role>',
      );
      expect(existsSync(managedModelsPath(home))).toBe(false);
      const dryPlan = buildCodexSetupPlan({ ...config, dryRun: true });
      expect(applyCodexSetup(dryPlan).success).toBe(true);
      expect(readFileSync(rolePath(home, 'worker'), 'utf8')).toContain(
        '<role>',
      );
      expect(existsSync(managedModelsPath(home))).toBe(false);
      for (let i = 0; i < 2; i++) {
        const result = applyCodexSetup(buildCodexSetupPlan(config));
        expect(result.success, result.error).toBe(true);
        expect(result.diagnostics.join('\n')).toMatch(/operator-edited/);
        expect(readFileSync(edited, 'utf8')).toBe(operatorText);
        const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
        for (const role of CODEX_ROLE_NAMES.filter((r) => r !== 'oracle')) {
          const content = readFileSync(rolePath(home, role), 'utf8');
          expect(content).not.toContain('<role>');
          expect(state.roleDigests[`thoth-agents-${role}.toml`]).toBe(
            digest(content),
          );
        }
        expect(state.roleDigests['thoth-agents-oracle.toml']).toBeUndefined();
        expect(existsSync(journal)).toBe(false);
      }
      const worker = rolePath(home, 'worker');
      const previous = digest(readFileSync(worker, 'utf8'));
      expect(
        applyCodexManagedModelOverrides(config, [
          { role: 'worker', model: 'operator-model', effort: 'high' },
        ]).success,
      ).toBe(true);
      const updated = readFileSync(worker, 'utf8');
      const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      expect(state.roleDigests['thoth-agents-worker.toml']).toBe(
        digest(updated),
      );
      expect(digest(updated)).not.toBe(previous);
      applyFreshCodexSetup(dir, home);
      expect(readFileSync(worker, 'utf8')).toBe(updated);
      const afterSync = JSON.parse(
        readFileSync(managedModelsPath(home), 'utf8'),
      );
      expect(afterSync.roleDigests).toEqual(state.roleDigests);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test.each([
    ['gpt-6-astra', 'medium', 'gpt-6.1-sol', 'xhigh'],
    ['custom-model', 'medium', 'custom-model', 'medium'],
    ['gpt-6-astra', 'high', 'gpt-6-astra', 'high'],
    ['gpt-6-astra', undefined, 'gpt-6-astra', undefined],
    ['openai/gpt-6-astra', 'medium', 'openai/gpt-6-astra', 'medium'],
  ])('sync compares the complete Codex legacy pair %s / %s coherently across two syncs', (model, effort, expectedModel, expectedEffort) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-legacy-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'oracle');
      const legacy = legacyRoleContent('oracle');
      writeFileSync(
        target,
        replaceRoleTomlEffort(replaceRoleModel(legacy, model), effort),
      );
      const key = 'thoth-agents-oracle.toml';
      const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      state.models[key] = 'gpt-6-astra';
      state.configuredModels = { [key]: model };
      state.configuredEfforts = { [key]: effort };
      writeFileSync(managedModelsPath(home), JSON.stringify(state));
      for (let sync = 0; sync < 2; sync++) {
        applyFreshCodexSetup(dir, home);
        const content = readFileSync(target, 'utf8');
        expect(roleModel(content)).toBe(expectedModel);
        expect(parseRoleTomlEffort(content)).toBe(expectedEffort);
        const next = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
        expect(next.configuredModels[key]).toBe(expectedModel);
        expect(next.configuredEfforts?.[key]).toBe(expectedEffort);
        if (model === 'gpt-6-astra' && effort === 'medium')
          expect(next.models[key]).toBe('gpt-6.1-sol');
      }
      applyFreshCodexSetup(dir, home, true);
      expect(roleModel(readFileSync(target, 'utf8'))).toBe('gpt-6.1-sol');
      expect(parseRoleTomlEffort(readFileSync(target, 'utf8'))).toBe('xhigh');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    ['explorer', 'gpt-6-luna', 'low', 'gpt-6-luna', 'max'],
    ['librarian', 'gpt-6-luna', 'high', 'gpt-6-luna', 'max'],
    ['oracle', 'gpt-6-astra', 'medium', 'gpt-6.1-sol', 'xhigh'],
    ['designer', 'gpt-6-sol', 'medium', 'gpt-6-luna', 'max'],
    ['worker', 'gpt-6-luna', 'max', 'gpt-6-luna', 'max'],
    ['designer', 'gpt-6-sol', 'high', 'gpt-6-sol', 'high'],
    ['designer', 'gpt-6-sol', undefined, 'gpt-6-sol', undefined],
  ] as const)('advances only complete tracked Codex pair %s / %s / %s without configured state', (role, model, effort, expectedModel, expectedEffort) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-tracked-legacy-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, role);
      const legacy = legacyRoleContent(role);
      writeFileSync(
        target,
        replaceRoleTomlEffort(replaceRoleModel(legacy, model), effort),
      );
      const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      state.models[`thoth-agents-${role}.toml`] = model;
      writeFileSync(managedModelsPath(home), JSON.stringify(state));
      for (let sync = 0; sync < 2; sync++) {
        applyFreshCodexSetup(dir, home);
        expect(roleModel(readFileSync(target, 'utf8'))).toBe(expectedModel);
        expect(parseRoleTomlEffort(readFileSync(target, 'utf8'))).toBe(
          expectedEffort,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('effort TOML helpers add, replace, and remove only the owned field', () => {
    const content = 'model = "gpt-5.6-sol"\nsandbox_mode = "read-only"\n';
    const added = replaceRoleTomlEffort(content, 'max');
    expect(parseRoleTomlEffort(added)).toBe('max');
    expect(added).toContain('sandbox_mode = "read-only"');
    const replaced = replaceRoleTomlEffort(added, 'ultra');
    expect(parseRoleTomlEffort(replaced)).toBe('ultra');
    const removed = replaceRoleTomlEffort(replaced, undefined);
    expect(parseRoleTomlEffort(removed)).toBeUndefined();
    expect(removed).toBe(content);
  });
  test('fresh plan emits the confirmed model and effort defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-defaults-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: PACKAGE_ROOT,
      });
      const expected = {
        oracle: { model: 'gpt-6.1-sol', effort: 'xhigh' },
        librarian: { model: 'gpt-6-luna', effort: 'max' },
        explorer: { model: 'gpt-6-luna', effort: 'max' },
        designer: { model: 'gpt-6-luna', effort: 'max' },
        worker: { model: 'gpt-6-luna', effort: 'max' },
      } as const;

      for (const [role, defaults] of Object.entries(expected)) {
        const item = plan.items.find(
          (candidate) =>
            candidate.action === 'write-role-toml' && candidate.role === role,
        );
        expect(roleModel(String(item?.content))).toBe(defaults.model);
        expect(parseRoleTomlEffort(String(item?.content))).toBe(
          defaults.effort,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('builds dry-run plan when caller cwd is outside the package repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-dlx-install-'));
    const callerProject = join(dir, 'caller-project');
    const home = join(dir, 'home');

    try {
      mkdirSync(callerProject, { recursive: true });
      const previousCwd = process.cwd();
      process.chdir(callerProject);
      try {
        const plan = buildCodexSetupPlan({
          dryRun: true,
          reset: false,
          scope: 'user',
          projectRoot: callerProject,
          homeDir: home,
        });

        expect(plan.dryRun).toBe(true);
        expect(
          plan.items.some((item) => item.targetPath.includes('.codex/plugins')),
        ).toBe(false);
        expect(plan.diagnostics.join('\n')).toContain(
          'codex plugin marketplace add https://github.com/EremesNG/thoth-plugins.git',
        );
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dry-run reports complete managed plan and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: PACKAGE_ROOT,
      });

      const itemKinds = plan.items.map((item) => item.kind);

      expect(itemKinds).toEqual(
        expect.arrayContaining(['managed-model-state', 'user-config']),
      );
      expect(itemKinds).not.toContain('personal-plugin-source');
      expect(itemKinds).not.toContain('personal-marketplace');
      expect(itemKinds).not.toContain('plugin-package');
      expect(
        plan.items
          .filter((item) => item.kind === 'role-subagent-toml')
          .map((item) => item.role),
      ).toEqual(CODEX_ROLE_NAMES);
      expect(plan.items.some((item) => item.role === 'orchestrator')).toBe(
        false,
      );
      expect(
        plan.items.some(
          (item) =>
            item.kind === 'managed-model-state' &&
            item.targetPath === managedModelsPath(join(dir, 'home')),
        ),
      ).toBe(true);
      expect(plan.diagnostics.join('\n')).toContain('/plugins');
      expect(plan.diagnostics.join('\n')).toContain(
        'codex plugin marketplace add https://github.com/EremesNG/thoth-plugins.git',
      );
      expect(plan.diagnostics.join('\n')).toContain('/hooks');
      expect(plan.diagnostics.join('\n')).toContain(
        'features.default_mode_request_user_input',
      );
      expect(applyCodexSetup(plan).success).toBe(true);
      expect(existsSync(join(dir, '.codex-plugin'))).toBe(false);
      expect(
        existsSync(join(dir, 'home', '.codex', 'plugins', 'thoth-agents')),
      ).toBe(false);
      expect(
        existsSync(join(dir, 'home', '.agents', 'plugins', 'marketplace.json')),
      ).toBe(false);
      expect(existsSync(managedModelsPath(join(dir, 'home')))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('formats only managed runtime surfaces and omits manager-owned plugin paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: PACKAGE_ROOT,
      });

      const formatted = formatCodexSetupPlan(plan);
      expect(formatted).not.toContain('AGENTS.md');
      expect(formatted.match(/- write-role-toml:/g)).toHaveLength(5);
      expect(formatted).toContain('- merge-toml:');
      expect(formatted).not.toContain('.codex/plugins');
      expect(formatted).not.toContain('.agents/plugins/marketplace.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('keeps diagnostics out of formatted plan for single canonical printing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: PACKAGE_ROOT,
      });

      const formatted = formatCodexSetupPlan(plan);
      const applyResult = applyCodexSetup(plan);
      const diagnostics = applyResult.diagnostics;

      expect(formatted).not.toContain(plan.diagnostics[0] ?? '');
      expect(formatted).not.toContain(plan.disclaimers[0] ?? '');
      expect(new Set(diagnostics).size).toBe(diagnostics.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('apply preserves root instructions and writes five specialists without mutating plugin-manager state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      const agentsFile = join(home, '.codex', 'AGENTS.md');
      mkdirSync(join(home, '.codex'), { recursive: true });
      writeFileSync(agentsFile, 'User guidance\n', { flush: true });
      writeFileSync(
        join(home, '.codex', 'config.toml'),
        '[mcp_servers.thoth_mem]\ncommand = "provider-owned"\nargs = ["serve"]\n',
      );
      const plan = buildCodexSetupPlan({
        dryRun: false,
        reset: true,
        scope: 'user',
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      });
      const result = applyCodexSetup(plan);

      expect(result.success).toBe(true);
      const root = readFileSync(agentsFile, 'utf8');
      expect(root).toBe('User guidance\n');
      expect(existsSync(`${agentsFile}.bak`)).toBe(false);
      for (const role of CODEX_ROLE_NAMES) {
        const agentPath = rolePath(home, role);
        expect(existsSync(agentPath)).toBe(true);
        const roleToml = readFileSync(agentPath, 'utf8');
        expectNoLeakedCodexAdaptationMarkers(roleToml);
        expect(roleToml).toContain(
          'developer_instructions = "Role instructions are delivered as developer context',
        );
        expect(roleToml).not.toContain('mcp_servers');
        expect(roleToml).not.toContain('skills.config');
        expect(roleToml).not.toContain('[skills');
        expect(roleToml).not.toContain('hooks =');
        expect(roleToml).not.toContain('[hooks');
      }
      expect(readManagedModels(home)).toEqual(
        Object.fromEntries(
          CODEX_ROLE_NAMES.map((role) => [
            `thoth-agents-${role}.toml`,
            roleModel(readFileSync(rolePath(home, role), 'utf8')),
          ]),
        ),
      );
      expect(
        existsSync(
          join(home, '.codex', 'agents', 'thoth-agents-orchestrator.toml'),
        ),
      ).toBe(false);
      expect(existsSync(join(dir, '.codex-plugin'))).toBe(false);
      expect(existsSync(join(home, '.codex', 'plugins'))).toBe(false);
      expect(
        existsSync(join(home, '.agents', 'plugins', 'marketplace.json')),
      ).toBe(false);
      const userConfig = readFileSync(
        join(home, '.codex', 'config.toml'),
        'utf8',
      );
      expect(userConfig).toContain('default_mode_request_user_input = true');
      expect(userConfig).toContain('[mcp_servers.thoth_mem]');
      expect(userConfig).toContain('command = "provider-owned"');
      expect(userConfig).toContain('args = ["serve"]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('setup diagnostics do not claim bundled provider hooks or memory capability', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-provider-boundary-'));
    try {
      const plan = buildCodexSetupPlan({
        dryRun: true,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: join(dir, 'home'),
        packageRoot: PACKAGE_ROOT,
      });
      const diagnostics = [...plan.diagnostics, ...plan.disclaimers].join('\n');

      expect(diagnostics).not.toContain('Run /hooks');
      expect(diagnostics).not.toMatch(/bootstraps? thoth-mem/i);
      expect(diagnostics).not.toMatch(/memory governance.*enforcement/i);
      expect(diagnostics).toContain('external provider');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('leaves an existing personal plugin cache untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      const personalPluginRoot = join(
        home,
        '.codex',
        'plugins',
        'thoth-agents',
      );
      mkdirSync(personalPluginRoot, { recursive: true });
      writeFileSync(
        join(personalPluginRoot, 'plugin.json'),
        '{"stale":true}\n',
      );
      const result = applyCodexSetup(
        buildCodexSetupPlan({
          dryRun: false,
          reset: true,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(existsSync(join(dir, '.codex-plugin'))).toBe(false);
      expect(
        readFileSync(join(personalPluginRoot, 'plugin.json'), 'utf8'),
      ).toBe('{"stale":true}\n');
      expect(existsSync(join(personalPluginRoot, '.codex-plugin'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('uses the package root when caller cwd is outside the package repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-dlx-install-'));
    const callerProject = join(dir, 'caller-project');
    const home = join(dir, 'home');
    const packageRoot = process.cwd();

    try {
      mkdirSync(callerProject, { recursive: true });
      const previousCwd = process.cwd();
      process.chdir(callerProject);
      try {
        const result = applyCodexSetup(
          buildCodexSetupPlan({
            dryRun: false,
            reset: true,
            scope: 'user',
            projectRoot: callerProject,
            homeDir: home,
            packageRoot,
          }),
        );

        expect(result.success).toBe(true);
        expect(existsSync(rolePath(home, 'explorer'))).toBe(true);
        expect(existsSync(join(home, '.codex', 'plugins'))).toBe(false);
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does not mutate an existing personal marketplace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      const marketplacePath = join(
        home,
        '.agents',
        'plugins',
        'marketplace.json',
      );
      mkdirSync(join(home, '.agents', 'plugins'), { recursive: true });
      writeFileSync(
        marketplacePath,
        JSON.stringify(
          {
            name: 'personal-marketplace',
            plugins: [
              { name: 'other-plugin', source: './plugins/other' },
              {
                name: 'thoth-agents',
                source: { source: 'local', path: './stale' },
                category: 'Stale',
              },
            ],
          },
          null,
          2,
        ),
      );

      const before = readFileSync(marketplacePath, 'utf8');
      const result = applyCodexSetup(
        buildCodexSetupPlan({
          dryRun: false,
          reset: true,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      );

      expect(result.success).toBe(true);
      expect(readFileSync(marketplacePath, 'utf8')).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('setup preserves installed effort and treats an absent field as inherit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-effort-current-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const worker = rolePath(home, 'worker');
      const explorer = rolePath(home, 'explorer');
      writeFileSync(
        worker,
        replaceRoleTomlEffort(readFileSync(worker, 'utf8'), 'high'),
      );
      writeFileSync(
        explorer,
        replaceRoleTomlEffort(readFileSync(explorer, 'utf8'), undefined),
      );
      const state = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      state.configuredEfforts = {
        'thoth-agents-explorer.toml': 'high',
      };
      writeFileSync(managedModelsPath(home), JSON.stringify(state, null, 2));

      applyFreshCodexSetup(dir, home);

      expect(parseRoleTomlEffort(readFileSync(worker, 'utf8'))).toBe('high');
      expect(
        parseRoleTomlEffort(readFileSync(explorer, 'utf8')),
      ).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('model-only Codex override preserves installed effort until explicitly cleared', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-effort-model-only-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const worker = rolePath(home, 'worker');
      writeFileSync(
        worker,
        replaceRoleTomlEffort(readFileSync(worker, 'utf8'), 'high'),
      );

      const installConfig = {
        dryRun: false,
        reset: false,
        scope: 'user' as const,
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      };
      expect(
        applyCodexManagedModelOverrides(installConfig, [
          { role: 'worker', model: 'openai/gpt-5.3-codex-spark' },
        ]).success,
      ).toBe(true);
      expect
        .soft(roleModel(readFileSync(worker, 'utf8')))
        .toBe('gpt-5.3-codex-spark');
      expect(parseRoleTomlEffort(readFileSync(worker, 'utf8'))).toBe('high');
      const state = readManagedModelState(home);
      expect(state.models['thoth-agents-worker.toml']).toBe('gpt-6-luna');
      expect
        .soft(state.configuredModels?.['thoth-agents-worker.toml'])
        .toBe('gpt-5.3-codex-spark');
      expect(state.models['thoth-agents-worker.toml']).not.toBe(
        state.configuredModels?.['thoth-agents-worker.toml'],
      );
      expect(existsSync(`${worker}.bak`)).toBe(true);
      expect(existsSync(`${managedModelsPath(home)}.bak`)).toBe(true);

      expect(
        applyCodexManagedModelOverrides(installConfig, [
          {
            role: 'worker',
            model: 'openai/gpt-5.3-codex-spark',
            clearEffort: true,
          },
        ]).success,
      ).toBe(true);
      expect(parseRoleTomlEffort(readFileSync(worker, 'utf8'))).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('explicit Codex apply restores a providerless baseline after a prefixed user-owned model', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-user-owned-prefixed-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'worker');
      writeFileSync(
        target,
        replaceRoleModel(
          readFileSync(target, 'utf8'),
          'openai/user-custom-model',
        ),
      );

      const before = readManagedModelState(home);
      expect(before.models['thoth-agents-worker.toml']).toBe('gpt-6-luna');
      expect(
        applyCodexManagedModelOverrides(
          {
            dryRun: false,
            reset: false,
            scope: 'user',
            projectRoot: dir,
            homeDir: home,
            packageRoot: PACKAGE_ROOT,
          },
          [{ role: 'worker', model: 'gpt-5.3-codex-spark' }],
        ).success,
      ).toBe(true);

      const state = readManagedModelState(home);
      expect(roleModel(readFileSync(target, 'utf8'))).toBe(
        'gpt-5.3-codex-spark',
      );
      expect(state.models['thoth-agents-worker.toml']).toBe('gpt-6-luna');
      expect(state.configuredModels?.['thoth-agents-worker.toml']).toBe(
        'gpt-5.3-codex-spark',
      );
      expect(state.models['thoth-agents-worker.toml']).not.toContain('openai/');
      expect(
        state.configuredModels?.['thoth-agents-worker.toml'],
      ).not.toContain('openai/');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('preserves user-customized Codex role model', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'worker');
      const installed = readFileSync(target, 'utf8');
      writeFileSync(
        target,
        replaceRoleModel(installed, 'user-custom-model').replace(
          'sandbox_mode = "workspace-write"',
          'sandbox_mode = "read-only"',
        ),
      );

      applyFreshCodexSetup(dir, home);

      const updated = readFileSync(target, 'utf8');
      expect(roleModel(updated)).toBe('user-custom-model');
      expect(parseRoleTomlEffort(updated)).toBe('max');
      expect(updated).not.toContain('toggle');
      expect(updated).not.toContain('budget_tokens');
      expect(updated).toContain('sandbox_mode = "read-only"');
      expect(readManagedModels(home)['thoth-agents-worker.toml']).toBe(
        roleModel(installed),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('retires only attributable obsolete Codex roles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      const target = rolePath(home, 'quick');
      mkdirSync(join(home, '.codex', 'agents'), { recursive: true });
      writeFileSync(
        target,
        'name = "quick"\nmodel = "old-managed-model"\nsandbox_mode = "read-only"\n',
      );
      writeFileSync(
        managedModelsPath(home),
        JSON.stringify(
          {
            version: 1,
            models: { 'thoth-agents-quick.toml': 'old-managed-model' },
          },
          null,
          2,
        ),
      );

      applyFreshCodexSetup(dir, home);

      expect(existsSync(target)).toBe(false);
      expect(
        readManagedModels(home)['thoth-agents-quick.toml'],
      ).toBeUndefined();
      expect(existsSync(rolePath(home, 'worker'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('preserves an obsolete role replaced while current roles are being written', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-retire-race-'));
    const originalWrite = managedStateIo.writeTextWithBackup;
    let spy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const home = join(dir, 'home');
      const target = rolePath(home, 'deep');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'model = "old-managed-model"\n');
      writeFileSync(
        managedModelsPath(home),
        JSON.stringify({
          version: 1,
          models: { 'thoth-agents-deep.toml': 'old-managed-model' },
        }),
      );
      const plan = buildCodexSetupPlan({
        dryRun: false,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      });
      spy = vi
        .spyOn(managedStateIo, 'writeTextWithBackup')
        .mockImplementation((path, content) => {
          const changed = originalWrite(path, content);
          if (path === rolePath(home, 'worker'))
            writeFileSync(target, 'model = "replacement-during-apply"\n');
          return changed;
        });
      const result = applyCodexSetup(plan);
      expect(result.success).toBe(false);
      expect(result.changed).toContain(rolePath(home, 'worker'));
      expect(readFileSync(target, 'utf8')).toContain(
        'replacement-during-apply',
      );
    } finally {
      spy?.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects plan-to-apply replacement and ownership loss before any mutation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-race-'));
    try {
      const home = join(dir, 'home');
      const target = rolePath(home, 'deep');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'model = "old-managed-model"\n');
      writeFileSync(
        managedModelsPath(home),
        JSON.stringify({
          version: 1,
          models: { 'thoth-agents-deep.toml': 'old-managed-model' },
        }),
      );
      const plan = buildCodexSetupPlan({
        dryRun: false,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      });
      writeFileSync(target, 'model = "user-replacement"\n');
      writeFileSync(managedModelsPath(home), '{"version":1,"models":{}}\n');

      const result = applyCodexSetup(plan);
      expect(result).toMatchObject({
        success: false,
        changed: [],
        error: expect.stringContaining('changed after planning'),
      });
      expect(readFileSync(target, 'utf8')).toContain('user-replacement');
      expect(existsSync(rolePath(home, 'worker'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects obsolete-role ownership loss after planning before any mutation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-ownership-race-'));
    try {
      const home = join(dir, 'home');
      const target = rolePath(home, 'quick');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'model = "old-managed-model"\n');
      writeFileSync(
        managedModelsPath(home),
        JSON.stringify({
          version: 1,
          models: { 'thoth-agents-quick.toml': 'old-managed-model' },
        }),
      );
      const plan = buildCodexSetupPlan({
        dryRun: false,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      });
      writeFileSync(managedModelsPath(home), '{"version":1,"models":{}}\n');

      const result = applyCodexSetup(plan);
      expect(result).toMatchObject({
        success: false,
        changed: [],
        error: expect.stringContaining('changed after planning'),
      });
      expect(existsSync(target)).toBe(true);
      expect(existsSync(rolePath(home, 'worker'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects a Worker collision introduced after planning', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-worker-race-'));
    try {
      const home = join(dir, 'home');
      const plan = buildCodexSetupPlan({
        dryRun: false,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      });
      const worker = rolePath(home, 'worker');
      mkdirSync(dirname(worker), { recursive: true });
      writeFileSync(worker, 'model = "user-owned"\n');

      const result = applyCodexSetup(plan);
      expect(result).toMatchObject({
        success: false,
        changed: [],
        error: expect.stringContaining('appeared after planning'),
      });
      expect(readFileSync(worker, 'utf8')).toContain('user-owned');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    'journal',
    'worker',
    'ledger',
  ] as const)('rejects a %s symlink introduced by an earlier apply write', (kind) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-apply-symlink-'));
    const originalWrite = managedStateIo.writeTextWithBackup;
    let spy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const home = join(dir, 'home');
      const obsolete = rolePath(home, 'deep');
      const ledger = managedModelsPath(home);
      mkdirSync(dirname(obsolete), { recursive: true });
      writeFileSync(obsolete, 'model = "old-managed-model"\n');
      const state = JSON.stringify({
        version: 1,
        models: { 'thoth-agents-deep.toml': 'old-managed-model' },
      });
      writeFileSync(ledger, state);
      const plan = buildCodexSetupPlan({
        dryRun: false,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      });
      const target =
        kind === 'journal'
          ? plan.items.find((item) => item.action === 'write-install-recovery')
              ?.targetPath
          : kind === 'worker'
            ? rolePath(home, 'worker')
            : ledger;
      if (!target) throw new Error('Missing planned recovery target');
      const outside = join(dir, 'outside-managed-scope');
      if (kind === 'ledger') writeFileSync(outside, state);
      let replaced = false;
      spy = vi
        .spyOn(managedStateIo, 'writeTextWithBackup')
        .mockImplementation((path, content) => {
          const changed = originalWrite(path, content);
          const trigger =
            kind === 'ledger'
              ? path === rolePath(home, 'worker')
              : path === plan.items[0].targetPath;
          if (trigger && !replaced) {
            rmSync(target, { force: true });
            symlinkSync(outside, target, 'file');
            replaced = true;
          }
          return changed;
        });
      const result = applyCodexSetup(plan);
      expect(replaced).toBe(true);
      expect(result.success).toBe(false);
      expect(result.changed.length).toBeGreaterThan(0);
      expect(readFileSync(obsolete, 'utf8')).toContain('old-managed-model');
      if (kind === 'ledger') expect(readFileSync(outside, 'utf8')).toBe(state);
      else expect(existsSync(outside)).toBe(false);
    } finally {
      spy?.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('recovers an interrupted first install only from exact role fingerprints', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-recovery-'));
    const originalWrite = managedStateIo.writeManagedModelState;
    let spy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const home = join(dir, 'home');
      const firstPlan = buildCodexSetupPlan({
        dryRun: false,
        reset: false,
        scope: 'user',
        projectRoot: dir,
        homeDir: home,
        packageRoot: PACKAGE_ROOT,
      });
      spy = vi
        .spyOn(managedStateIo, 'writeManagedModelState')
        .mockImplementation((path, version, updates) => {
          if (path === managedModelsPath(home)) throw new Error('interrupted');
          return originalWrite(path, version, updates);
        });
      const interrupted = applyCodexSetup(firstPlan);
      expect(interrupted.success).toBe(false);
      expect(existsSync(rolePath(home, 'worker'))).toBe(true);
      expect(existsSync(managedModelsPath(home))).toBe(false);
      spy.mockRestore();
      spy = undefined;

      const retried = applyCodexSetup(
        buildCodexSetupPlan({
          dryRun: false,
          reset: false,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      );
      expect(retried.success).toBe(true);
      expect(readManagedModels(home)['thoth-agents-worker.toml']).toBe(
        'gpt-6-luna',
      );
      expect(
        existsSync(
          join(home, '.codex', 'agents', '.thoth-agents-install-recovery.json'),
        ),
      ).toBe(false);
    } finally {
      spy?.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('preserves and reports replacement of an interrupted-install Worker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-recovery-replace-'));
    const originalWrite = managedStateIo.writeManagedModelState;
    let spy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const home = join(dir, 'home');
      spy = vi
        .spyOn(managedStateIo, 'writeManagedModelState')
        .mockImplementation((path, version, updates) => {
          if (path === managedModelsPath(home)) throw new Error('interrupted');
          return originalWrite(path, version, updates);
        });
      applyCodexSetup(
        buildCodexSetupPlan({
          dryRun: false,
          reset: false,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      );
      spy.mockRestore();
      spy = undefined;
      writeFileSync(
        rolePath(home, 'worker'),
        'model = "unowned-replacement"\n',
      );

      const retry = applyCodexSetup(
        buildCodexSetupPlan({
          reset: false,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      );
      expect(retry.success).toBe(true);
      expect(retry.diagnostics.join('\n')).toMatch(/operator-edited/);
      expect(readFileSync(rolePath(home, 'worker'), 'utf8')).toContain(
        'unowned-replacement',
      );
    } finally {
      spy?.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    'worker',
    'deep',
    'ledger',
  ] as const)('rejects a dangling %s symlink before mutation', (kind) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-dangling-'));
    try {
      const home = join(dir, 'home');
      const agents = join(home, '.codex', 'agents');
      mkdirSync(agents, { recursive: true });
      const target =
        kind === 'ledger' ? managedModelsPath(home) : rolePath(home, kind);
      symlinkSync(join(dir, `missing-${kind}`), target, 'file');
      expect(() =>
        buildCodexSetupPlan({
          dryRun: false,
          reset: false,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      ).toThrow(/symlink/);
      expect(existsSync(rolePath(home, 'explorer'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed on corrupt interrupted-install recovery state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-recovery-corrupt-'));
    try {
      const home = join(dir, 'home');
      const agents = join(home, '.codex', 'agents');
      mkdirSync(agents, { recursive: true });
      writeFileSync(join(agents, '.thoth-agents-install-recovery.json'), '{}');
      expect(() =>
        buildCodexSetupPlan({
          dryRun: false,
          reset: false,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      ).toThrow(/Corrupt Codex install recovery state/);
      expect(existsSync(rolePath(home, 'worker'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects a dangling symlinked Codex agents ancestor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-dangling-parent-'));
    try {
      const home = join(dir, 'home');
      mkdirSync(join(home, '.codex'), { recursive: true });
      symlinkSync(
        join(dir, 'missing-agents'),
        join(home, '.codex', 'agents'),
        'dir',
      );
      expect(() =>
        buildCodexSetupPlan({
          dryRun: false,
          reset: false,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      ).toThrow(/symlinked parent/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects a symlinked Codex agents directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-link-'));
    try {
      const home = join(dir, 'home');
      const realAgents = join(dir, 'real-agents');
      mkdirSync(join(home, '.codex'), { recursive: true });
      mkdirSync(realAgents, { recursive: true });
      symlinkSync(realAgents, join(home, '.codex', 'agents'), 'junction');

      expect(() =>
        buildCodexSetupPlan({
          dryRun: false,
          reset: false,
          scope: 'user',
          projectRoot: dir,
          homeDir: home,
          packageRoot: PACKAGE_ROOT,
        }),
      ).toThrow(/symlinked parent/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('handles legacy Codex role model tracking', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const explorer = rolePath(home, 'explorer');
      const librarian = rolePath(home, 'librarian');
      const explorerDefault = roleModel(readFileSync(explorer, 'utf8'));
      writeFileSync(
        librarian,
        replaceRoleModel(readFileSync(librarian, 'utf8'), 'legacy-user-model'),
      );
      rmSync(managedModelsPath(home), { force: true });

      applyFreshCodexSetup(dir, home);

      expect(roleModel(readFileSync(explorer, 'utf8'))).toBe(explorerDefault);
      expect(roleModel(readFileSync(librarian, 'utf8'))).toBe(
        'legacy-user-model',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('preserves the entire operator-edited Codex role', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'designer');
      const installed = readFileSync(target, 'utf8');
      writeFileSync(
        target,
        replaceRoleModel(installed, 'designer-user-model')
          .replace('name = "designer"', 'name = "renamed"')
          .replace(
            'description = "Own user-facing implementation choices and visual quality for UI work."',
            'description = "user edited"',
          )
          .replace(
            'model_reasoning_effort = "max"',
            'model_reasoning_effort = "high"',
          )
          .replace(
            'developer_instructions = """',
            'developer_instructions = """\nUSER EDIT\n',
          ),
      );

      applyFreshCodexSetup(dir, home);

      const updated = readFileSync(target, 'utf8');
      expect(roleModel(updated)).toBe('designer-user-model');
      expect(updated).toContain('name = "renamed"');
      expect(updated).toContain(
        'description = "Own user-facing implementation choices',
      );
      expect(updated).toContain('Use when: User-facing UI/UX');
      expect(parseRoleTomlEffort(updated)).toBe('high');
      expect(updated).not.toContain('USER EDIT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reset refreshes Codex managed model state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-install-'));
    try {
      const home = join(dir, 'home');
      applyFreshCodexSetup(dir, home);
      const target = rolePath(home, 'oracle');
      expect(
        applyCodexManagedModelOverrides(
          {
            reset: false,
            scope: 'user',
            projectRoot: dir,
            homeDir: home,
            packageRoot: PACKAGE_ROOT,
          },
          [{ role: 'oracle', model: 'reset-user-model', effort: 'low' }],
        ).success,
      ).toBe(true);

      const prior = JSON.parse(readFileSync(managedModelsPath(home), 'utf8'));
      prior.extension = { keep: true };
      prior.ownedHookTrustKeys = ['owned'];
      writeFileSync(managedModelsPath(home), JSON.stringify(prior));
      applyFreshCodexSetup(dir, home, true);
      const resetState = JSON.parse(
        readFileSync(managedModelsPath(home), 'utf8'),
      );
      expect(resetState.configuredModels ?? {}).toEqual({});
      expect(resetState.configuredEfforts ?? {}).toEqual({});
      expect(resetState.extension).toEqual({ keep: true });
      expect(resetState.priorThreadsValue).toBe(prior.priorThreadsValue);
      expect(resetState.ownedHookTrustKeys).toEqual(['owned']);

      const resetModel = roleModel(readFileSync(target, 'utf8'));
      expect(resetModel).not.toBe('reset-user-model');
      const resetEffort = parseRoleTomlEffort(readFileSync(target, 'utf8'));
      rmSync(target);
      applyFreshCodexSetup(dir, home);
      expect(roleModel(readFileSync(target, 'utf8'))).toBe(resetModel);
      expect(parseRoleTomlEffort(readFileSync(target, 'utf8'))).toBe(
        resetEffort,
      );
      expect(readManagedModels(home)['thoth-agents-oracle.toml']).toBe(
        resetModel,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('legacy Codex root migration', () => {
  test('removes only the marked bytes, preserving CRLF, BOM and surrounding whitespace with a backup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-root-migration-'));
    const home = join(dir, 'home');
    const target = join(home, '.codex', 'AGENTS.md');
    const original =
      '\uFEFFoperator\r\n\r\n<!-- thoth-agents:codex-root:start -->\r\nedited legacy payload\r\n<!-- thoth-agents:codex-root:end -->\r\n\r\ntail  \r\n';
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, original);
      seedHookBundle(home);
      const plan = buildCodexSetupPlan({
        scope: 'user',
        reset: false,
        projectRoot: dir,
        homeDir: home,
        commandExecutor: hookManager,
      });
      const result = applyCodexSetup(plan);
      expect(result.success).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe(
        '\uFEFFoperator\r\n\r\n\r\n\r\ntail  \r\n',
      );
      expect(readFileSync(`${target}.bak`, 'utf8')).toBe(original);
      expect(result.diagnostics.join('\n')).toContain(
        `Removed legacy Codex root block from ${target}; backup: ${target}.bak`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function seedHookBundle(home: string): void {
  const root = join(
    home,
    '.codex/plugins/cache/thoth-plugins/thoth-agents/1.0.0/codex-hooks',
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

const hookManager: pluginInstall.CodexCommandExecutor = (_command, args) => ({
  exitCode: 0,
  stderr: '',
  stdout: JSON.stringify(
    args.includes('marketplace')
      ? { marketplaces: [] }
      : {
          installed: [
            {
              pluginId: 'thoth-agents@thoth-plugins',
              enabled: true,
              version: '1.0.0',
            },
          ],
        },
  ),
});

describe('Codex root migration prerequisite', () => {
  test.each([
    'missing',
    'disabled',
    'legacy',
  ])('%s plugin fails before any legacy surface is changed', (kind) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-root-gate-'));
    const home = join(dir, 'home');
    const target = join(home, '.codex', 'AGENTS.md');
    const legacyRole =
      'model = "legacy-model"\ndeveloper_instructions = "full legacy prompt"\n';
    const original =
      '<!-- thoth-agents:codex-root:start -->legacy<!-- thoth-agents:codex-root:end -->';
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, original);
      mkdirSync(dirname(rolePath(home, 'oracle')), { recursive: true });
      writeFileSync(rolePath(home, 'oracle'), legacyRole);
      const commandExecutor: pluginInstall.CodexCommandExecutor = (
        command,
        args,
        options,
      ) =>
        kind === 'legacy'
          ? hookManager(command, args, options)
          : {
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
                                enabled: false,
                                version: '1.0.0',
                              },
                            ],
                    },
              ),
            };
      const plan = buildCodexSetupPlan({
        scope: 'user',
        reset: false,
        projectRoot: dir,
        homeDir: home,
        commandExecutor,
      });
      const result = applyCodexSetup(plan);
      expect(result.success).toBe(false);
      expect(result.error).toContain('thoth-agents update --agent=codex');
      expect(readFileSync(target, 'utf8')).toBe(original);
      expect(existsSync(`${target}.bak`)).toBe(false);
      expect(readFileSync(rolePath(home, 'oracle'), 'utf8')).toBe(legacyRole);
      expect(existsSync(join(home, '.codex/config.toml'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('legacy root removal edge cases', () => {
  const start = '<!-- thoth-agents:codex-root:start -->';
  const end = '<!-- thoth-agents:codex-root:end -->';
  test.each([
    '',
    ' \r\n',
    'operator\r\n',
  ])('absent markers preserve the original file exactly (%j)', (original) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-root-noop-'));
    const home = join(dir, 'home');
    const target = join(home, '.codex/AGENTS.md');
    try {
      seedHookBundle(home);
      writeFileSync(target, original);
      const result = applyCodexSetup(
        buildCodexSetupPlan({
          scope: 'user',
          reset: false,
          projectRoot: dir,
          homeDir: home,
          commandExecutor: hookManager,
        }),
      );
      expect(result.success).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe(original);
      expect(existsSync(`${target}.bak`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test.each([
    start,
    end,
    end + start,
    start + start + end,
    start + end + end,
    '<!-- thoth-agents:codex-root:start -- >',
  ])('preserves and reports malformed or ambiguous markers (%j)', (original) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-root-malformed-'));
    const home = join(dir, 'home');
    const target = join(home, '.codex/AGENTS.md');
    try {
      seedHookBundle(home);
      writeFileSync(target, original);
      const plan = buildCodexSetupPlan({
        scope: 'user',
        reset: false,
        projectRoot: dir,
        homeDir: home,
        commandExecutor: hookManager,
      });
      const result = applyCodexSetup(plan);
      expect(result.success).toBe(true);
      expect(result.diagnostics.join('\n')).toContain(
        'Preserved malformed or ambiguous legacy Codex root markers',
      );
      expect(readFileSync(target, 'utf8')).toBe(original);
      expect(existsSync(`${target}.bak`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('deletes whitespace-only migration results, but never creates a missing root file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-root-empty-'));
    const home = join(dir, 'home');
    const target = join(home, '.codex/AGENTS.md');
    const original = ` \r\n${start}legacy${end}\r\n`;
    try {
      seedHookBundle(home);
      writeFileSync(target, original);
      const config = {
        scope: 'user' as const,
        reset: false,
        projectRoot: dir,
        homeDir: home,
        commandExecutor: hookManager,
      };
      expect(applyCodexSetup(buildCodexSetupPlan(config)).success).toBe(true);
      expect(existsSync(target)).toBe(false);
      expect(readFileSync(`${target}.bak`, 'utf8')).toBe(original);
      expect(applyCodexSetup(buildCodexSetupPlan(config)).success).toBe(true);
      expect(existsSync(target)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('dry-run reports removal and the prerequisite without changing any file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-root-dry-'));
    const home = join(dir, 'home');
    const target = join(home, '.codex/AGENTS.md');
    const original = `${start}legacy${end}`;
    try {
      seedHookBundle(home);
      writeFileSync(target, original);
      const plan = buildCodexSetupPlan({
        dryRun: true,
        scope: 'user',
        reset: false,
        projectRoot: dir,
        homeDir: home,
        commandExecutor: hookManager,
      });
      const result = applyCodexSetup(plan);
      expect(formatCodexSetupPlan(plan)).toContain('remove-legacy-root-block');
      expect(result.diagnostics.join('\n')).toContain(
        'Codex hook prerequisite passed',
      );
      expect(result.changed).toEqual([]);
      expect(readFileSync(target, 'utf8')).toBe(original);
      expect(existsSync(`${target}.bak`)).toBe(false);
      expect(existsSync(rolePath(home, 'worker'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('legacy root migration preserves non-UTF8 bytes and rejects a changed file before mutation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-root-bytes-'));
  const home = join(dir, 'home');
  const target = join(home, '.codex/AGENTS.md');
  const outside = Buffer.from([0xff, 0x80, 0, 0x41]);
  const original = Buffer.concat([
    outside,
    Buffer.from(
      '<!-- thoth-agents:codex-root:start -->legacy<!-- thoth-agents:codex-root:end -->',
    ),
    outside,
  ]);
  try {
    seedHookBundle(home);
    writeFileSync(target, original);
    const config = {
      scope: 'user' as const,
      reset: false,
      projectRoot: dir,
      homeDir: home,
      commandExecutor: hookManager,
    };
    const plan = buildCodexSetupPlan(config);
    writeFileSync(target, 'changed by operator');
    expect(applyCodexSetup(plan)).toMatchObject({
      success: false,
      changed: [],
    });
    expect(readFileSync(target, 'utf8')).toBe('changed by operator');
    expect(existsSync(`${target}.bak`)).toBe(false);
    expect(existsSync(rolePath(home, 'worker'))).toBe(false);
    writeFileSync(target, original);
    expect(applyCodexSetup(buildCodexSetupPlan(config)).success).toBe(true);
    expect(readFileSync(target)).toEqual(Buffer.concat([outside, outside]));
    expect(readFileSync(`${target}.bak`)).toEqual(original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dry-run reports a failed prerequisite and planned removal without mutation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-root-dry-gate-'));
  const home = join(dir, 'home');
  const target = join(home, '.codex/AGENTS.md');
  const original =
    '<!-- thoth-agents:codex-root:start -->legacy<!-- thoth-agents:codex-root:end -->';
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, original);
    const plan = buildCodexSetupPlan({
      dryRun: true,
      scope: 'user',
      reset: false,
      projectRoot: dir,
      homeDir: home,
      commandExecutor: hookManager,
    });
    const result = applyCodexSetup(plan);
    expect(formatCodexSetupPlan(plan)).toContain('remove-legacy-root-block');
    expect(result.diagnostics.join('\n')).toContain(
      'Planned migration is conditional on the plugin step passing this prerequisite.',
    );
    expect(result.changed).toEqual([]);
    expect(readFileSync(target, 'utf8')).toBe(original);
    expect(existsSync(`${target}.bak`)).toBe(false);
    expect(existsSync(rolePath(home, 'worker'))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration documentation describes preservation rather than a Worker collision blocker', () => {
  const doc = readFileSync(join(PACKAGE_ROOT, 'docs/codex-install.md'), 'utf8');
  expect(doc).not.toContain(
    'without thoth-agents model-ownership state blocks setup',
  );
});
