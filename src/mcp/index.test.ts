import { describe, expect, test } from 'vitest';
import { DEFAULT_THOTH_COMMAND } from '../config';
import { createBuiltinMcps } from './index';

describe('createBuiltinMcps', () => {
  test('registers the default thoth-mem MCP by default', () => {
    const mcps = createBuiltinMcps();
    const names = Object.keys(mcps).sort();

    expect(names).toEqual(['context7', 'exa', 'grep_app', 'thoth_mem']);

    const thoth = mcps.thoth_mem;
    expect(thoth).toBeDefined();
    expect('command' in thoth).toBe(true);
    if (!('command' in thoth)) {
      throw new Error('Expected local thoth MCP');
    }
    expect(thoth.command).toEqual(DEFAULT_THOTH_COMMAND);
  });

  test('omits thoth-mem MCP when disabled', () => {
    const mcps = createBuiltinMcps(['thoth_mem']);

    expect(Object.keys(mcps).sort()).toEqual(['context7', 'exa', 'grep_app']);
    expect(mcps.thoth_mem).toBeUndefined();
  });

  test('applies custom thoth invocation settings to MCP definition', () => {
    const mcps = createBuiltinMcps([], {
      command: ['bun', 'x', 'thoth-mem'],
      data_dir: '/tmp/thoth-data',
      http_port: 8123,
      environment: {
        THOTH_PROFILE: 'test',
      },
      timeout: 12345,
    });

    const thoth = mcps.thoth_mem;
    expect('command' in thoth).toBe(true);
    expect(thoth).toMatchObject({
      type: 'local',
      command: ['bun', 'x', 'thoth-mem'],
      environment: {
        THOTH_DATA_DIR: '/tmp/thoth-data',
        THOTH_HTTP_PORT: '8123',
        THOTH_PROFILE: 'test',
      },
      timeout: 12345,
    });
  });

  test('leaves unrelated MCPs enabled when thoth-mem is disabled', () => {
    const mcps = createBuiltinMcps(['thoth_mem']);

    expect(mcps.exa).toBeDefined();
    expect(mcps.context7).toBeDefined();
    expect(mcps.grep_app).toBeDefined();
  });

  test('ignores unknown MCP names in disabled list', () => {
    const mcps = createBuiltinMcps(['unknown_mcp', 'nonexistent']);

    expect(Object.keys(mcps)).toHaveLength(4);
    expect(mcps.thoth_mem).toBeDefined();
  });

  test('MCP configs have required properties', () => {
    const mcps = createBuiltinMcps();

    for (const config of Object.values(mcps)) {
      expect(config).toBeDefined();
      const hasUrl = 'url' in config;
      const hasCommand = 'command' in config;
      expect(hasUrl || hasCommand).toBe(true);
    }
  });
});
