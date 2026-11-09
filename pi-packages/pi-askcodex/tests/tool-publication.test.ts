import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  getPublishedToolDefinition,
  type ToolDefinitionLike,
} from '@thoth-agents/pi-core';
import { afterEach, expect, it, vi } from 'vitest';
import askCodex from '../src/index.js';

afterEach(() => vi.unstubAllEnvs());

it.each([
  [undefined, undefined, 'direct'],
  ['codemode', undefined, 'deferred'],
  ['tool_search', undefined, 'deferred'],
  ['codemode', 'direct', 'direct'],
])('publishes adaptive AskCodex with %s active and override %s', async (discovery, override, exposure) => {
  vi.stubEnv('ASKCODEX_ENABLED', '1');
  vi.stubEnv('THOTH_AGENTS_PI_EXPOSURE', override);
  const handlers = new Map<string, Array<(...args: any[]) => unknown>>();
  const tools = new Map<string, ToolDefinitionLike>();
  let active = ['read', ...(discovery ? [discovery] : [])];
  askCodex({
    registerTool: (tool) => {
      tools.set(tool.name, tool);
    },
    on: (name, handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    getActiveTools: () => active,
    setActiveTools: (names) => {
      active = names;
    },
  } as ExtensionAPI);
  expect(tools.get('AskCodex')).toMatchObject({
    exposure: 'direct',
    defaultActive: true,
  });
  expect(getPublishedToolDefinition('AskCodex')).toBeUndefined();
  active.push('AskCodex');
  try {
    for (const handler of handlers.get('session_start') ?? [])
      await handler({}, { hasUI: true });
    expect(tools.get('AskCodex')).toMatchObject({
      exposure,
      defaultActive: exposure === 'direct',
    });
    expect(active.includes('AskCodex')).toBe(exposure === 'direct');
    expect(active).toContain('read');
    expect(getPublishedToolDefinition('AskCodex')).toBe(tools.get('AskCodex'));
  } finally {
    for (const handler of handlers.get('session_shutdown') ?? [])
      await handler({}, {});
  }
});
