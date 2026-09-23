import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  HarnessId,
  ProviderCapabilityEvidence,
  ProviderEvidenceInput,
} from '../../harness/types';
import { loadModelsDevCatalog } from '../model-catalog';
import type {
  HarnessStatusReport,
  OperationApplyResult,
  OperationPlan,
} from '../operations';

const parseConfigMock = vi.hoisted(() => vi.fn());
const operationDispatchSpies = vi.hoisted(() => ({
  opencodeUpdate: vi.fn(),
  codexUpdate: vi.fn(),
  claudeUpdate: vi.fn(),
  piInstall: vi.fn(),
  piUpdate: vi.fn(),
  opencodeApply: vi.fn(),
  codexApply: vi.fn(),
  claudeApply: vi.fn(),
  piApply: vi.fn(),
}));

vi.mock('../operations/opencode', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../operations/opencode')>();
  return {
    ...original,
    buildOpenCodeUpdatePlan: () => {
      operationDispatchSpies.opencodeUpdate();
      return completeDispatchPlan('opencode');
    },
    applyOpenCodePlan: (
      plan: Parameters<typeof original.applyOpenCodePlan>[0],
    ) => {
      operationDispatchSpies.opencodeApply(plan);
      if (plan.id === 'tui-dispatch-test') {
        return dispatchApplyResult('opencode', 'OpenCode');
      }
      return original.applyOpenCodePlan(plan);
    },
  };
});

vi.mock('../operations/codex', async (importOriginal) => {
  const original = await importOriginal<typeof import('../operations/codex')>();
  return {
    ...original,
    buildCodexUpdatePlan: () => {
      operationDispatchSpies.codexUpdate();
      return completeDispatchPlan('codex');
    },
    applyCodexPlan: (plan: Parameters<typeof original.applyCodexPlan>[0]) => {
      operationDispatchSpies.codexApply(plan);
      if (plan.id === 'tui-dispatch-test') {
        return dispatchApplyResult('codex', 'Codex');
      }
      return original.applyCodexPlan(plan);
    },
  };
});

vi.mock('../operations/claude-code', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../operations/claude-code')>();
  return {
    ...original,
    buildClaudeCodeUpdatePlan: () => {
      operationDispatchSpies.claudeUpdate();
      return completeDispatchPlan('claude');
    },
    applyClaudeCodePlan: (
      plan: Parameters<typeof original.applyClaudeCodePlan>[0],
    ) => {
      operationDispatchSpies.claudeApply(plan);
      if (plan.id === 'tui-dispatch-test') {
        return dispatchApplyResult('claude', 'Claude');
      }
      return original.applyClaudeCodePlan(plan);
    },
  };
});

vi.mock('../operations/pi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../operations/pi')>();
  return {
    ...original,
    buildPiInstallPlan: () => {
      operationDispatchSpies.piInstall();
      return completeDispatchPlan('pi', 'install');
    },
    buildPiUpdatePlan: () => {
      operationDispatchSpies.piUpdate();
      return completeDispatchPlan('pi');
    },
    applyPiPlan: (plan: Parameters<typeof original.applyPiPlan>[0]) => {
      operationDispatchSpies.piApply(plan);
      if (plan.id === 'tui-dispatch-test') {
        return dispatchApplyResult('pi', 'Pi');
      }
      return original.applyPiPlan(plan);
    },
  };
});

vi.mock('../paths', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../paths')>()),
  getExistingLiteConfigPath: vi.fn(() => 'managed-thoth-agents.json'),
}));

vi.mock('../config-io', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config-io')>()),
  parseConfig: parseConfigMock,
}));

vi.mock('../model-catalog', () => ({
  loadModelsDevCatalog: vi.fn(),
}));

function completeDispatchPlan(
  harness: HarnessId,
  action: 'install' | 'update' = 'update',
): OperationPlan {
  return {
    id: `${harness}-complete-${action}`,
    harness,
    action,
    title: `${action === 'install' ? 'Install' : 'Update'} complete ${harness} setup`,
    summary: 'Preview the complete shared operation update.',
    dryRun: true,
    canApply: true,
    targets: [],
    surfaces: [],
    backup: { required: false, strategy: 'none' },
    items: [
      {
        title: 'Plan provider setup',
        target: {
          kind: 'surface',
          label: 'Provider-owned thoth-mem setup',
        },
      },
      {
        title: 'Record completed CLI install',
        target: {
          kind: 'file',
          label: 'CLI-managed install version',
        },
      },
    ],
    warnings: [],
    disclaimers: [],
  };
}

