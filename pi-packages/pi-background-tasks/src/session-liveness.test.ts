import { getOrInstallSessionLivenessRegistry } from '@thoth-agents/pi-core';
import { describe, expect, it, vi } from 'vitest';
import { lifecycleHost } from './test-support/lifecycle-harness.js';

describe('background session liveness', () => {
  it('skips unavailable identifiers and survives registry registration errors', async () => {
    const key = Symbol.for('@agegr/pi-web/session-liveness/v1');
    const globals = globalThis as unknown as Record<symbol, unknown>;
    const original = globals[key];
    const register = vi.fn(() => { throw new Error('registry unavailable'); });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    globals[key] = { version: 1, register, hasActiveProvider: () => false };
    const host = lifecycleHost(' ');
    try {
      await expect(host.emit('session_start')).resolves.toBeUndefined();
      expect(register).not.toHaveBeenCalled();
      host.ctx.sessionManager.getSessionId = () => 'owner';
      await expect(host.emit('session_start')).resolves.toBeUndefined();
      expect(register).toHaveBeenCalledOnce();
    } finally {
      await host.emit('session_shutdown', 'quit');
      if (original === undefined) delete globals[key];
      else globals[key] = original;
      log.mockRestore();
    }
  });

  it.each(['process', 'command_watch'])('retains only the owning session while a %s is running', async (kind) => {
    const host = lifecycleHost('owner');
    Object.assign(host.ctx.sessionManager, { getSessionFile: () => '/owner.jsonl' });
    const child = lifecycleHost('child');
    const registry = getOrInstallSessionLivenessRegistry();
    await host.emit('session_start');
    await child.emit('session_start');
    expect(registry?.hasActiveProvider({ sessionId: 'owner' })).toBe(false);
    let id: string | undefined;
    try {
      if (kind === 'process') {
        id = await host.spawn({ shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'] });
      } else {
        const text = await host.execute('bg_task_watch', {
          shell: 'none', argv: [process.execPath, '-e', "console.log('waiting')"],
          success_when: { type: 'stdout_contains', value: 'ready' }, interval_seconds: 60, timeout_seconds: 0,
        });
        id = text.match(/bg_[a-z0-9_]+/)![0];
      }
      expect(registry?.hasActiveProvider({ sessionFile: '/owner.jsonl' })).toBe(true);
      expect(registry?.hasActiveProvider({ sessionId: 'child' })).toBe(false);
      await child.emit('session_shutdown', 'quit');
      expect(registry?.hasActiveProvider({ sessionId: 'owner' })).toBe(true);
      await host.emit('session_start');
      expect(registry?.hasActiveProvider({ sessionId: 'owner' })).toBe(true);
      await host.execute('bg_task_stop', { id });
      expect(registry?.hasActiveProvider({ sessionId: 'owner' })).toBe(false);
    } finally {
      if (id) await host.execute('bg_task_stop', { id });
      await host.emit('session_shutdown', 'quit');
      await child.emit('session_shutdown', 'quit');
    }
  });

  it('unregisters on reload and before registering a replacement session', async () => {
    const host = lifecycleHost('before');
    const registry = getOrInstallSessionLivenessRegistry();
    await host.emit('session_start');
    const id = await host.spawn({ shell: 'none', argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'] });
    try {
      expect(registry?.hasActiveProvider({ sessionId: 'before' })).toBe(true);
      host.ctx.sessionManager.getSessionId = () => 'after';
      await host.emit('session_start');
      expect(registry?.hasActiveProvider({ sessionId: 'before' })).toBe(false);
      expect(registry?.hasActiveProvider({ sessionId: 'after' })).toBe(false);
      host.ctx.sessionManager.getSessionId = () => 'before';
      await host.emit('session_start');
      expect(registry?.hasActiveProvider({ sessionId: 'before' })).toBe(true);
      await host.emit('session_shutdown', 'reload');
      expect(registry?.hasActiveProvider({ sessionId: 'before' })).toBe(false);
      await host.emit('session_shutdown', 'reload');
    } finally {
      await host.execute('bg_task_stop', { id });
      await host.emit('session_shutdown', 'quit');
    }
  });
});
