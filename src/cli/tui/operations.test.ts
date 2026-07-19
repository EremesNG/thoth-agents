import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type {
  ProviderCapabilityEvidence,
  ProviderEvidenceInput,
} from '../../harness/types';
import { loadModelsDevCatalog } from '../model-catalog';
import type { HarnessStatusReport } from '../operations';

const parseConfigMock = vi.hoisted(() => vi.fn());

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
      model: 'openai/gpt-5.6-sol',
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
      model: 'openai/gpt-5.6-sol',
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
        model: 'gpt-5.6-sol',
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
