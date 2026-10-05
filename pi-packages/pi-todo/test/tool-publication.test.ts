import {
  getPublishedToolDefinition,
  getToolDefinitionRegistryVersion,
} from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import registerTodo from '../index.js';
import { clearActiveRenderSession } from '../state/store.js';
import { createMockCtx, createMockPi } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  clearActiveRenderSession();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function fixture(hasUI = true) {
  const { pi, captured } = createMockPi();
  registerTodo(pi);
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('todo not registered');
  const ctx = createMockCtx({ sessionId: 'tool-publication', hasUI });
  return {
    pi,
    tools: captured.tools,
    tool,
    async emit(name: string) {
      for (const handler of captured.events.get(name) ?? [])
        await handler({} as never, ctx as never);
    },
  };
}

describe('todo tool definition publication', () => {
  it('publishes the full host definition only on a UI session start', async () => {
    const host = fixture();
    expect(getPublishedToolDefinition('todo')).toBeUndefined();
    try {
      await host.emit('session_start');
      expect(host.tools.size).toBe(1);
      expect(getPublishedToolDefinition('todo')).toBe(host.tools.get('todo'));
    } finally {
      await host.emit('session_shutdown');
    }
    expect(getPublishedToolDefinition('todo')).toBeUndefined();
  });

  it('never publishes headless registrations or session starts', async () => {
    const host = fixture(false);
    const late = { ...host.tool, name: 'todo_late_headless' };
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

  it('publishes late host registrations immediately and withdraws them', async () => {
    const host = fixture();
    const late = { ...host.tool, name: 'todo_late_ui' };
    try {
      await host.emit('session_start');
      host.pi.registerTool(late);
      expect(host.tools.get(late.name)).toBe(late);
      expect(getPublishedToolDefinition(late.name)).toBe(late);
    } finally {
      await host.emit('session_shutdown');
    }
    expect(getPublishedToolDefinition(late.name)).toBeUndefined();
  });

  it('starts idempotently and republishes after shutdown in the same instance', async () => {
    const host = fixture();
    try {
      await host.emit('session_start');
      const version = getToolDefinitionRegistryVersion();
      await host.emit('session_start');
      expect(getToolDefinitionRegistryVersion()).toBe(version);
      await host.emit('session_shutdown');
      await host.emit('session_start');
      expect(getPublishedToolDefinition('todo')).toBe(host.tools.get('todo'));
    } finally {
      await host.emit('session_shutdown');
    }
    expect(getPublishedToolDefinition('todo')).toBeUndefined();
  });
});