function dispatchApplyResult(
  harness: HarnessId,
  displayName: string,
): OperationApplyResult {
  return {
    harness,
    action: 'update',
    applied: false,
    summary: `${displayName} shared apply boundary reached.`,
    changedTargets: [],
    backups: [],
    warnings: [],
    disclaimers: [],
  };
}

const checkedAt = '2026-07-11T00:00:00.000Z';

function useOpenCodeConfig(config: unknown): void {
  parseConfigMock.mockReturnValue({ config });
}

function loadDeterministicModelCatalog() {
  vi.mocked(loadModelsDevCatalog).mockResolvedValue({
    models: [
      {
        id: 'claude-sonnet-4-5',
        catalogId: 'anthropic/claude-sonnet-4-5',
        label: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        efforts: ['low', 'medium', 'high'],
        source: 'remote',
      },
    ],
    source: 'remote',
    stale: false,
    checkedAt,
    warnings: [],
  });
}

describe('TUI operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadDeterministicModelCatalog();
    useOpenCodeConfig({
      preset: 'openai',
      agents: {
        explorer: { model: 'openai/current-explorer', variant: 'high' },
      },
      presets: {
        openai: {
          deep: { model: 'openai/current-deep' },
        },
      },
    });
  });

  test('OpenCode model roles read the installed plugin config when present', async () => {
    const { getOpenCodeModelRoles } = await import('./operations');

    const roles = getOpenCodeModelRoles();

    expect(roles).toContainEqual({
      role: 'explorer',
      model: 'openai/current-explorer',
      effort: { kind: 'effort', value: 'high' },
    });
    expect(roles).toContainEqual({
      role: 'deep',
      model: 'openai/current-deep',
      effort: { kind: 'inherit' },
    });
  });

  test('OpenCode model roles use canonical orchestrator defaults without config', async () => {
    useOpenCodeConfig(undefined);
    const { getOpenCodeModelRoles } = await import('./operations');

    expect(
      getOpenCodeModelRoles().find(({ role }) => role === 'orchestrator'),
    ).toEqual({
      role: 'orchestrator',
      model: 'openai/gpt-6-sol',
      effort: { kind: 'effort', value: 'xhigh' },
    });
  });

  test('OpenCode model roles inherit from the selected preset with field-level root overrides', async () => {
    useOpenCodeConfig({
      preset: 'custom',
      agents: {
        explorer: { model: 'root/explorer' },
        deep: { variant: 'root-deep-variant' },
      },
      presets: {
        custom: {
          explorer: {
            model: 'custom/explorer',
            variant: 'custom-explorer-variant',
          },
          deep: { model: 'custom/deep', variant: 'custom-deep-variant' },
          librarian: {
            model: 'custom/librarian',
            variant: 'custom-librarian-variant',
          },
        },
        openai: {
          explorer: { model: 'wrong/explorer', variant: 'wrong-explorer' },
          deep: { model: 'wrong/deep', variant: 'wrong-deep' },
          librarian: { model: 'wrong/librarian', variant: 'wrong-librarian' },
        },
      },
    });
    const { getOpenCodeModelRoles } = await import('./operations');

    const roles = getOpenCodeModelRoles();

    expect(roles.find(({ role }) => role === 'explorer')).toEqual({
      role: 'explorer',
      model: 'root/explorer',
      effort: { kind: 'effort', value: 'custom-explorer-variant' },
    });
    expect(roles.find(({ role }) => role === 'deep')).toEqual({
      role: 'deep',
      model: 'custom/deep',
      effort: { kind: 'effort', value: 'root-deep-variant' },
    });
    expect(roles.find(({ role }) => role === 'librarian')).toEqual({
      role: 'librarian',
      model: 'custom/librarian',
      effort: { kind: 'effort', value: 'custom-librarian-variant' },
    });
  });

  test('OpenCode model roles treat an empty string as a literal selected preset key', async () => {
    useOpenCodeConfig({
      preset: '',
      agents: {
        explorer: { model: 'root/explorer' },
      },
      presets: {
        '': {
          explorer: { model: 'empty/explorer', variant: 'empty-variant' },
          deep: { model: 'empty/deep', variant: 'empty-deep-variant' },
        },
        openai: {
          explorer: { model: 'wrong/explorer', variant: 'wrong-explorer' },
          deep: { model: 'wrong/deep', variant: 'wrong-deep' },
        },
      },
    });
    const { getOpenCodeModelRoles } = await import('./operations');

    const roles = getOpenCodeModelRoles();

    expect(roles.find(({ role }) => role === 'explorer')).toEqual({
      role: 'explorer',
      model: 'root/explorer',
      effort: { kind: 'effort', value: 'empty-variant' },
    });
    expect(roles.find(({ role }) => role === 'deep')).toEqual({
      role: 'deep',
      model: 'empty/deep',
      effort: { kind: 'effort', value: 'empty-deep-variant' },
    });
  });

  test.each([
    [
      'absent',
      {
        agents: {
          explorer: { model: 'root/explorer', variant: 'root-variant' },
        },
        presets: {
          openai: {
            deep: { model: 'wrong/deep', variant: 'wrong-deep-variant' },
          },
        },
      },
    ],
    [
      'missing',
      {
        preset: 'missing',
        agents: {
          explorer: { model: 'root/explorer', variant: 'root-variant' },
        },
        presets: {
          openai: {
            deep: { model: 'wrong/deep', variant: 'wrong-deep-variant' },
          },
        },
      },
    ],
  ] as const)('OpenCode model roles with active preset %s use root overrides and defaults without openai fallback', async (_state, config) => {
    useOpenCodeConfig(config);
    const { getOpenCodeModelRoles } = await import('./operations');

    const roles = getOpenCodeModelRoles();

    expect(roles.find(({ role }) => role === 'explorer')).toEqual({
      role: 'explorer',
      model: 'root/explorer',
      effort: { kind: 'effort', value: 'root-variant' },
    });
    expect(roles.find(({ role }) => role === 'deep')).toEqual({
      role: 'deep',
      model: 'openai/gpt-6-sol',
      effort: { kind: 'effort', value: 'medium' },
    });
  });

  test('Codex current effort comes from installed artifacts, not stale sidecar state', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tui-codex-current-'));
    const home = join(root, 'home');
    const agents = join(home, '.codex', 'agents');
    try {
      mkdirSync(agents, { recursive: true });
      writeFileSync(
        join(agents, 'thoth-agents-deep.toml'),
        'name = "deep"\nmodel = "gpt-5.6-terra"\nmodel_reasoning_effort = "high"\n',
      );
      writeFileSync(
        join(agents, 'thoth-agents-explorer.toml'),
        'name = "explorer"\nmodel = "gpt-5.6-luna"\n',
      );
      writeFileSync(
        join(agents, '.thoth-agents-managed-models.json'),
        JSON.stringify({
          version: 1,
          models: {},
          configuredEfforts: {
            'thoth-agents-explorer.toml': 'high',
          },
        }),
      );

      const { getCodexModelRoles } = await import('./operations');
      const roles = getCodexModelRoles({
        cwd: root,
        homeDir: home,
        packageRoot: process.cwd(),
        scope: 'user',
      });

      expect(roles.find((role) => role.role === 'deep')).toMatchObject({
        model: 'gpt-5.6-terra',
        effort: { kind: 'effort', value: 'high' },
      });
      expect(roles.find((role) => role.role === 'explorer')).toMatchObject({
        model: 'gpt-5.6-luna',
        effort: { kind: 'inherit' },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('Claude model display ignores manager-owned cache files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tui-claude-current-'));
    const home = join(root, 'home');
    const plugin = join(home, '.claude', 'skills', 'thoth-agents');
    const agents = join(plugin, 'agents');
    try {
      mkdirSync(agents, { recursive: true });
      writeFileSync(
        join(agents, 'deep.md'),
        '---\nname: deep\nmodel: opus\neffort: high\n---\nbody\n',
      );
      writeFileSync(
        join(agents, 'explorer.md'),
        '---\nname: explorer\nmodel: haiku\n---\nbody\n',
      );
      writeFileSync(
        join(plugin, '.thoth-agents-managed-models.json'),
        JSON.stringify({
          version: 1,
          models: {},
          configuredEfforts: { explorer: 'max' },
        }),
      );

      const { getClaudeCodeModelRoles } = await import('./operations');
      const roles = getClaudeCodeModelRoles({
        cwd: root,
        homeDir: home,
        packageRoot: process.cwd(),
        scope: 'user',
      });

      expect(roles.find((role) => role.role === 'deep')).toMatchObject({
        model: 'sonnet',
      });
      expect(
        roles.find((role) => role.role === 'deep')?.effort,
      ).toBeUndefined();
      expect(roles.find((role) => role.role === 'explorer')).toMatchObject({
        model: 'haiku',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('missing artifacts use each renderer recommendation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tui-missing-current-'));
    try {
      const { getClaudeCodeModelRoles, getCodexModelRoles } = await import(
        './operations'
      );
      const codex = getCodexModelRoles({
        cwd: root,
        homeDir: join(root, 'codex-home'),
        packageRoot: process.cwd(),
        scope: 'user',
      });
      const claude = getClaudeCodeModelRoles({
        cwd: root,
        homeDir: join(root, 'claude-home'),
        packageRoot: process.cwd(),
        scope: 'user',
      });

      expect(codex.find((role) => role.role === 'deep')).toMatchObject({
        model: 'gpt-6-sol',
        effort: { kind: 'effort', value: 'medium' },
      });
      expect(claude.find((role) => role.role === 'deep')).toMatchObject({
        model: 'sonnet',
      });
      expect(
        claude.find((role) => role.role === 'deep')?.effort,
      ).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('routes the Claude Code harness to its own adapter, not Codex', async () => {
    const { defaultTuiOperations, getClaudeCodeModelRoles } = await import(
      './operations'
    );

    // Status and model roles for claude must come from the Claude Code
    // adapter (harness id 'claude'), never fall through to Codex.
    expect(defaultTuiOperations.status('claude').harness).toBe('claude');

    const roles = getClaudeCodeModelRoles();
    expect(roles.map((role) => role.role)).toEqual([
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]);
    for (const role of roles) {
      expect(['sonnet', 'opus', 'haiku', 'inherit']).toContain(role.model);
    }

    // Claude aliases stay available while the catalog adds concrete Anthropic models.
    expect(
      (await defaultTuiOperations.modelOptions('claude')).map((o) => o.id),
    ).toEqual([
      'sonnet',
      'opus',
      'haiku',
      'inherit',
      'anthropic/claude-sonnet-4-5',
    ]);
  });

  test.each([
    ['opencode', 'opencodeUpdate', 'opencodeApply'],
    ['codex', 'codexUpdate', 'codexApply'],
    ['claude', 'claudeUpdate', 'claudeApply'],
    ['pi', 'piUpdate', 'piApply'],
  ] as const)('routes %s Update planning and apply through its complete shared operation service', async (harness, planSpy, applySpy) => {
    const { defaultTuiOperations } = await import('./operations');

    const updatePlan = defaultTuiOperations.plan(harness, 'update');
    expect(operationDispatchSpies[planSpy]).toHaveBeenCalledTimes(1);
    expect(updatePlan.title).toContain('complete');
    expect(updatePlan.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({
            label: 'Provider-owned thoth-mem setup',
          }),
        }),
        expect.objectContaining({
          target: expect.objectContaining({
            label: 'CLI-managed install version',
          }),
        }),
      ]),
    );

    const dispatchPlan = { ...updatePlan, id: 'tui-dispatch-test' };
    const result = defaultTuiOperations.apply(dispatchPlan);
    expect(operationDispatchSpies[applySpy]).toHaveBeenCalledWith(dispatchPlan);
    expect(result.summary).toContain('shared apply boundary reached');
  });

  test('routes Pi Install planning and apply through Pi instead of Codex', async () => {
    const { defaultTuiOperations } = await import('./operations');

    const installPlan = defaultTuiOperations.plan('pi', 'install');
    expect(operationDispatchSpies.piInstall).toHaveBeenCalledTimes(1);
    expect(operationDispatchSpies.codexUpdate).not.toHaveBeenCalled();
    expect(installPlan).toMatchObject({ harness: 'pi', action: 'install' });

    const dispatchPlan = { ...installPlan, id: 'tui-dispatch-test' };
    const result = defaultTuiOperations.apply(dispatchPlan);
    expect(operationDispatchSpies.piApply).toHaveBeenCalledWith(dispatchPlan);
    expect(operationDispatchSpies.codexApply).not.toHaveBeenCalled();
    expect(result.summary).toContain('Pi shared apply boundary reached');
  });

  test.each([
    {
      label: 'supported provider evidence',
      evidence: {
        state: 'supported',
        source: 'provider',
        basis: ['Provider reported persistence and recovery availability.'],
      },
    },
    {
      label: 'degraded harness evidence',
      evidence: {
        state: 'degraded',
        source: 'harness',
        basis: ['Harness reported persistence but not recovery availability.'],
      },
    },
  ] satisfies ReadonlyArray<{
    label: string;
    evidence: ProviderCapabilityEvidence;
  }>)('forwards $label without changing consumer-managed state', async ({
    evidence,
  }) => {
    const { defaultTuiOperations } = await import('./operations');
    const statusWithEvidence = defaultTuiOperations.status as unknown as (
      harness: 'opencode',
      input: ProviderEvidenceInput,
    ) => HarnessStatusReport;

    const report = statusWithEvidence('opencode', {
      providerEvidence: evidence,
    });

    expect(report.providerCapability).toEqual(evidence);
    expect(report.state).not.toBe(evidence.state);
  });

  test('defaults omitted provider evidence to unsupported without failing consumer status', async () => {
    const { defaultTuiOperations } = await import('./operations');
    const report = defaultTuiOperations.status('opencode');

    expect(report.providerCapability).toEqual({
      state: 'unsupported',
      source: 'none',
      basis: [],
    });
    expect(report.state).not.toBe('unknown');
  });
});

