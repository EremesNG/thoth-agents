import {
  getPublishedToolDefinition,
  getToolDefinitionRegistryVersion,
} from '@thoth-agents/pi-core';
import { describe, expect, it } from 'vitest';
import { lifecycleHost } from './test-support/lifecycle-harness.js';

describe('background tool definition publication', () => {
  it('publishes the full host definitions only on a UI session start', async () => {
    const host = lifecycleHost('tool-publication-ui', true);
    for (const name of host.tools.keys())
      expect(getPublishedToolDefinition(name)).toBeUndefined();

    try {
      await host.emit('session_start');
      expect(host.tools.size).toBe(8);
      for (const [name, definition] of host.tools)
        expect(getPublishedToolDefinition(name)).toBe(definition);
    } finally {
      await host.emit('session_shutdown', 'reload');
    }
    for (const name of host.tools.keys())
      expect(getPublishedToolDefinition(name)).toBeUndefined();
  });
  it('never publishes headless registrations or session starts', async () => {
    const host = lifecycleHost('tool-publication-headless');
    try {
      await host.emit('session_start');
      const late = { ...host.tools.get('bg_task_spawn'), name: 'bg_late_headless' };
      host.pi.registerTool(late);
      expect(host.tools.get(late.name)).toBe(late);
      for (const name of host.tools.keys())
        expect(getPublishedToolDefinition(name)).toBeUndefined();
    } finally {
      await host.emit('session_shutdown', 'reload');
    }
  });

  it('publishes late host registrations immediately and withdraws them', async () => {
    const host = lifecycleHost('tool-publication-late', true);
    const late = { ...host.tools.get('bg_task_spawn'), name: 'bg_late_ui' };
    try {
      await host.emit('session_start');
      host.pi.registerTool(late);
      expect(host.tools.get(late.name)).toBe(late);
      expect(getPublishedToolDefinition(late.name)).toBe(late);
    } finally {
      await host.emit('session_shutdown', 'reload');
    }
    expect(getPublishedToolDefinition(late.name)).toBeUndefined();
  });

  it('starts idempotently and republishes after shutdown in the same instance', async () => {
    const host = lifecycleHost('tool-publication-restart', true);
    try {
      await host.emit('session_start');
      const version = getToolDefinitionRegistryVersion();
      await host.emit('session_start');
      expect(getToolDefinitionRegistryVersion()).toBe(version);
      await host.emit('session_shutdown', 'reload');
      await host.emit('session_start');
      for (const [name, definition] of host.tools)
        expect(getPublishedToolDefinition(name)).toBe(definition);
    } finally {
      await host.emit('session_shutdown', 'reload');
    }
    for (const name of host.tools.keys())
      expect(getPublishedToolDefinition(name)).toBeUndefined();
  });
});
