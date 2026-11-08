import type { Plugin } from '@opencode/plugin';
import { expect, test, vi } from 'vitest';
import type { OpenCodeDependencies } from './context';
import { registerMcp } from './mcp';

test('sets enabled built-in MCP servers using v2 configs', async () => {
  const set = vi.fn();
  const transform = vi.fn(async (edit) => edit({ set }));
  await registerMcp(
    { mcp: { transform } } as unknown as Plugin.Context,
    {
      config: { disabled_mcps: ['exa'] },
    } as OpenCodeDependencies,
  );
  expect(set.mock.calls.map(([name]) => name).sort()).toEqual([
    'context7',
    'grep_app',
  ]);
  expect(set).toHaveBeenCalledWith('grep_app', {
    type: 'remote',
    url: 'https://mcp.grep.app',
    oauth: false,
  });
  set.mockClear();
  await registerMcp(
    { mcp: { transform } } as unknown as Plugin.Context,
    {
      config: {},
    } as OpenCodeDependencies,
  );
  expect(set).toHaveBeenCalledWith('exa', {
    type: 'local',
    command: ['npx', '-y', 'exa-mcp-server'],
  });
});
