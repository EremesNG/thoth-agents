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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ALL_AGENT_NAMES } from '../../config';
import { THOTH_OWNED_SKILL_NAMES } from '../../harness/core/owned-skills';
import { finalizeHarnessInstall } from '../install-completion';
import {
  getInstallLedgerPath,
  readInstallLedger,
  recordCompletedInstall,
} from '../install-ledger';
import { resolveExecutingPackageVersion } from '../package-version';
import { generateLiteConfig } from '../providers';
import { getOpenCodeModelRoles } from '../tui/operations';

const installRequiredSkillMock = vi.hoisted(() =>
  vi.fn(() => ({ status: 'installed' as const })),
);

vi.mock('../skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skills')>();
  return {
    ...actual,
    REQUIRED_SKILLS: [
      {
        name: 'simplify',
        repo: 'https://example.test/simplify',
        skillName: 'simplify',
        description: 'test skill',
      },
      {
        name: 'tdd',
        repo: 'https://example.test/tdd',
        skillName: 'tdd',
        description: 'test skill',
      },
      {
        name: 'progressive-context-router',
        repo: 'https://example.test/progressive-context-router',
        skillName: 'progressive-context-router',
        description: 'test skill',
      },
      {
        name: 'architectural-grilling',
        repo: 'https://example.test/architectural-grilling',
        skillName: 'architectural-grilling',
        description: 'test skill',
      },
    ],
    installRequiredSkill: installRequiredSkillMock,
  };
});

import {
  applyOpenCodePlan,
  buildOpenCodeInstallPlan,
  buildOpenCodeModelPlan,
  buildOpenCodeSyncPlan,
  buildOpenCodeUpdatePlan,
  getOpenCodeStatus,
} from './opencode';

const EXECUTING_PACKAGE = resolveExecutingPackageVersion();
if (!EXECUTING_PACKAGE.ok) {
  throw new Error(EXECUTING_PACKAGE.error.message);
}
const EXECUTING_PLUGIN = `thoth-agents@${EXECUTING_PACKAGE.version}`;

