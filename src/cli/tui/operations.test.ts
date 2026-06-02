import { describe, expect, test, vi } from 'vitest';

vi.mock('../paths', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../paths')>()),
  getExistingLiteConfigPath: vi.fn(() => 'managed-thoth-agents.json'),
}));

vi.mock('../config-io', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config-io')>()),
  parseConfig: vi.fn(() => ({
    config: {
      agents: {
        explorer: { model: 'openai/current-explorer' },
      },
      presets: {
        openai: {
          deep: { model: 'openai/current-deep' },
        },
      },
    },
  })),
}));

describe('TUI operations', () => {
  test('OpenCode model roles read the installed plugin config when present', async () => {
    const { getOpenCodeModelRoles } = await import('./operations');

    const roles = getOpenCodeModelRoles();

    expect(roles).toContainEqual({
      role: 'explorer',
      model: 'openai/current-explorer',
    });
    expect(roles).toContainEqual({
      role: 'deep',
      model: 'openai/current-deep',
    });
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

    // Model options are the Claude Code aliases, not the OpenCode/Codex catalog.
    expect(
      defaultTuiOperations.modelOptions('claude').map((o) => o.id),
    ).toEqual(['sonnet', 'opus', 'haiku', 'inherit']);
  });
});