describe('shipped model restoration', () => {
  test('projects exact defaults for each harness independently of installed roles', async () => {
    const { getShippedModelRoles } = await import('../model-defaults');
    const expected = [
      ['explorer', 'gpt-6-luna', 'low'],
      ['librarian', 'gpt-6-luna', 'high'],
      ['oracle', 'gpt-6-astra', 'medium'],
      ['designer', 'gpt-6-sol', 'medium'],
      ['quick', 'gpt-6-luna', 'medium'],
      ['deep', 'gpt-6-sol', 'medium'],
    ];
    const compact = (harness: HarnessId) =>
      getShippedModelRoles(harness).map(({ role, model, effort }) => [
        role,
        model,
        effort?.kind === 'effort' ? effort.value : 'inherit',
      ]);
    expect(compact('codex')).toEqual(expected);
    expect(compact('pi')).toEqual(
      expected.map(([role, model, effort]) => [
        role,
        `openai-codex/${model}`,
        effort,
      ]),
    );
    expect(compact('opencode')).toEqual([
      ['orchestrator', 'openai/gpt-6-sol', 'xhigh'],
      ...expected.map(([role, model, effort]) => [
        role,
        `openai/${model}`,
        effort,
      ]),
    ]);
    expect(compact('claude')).toEqual([
      ['explorer', 'haiku', 'low'],
      ['librarian', 'sonnet', 'high'],
      ['oracle', 'opus', 'high'],
      ['designer', 'sonnet', 'medium'],
      ['quick', 'haiku', 'low'],
      ['deep', 'sonnet', 'medium'],
    ]);
    const mutated = getShippedModelRoles('codex');
    const first = mutated[0];
    if (!first) throw new Error('Missing first default role');
    first.model = 'custom';
    if (first.effort?.kind === 'effort') first.effort.value = 'max';
    expect(compact('codex')).toEqual(expected);
  });
});

