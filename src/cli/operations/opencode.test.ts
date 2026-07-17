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
import { getOpenCodeManagedModelStatePath } from '../paths';

const installRecommendedSkillMock = vi.hoisted(() =>
  vi.fn(() => ({ status: 'installed' as const })),
);
const installCustomSkillsMock = vi.hoisted(() => vi.fn());
const checkCustomSkillsNeedUpdateMock = vi.hoisted(() => vi.fn());

vi.mock('../skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../skills')>();
  return {
    ...actual,
    RECOMMENDED_SKILLS: [
      {
        name: 'simplify',
        repo: 'https://example.test/simplify',
        skillName: 'simplify',
        description: 'test skill',
      },
      {
        name: 'playwright-cli',
        repo: 'https://example.test/playwright-cli',
        skillName: 'playwright-cli',
        description: 'test skill',
      },
    ],
    installRecommendedSkill: installRecommendedSkillMock,
  };
});

vi.mock('../custom-skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../custom-skills')>();
  return {
    ...actual,
    installCustomSkills: installCustomSkillsMock,
    checkCustomSkillsNeedUpdate: checkCustomSkillsNeedUpdateMock,
  };
});

import { CUSTOM_SKILLS } from '../custom-skills';
import {
  applyOpenCodePlan,
  buildOpenCodeInstallPlan,
  buildOpenCodeModelPlan,
  buildOpenCodeSyncPlan,
  buildOpenCodeUpdatePlan,
  getOpenCodeStatus,
} from './opencode';
import type { OperationPlan } from './types';

