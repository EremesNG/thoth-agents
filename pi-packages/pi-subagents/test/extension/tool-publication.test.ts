import fs from 'node:fs';
import path from 'node:path';
import {
  getPublishedToolDefinition,
  getToolDefinitionRegistryVersion,
  type ToolDefinitionLike,
} from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import subagentsExtension from '../../src/extension/subagents-extension.js';
import type { SubagentManager } from '../../src/manager.js';
import {
  resetPiComponentCacheForTests,
  resolveSubagentExternalToolDefinitionFromInfo,
} from '../../src/thread-view.js';
import { registerSubagentTools } from '../../src/tools/registry.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();
beforeEach(resetPiComponentCacheForTests);
afterEach(resetPiComponentCacheForTests);

function fixture(hasUI = true) {
  const tools = new Map<string, ToolDefinitionLike>();
  const handlers = new Map<
    string,
    Array<(event: unknown, ctx: unknown) => unknown>
  >();
  const pi = {
    registerTool(tool: ToolDefinitionLike) {
      tools.set(tool.name, tool);
    },
    on(name: string, handler: (event: unknown, ctx: unknown) => unknown) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
  };
  subagentsExtension(pi);
  const ctx = { hasUI, cwd: env.tmp, sessionId: 'tool-publication', ui: {} };
  return {
    pi,
    tools,
    async emit(name: string) {
      for (const handler of handlers.get(name) ?? []) await handler({}, ctx);
    },
  };
}

describe('subagents tool definition publication', () => {
  it('restores root renderers and releases child-only definitions when a headless child shuts down', async () => {
    const root = fixture(false);
    const child = fixture(false);
    const name = 'subagent_run';
    const childOnly = { name: 'child_only' };
    const resolve = (toolName = name) =>
      resolveSubagentExternalToolDefinitionFromInfo(toolName, {
        name: toolName,
      });
    try {
      child.pi.registerTool(childOnly);
      expect(child.tools.get(name)).not.toBe(root.tools.get(name));
      expect(resolve()).toBe(child.tools.get(name));
      expect(resolve(childOnly.name)).toBe(childOnly);

      await child.emit('session_shutdown');

      expect(resolve()).toBe(root.tools.get(name));
      expect(resolve(childOnly.name)).toBeUndefined();

      await root.emit('session_shutdown');

      expect(resolve()).toBeUndefined();
    } finally {
      await child.emit('session_shutdown');
      await root.emit('session_shutdown');
    }
  });

  it('keeps the latest live owner after re-registration and parent-first shutdown', async () => {
    const root = fixture(false);
    const child = fixture(false);
    const name = 'subagent_run';
    const replacement = { ...root.tools.get(name), name };
    const resolve = () =>
      resolveSubagentExternalToolDefinitionFromInfo(name, { name });
    try {
      root.pi.registerTool(replacement);
      expect(resolve()).toBe(replacement);

      await root.emit('session_shutdown');

      expect(resolve()).toBe(child.tools.get(name));

      await child.emit('session_shutdown');

      expect(resolve()).toBeUndefined();
    } finally {
      await root.emit('session_shutdown');
      await child.emit('session_shutdown');
    }
  });

  it('publishes the full host definitions only on a UI session start', async () => {
    const host = fixture();
    expect(host.tools.size).toBeGreaterThan(0);
    for (const name of host.tools.keys())
      expect(getPublishedToolDefinition(name)).toBeUndefined();
    try {
      await host.emit('session_start');
      for (const [name, definition] of host.tools)
        expect(getPublishedToolDefinition(name)).toBe(definition);
    } finally {
      await host.emit('session_shutdown');
    }
    for (const name of host.tools.keys())
      expect(getPublishedToolDefinition(name)).toBeUndefined();
  });

  it('never publishes headless registrations or session starts', async () => {
    const host = fixture(false);
    const run = host.tools.get('subagent_run');
    if (!run) throw new Error('subagent_run not registered');
    const late = { ...run, name: 'subagent_late_headless' };
    try {
      await host.emit('session_start');
      host.pi.registerTool(late);
      expect(host.tools.get(late.name)).toBe(late);
      for (const name of host.tools.keys())
        expect(getPublishedToolDefinition(name)).toBeUndefined();
    } finally {
      await host.emit('session_shutdown');
    }
  });

  it('publishes conditional tools registered after the UI session starts', async () => {
    const configFile = path.join(env.tmp, 'isolated-agent', 'subagents.json');
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        enable_continue: false,
        enable_ask_orchestrator: false,
      }),
    );
    const host = fixture();
    expect(host.tools.has('subagent_continue')).toBe(false);
    expect(host.tools.has('subagent_reply')).toBe(false);
    try {
      await host.emit('session_start');
      fs.writeFileSync(
        path.join(env.tmp, '.pi', 'subagents.json'),
        JSON.stringify({
          enable_continue: true,
          enable_ask_orchestrator: true,
        }),
      );
      registerSubagentTools(host.pi, {} as SubagentManager, env.tmp);
      expect(host.tools.has('subagent_continue')).toBe(true);
      expect(host.tools.has('subagent_reply')).toBe(true);
      for (const [name, definition] of host.tools) {
        expect(definition).toHaveProperty('exposure', 'model-only');
        expect(getPublishedToolDefinition(name)).toBe(definition);
      }
    } finally {
      await host.emit('session_shutdown');
    }
    for (const name of host.tools.keys())
      expect(getPublishedToolDefinition(name)).toBeUndefined();
  });

  it('does not republish on repeated UI starts before shutdown', async () => {
    const host = fixture();
    try {
      await host.emit('session_start');
      const version = getToolDefinitionRegistryVersion();
      await host.emit('session_start');
      expect(getToolDefinitionRegistryVersion()).toBe(version);
      for (const [name, definition] of host.tools)
        expect(getPublishedToolDefinition(name)).toBe(definition);
    } finally {
      await host.emit('session_shutdown');
    }
    for (const name of host.tools.keys())
      expect(getPublishedToolDefinition(name)).toBeUndefined();
  });
});
