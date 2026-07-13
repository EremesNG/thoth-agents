import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getOpenCodeManagedModelStatePath } from '../paths';

const installRecommendedSkillMock = vi.hoisted(() =>
  vi.fn(() => ({ status: 'installed' as const })),
);

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
    installCustomSkills: vi.fn(() => ({
      success: true,
      updatedSkills: [],
      skippedSkills: [],
      failedSkills: [],
      removedSkills: [],
    })),
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
import type { OperationPlan } from './types';

describe('OpenCode operations adapter', () => {
  let configRoot: string;
  let originalConfigDir: string | undefined;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    installRecommendedSkillMock.mockReset();
    installRecommendedSkillMock.mockReturnValue({ status: 'installed' });
    originalConfigDir = process.env.OPENCODE_CONFIG_DIR;
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    const root = mkdtempSync(join(tmpdir(), 'thoth-opencode-ops-'));
    process.env.XDG_CONFIG_HOME = root;
    configRoot = join(root, 'opencode');
    mkdirSync(configRoot, { recursive: true });
    process.env.OPENCODE_CONFIG_DIR = configRoot;
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

  test('OpenCode update and sync plans are dry-run previews that do not write files', () => {
    const updatePlan = buildOpenCodeUpdatePlan({ cwd: configRoot });
    const syncPlan = buildOpenCodeSyncPlan({ cwd: configRoot });

    expect(updatePlan.harness).toBe('opencode');
    expect(updatePlan.action).toBe('update');
    expect(updatePlan.dryRun).toBe(true);
    expect(updatePlan.canApply).toBe(true);
    expect(updatePlan.items[0]?.preview).toContain('thoth-agents@latest');
    expect(syncPlan.action).toBe('sync');
    expect(
      syncPlan.items.some((item) => item.preview?.includes('"orchestrator"')),
    ).toBe(true);
    expect(existsSync(mainConfigPath())).toBe(false);
    expect(existsSync(liteConfigPath())).toBe(false);
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

  test('OpenCode effort sidecar clears only matching managed variants', () => {
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

    const preserved = applyOpenCodePlan(modelOnly);
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
    expect(applyOpenCodePlan(plan).applied).toBe(true);
    const output = readFileSync(liteConfigPath(), 'utf8');
    const config = JSON.parse(output);
    expect(config.agents.deep.model).toBe('manual-provider/manual-model');
    expect(config.agents.deep.variant).toBeUndefined();
    expect(output).not.toContain('toggle');
    expect(output).not.toContain('budget_tokens');
  });

  test('OpenCode apply writes only explicit applyable OpenCode plans and rejects unsafe plans', () => {
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
    expect(driftPlan.canApply).toBe(false);
    expect(applyOpenCodePlan(driftPlan).applied).toBe(false);
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

  test('OpenCode install apply fails on real recommended skill install failure', () => {
    installRecommendedSkillMock
      .mockReturnValueOnce({ status: 'already-installed' })
      .mockReturnValueOnce({ status: 'failed' });

    const applied = applyOpenCodePlan(
      buildOpenCodeInstallPlan({ cwd: configRoot }),
    );

    expect(applied.applied).toBe(false);
    expect(applied.summary).toContain(
      'Failed to install recommended OpenCode skill: playwright-cli.',
    );
  });
});