describe('OpenCode operations adapter', () => {
  let configRoot: string;
  let originalConfigDir: string | undefined;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    installRecommendedSkillMock.mockReset();
    installRecommendedSkillMock.mockReturnValue({ status: 'installed' });
    installCustomSkillsMock.mockReset();
    checkCustomSkillsNeedUpdateMock.mockReset();
    checkCustomSkillsNeedUpdateMock.mockReturnValue({
      needsUpdate: false,
      skillsNeedingUpdate: [],
      removedSkills: [],
    });
    originalConfigDir = process.env.OPENCODE_CONFIG_DIR;
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    const root = mkdtempSync(join(tmpdir(), 'thoth-opencode-ops-'));
    process.env.XDG_CONFIG_HOME = root;
    configRoot = join(root, 'opencode');
    mkdirSync(configRoot, { recursive: true });
    process.env.OPENCODE_CONFIG_DIR = configRoot;
    installCustomSkillsMock.mockImplementation(() => {
      for (const skill of CUSTOM_SKILLS) {
        const path = join(configRoot, 'skills', skill.name, 'SKILL.md');
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, `---\nname: ${skill.name}\n---\n`);
      }
      return {
        success: true,
        updatedSkills: CUSTOM_SKILLS.map((skill) => ({
          skill,
          reasons: ['missing'],
        })),
        skippedSkills: [],
        failedSkills: [],
        removedSkills: [],
      };
    });
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
  });

  function mainConfigPath(): string {
    return join(configRoot, 'opencode.json');
  }

  function liteConfigPath(): string {
    return join(configRoot, 'thoth-agents.json');
  }

  function skillPath(skillName: string): string {
    return join(configRoot, 'home', '.agents', 'skills', skillName, 'SKILL.md');
  }

  function writeSkill(skillName: string): void {
    const path = skillPath(skillName);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `---\nname: ${skillName}\n---\n`);
  }

  function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  function sevenAgentRoster(): Record<string, { model: string }> {
    return {
      orchestrator: { model: 'openai/gpt-5.4' },
      explorer: { model: 'openai/gpt-5.4-mini' },
      librarian: { model: 'openai/gpt-5.4-mini' },
      oracle: { model: 'openai/gpt-5.4' },
      designer: { model: 'openai/gpt-5.4-mini' },
      quick: { model: 'openai/gpt-5.4-mini' },
      deep: { model: 'openai/gpt-5.4' },
    };
  }

  function writeManagedConfig(
    liteConfig: unknown = {
      preset: 'openai',
      presets: { openai: sevenAgentRoster() },
    },
  ): void {
    writeJson(mainConfigPath(), { plugin: ['thoth-agents@latest'] });
    writeJson(liteConfigPath(), liteConfig);
  }

  function writeBundledSkills(): void {
    for (const skill of CUSTOM_SKILLS) {
      const path = join(configRoot, 'skills', skill.name, 'SKILL.md');
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, `---\nname: ${skill.name}\n---\n`);
    }
  }

  function modelPlan() {
    return buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [{ role: 'deep', model: 'openai/gpt-5.4' }],
      },
      { cwd: configRoot },
    );
  }

  test('OpenCode status classifies missing, installed, drift, and unknown config states', () => {
    expect(getOpenCodeStatus({ cwd: configRoot }).state).toBe('missing');

    writeJson(mainConfigPath(), { plugin: ['thoth-agents@latest'] });
    writeJson(liteConfigPath(), {
      preset: 'openai',
      presets: {
        openai: {
          orchestrator: { model: 'openai/gpt-5.4' },
          explorer: { model: 'openai/gpt-5.4-mini' },
          librarian: { model: 'openai/gpt-5.4-mini' },
          oracle: { model: 'openai/gpt-5.4' },
          designer: { model: 'openai/gpt-5.4-mini' },
          quick: { model: 'openai/gpt-5.4-mini' },
          deep: { model: 'openai/gpt-5.4' },
        },
      },
    });
    const installed = getOpenCodeStatus({ cwd: configRoot });
    expect(installed.state).toBe('installed');
    expect(
      installed.targets.some((target) =>
        target.observed?.includes('thoth-agents@latest'),
      ),
    ).toBe(true);

    writeJson(mainConfigPath(), { plugin: ['thoth-agents@0.1.0'] });
    expect(getOpenCodeStatus({ cwd: configRoot }).state).toBe('drift');

    writeFileSync(mainConfigPath(), '{ invalid json');
    const unknown = getOpenCodeStatus({ cwd: configRoot });
    expect(unknown.state).toBe('unknown');
    expect(unknown.diagnostics[0]?.severity).toBe('critical');
  });

  test('OpenCode status includes installed recommended skill targets when skill files exist', () => {
    writeJson(mainConfigPath(), { plugin: ['thoth-agents@latest'] });
    writeJson(liteConfigPath(), {
      preset: 'openai',
      presets: {
        openai: {
          orchestrator: { model: 'openai/gpt-5.4' },
          explorer: { model: 'openai/gpt-5.4-mini' },
          librarian: { model: 'openai/gpt-5.4-mini' },
          oracle: { model: 'openai/gpt-5.4' },
          designer: { model: 'openai/gpt-5.4-mini' },
          quick: { model: 'openai/gpt-5.4-mini' },
          deep: { model: 'openai/gpt-5.4' },
        },
      },
    });
    writeSkill('simplify');
    writeSkill('playwright-cli');

    const installed = getOpenCodeStatus({
      cwd: configRoot,
      env: { HOME: join(configRoot, 'home') },
    });

    expect(installed.state).toBe('installed');
    expect(installed.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'skill',
          label: 'Simplify',
          state: 'installed',
          observed: 'recommended global skill installed',
        }),
        expect.objectContaining({
          kind: 'skill',
          label: 'Playwright-CLI',
          state: 'installed',
          observed: 'recommended global skill installed',
        }),
      ]),
    );
  });

  test('OpenCode status includes missing recommended skill targets without failing installed config', () => {
    writeJson(mainConfigPath(), { plugin: ['thoth-agents@latest'] });
    writeJson(liteConfigPath(), {
      preset: 'openai',
      presets: {
        openai: {
          orchestrator: { model: 'openai/gpt-5.4' },
          explorer: { model: 'openai/gpt-5.4-mini' },
          librarian: { model: 'openai/gpt-5.4-mini' },
          oracle: { model: 'openai/gpt-5.4' },
          designer: { model: 'openai/gpt-5.4-mini' },
          quick: { model: 'openai/gpt-5.4-mini' },
          deep: { model: 'openai/gpt-5.4' },
        },
      },
    });
    writeSkill('simplify');

    const installed = getOpenCodeStatus({
      cwd: configRoot,
      env: { HOME: join(configRoot, 'home') },
    });

    expect(installed.state).toBe('installed');
    expect(installed.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'skill',
          label: 'Simplify',
          state: 'installed',
        }),
        expect.objectContaining({
          kind: 'skill',
          label: 'Playwright-CLI',
          state: 'missing',
          observed: 'recommended global skill missing',
        }),
      ]),
    );
    expect(installed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'minor',
          code: 'opencode-recommended-skills-missing',
        }),
      ]),
    );
  });

  test('OpenCode status identifies a parseable legacy agents roster with actionable observations', () => {
    writeManagedConfig({ preset: 'agents', agents: sevenAgentRoster() });
    writeBundledSkills();

    const status = getOpenCodeStatus({ cwd: configRoot });
    const plan = modelPlan();
    const rosterTarget = status.targets.find(
      (target) => target.label === 'thoth-agents config',
    );

    expect(status.state).toBe('drift');
    expect(status.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'important',
          code: 'opencode-roster-drift',
        }),
      ]),
    );
    expect(status.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-active-preset-selected' }),
      ]),
    );
    expect(plan.canApply).toBe(false);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-roster-drift' }),
      ]),
    );
    expect(rosterTarget).toEqual(
      expect.objectContaining({
        state: 'drift',
        observed: expect.stringContaining('preset: agents'),
      }),
    );
    for (const role of Object.keys(sevenAgentRoster())) {
      expect(rosterTarget?.observed).toContain(role);
    }
  });

  test('OpenCode status distinguishes required bundled skills from optional recommended skills', () => {
    writeManagedConfig();
    writeSkill('simplify');

    const status = getOpenCodeStatus({
      cwd: configRoot,
      env: { HOME: join(configRoot, 'home') },
    });

    expect(status.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'important',
          code: 'opencode-bundled-skills-missing',
        }),
        expect.objectContaining({
          severity: 'minor',
          code: 'opencode-recommended-skills-missing',
        }),
      ]),
    );
    expect(status.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'skill',
          state: 'missing',
          expected: 'bundled thoth-agents OpenCode skill',
        }),
        expect.objectContaining({
          kind: 'skill',
          label: 'Playwright-CLI',
          state: 'missing',
          expected: 'recommended global OpenCode skill',
        }),
      ]),
    );
  });

  test('OpenCode update and sync plans are dry-run previews that do not write files', () => {
    const updatePlan = buildOpenCodeUpdatePlan({ cwd: configRoot });
    const syncPlan = buildOpenCodeSyncPlan({ cwd: configRoot });

    expect(updatePlan.harness).toBe('opencode');
    expect(updatePlan.action).toBe('update');
    expect(updatePlan.dryRun).toBe(true);
    expect(updatePlan.canApply).toBe(false);
    expect(updatePlan.items[0]?.preview).toContain('thoth-agents@latest');
    expect(syncPlan.action).toBe('sync');
    expect(
      syncPlan.items.some((item) => item.preview?.includes('"orchestrator"')),
    ).toBe(true);
    expect(existsSync(mainConfigPath())).toBe(false);
    expect(existsSync(liteConfigPath())).toBe(false);
  });

  test.each([
    [
      'update',
      () => buildOpenCodeUpdatePlan({ cwd: configRoot }),
      () => [`${mainConfigPath()}.bak`],
    ],
    ['model-config', () => modelPlan(), () => [`${liteConfigPath()}.bak`]],
    [
      'sync',
      () => buildOpenCodeSyncPlan({ cwd: configRoot }),
      () => [`${mainConfigPath()}.bak`, `${liteConfigPath()}.bak`],
    ],
    [
      'install',
      () => buildOpenCodeInstallPlan({ cwd: configRoot }),
      () => [`${mainConfigPath()}.bak`, `${liteConfigPath()}.bak`],
    ],
  ] as const)('OpenCode %s plan aggregates unique item backup destinations', (_action, buildPlan, expectedPaths) => {
    const backup = buildPlan().backup;
    const paths = backup.destinations?.map(({ path }) => path) ?? [];

    expect(backup.required).toBe(true);
    expect(backup.strategy).toBe('managed-backup-file');
    expect(paths).toEqual(expectedPaths());
    expect(new Set(paths).size).toBe(paths.length);
  });

  test.each([
    ['sync', () => buildOpenCodeSyncPlan({ cwd: configRoot })],
    ['install', () => buildOpenCodeInstallPlan({ cwd: configRoot })],
  ] as const)('OpenCode %s plan discloses the authoritative bundled skill refresh only', (_action, buildPlan) => {
    const item = buildPlan().items.find(
      ({ title }) => title === 'Refresh bundled thoth-agents OpenCode skills',
    );

    expect(item).toBeDefined();
    expect(item?.target).toEqual(
      expect.objectContaining({
        kind: 'skill',
        label: 'Bundled thoth-agents OpenCode skills',
      }),
    );
    const preview = JSON.parse(item?.preview ?? 'null');
    expect(preview).toEqual({
      count: CUSTOM_SKILLS.length,
      names: CUSTOM_SKILLS.map(({ name }) => name),
    });
    expect(preview.names).not.toEqual(
      expect.arrayContaining(['simplify', 'playwright-cli']),
    );
  });

  test('OpenCode install plan previews no TUI, no tmux, skills yes semantics', () => {
    const plan = buildOpenCodeInstallPlan({ cwd: configRoot });

    expect(plan.harness).toBe('opencode');
    expect(plan.action).toBe('install');
    expect(plan.dryRun).toBe(true);
    expect(plan.canApply).toBe(true);
    expect(plan.summary).toContain('--no-tui');
    expect(plan.summary).toContain('--tmux=no');
    expect(plan.summary).toContain('--skills=yes');
    expect(plan.items.map((item) => item.preview).join('\n')).toContain(
      '"installSkills": true',
    );
    expect(plan.items.map((item) => item.preview).join('\n')).toContain(
      '"hasTmux": false',
    );
    expect(existsSync(mainConfigPath())).toBe(false);
    expect(existsSync(liteConfigPath())).toBe(false);
  });

  test.each([
    'sync',
    'install',
  ] as const)('OpenCode %s preview allows known managed roster repair without writing', (action) => {
    writeManagedConfig({ preset: 'agents', agents: sevenAgentRoster() });
    writeBundledSkills();
    const beforeMain = readFileSync(mainConfigPath(), 'utf8');
    const beforeLite = readFileSync(liteConfigPath(), 'utf8');

    const plan =
      action === 'sync'
        ? buildOpenCodeSyncPlan({ cwd: configRoot })
        : buildOpenCodeInstallPlan({ cwd: configRoot });

    expect(plan.dryRun).toBe(true);
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(beforeMain);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe(beforeLite);
    expect(existsSync(`${liteConfigPath()}.bak`)).toBe(false);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-roster-drift' }),
      ]),
    );
    expect(plan.canApply).toBe(true);
  });

  test('OpenCode model preview is gated by bundled-skill health but not optional skills', () => {
    writeManagedConfig();

    const blocked = modelPlan();
    expect(blocked.canApply).toBe(false);
    expect(blocked.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-bundled-skills-missing' }),
      ]),
    );

    writeBundledSkills();
    const eligible = modelPlan();
    expect(eligible.canApply).toBe(true);
    expect(eligible.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'minor',
          code: 'opencode-recommended-skills-missing',
        }),
      ]),
    );
  });

  test.each([
    {
      name: 'missing selected preset entry',
      config: {
        preset: 'custom',
        presets: { openai: sevenAgentRoster() },
      },
    },
    {
      name: 'empty selected preset name',
      config: { preset: '', presets: { '': {} } },
    },
    {
      name: 'null selected preset entry',
      config: { preset: 'custom', presets: { custom: null } },
    },
    {
      name: 'array selected preset entry',
      config: { preset: 'custom', presets: { custom: [] } },
    },
    {
      name: 'incomplete managed openai preset entry',
      config: {
        preset: 'openai',
        presets: { openai: { deep: { model: 'openai/gpt-5.4' } } },
      },
    },
    {
      name: 'inherited __proto__ preset entry',
      config: { preset: '__proto__', presets: {} },
    },
  ])('OpenCode model preview blocks $name as generic roster drift', ({
    config,
  }) => {
    writeManagedConfig(config);
    writeBundledSkills();

    const plan = modelPlan();

    expect(plan.canApply).toBe(false);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-roster-drift' }),
      ]),
    );
    expect(plan.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-active-preset-selected' }),
      ]),
    );
  });

  test.each([
    'sync',
    'install',
  ] as const)('OpenCode %s preview keeps valid custom active-preset drift repairable', (action) => {
    writeManagedConfig({
      preset: 'custom',
      presets: {
        openai: sevenAgentRoster(),
        custom: { deep: { model: 'custom/deep' } },
      },
    });
    writeBundledSkills();

    const plan =
      action === 'sync'
        ? buildOpenCodeSyncPlan({ cwd: configRoot })
        : buildOpenCodeInstallPlan({ cwd: configRoot });

    expect(plan.canApply).toBe(true);
    expect(applyOpenCodePlan(plan).applied).toBe(true);
    expect(JSON.parse(readFileSync(liteConfigPath(), 'utf8')).preset).toBe(
      'openai',
    );
  });

  test('OpenCode rejects unmanaged existing config without writes', () => {
    writeJson(mainConfigPath(), { theme: 'user-owned' });
    const unmanagedBefore = readFileSync(mainConfigPath(), 'utf8');
    const unmanaged = buildOpenCodeInstallPlan({ cwd: configRoot });
    expect(unmanaged.canApply).toBe(false);
    expect(unmanaged.blockerTargets).toEqual([
      expect.objectContaining({ label: 'OpenCode config', state: 'missing' }),
    ]);
    expect(applyOpenCodePlan(unmanaged).applied).toBe(false);
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(unmanagedBefore);
  });

  test.each([
    'sync',
    'install',
  ] as const)('OpenCode %s rejects an existing unrecognized lite config when main config is absent', (action) => {
    writeJson(liteConfigPath(), {
      preset: 'custom',
      agents: { helper: { model: 'user/model' } },
    });
    const before = readFileSync(liteConfigPath(), 'utf8');

    const plan =
      action === 'sync'
        ? buildOpenCodeSyncPlan({ cwd: configRoot })
        : buildOpenCodeInstallPlan({ cwd: configRoot });
    const status = getOpenCodeStatus({ cwd: configRoot });

    expect(status.state).toBe('unknown');
    expect(status.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-roster-unrecognized' }),
      ]),
    );
    expect(plan.canApply).toBe(false);
    expect(plan.blockerTargets).toEqual([
      expect.objectContaining({
        label: 'thoth-agents config',
        state: 'unknown',
      }),
    ]);
    expect(applyOpenCodePlan(plan).applied).toBe(false);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe(before);
    expect(existsSync(mainConfigPath())).toBe(false);
  });

  test('OpenCode rejects malformed config without writes', () => {
    writeFileSync(mainConfigPath(), '{ malformed');
    const malformedBefore = readFileSync(mainConfigPath(), 'utf8');
    const malformed = buildOpenCodeSyncPlan({ cwd: configRoot });
    const malformedModel = modelPlan();
    expect(malformed.canApply).toBe(false);
    expect(malformedModel.canApply).toBe(false);
    expect(malformedModel.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-config-parse-error' }),
      ]),
    );
    expect(applyOpenCodePlan(malformed).applied).toBe(false);
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(malformedBefore);
  });

  test('OpenCode rejects a fabricated drift item without writes', () => {
    writeManagedConfig();
    writeBundledSkills();
    const fabricated = buildOpenCodeSyncPlan({ cwd: configRoot });
    fabricated.canApply = true;
    fabricated.items[0] = { ...fabricated.items[0], state: 'drift' };
    const managedBefore = readFileSync(mainConfigPath(), 'utf8');
    expect(applyOpenCodePlan(fabricated).applied).toBe(false);
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(managedBefore);
  });

  test.each([
    {
      name: 'plan identity',
      mutate(plan: OperationPlan) {
        plan.id = 'opencode-forged-repair';
      },
    },
    {
      name: 'extra drift item',
      mutate(plan: OperationPlan) {
        plan.items.push({
          title: 'Overwrite unrelated managed target',
          target: { kind: 'skill', label: 'forged target' },
          state: 'drift',
        });
      },
    },
    {
      name: 'target metadata',
      mutate(plan: OperationPlan) {
        const item = plan.items[0];
        if (!item) throw new Error('Expected sync item.');
        item.target = { ...item.target, path: join(configRoot, 'forged.json') };
      },
    },
  ])('OpenCode rejects forged $name during real repairable drift', ({
    mutate,
  }) => {
    writeManagedConfig({ preset: 'agents', agents: sevenAgentRoster() });
    writeBundledSkills();
    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });
    const beforeMain = readFileSync(mainConfigPath(), 'utf8');
    const beforeLite = readFileSync(liteConfigPath(), 'utf8');
    mutate(plan);

    expect(plan.canApply).toBe(true);
    expect(applyOpenCodePlan(plan).applied).toBe(false);
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(beforeMain);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe(beforeLite);
  });

  test('OpenCode rejects a structurally identical cloned plan as unissued without writes', () => {
    writeManagedConfig();
    writeBundledSkills();
    const issued = buildOpenCodeSyncPlan({ cwd: configRoot });
    const clone = structuredClone(issued);
    const beforeMain = readFileSync(mainConfigPath(), 'utf8');
    const beforeLite = readFileSync(liteConfigPath(), 'utf8');

    const result = applyOpenCodePlan(clone);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-unissued' }),
      ]),
    );
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(beforeMain);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe(beforeLite);
  });

  test('OpenCode rejects an own toJSON digest bypass combined with public plan mutation', () => {
    writeManagedConfig();
    writeBundledSkills();
    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });
    const issuedShape = structuredClone(plan);
    plan.action = 'update';
    Object.defineProperty(plan, 'toJSON', {
      configurable: true,
      value: () => issuedShape,
    });
    const beforeMain = readFileSync(mainConfigPath(), 'utf8');
    const beforeLite = readFileSync(liteConfigPath(), 'utf8');

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-noncanonical' }),
      ]),
    );
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(beforeMain);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe(beforeLite);
    expect(existsSync(`${mainConfigPath()}.bak`)).toBe(false);
    expect(existsSync(`${liteConfigPath()}.bak`)).toBe(false);
    expect(installCustomSkillsMock).not.toHaveBeenCalled();
  });

  test('OpenCode rejects an inherited prototype toJSON digest bypass without writes', () => {
    writeManagedConfig();
    writeBundledSkills();
    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });
    const issuedShape = structuredClone(plan);
    plan.summary = 'attacker-controlled summary';
    Object.setPrototypeOf(plan, {
      toJSON: () => issuedShape,
    });
    const beforeMain = readFileSync(mainConfigPath(), 'utf8');
    const beforeLite = readFileSync(liteConfigPath(), 'utf8');

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-noncanonical' }),
      ]),
    );
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(beforeMain);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe(beforeLite);
    expect(existsSync(`${mainConfigPath()}.bak`)).toBe(false);
    expect(existsSync(`${liteConfigPath()}.bak`)).toBe(false);
  });

  test('OpenCode rejects an Object.prototype toJSON hook without invoking it for the plan', () => {
    writeManagedConfig();
    writeBundledSkills();
    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });
    const issuedShape = structuredClone(plan);
    plan.action = 'update';
    let planHookCalls = 0;
    Object.defineProperty(Object.prototype, 'toJSON', {
      configurable: true,
      value(this: unknown) {
        if (this === plan) {
          planHookCalls += 1;
          return issuedShape;
        }
        return this;
      },
    });

    let result: ReturnType<typeof applyOpenCodePlan>;
    try {
      result = applyOpenCodePlan(plan);
    } finally {
      Reflect.deleteProperty(Object.prototype, 'toJSON');
    }

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-noncanonical' }),
      ]),
    );
    expect(planHookCalls).toBe(0);
    expect(existsSync(`${mainConfigPath()}.bak`)).toBe(false);
    expect(existsSync(`${liteConfigPath()}.bak`)).toBe(false);
  });

  test('OpenCode detects accessors without invoking them or writing', () => {
    writeManagedConfig();
    writeBundledSkills();
    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });
    const issuedSummary = plan.summary;
    let getterCalls = 0;
    Object.defineProperty(plan, 'summary', {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return issuedSummary;
      },
    });

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-noncanonical' }),
      ]),
    );
    expect(getterCalls).toBe(0);
    expect(existsSync(`${mainConfigPath()}.bak`)).toBe(false);
    expect(existsSync(`${liteConfigPath()}.bak`)).toBe(false);
  });

  test.each([
    [
      'non-plain nested object',
      (plan: OperationPlan) => {
        const item = plan.items[0];
        if (!item) throw new Error('Expected sync item.');
        Object.setPrototypeOf(item.target, { attackerOwned: true });
      },
    ],
    [
      'symbol key',
      (plan: OperationPlan) => {
        Object.defineProperty(plan, Symbol('attacker'), { value: true });
      },
    ],
    [
      'function value',
      (plan: OperationPlan) => {
        Object.defineProperty(plan, 'attackerCallback', {
          enumerable: true,
          value: () => 'ignored by JSON.stringify',
        });
      },
    ],
    [
      'cycle',
      (plan: OperationPlan) => {
        Object.defineProperty(plan, 'cycle', {
          enumerable: true,
          value: plan,
        });
      },
    ],
  ] as const)('OpenCode rejects issued plans containing a $s', (_name, mutate) => {
    writeManagedConfig();
    writeBundledSkills();
    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });
    mutate(plan);

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-noncanonical' }),
      ]),
    );
    expect(existsSync(`${mainConfigPath()}.bak`)).toBe(false);
    expect(existsSync(`${liteConfigPath()}.bak`)).toBe(false);
    expect(installCustomSkillsMock).not.toHaveBeenCalled();
  });

  test.each([
    [
      'model preview',
      (plan: OperationPlan) => {
        const item = plan.items[0];
        if (!item) throw new Error('Expected model item.');
        item.preview = JSON.stringify({ deep: { model: 'attacker/model' } });
      },
    ],
    [
      'target mutation',
      (plan: OperationPlan) => {
        const target = plan.targets[0];
        if (!target) throw new Error('Expected target.');
        target.observed = 'forged observation';
      },
    ],
    [
      'target addition',
      (plan: OperationPlan) => {
        plan.targets.push({ kind: 'unknown', label: 'forged' });
      },
    ],
    [
      'target removal',
      (plan: OperationPlan) => {
        plan.targets.pop();
      },
    ],
    [
      'item reorder',
      (plan: OperationPlan) => {
        plan.items.reverse();
      },
    ],
    [
      'action mutation',
      (plan: OperationPlan) => {
        plan.action = 'update';
      },
    ],
    [
      'id mutation',
      (plan: OperationPlan) => {
        plan.id = 'forged-id';
      },
    ],
  ] as const)('OpenCode rejects in-place issued-plan $s as mutated without writes', (_name, mutate) => {
    writeManagedConfig();
    writeBundledSkills();
    const plan =
      _name === 'model preview'
        ? modelPlan()
        : buildOpenCodeSyncPlan({ cwd: configRoot });
    const beforeMain = readFileSync(mainConfigPath(), 'utf8');
    const beforeLite = readFileSync(liteConfigPath(), 'utf8');
    mutate(plan);

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-mutated' }),
      ]),
    );
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(beforeMain);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe(beforeLite);
  });

  test('OpenCode rejects an issued plan when any live target or diagnostic changes', () => {
    writeManagedConfig();
    writeBundledSkills();
    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });
    const skill = CUSTOM_SKILLS[0];
    if (!skill) throw new Error('Expected bundled skill.');
    rmSync(join(configRoot, 'skills', skill.name), {
      recursive: true,
      force: true,
    });
    const beforeMain = readFileSync(mainConfigPath(), 'utf8');
    const beforeLite = readFileSync(liteConfigPath(), 'utf8');

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-live-state-changed' }),
        expect.objectContaining({ code: 'opencode-bundled-skills-missing' }),
      ]),
    );
    expect(result.diagnosticTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected: 'bundled thoth-agents OpenCode skill',
          state: 'missing',
        }),
      ]),
    );
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(beforeMain);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe(beforeLite);
  });

  test('OpenCode rejection reports a new live lite-config blocker from fresh status', () => {
    writeManagedConfig();
    writeBundledSkills();
    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });
    writeFileSync(liteConfigPath(), '{ malformed');
    const beforeMain = readFileSync(mainConfigPath(), 'utf8');

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-live-state-changed' }),
        expect.objectContaining({ code: 'thoth-config-parse-error' }),
      ]),
    );
    expect(result.diagnosticTargets).toEqual([
      expect.objectContaining({
        label: 'thoth-agents config',
        state: 'unknown',
      }),
    ]);
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(beforeMain);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe('{ malformed');
  });

  test('OpenCode applies an untouched issued model plan from its immutable private role payload', () => {
    writeManagedConfig();
    writeBundledSkills();
    const plan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [{ role: 'deep', model: 'trusted/model' }],
      },
      { cwd: configRoot },
    );

    expect(applyOpenCodePlan(plan).applied).toBe(true);
    expect(
      JSON.parse(readFileSync(liteConfigPath(), 'utf8')).agents.deep.model,
    ).toBe('trusted/model');
  });

  test('OpenCode leaves duplicate-role model previews unissued before writes', () => {
    const plan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          { role: 'deep', model: 'trusted/first' },
          { role: 'deep', model: 'trusted/second' },
        ],
      },
      { cwd: configRoot },
    );

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-unissued' }),
      ]),
    );
    expect(existsSync(mainConfigPath())).toBe(false);
    expect(existsSync(liteConfigPath())).toBe(false);
  });

  test('OpenCode leaves status-blocked valid-role model previews unissued before writes', () => {
    writeManagedConfig();
    const beforeMain = readFileSync(mainConfigPath(), 'utf8');
    const beforeLite = readFileSync(liteConfigPath(), 'utf8');
    const plan = modelPlan();

    expect(plan.canApply).toBe(false);
    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-unissued' }),
      ]),
    );
    expect(readFileSync(mainConfigPath(), 'utf8')).toBe(beforeMain);
    expect(readFileSync(liteConfigPath(), 'utf8')).toBe(beforeLite);
  });

  test.each([
    [
      'unsupported role',
      () =>
        buildOpenCodeModelPlan(
          {
            harness: 'opencode',
            dryRun: true,
            roles: [{ role: 'attacker', model: 'attacker/model' }],
          },
          { cwd: configRoot },
        ),
    ],
    [
      'empty role list',
      () =>
        buildOpenCodeModelPlan(
          { harness: 'opencode', dryRun: true, roles: [] },
          { cwd: configRoot },
        ),
    ],
    [
      'harness mismatch',
      () =>
        buildOpenCodeModelPlan(
          {
            harness: 'codex',
            dryRun: true,
            roles: [{ role: 'deep', model: 'trusted/model' }],
          },
          { cwd: configRoot },
        ),
    ],
    [
      'invalid effort',
      () =>
        buildOpenCodeModelPlan(
          {
            harness: 'opencode',
            dryRun: true,
            roles: [
              {
                role: 'deep',
                model: 'openai/gpt-5.6-sol',
                catalogId: 'openai/gpt-5.6-sol',
                availableEfforts: ['high'],
                effort: { kind: 'effort', value: 'max' },
              },
            ],
          },
          { cwd: configRoot },
        ),
    ],
  ] as const)('OpenCode invalid $s previews have no issuance provenance after canApply tampering', (_name, buildPlan) => {
    const plan = buildPlan();
    expect(plan.canApply).toBe(false);
    plan.canApply = true;

    const result = applyOpenCodePlan(plan);

    expect(result.applied).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-plan-unissued' }),
      ]),
    );
    expect(existsSync(mainConfigPath())).toBe(false);
    expect(existsSync(liteConfigPath())).toBe(false);
  });

  test('OpenCode blocker correspondence excludes optional skills and recommended targets', () => {
    writeManagedConfig();
    const plan = modelPlan();

    expect(plan.canApply).toBe(false);
    expect(plan.blockerTargets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected: 'recommended global OpenCode skill',
        }),
      ]),
    );
    expect(plan.blockerTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected: 'bundled thoth-agents OpenCode skill',
          state: 'missing',
        }),
      ]),
    );
  });

  test.each([
    ['opencode-config-parse-error', mainConfigPath, 'OpenCode config'],
    ['thoth-config-parse-error', liteConfigPath, 'thoth-agents config'],
  ] as const)('OpenCode %s selects only its affected config target as blocker', (_code, path, label) => {
    writeManagedConfig();
    writeBundledSkills();
    writeFileSync(path(), '{ malformed');

    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });

    expect(plan.blockerTargets).toEqual([
      expect.objectContaining({ label, state: 'unknown' }),
    ]);
  });

  test('OpenCode one-sided missing managed surfaces have explicit affected blockers', () => {
    writeBundledSkills();
    writeJson(mainConfigPath(), { plugin: ['thoth-agents@latest'] });
    const missingLite = modelPlan();
    expect(missingLite.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-lite-config-missing' }),
      ]),
    );
    expect(missingLite.blockerTargets).toEqual([
      expect.objectContaining({
        label: 'thoth-agents config',
        state: 'missing',
      }),
    ]);

    rmSync(mainConfigPath(), { force: true });
    writeJson(liteConfigPath(), {
      preset: 'openai',
      presets: { openai: sevenAgentRoster() },
    });
    const missingMain = modelPlan();
    expect(missingMain.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-main-config-missing' }),
      ]),
    );
    expect(missingMain.blockerTargets).toEqual([
      expect.objectContaining({ label: 'OpenCode config', state: 'missing' }),
    ]);
  });

  test('OpenCode bundled health classification failures select bundled targets only', () => {
    writeManagedConfig();
    writeBundledSkills();
    checkCustomSkillsNeedUpdateMock.mockImplementation(() => {
      throw new Error('classification exploded');
    });

    const plan = buildOpenCodeSyncPlan({ cwd: configRoot });

    expect(plan.blockerTargets).not.toHaveLength(0);
    expect(plan.blockerTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'skill',
          expected: 'bundled thoth-agents OpenCode skill',
        }),
      ]),
    );
    expect(plan.blockerTargets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expected: 'recommended global OpenCode skill',
        }),
      ]),
    );
  });

  test('OpenCode model preconfiguration is allowed only when both managed config targets are absent', () => {
    const plan = modelPlan();
    expect(plan.canApply).toBe(true);
    expect(plan.blockerTargets).toEqual([]);

    const applied = applyOpenCodePlan(plan);
    expect(applied.applied).toBe(true);
    expect(existsSync(mainConfigPath())).toBe(false);
    expect(
      JSON.parse(readFileSync(liteConfigPath(), 'utf8')).agents.deep.model,
    ).toBe('openai/gpt-5.4');
    expect(installCustomSkillsMock).not.toHaveBeenCalled();

    rmSync(liteConfigPath(), { force: true });
    writeJson(liteConfigPath(), { agents: { deep: { model: 'user/model' } } });
    expect(modelPlan().canApply).toBe(false);
  });

  test('OpenCode both-configs-absent preconfiguration still blocks critical diagnostics', () => {
    checkCustomSkillsNeedUpdateMock.mockImplementation(() => {
      throw new Error('classification exploded');
    });

    const plan = modelPlan();

    expect(plan.canApply).toBe(false);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'critical',
          code: 'opencode-bundled-skills-health-unknown',
        }),
      ]),
    );
  });

  test('OpenCode both-configs-absent preconfiguration ignores outdated bundled skills', () => {
    writeBundledSkills();
    const staleSkill = CUSTOM_SKILLS[0];
    if (!staleSkill) throw new Error('Expected at least one bundled skill.');
    checkCustomSkillsNeedUpdateMock.mockReturnValue({
      needsUpdate: true,
      skillsNeedingUpdate: [
        {
          skill: staleSkill,
          reasons: ['hash-mismatch'],
          targetPath: join(configRoot, 'skills', staleSkill.name),
        },
      ],
      removedSkills: [],
    });

    const plan = modelPlan();

    expect(plan.canApply).toBe(true);
    expect(plan.blockerTargets).toEqual([]);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'important',
          code: 'opencode-bundled-skills-outdated',
        }),
      ]),
    );
  });

  test('OpenCode model plan maps seven role overrides into plugin config shape', () => {
    const plan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          { role: 'orchestrator', provider: 'openai', model: 'gpt-5.4' },
          { role: 'oracle', model: 'anthropic/claude-opus-4.6' },
          { role: 'librarian', model: 'openai/gpt-5.4-mini' },
          { role: 'explorer', model: 'openai/gpt-5.4-mini' },
          { role: 'designer', model: 'openai/gpt-5.4-mini' },
          { role: 'quick', model: 'openai/gpt-5.4-mini' },
          { role: 'deep', model: 'openai/gpt-5.4' },
        ],
      },
      { cwd: configRoot },
    );

    expect(plan.action).toBe('model-config');
    expect(plan.canApply).toBe(true);
    expect(plan.items).toHaveLength(7);
    expect(plan.items[0]?.preview).toContain('"orchestrator"');
    expect(plan.items[0]?.preview).toContain('"openai/gpt-5.4"');
    expect(existsSync(liteConfigPath())).toBe(false);
  });

  test('OpenCode model apply preserves preset ownership and changes only requested root overrides', () => {
    const presets = {
      openai: sevenAgentRoster(),
      custom: {
        deep: { model: 'custom/deep', variant: 'custom-variant' },
      },
    };
    const agents = {
      explorer: {
        model: 'user/explorer',
        variant: 'user-variant',
        temperature: 0.2,
      },
      quick: { model: 'user/quick', prompt: 'keep me' },
    };
    writeManagedConfig({
      preset: 'custom',
      presets,
      agents,
      userOwned: { keep: true },
    });
    writeBundledSkills();
    const before = JSON.parse(readFileSync(liteConfigPath(), 'utf8'));
    const plan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            model: 'openai/gpt-5.6-sol',
            effort: { kind: 'inherit' },
          },
        ],
      },
      { cwd: configRoot },
    );

    expect(plan.canApply).toBe(true);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'important',
          code: 'opencode-active-preset-selected',
        }),
      ]),
    );
    expect(plan.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-roster-drift' }),
      ]),
    );
    const applied = applyOpenCodePlan(plan);
    const after = JSON.parse(readFileSync(liteConfigPath(), 'utf8'));

    expect(applied.applied).toBe(true);
    expect(after.preset).toBe(before.preset);
    expect(after.presets).toEqual(before.presets);
    expect(after.presets).not.toHaveProperty('agents');
    expect(after.agents).toEqual({
      ...before.agents,
      deep: { model: 'openai/gpt-5.6-sol' },
    });
    expect(after.userOwned).toEqual(before.userOwned);
  });

  test('OpenCode effort sidecar clears only matching managed variants', () => {
    writeManagedConfig();
    writeBundledSkills();
    const explicit = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            model: 'openai/gpt-5.6-sol',
            catalogId: 'openai/gpt-5.6-sol',
            availableEfforts: ['high', 'max'],
            effort: { kind: 'effort', value: 'high' },
          },
        ],
      },
      { cwd: configRoot },
    );
    expect(applyOpenCodePlan(explicit).applied).toBe(true);
    const statePath = getOpenCodeManagedModelStatePath();
    expect(
      JSON.parse(readFileSync(statePath, 'utf8')).configuredEfforts.deep,
    ).toBe('high');
    const config = JSON.parse(readFileSync(liteConfigPath(), 'utf8'));
    expect(config.agents.deep.variant).toBe('high');

    config.agents.deep.variant = 'low';
    writeJson(liteConfigPath(), config);
    const inherit = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            model: 'openai/gpt-5.6-sol',
            effort: { kind: 'inherit' },
          },
        ],
      },
      { cwd: configRoot },
    );
    const preserved = applyOpenCodePlan(inherit);
    expect(preserved.applied).toBe(true);
    expect(
      JSON.parse(readFileSync(liteConfigPath(), 'utf8')).agents.deep.variant,
    ).toBe('low');
    expect(
      preserved.warnings.some(
        (warning) => warning.code === 'opencode-effort-user-owned',
      ),
    ).toBe(true);
  });

  test('OpenCode preserves an untracked user variant unless explicitly replaced', () => {
    writeManagedConfig();
    writeBundledSkills();
    const modelOnly = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            model: 'openai/gpt-5.6-sol',
            effort: { kind: 'inherit' },
          },
        ],
      },
      { cwd: configRoot },
    );
    expect(applyOpenCodePlan(modelOnly).applied).toBe(true);
    const config = JSON.parse(readFileSync(liteConfigPath(), 'utf8'));
    config.agents.deep.variant = 'low';
    writeJson(liteConfigPath(), config);

    const preserved = applyOpenCodePlan(
      buildOpenCodeModelPlan(
        {
          harness: 'opencode',
          dryRun: true,
          roles: [
            {
              role: 'deep',
              model: 'openai/gpt-5.6-sol',
              effort: { kind: 'inherit' },
            },
          ],
        },
        { cwd: configRoot },
      ),
    );
    expect(preserved.applied).toBe(true);
    expect(
      JSON.parse(readFileSync(liteConfigPath(), 'utf8')).agents.deep.variant,
    ).toBe('low');
    expect(
      preserved.warnings.some(
        (warning) => warning.code === 'opencode-effort-user-owned',
      ),
    ).toBe(true);

    const explicit = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            model: 'openai/gpt-5.6-sol',
            catalogId: 'openai/gpt-5.6-sol',
            availableEfforts: ['high'],
            effort: { kind: 'effort', value: 'high' },
          },
        ],
      },
      { cwd: configRoot },
    );
    expect(applyOpenCodePlan(explicit).applied).toBe(true);
    expect(
      JSON.parse(readFileSync(liteConfigPath(), 'utf8')).agents.deep.variant,
    ).toBe('high');
  });

  test('OpenCode manual model-only configuration round-trips without excluded controls', () => {
    writeManagedConfig();
    writeBundledSkills();
    const plan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          {
            role: 'deep',
            model: 'manual-provider/manual-model',
            effort: { kind: 'inherit' },
          },
        ],
      },
      { cwd: configRoot },
    );

    expect(applyOpenCodePlan(plan).applied).toBe(true);
    expect(
      applyOpenCodePlan(
        buildOpenCodeModelPlan(
          {
            harness: 'opencode',
            dryRun: true,
            roles: [
              {
                role: 'deep',
                model: 'manual-provider/manual-model',
                effort: { kind: 'inherit' },
              },
            ],
          },
          { cwd: configRoot },
        ),
      ).applied,
    ).toBe(true);
    const output = readFileSync(liteConfigPath(), 'utf8');
    const config = JSON.parse(output);
    expect(config.agents.deep.model).toBe('manual-provider/manual-model');
    expect(config.agents.deep.variant).toBeUndefined();
    expect(output).not.toContain('toggle');
    expect(output).not.toContain('budget_tokens');
  });

  test('OpenCode apply writes only explicit applyable OpenCode plans and rejects unsafe plans', () => {
    writeBundledSkills();
    const unsafePlan: OperationPlan = {
      ...buildOpenCodeUpdatePlan({ cwd: configRoot }),
      canApply: false,
    };

    expect(applyOpenCodePlan(unsafePlan).applied).toBe(false);
    expect(existsSync(mainConfigPath())).toBe(false);

    const applied = applyOpenCodePlan(
      buildOpenCodeUpdatePlan({ cwd: configRoot }),
    );
    expect(applied.applied).toBe(true);
    expect(readFileSync(mainConfigPath(), 'utf-8')).toContain(
      'thoth-agents@latest',
    );
    expect(
      applyOpenCodePlan({
        ...buildOpenCodeUpdatePlan({ cwd: configRoot }),
        harness: 'codex',
      }).applied,
    ).toBe(false);

    expect(
      applyOpenCodePlan({
        ...buildOpenCodeInstallPlan({ cwd: configRoot }),
        canApply: false,
      }).applied,
    ).toBe(false);

    const malformedModelPlan = buildOpenCodeModelPlan(
      {
        harness: 'opencode',
        dryRun: true,
        roles: [
          { role: 'orchestrator', model: 'openai/gpt-5.4' },
          { role: 'oracle', model: 'openai/gpt-5.4' },
          { role: 'librarian', model: 'openai/gpt-5.4-mini' },
          { role: 'explorer', model: 'openai/gpt-5.4-mini' },
          { role: 'designer', model: 'openai/gpt-5.4-mini' },
          { role: 'quick', model: 'openai/gpt-5.4-mini' },
          { role: 'deep', model: 'openai/gpt-5.4' },
        ],
      },
      { cwd: configRoot },
    );
    malformedModelPlan.items[0] = {
      ...malformedModelPlan.items[0],
      preview: '{ invalid json',
    };
    expect(applyOpenCodePlan(malformedModelPlan).applied).toBe(false);

    writeJson(mainConfigPath(), { plugin: ['thoth-agents@0.1.0'] });
    const driftPlan = buildOpenCodeSyncPlan({ cwd: configRoot });
    expect(driftPlan.canApply).toBe(true);
    expect(applyOpenCodePlan(driftPlan).applied).toBe(true);
  });

  test('OpenCode apply installs plugin and skills-enabled lite config from install plan', () => {
    const applied = applyOpenCodePlan(
      buildOpenCodeInstallPlan({ cwd: configRoot }),
    );

    expect(applied.applied).toBe(true);
    expect(readFileSync(mainConfigPath(), 'utf-8')).toContain(
      'thoth-agents@latest',
    );
    const liteConfig = readFileSync(liteConfigPath(), 'utf-8');
    expect(liteConfig).not.toContain('"enabled": true');
    expect(applied.summary).toContain('install');
  });

  test.each([
    'sync',
    'install',
  ] as const)('OpenCode %s repairs managed roster and bundled skills while preserving user config', (action) => {
    writeJson(mainConfigPath(), {
      plugin: ['user-plugin', 'thoth-agents@latest'],
      theme: 'user-owned',
      agent: {
        explore: { model: 'user/explorer', temperature: 0.2 },
        general: { model: 'user/general', prompt: 'keep me' },
      },
    });
    writeJson(liteConfigPath(), {
      preset: 'agents',
      agents: sevenAgentRoster(),
    });

    const originalMain = readFileSync(mainConfigPath(), 'utf8');
    const plan =
      action === 'sync'
        ? buildOpenCodeSyncPlan({ cwd: configRoot })
        : buildOpenCodeInstallPlan({ cwd: configRoot });
    const applied = applyOpenCodePlan(plan);

    expect(applied.applied).toBe(true);
    expect(readFileSync(`${mainConfigPath()}.bak`, 'utf8')).toBe(originalMain);
    expect(existsSync(`${liteConfigPath()}.bak`)).toBe(true);
    expect(applied.backups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: `${liteConfigPath()}.bak` }),
      ]),
    );
    const main = JSON.parse(readFileSync(mainConfigPath(), 'utf8'));
    expect(main.theme).toBe('user-owned');
    expect(main.plugin).toEqual(
      expect.arrayContaining(['user-plugin', 'thoth-agents@latest']),
    );
    expect(main.agent).toEqual({
      explore: {
        model: 'user/explorer',
        temperature: 0.2,
        disable: true,
      },
      general: {
        model: 'user/general',
        prompt: 'keep me',
        disable: true,
      },
    });
    const lite = JSON.parse(readFileSync(liteConfigPath(), 'utf8'));
    expect(lite.preset).toBe('openai');
    expect(Object.keys(lite.presets.openai).sort()).toEqual(
      Object.keys(sevenAgentRoster()).sort(),
    );
    for (const skill of CUSTOM_SKILLS) {
      expect(
        existsSync(join(configRoot, 'skills', skill.name, 'SKILL.md')),
      ).toBe(true);
    }
    expect(applied.changedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'skill',
          state: 'installed',
        }),
      ]),
    );
    expect(getOpenCodeStatus({ cwd: configRoot }).state).toBe('installed');
    expect(modelPlan().canApply).toBe(true);
  });

  test('OpenCode sync reports a bundled-skill partial failure and remains unhealthy', () => {
    writeManagedConfig();
    const failedSkill = CUSTOM_SKILLS[0];
    if (!failedSkill) throw new Error('Expected at least one bundled skill.');
    installCustomSkillsMock.mockReturnValueOnce({
      success: false,
      updatedSkills: [],
      skippedSkills: [],
      failedSkills: [{ skill: failedSkill, reasons: ['missing'] }],
      removedSkills: [],
    });

    const applied = applyOpenCodePlan(
      buildOpenCodeSyncPlan({ cwd: configRoot }),
    );

    expect(applied.applied).toBe(false);
    expect(applied.summary).toContain(failedSkill.name);
    expect(applied.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-bundled-skills-failed' }),
      ]),
    );
    expect(getOpenCodeStatus({ cwd: configRoot }).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-bundled-skills-missing' }),
      ]),
    );
    expect(modelPlan().canApply).toBe(false);
  });

  test('OpenCode stale bundled skill update failure remains unhealthy and blocks model config', () => {
    writeManagedConfig();
    writeBundledSkills();
    const staleSkill = CUSTOM_SKILLS[0];
    if (!staleSkill) throw new Error('Expected at least one bundled skill.');
    checkCustomSkillsNeedUpdateMock.mockReturnValue({
      needsUpdate: true,
      skillsNeedingUpdate: [
        {
          skill: staleSkill,
          reasons: ['hash-mismatch'],
          targetPath: join(configRoot, 'skills', staleSkill.name),
        },
      ],
      removedSkills: [],
    });
    installCustomSkillsMock.mockReturnValueOnce({
      success: false,
      updatedSkills: [],
      skippedSkills: [],
      failedSkills: [{ skill: staleSkill, reasons: ['hash-mismatch'] }],
      removedSkills: [],
    });

    const before = readFileSync(
      join(configRoot, 'skills', staleSkill.name, 'SKILL.md'),
      'utf8',
    );
    const applied = applyOpenCodePlan(
      buildOpenCodeSyncPlan({ cwd: configRoot }),
    );

    expect(applied.applied).toBe(false);
    expect(applied.summary).toContain(staleSkill.name);
    expect(
      readFileSync(
        join(configRoot, 'skills', staleSkill.name, 'SKILL.md'),
        'utf8',
      ),
    ).toBe(before);
    expect(getOpenCodeStatus({ cwd: configRoot }).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-bundled-skills-outdated' }),
      ]),
    );
    expect(modelPlan().canApply).toBe(false);
  });

  test('OpenCode install apply treats already-installed recommended skills as success', () => {
    installRecommendedSkillMock
      .mockReturnValueOnce({ status: 'already-installed' })
      .mockReturnValueOnce({ status: 'already-installed' });

    const applied = applyOpenCodePlan(
      buildOpenCodeInstallPlan({ cwd: configRoot }),
    );

    expect(applied.applied).toBe(true);
    expect(installRecommendedSkillMock).toHaveBeenCalledTimes(2);
    expect(applied.changedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'skill',
          state: 'installed',
        }),
      ]),
    );
  });

  test('OpenCode install treats recommended skill failure as non-blocking warning', () => {
    installRecommendedSkillMock
      .mockReturnValueOnce({ status: 'already-installed' })
      .mockReturnValueOnce({ status: 'failed' });

    const applied = applyOpenCodePlan(
      buildOpenCodeInstallPlan({ cwd: configRoot }),
    );

    expect(applied.applied).toBe(true);
    expect(installCustomSkillsMock).toHaveBeenCalledTimes(1);
    expect(applied.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'opencode-recommended-skill-failed',
          severity: 'important',
        }),
      ]),
    );
  });

  test('OpenCode install isolates a thrown recommended skill failure after bundled repair', () => {
    installRecommendedSkillMock
      .mockImplementationOnce(() => {
        throw new Error('network exploded');
      })
      .mockReturnValueOnce({ status: 'installed' });

    const applied = applyOpenCodePlan(
      buildOpenCodeInstallPlan({ cwd: configRoot }),
    );

    expect(applied.applied).toBe(true);
    expect(installCustomSkillsMock).toHaveBeenCalledTimes(1);
    expect(installCustomSkillsMock.mock.invocationCallOrder[0]).toBeLessThan(
      installRecommendedSkillMock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(applied.changedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'skill',
          label: 'Bundled thoth-agents OpenCode skills',
          state: 'installed',
        }),
      ]),
    );
    expect(applied.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'opencode-recommended-skill-failed',
          message: expect.stringMatching(/simplify|network exploded/),
        }),
      ]),
    );
  });

  test.each([
    'sync',
    'install',
  ] as const)('OpenCode %s isolates a thrown bundled skill repair as a critical partial result', (action) => {
    writeManagedConfig();
    installCustomSkillsMock.mockImplementationOnce(() => {
      throw new Error('bundle copy exploded');
    });

    const applied = applyOpenCodePlan(
      action === 'sync'
        ? buildOpenCodeSyncPlan({ cwd: configRoot })
        : buildOpenCodeInstallPlan({ cwd: configRoot }),
    );

    expect(applied.applied).toBe(false);
    expect(applied.summary).toContain('bundle copy exploded');
    expect(applied.changedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'OpenCode config' }),
        expect.objectContaining({ label: 'thoth-agents config' }),
      ]),
    );
    expect(applied.backups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: `${liteConfigPath()}.bak` }),
      ]),
    );
    expect(applied.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'critical',
          code: 'opencode-bundled-skills-failed',
        }),
      ]),
    );
    expect(getOpenCodeStatus({ cwd: configRoot }).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'opencode-bundled-skills-missing' }),
      ]),
    );
    expect(modelPlan().canApply).toBe(false);
  });
});
