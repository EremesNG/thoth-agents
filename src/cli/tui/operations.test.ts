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
});
