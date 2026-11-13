import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '../src/index.js';

const key = Symbol.for('@agegr/pi-web/session-liveness/v1');
const globals = globalThis as unknown as Record<symbol, unknown>;
const original = globals[key];
afterEach(() => {
  if (original === undefined) delete globals[key];
  else globals[key] = original;
});

describe('session liveness registry', () => {
  it('installs once when absent and reuses a compatible bridge registry', () => {
    delete globals[key];
    const registry = core.getOrInstallSessionLivenessRegistry();
    expect(registry?.version).toBe(1);
    expect(globals[key]).toBe(registry);
    expect(core.getOrInstallSessionLivenessRegistry()).toBe(registry);
    const bridge = {
      version: 1,
      register: vi.fn(() => () => {}),
      hasActiveProvider: () => true,
    };
    globals[key] = bridge;
    const provider = {
      name: 'test',
      sessionId: 'session',
      isActive: () => false,
    };
    core.registerSessionLivenessProvider(provider);
    expect(core.getOrInstallSessionLivenessRegistry()).toBe(bridge);
    expect(bridge.register).toHaveBeenCalledWith(provider);
  });

  it.each([
    null,
    false,
    { version: 2 },
    { version: 1, register: () => {} },
  ])('preserves an incompatible occupied slot: %j', (value) => {
    globals[key] = value;
    expect(core.getOrInstallSessionLivenessRegistry()).toBeUndefined();
    const unregister = core.registerSessionLivenessProvider({
      name: 'test',
      sessionId: 'session',
      isActive: () => true,
    });
    expect(() => {
      unregister();
      unregister();
    }).not.toThrow();
    expect(globals[key]).toBe(value);
  });

  it.each([
    true,
    undefined,
    null,
    0,
    '',
    Promise.resolve(false),
  ])('treats any value other than literal false as active: %j', (value) => {
    delete globals[key];
    const registry = core.getOrInstallSessionLivenessRegistry();
    core.registerSessionLivenessProvider({
      name: 'test',
      sessionId: 'session',
      sessionFile: '/session.jsonl',
      isActive: () => value,
    });
    expect(registry?.hasActiveProvider({ sessionId: 'session' })).toBe(true);
    expect(registry?.hasActiveProvider({ sessionFile: 'session' })).toBe(true);
    expect(registry?.hasActiveProvider({ sessionId: '/session.jsonl' })).toBe(
      true,
    );
    expect(registry?.hasActiveProvider({ sessionFile: '/session.jsonl' })).toBe(
      true,
    );
    expect(registry?.hasActiveProvider({ sessionId: 'other' })).toBe(false);
    expect(registry?.hasActiveProvider({})).toBe(false);
  });

  it('reads activity live, treats exceptions as active, and unregisters idempotently', () => {
    delete globals[key];
    const registry = core.getOrInstallSessionLivenessRegistry();
    let active = false;
    const off = core.registerSessionLivenessProvider({
      name: 'test',
      sessionId: 'session',
      isActive: () => active,
    });
    expect(registry?.hasActiveProvider({ sessionId: 'session' })).toBe(false);
    active = true;
    expect(registry?.hasActiveProvider({ sessionId: 'session' })).toBe(true);
    off();
    off();
    expect(registry?.hasActiveProvider({ sessionId: 'session' })).toBe(false);
    core.registerSessionLivenessProvider({
      name: 'test',
      sessionId: 'session',
      isActive: () => {
        throw new Error('unknown');
      },
    });
    expect(registry?.hasActiveProvider({ sessionId: 'session' })).toBe(true);
  });

  it('retains prototype getters and calls activity with the original receiver', () => {
    delete globals[key];
    const registry = core.getOrInstallSessionLivenessRegistry();
    if (!registry) throw new Error('Registry was not installed');
    class Provider {
      get name() {
        return 'test';
      }
      get sessionId() {
        return 'session';
      }
      get sessionFile() {
        return '/session.jsonl';
      }
      isActive() {
        return this.sessionId === 'session';
      }
    }
    registry.register(new Provider());
    expect(registry.hasActiveProvider({ sessionId: 'session' })).toBe(true);
    expect(registry.hasActiveProvider({ sessionFile: '/session.jsonl' })).toBe(
      true,
    );
  });

  it('reads mutated identifiers and activity live with independent registrations', () => {
    delete globals[key];
    const registry = core.getOrInstallSessionLivenessRegistry();
    if (!registry) throw new Error('Registry was not installed');
    const provider = {
      name: 'test',
      sessionId: 'before',
      sessionFile: '/before',
      isActive: () => true,
    };
    const first = registry.register(provider);
    const second = registry.register(provider);
    provider.sessionId = 'after';
    provider.sessionFile = '/after';
    expect(
      registry.hasActiveProvider({
        sessionId: 'before',
        sessionFile: '/before',
      }),
    ).toBe(false);
    expect(registry.hasActiveProvider({ sessionId: 'after' })).toBe(true);
    expect(registry.hasActiveProvider({ sessionFile: '/after' })).toBe(true);
    // Orca filters query identifiers by truthiness, not by trimming.
    provider.sessionId = ' ';
    expect(registry.hasActiveProvider({ sessionId: ' ' })).toBe(true);
    first();
    first();
    expect(registry.hasActiveProvider({ sessionId: ' ' })).toBe(true);
    provider.isActive = () => false;
    expect(registry.hasActiveProvider({ sessionId: ' ' })).toBe(false);
    provider.isActive = () => true;
    second();
    expect(registry.hasActiveProvider({ sessionId: ' ' })).toBe(false);
  });

  it('throws for invalid providers without retaining activity', () => {
    delete globals[key];
    const registry = core.getOrInstallSessionLivenessRegistry();
    for (const provider of [
      null,
      undefined,
      false,
      'provider',
      {},
      Object.assign(function provider() {}, {
        sessionId: 'session',
        isActive: () => true,
      }),
      { name: 'test', sessionId: 'session', isActive: false },
      { name: '', sessionId: 'session', isActive: () => true },
      { name: 'test', sessionId: ' ', isActive: () => true },
      {
        name: 'test',
        sessionId: 'session',
        sessionFile: ' ',
        isActive: () => true,
      },
    ])
      expect(() =>
        registry?.register(provider as core.SessionLivenessProvider),
      ).toThrow('Session liveness provider is invalid');
    expect(registry?.hasActiveProvider({ sessionId: 'session' })).toBe(false);
  });
});
