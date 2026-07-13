import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { loadModelsDevCatalog } from '../model-catalog';

vi.mock('../paths', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../paths')>()),
  getExistingLiteConfigPath: vi.fn(() => 'managed-thoth-agents.json'),
}));

vi.mock('../config-io', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config-io')>()),
  parseConfig: vi.fn(() => ({
    config: {
      agents: {
        explorer: { model: 'openai/current-explorer', variant: 'high' },
      },
      presets: {
        openai: {
          deep: { model: 'openai/current-deep' },
        },
      },
    },
  })),
}));

vi.mock('../model-catalog', () => ({
  loadModelsDevCatalog: vi.fn(),
}));

const checkedAt = '2026-07-11T00:00:00.000Z';

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

  test('Claude current effort comes from installed artifacts, not stale sidecar state', async () => {
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
        model: 'opus',
        effort: { kind: 'effort', value: 'high' },
      });
      expect(roles.find((role) => role.role === 'explorer')).toMatchObject({
        model: 'haiku',
        effort: { kind: 'inherit' },
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
        model: 'gpt-5.6-terra',
        effort: { kind: 'effort', value: 'xhigh' },
      });
      expect(claude.find((role) => role.role === 'deep')).toMatchObject({
        model: 'sonnet',
        effort: { kind: 'inherit' },
      });
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
});
