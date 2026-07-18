import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createBuiltinMcps } from './index';

const providerLauncherPath = fileURLToPath(
  new URL('./thoth.ts', import.meta.url),
);

describe('createBuiltinMcps', () => {
  test('registers only the unrelated built-in MCPs', () => {
    const mcps = createBuiltinMcps();

    expect(Object.keys(mcps).sort()).toEqual(['context7', 'exa', 'grep_app']);
    expect(mcps).not.toHaveProperty('thoth_mem');
  });

  test('does not bundle a provider MCP launcher', () => {
    expect(existsSync(providerLauncherPath)).toBe(false);
  });

  test('preserves disablement and ignores unknown names for unrelated MCPs', () => {
    expect(
      Object.keys(createBuiltinMcps(['exa', 'unknown_mcp'])).sort(),
    ).toEqual(['context7', 'grep_app']);
  });

  test('keeps required URL or command properties on unrelated MCP configs', () => {
    for (const config of Object.values(createBuiltinMcps())) {
      expect('url' in config || 'command' in config).toBe(true);
    }
  });
});