test('restore plans retain missing or unsupported Codex effort diagnostics', async () => {
  const { buildRestoreModelPlan } = await import('./operations');
  const root = mkdtempSync(join(tmpdir(), 'restore-model-plan-'));
  try {
    const source = {
      cwd: root,
      homeDir: root,
      codexHome: join(root, '.codex'),
      packageRoot: process.cwd(),
    };
    const missing = buildRestoreModelPlan('codex', [], source);
    expect(missing.canApply).toBe(false);
    expect(
      missing.warnings.some(
        ({ code }) => code === 'codex-effort-model-unsupported',
      ),
    ).toBe(true);
    const catalog = ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra'].map((model) => ({
      id: model,
      catalogId: `openai/${model}`,
      label: model,
      provider: 'openai',
      efforts: ['low', 'medium', 'high', 'xhigh'],
      source: 'remote' as const,
    }));
    const ready = buildRestoreModelPlan('codex', catalog, source);
    expect(ready.canApply).toBe(true);
    expect(
      ready.items.map(({ preview }) => JSON.parse(preview ?? '{}')),
    ).toEqual([
      { role: 'explorer', model: 'gpt-6-luna', effort: 'low' },
      { role: 'librarian', model: 'gpt-6-luna', effort: 'high' },
      { role: 'oracle', model: 'gpt-6-astra', effort: 'medium' },
      { role: 'designer', model: 'gpt-6-sol', effort: 'medium' },
      { role: 'quick', model: 'gpt-6-luna', effort: 'medium' },
      { role: 'deep', model: 'gpt-6-sol', effort: 'medium' },
    ]);
    expect(existsSync(join(root, '.codex'))).toBe(false);
    const unsupported = buildRestoreModelPlan(
      'codex',
      catalog.map((option) => ({ ...option, efforts: ['low'] })),
      source,
    );
    expect(unsupported.canApply).toBe(false);
    const claude = buildRestoreModelPlan('claude', [], source);
    expect(claude.canApply).toBe(false);
    expect(claude.items).toHaveLength(6);
    expect(
      claude.warnings.some(
        ({ code }) => code === 'claude-code-model-cache-owned',
      ),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