describe('OpenCode operations adapter v0.3', () => {
  let configRoot: string;
  let tempRoot: string;
  let originalConfigDir: string | undefined;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    installRequiredSkillMock.mockReset();
    installRequiredSkillMock.mockReturnValue({ status: 'installed' });
    originalConfigDir = process.env.OPENCODE_CONFIG_DIR;
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    tempRoot = mkdtempSync(join(tmpdir(), 'thoth-opencode-v03-'));
    configRoot = join(tempRoot, 'opencode');
    mkdirSync(configRoot, { recursive: true });
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    process.env.XDG_CONFIG_HOME = tempRoot;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.OPENCODE_CONFIG_DIR;
    } else {
      process.env.OPENCODE_CONFIG_DIR = originalConfigDir;
    }
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  const context = () => ({
    cwd: configRoot,
    env: {
      HOME: join(configRoot, 'home'),
      XDG_CONFIG_HOME: tempRoot,
    },
    runThothMemSetup: () => completeProviderResult(),
    installLedgerOptions: { configRoot: tempRoot },
  });

  const mainConfigPath = () => join(configRoot, 'opencode.json');
  const liteConfigPath = () => join(configRoot, 'thoth-agents.json');

  function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  function validLiteConfig(): Record<string, unknown> {
    return generateLiteConfig({
      agent: 'opencode',
      hasTmux: false,
      dryRun: false,
      reset: false,
    });
  }

  function writeManagedConfig(): void {
    writeJson(mainConfigPath(), { plugin: [EXECUTING_PLUGIN] });
    writeJson(liteConfigPath(), validLiteConfig());
  }

  function writeRequiredSkill(
    name: string,
    root: 'opencode' | 'agents' = 'opencode',
  ): string {
    const rootSegments =
      root === 'opencode'
        ? ['.config', 'opencode', 'skills']
        : ['.agents', 'skills'];
    const path = join(configRoot, 'home', ...rootSegments, name, 'SKILL.md');
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `---\nname: ${name}\n---\n`);
    return path;
  }

  function writeAllRequiredSkills(): void {
    writeRequiredSkill('simplify');
    writeRequiredSkill('tdd');
    writeRequiredSkill('progressive-context-router');
    writeRequiredSkill('architectural-grilling');
    for (const skillName of THOTH_OWNED_SKILL_NAMES) {
      writeRequiredSkill(skillName);
    }
  }

  function cataloguedOpenCodeRoles() {
    return getOpenCodeModelRoles().map((role) =>
      role.effort?.kind === 'effort'
        ? {
            ...role,
            catalogId: role.model,
            availableEfforts: [role.effort.value],
          }
        : role,
    );
  }

  function completeProviderResult() {
    return {
      success: true,
      evidenceValid: true,
      status: 'complete' as const,
      changed: true,
      harness: 'opencode' as const,
      target: 'C:/provider/opencode',
      steps: [{ name: 'Provider setup', outcome: 'complete' as const }],
      diagnostics: ['provider complete'],
      manualActions: [],
      receipt: null,
      command: 'npx',
      args: ['thoth-mem@latest'],
      exitCode: 0,
    };
  }

  test.each([
    ['install', buildOpenCodeInstallPlan],
    ['update', buildOpenCodeUpdatePlan],
  ] as const)('%s preview is complete and apply preserves required effect order', (action, buildPlan) => {
    const effects: string[] = [];
    const updateMainConfig = vi.fn(() => {
      effects.push('config');
      return { success: true, configPath: mainConfigPath() };
    });
    const writeLite = vi.fn(() => {
      effects.push('lite-config');
      return { success: true, configPath: liteConfigPath() };
    });
    const syncOwnedSkills = vi.fn((options: { dryRun?: boolean }) => {
      if (!options.dryRun) effects.push('owned-skills');
      return {
        success: true,
        status: options.dryRun ? ('planned' as const) : ('installed' as const),
        skills: [
          {
            name: 'thoth-sdd' as const,
            sourcePath: 'C:/package/skills/thoth-sdd',
            destinationPath: 'C:/home/skills/thoth-sdd',
          },
        ],
      };
    });
    const installSkill = vi.fn((skill: { name: string }) => {
      effects.push(`external:${skill.name}`);
      return {
        status: 'installed' as const,
        skillPath: `C:/skills/${skill.name}`,
      };
    });
    const finalize = vi.fn((options) => {
      effects.push('provider-ledger');
      return finalizeHarnessInstall(options);
    });
    const operationContext = {
      ...context(),
      resolveExecutingPackageVersion: () => ({
        ok: true as const,
        version: '0.4.8',
        packageRoot: process.cwd(),
      }),
      updateOpenCodeMainConfig: updateMainConfig,
      writeLiteConfig: writeLite,
      syncOpenCodeOwnedSkills: syncOwnedSkills,
      installRequiredSkill: installSkill,
      finalizeHarnessInstall: finalize,
      installLedgerOptions: { configRoot: tempRoot },
    };

    const plan = buildPlan(operationContext);
    const titles = plan.items.map(({ title }) => title);

    expect(plan.action).toBe(action);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Ensure OpenCode plugin points at thoth-agents@0.4.8',
        'Disable OpenCode default agents',
        'Write thoth-agents seven-role config',
        'Synchronize global thoth-owned OpenCode skills',
        'Install required external skills',
        'Plan provider-owned thoth-mem setup',
        'Record completed OpenCode CLI install',
      ]),
    );
    expect(updateMainConfig).not.toHaveBeenCalled();
    expect(writeLite).not.toHaveBeenCalled();
    expect(installSkill).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(true);
    expect(updateMainConfig).toHaveBeenCalledWith({
      ensurePlugin: true,
      pluginVersion: '0.4.8',
      disableDefaults: true,
    });
    expect(effects).toEqual([
      'config',
      'lite-config',
      'owned-skills',
      ...[
        'simplify',
        'tdd',
        'progressive-context-router',
        'architectural-grilling',
      ].map((name) => `external:${name}`),
      'provider-ledger',
    ]);
    expect(readInstallLedger({ configRoot: tempRoot })).toMatchObject({
      status: 'valid',
      ledger: { harnesses: { opencode: { version: '0.4.8' } } },
    });
  });

  test('rejects changed exact-version provenance before OpenCode mutation', () => {
    let version = '0.4.8';
    const updateMainConfig = vi.fn(() => ({
      success: true,
      configPath: mainConfigPath(),
    }));
    const operationContext = {
      ...context(),
      resolveExecutingPackageVersion: () => ({
        ok: true as const,
        version,
        packageRoot: process.cwd(),
      }),
      updateOpenCodeMainConfig: updateMainConfig,
    };
    const plan = buildOpenCodeUpdatePlan(operationContext);
    version = '0.4.9';

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-package-version-changed' }),
      ]),
    );
    expect(updateMainConfig).not.toHaveBeenCalled();
  });

  test('reports provider failure and does not claim OpenCode update completion', () => {
    const finalize = vi.fn(() => ({
      success: false,
      provider: {
        ...completeProviderResult(),
        success: false,
        status: 'partial' as const,
        diagnostics: ['provider partial'],
        manualActions: ['Run provider recovery.'],
        receipt: 'C:/provider/partial.json',
        exitCode: 2,
      },
      ledger: {
        status: 'not-attempted' as const,
        path: getInstallLedgerPath({ configRoot: tempRoot }),
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
      installLedgerOptions: { configRoot: tempRoot },
    };

    const result = applyOpenCodePlan(buildOpenCodeUpdatePlan(operationContext));

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'provider partial' }),
        expect.objectContaining({ message: 'Run provider recovery.' }),
      ]),
    );
    expect(result.summary).toContain('provider incomplete');
  });

  test('reports matching, mismatched, missing, and invalid CLI-managed versions', () => {
    const executing = resolveExecutingPackageVersion();
    expect(executing.ok).toBe(true);
    if (!executing.ok) return;
    const versionTarget = () =>
      getOpenCodeStatus(context()).targets.find(
        ({ label }) => label === 'CLI-managed install version',
      );
    const ledgerOptions = { configRoot: tempRoot };

    expect(versionTarget()).toMatchObject({
      kind: 'file',
      path: getInstallLedgerPath(ledgerOptions),
      state: 'missing',
      expected: `executing ${executing.version}`,
      observed: 'recorded missing',
    });

    expect(
      recordCompletedInstall({
        harness: 'opencode',
        version: executing.version,
        ...ledgerOptions,
      }).success,
    ).toBe(true);
    expect(versionTarget()).toMatchObject({
      state: 'installed',
      expected: `executing ${executing.version}`,
      observed: `recorded ${executing.version}`,
    });

    const priorVersion = executing.version === '0.4.7' ? '0.4.6' : '0.4.7';
    expect(
      recordCompletedInstall({
        harness: 'opencode',
        version: priorVersion,
        ...ledgerOptions,
      }).success,
    ).toBe(true);
    expect(versionTarget()).toMatchObject({
      state: 'outdated',
      expected: `executing ${executing.version}`,
      observed: `recorded ${priorVersion}`,
    });

    writeFileSync(getInstallLedgerPath(ledgerOptions), '{ malformed');
    expect(versionTarget()).toMatchObject({
      state: 'unknown',
      expected: `executing ${executing.version}`,
      observed: 'recorded unknown (invalid ledger)',
    });
  });

  test('classifies missing required skills as managed drift', () => {
    writeManagedConfig();
    const status = getOpenCodeStatus(context());

    expect(status.state).toBe('drift');
    expect(status.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'important',
          code: 'opencode-required-skills-missing',
        }),
      ]),
    );
    expect(
      status.diagnostics.some(({ code }) => code?.includes('bundled-skills')),
    ).toBe(false);
  });

  test('reports all owned and external global skills', () => {
    writeManagedConfig();
    writeRequiredSkill('simplify');

    const status = getOpenCodeStatus(context());
    const skills = status.targets.filter(({ kind }) => kind === 'skill');

    expect(skills).toHaveLength(9);
    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Simplify', state: 'installed' }),
        expect.objectContaining({ label: 'Tdd', state: 'missing' }),
        expect.objectContaining({ label: 'Thoth-SDD', state: 'missing' }),
        expect.objectContaining({ label: 'Plan-Reviewer', state: 'missing' }),
      ]),
    );
    expect(
      skills.filter(({ observed }) =>
        observed?.includes('thoth-owned global skill'),
      ),
    ).toHaveLength(5);
  });

  test('accepts required external skills from both OpenCode global roots', () => {
    writeManagedConfig();
    const expectedPaths = [
      writeRequiredSkill('simplify'),
      writeRequiredSkill('tdd', 'agents'),
      writeRequiredSkill('progressive-context-router'),
      writeRequiredSkill('architectural-grilling', 'agents'),
      ...THOTH_OWNED_SKILL_NAMES.map((name) => writeRequiredSkill(name)),
    ];

    const status = getOpenCodeStatus(context());
    const skills = status.targets.filter(({ kind }) => kind === 'skill');

    expect(status.state).toBe('installed');
    expect(skills.map(({ path }) => path)).toEqual(expectedPaths);
    expect(
      status.diagnostics.some(
        ({ code }) => code === 'opencode-required-skills-missing',
      ),
    ).toBe(false);
  });

  test('previews seven-role sync and all global skill installation', () => {
    const sync = buildOpenCodeSyncPlan(context());
    const install = buildOpenCodeInstallPlan(context());
    const previews = [...sync.items, ...install.items]
      .map(({ preview }) => preview ?? '')
      .join('\n');

    expect(previews).not.toMatch(/sdd-(?:specify|plan|tasks)/);
    expect(previews).toContain('orchestrator');
    expect(previews).toContain('oracle');
    expect([...sync.items, ...install.items]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Synchronize global thoth-owned OpenCode skills',
        }),
      ]),
    );
    expect(previews).not.toContain('installCustomSkills');
    expect(previews).toContain('simplify');
    expect(previews).toContain('tdd');
    expect(previews).toContain('progressive-context-router');
    expect(previews).toContain('architectural-grilling');
    for (const skillName of THOTH_OWNED_SKILL_NAMES) {
      expect(previews).toContain(skillName);
    }
    expect(previews).not.toContain('playwright-cli');
    expect(existsSync(mainConfigPath())).toBe(false);
    expect(existsSync(liteConfigPath())).toBe(false);
  });

  test('applies an install with the complete canonical roster', () => {
    const result = applyOpenCodePlan(buildOpenCodeInstallPlan(context()));
    const written = JSON.parse(readFileSync(liteConfigPath(), 'utf8')) as {
      preset: string;
      presets: { openai: Record<string, unknown> };
    };

    expect(result.applied).toBe(true);
    expect(written.preset).toBe('openai');
    expect(Object.keys(written.presets.openai)).toEqual(ALL_AGENT_NAMES);
    expect(result.changedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ observed: 'seven-role roster written' }),
        expect.objectContaining({ label: 'Required OpenCode skills' }),
      ]),
    );
    expect(installRequiredSkillMock).toHaveBeenCalledTimes(4);
    expect(installRequiredSkillMock).toHaveBeenCalledWith(
      expect.objectContaining({ skillName: 'tdd' }),
      'opencode',
      expect.any(Object),
    );
    for (const skillName of THOTH_OWNED_SKILL_NAMES) {
      expect(
        existsSync(
          join(
            configRoot,
            'home',
            '.config',
            'opencode',
            'skills',
            skillName,
            'SKILL.md',
          ),
        ),
        skillName,
      ).toBe(true);
    }
    expect(installRequiredSkillMock).toHaveBeenCalledWith(
      expect.objectContaining({ skillName: 'architectural-grilling' }),
      'opencode',
      expect.any(Object),
    );
  });

  test('applies sync with the built-in OpenAI preset active', () => {
    const result = applyOpenCodePlan(buildOpenCodeSyncPlan(context()));
    const written = JSON.parse(readFileSync(liteConfigPath(), 'utf8')) as {
      preset: string;
      presets: { openai: Record<string, unknown> };
    };

    expect(result.applied).toBe(true);
    expect(written.preset).toBe('openai');
    expect(Object.keys(written.presets.openai)).toEqual(ALL_AGENT_NAMES);
    expect(readInstallLedger({ configRoot: tempRoot }).status).toBe('missing');
  });

  test('blocks completion when a required skill cannot be installed', () => {
    installRequiredSkillMock.mockReturnValue({ status: 'failed' });

    const result = applyOpenCodePlan(buildOpenCodeInstallPlan(context()));

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'critical',
          code: 'opencode-required-skill-failed',
        }),
      ]),
    );
  });

  test('activates a complete agents preset without losing effective fields', () => {
    writeManagedConfig();
    writeAllRequiredSkills();
    const baseConfig = validLiteConfig();
    const customPreset = {
      librarian: {
        model: 'custom/librarian',
        variant: 'selected-librarian',
        temperature: 0.4,
      },
      deep: { model: 'custom/deep', temperature: 0.5 },
    };
    writeJson(liteConfigPath(), {
      ...baseConfig,
      preset: 'custom',
      presets: {
        ...(baseConfig.presets as Record<string, unknown>),
        custom: customPreset,
      },
      agents: {
        explorer: { variant: 'root-explorer', temperature: 0.25 },
        deep: { temperature: 0.75 },
      },
      tmux: { enabled: true, layout: 'tiled', main_pane_size: 55 },
    });
    const plan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            provider: 'openai',
            model: 'gpt-5.6-terra',
          },
        ],
      },
      context(),
    );

    const result = applyOpenCodePlan(plan);
    const written = JSON.parse(readFileSync(liteConfigPath(), 'utf8')) as {
      preset: string;
      presets: Record<string, Record<string, Record<string, string | number>>>;
      agents: Record<string, Record<string, string | number>>;
      tmux: { enabled: boolean; layout: string; main_pane_size: number };
    };

    expect(result.applied).toBe(true);
    expect(written.preset).toBe('agents');
    expect(Object.keys(written.presets.agents ?? {})).toEqual(ALL_AGENT_NAMES);
    expect(written.presets.agents?.explorer).toEqual({
      model: 'openai/gpt-5.6-luna',
      variant: 'root-explorer',
      temperature: 0.25,
    });
    expect(written.presets.agents?.deep).toEqual({
      model: 'openai/gpt-5.6-terra',
      temperature: 0.75,
    });
    expect(written.presets.agents?.librarian).toEqual({
      model: 'custom/librarian',
      variant: 'selected-librarian',
      temperature: 0.4,
    });
    expect(written.presets.custom).toEqual(customPreset);
    expect(written.agents.deep).toEqual({
      model: 'openai/gpt-5.6-terra',
      temperature: 0.75,
    });
    expect(written.tmux).toEqual({
      enabled: true,
      layout: 'tiled',
      main_pane_size: 55,
    });
  });

  test('activates all unchanged displayed roles as the agents preset', () => {
    writeManagedConfig();
    writeAllRequiredSkills();
    const displayedRoles = cataloguedOpenCodeRoles();
    const plan = buildOpenCodeModelPlan(
      { harness: 'opencode', dryRun: true, roles: displayedRoles },
      context(),
    );

    expect(displayedRoles).toHaveLength(ALL_AGENT_NAMES.length);
    expect(plan.canApply, JSON.stringify(plan.warnings)).toBe(true);
    const result = applyOpenCodePlan(plan);
    expect(result.applied, JSON.stringify(result.warnings)).toBe(true);
    const written = JSON.parse(readFileSync(liteConfigPath(), 'utf8')) as {
      preset: string;
      presets: Record<string, Record<string, Record<string, unknown>>>;
      agents: Record<string, Record<string, unknown>>;
    };

    expect(written.preset).toBe('agents');
    expect(Object.keys(written.presets.agents ?? {})).toEqual(ALL_AGENT_NAMES);
    expect(Object.keys(written.agents)).toEqual(ALL_AGENT_NAMES);
    for (const role of displayedRoles) {
      const persisted = written.presets.agents?.[role.role];
      expect(persisted?.model).toBe(role.model);
      if (role.effort?.kind === 'effort') {
        expect(persisted?.variant).toBe(role.effort.value);
      } else {
        expect(persisted).not.toHaveProperty('variant');
      }
    }
  });

  test('prefers a complete agents preset over the root-only legacy shape', () => {
    writeManagedConfig();
    writeAllRequiredSkills();
    const plan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: cataloguedOpenCodeRoles(),
      },
      context(),
    );
    expect(applyOpenCodePlan(plan).applied).toBe(true);

    writeJson(mainConfigPath(), { plugin: ['thoth-agents@0.3.0'] });
    const pluginDrift = getOpenCodeStatus(context());
    expect(pluginDrift.state).toBe('drift');
    expect(pluginDrift.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plugin-drift' }),
      ]),
    );
    expect(pluginDrift.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-roster-drift' }),
      ]),
    );

    rmSync(mainConfigPath());
    const missingMain = getOpenCodeStatus(context());
    expect(missingMain.state).toBe('missing');
    expect(missingMain.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-roster-drift' }),
      ]),
    );

    const legacy = JSON.parse(readFileSync(liteConfigPath(), 'utf8')) as Record<
      string,
      unknown
    > & {
      presets: Record<string, unknown>;
    };
    delete legacy.presets.agents;
    writeJson(liteConfigPath(), legacy);
    writeJson(mainConfigPath(), { plugin: [EXECUTING_PLUGIN] });
    const rootOnlyLegacy = getOpenCodeStatus(context());
    expect(rootOnlyLegacy.state).toBe('drift');
    expect(rootOnlyLegacy.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-roster-drift' }),
      ]),
    );
  });

  test('recognizes and reapplies the activated agents preset', () => {
    writeManagedConfig();
    writeAllRequiredSkills();
    const firstPlan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          {
            role: 'explorer',
            model: 'openai/gpt-5.6-luna',
            effort: { kind: 'inherit' },
          },
          { role: 'deep', model: 'openai/gpt-5.6-terra' },
        ],
      },
      context(),
    );

    expect(applyOpenCodePlan(firstPlan).applied).toBe(true);
    const beforeSecondApply = getOpenCodeModelRoles();
    const status = getOpenCodeStatus(context());

    expect(status.state).toBe('installed');
    expect(status.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-roster-drift' }),
      ]),
    );
    expect(beforeSecondApply.find(({ role }) => role === 'deep')).toEqual({
      role: 'deep',
      model: 'openai/gpt-5.6-terra',
      effort: { kind: 'inherit' },
    });
    expect(beforeSecondApply.find(({ role }) => role === 'explorer')).toEqual({
      role: 'explorer',
      model: 'openai/gpt-5.6-luna',
      effort: { kind: 'inherit' },
    });

    const secondPlan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [{ role: 'deep', model: 'openai/gpt-5.6-sol' }],
      },
      context(),
    );
    expect(secondPlan.canApply).toBe(true);
    expect(applyOpenCodePlan(secondPlan).applied).toBe(true);

    const afterSecondApply = getOpenCodeModelRoles();
    expect(afterSecondApply.filter(({ role }) => role !== 'deep')).toEqual(
      beforeSecondApply.filter(({ role }) => role !== 'deep'),
    );
    expect(afterSecondApply.find(({ role }) => role === 'deep')).toEqual({
      role: 'deep',
      model: 'openai/gpt-5.6-sol',
      effort: { kind: 'inherit' },
    });
    const written = JSON.parse(readFileSync(liteConfigPath(), 'utf8')) as {
      presets: { agents: Record<string, Record<string, unknown>> };
    };
    expect(written.presets.agents.explorer).not.toHaveProperty('variant');
  });

  test('rejects unissued or mutated plans before writing', () => {
    const update = buildOpenCodeUpdatePlan(context());
    update.summary = 'tampered';

    const result = applyOpenCodePlan(update);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'critical' }),
      ]),
    );
    expect(existsSync(mainConfigPath())).toBe(false);
  });
});
