import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { expect, test, vi } from 'vitest';
import extension from '../extensions/index.js';
import { readCatalog } from '../src/catalog.js';

test.skipIf(process.platform !== 'win32')(
  'first load with no cache refreshes models in the background without a prompt',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'junie-background-'));
    const keys = [
      'PI_CODING_AGENT_DIR',
      'JUNIE_BRIDGE_LAUNCHER',
      'FAKE_TRANSCRIPT',
    ] as const;
    const previous = keys.map((key) => process.env[key]);
    const fixture = fileURLToPath(
      new URL('./fixtures/fake-junie.cjs', import.meta.url),
    );
    const shim = join(dir, 'junie.bat');
    const transcript = join(dir, 'wire.jsonl');
    writeFileSync(
      shim,
      `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`,
    );
    process.env.PI_CODING_AGENT_DIR = dir;
    process.env.JUNIE_BRIDGE_LAUNCHER = shim;
    process.env.FAKE_TRANSCRIPT = transcript;
    Reflect.deleteProperty(
      globalThis,
      Symbol.for('thoth-agents.pi-junie-bridge.registration.v1'),
    );
    const registerProvider = vi.fn();
    try {
      extension({
        registerEntryRenderer: () => {},
        registerProvider,
        registerCommand: () => {},
        on: () => {},
      } as unknown as ExtensionAPI);
      expect(registerProvider.mock.calls[0][1].models).toEqual([]);
      await expect
        .poll(() => readCatalog(dir), { timeout: 8000 })
        .toMatchObject({
          models: [
            { id: 'v1:12:jetbrains-ai:gemini-3.7-flash' },
            { id: 'mix.auto' },
          ],
        });
      await expect.poll(() => registerProvider.mock.calls.length).toBe(2);
      expect(registerProvider.mock.calls[1][1].models).toHaveLength(2);
      const { readFileSync } = await import('node:fs');
      expect(readFileSync(transcript, 'utf8')).not.toContain('session/prompt');
    } finally {
      keys.forEach((key, i) => {
        if (previous[i] === undefined) delete process.env[key];
        else process.env[key] = previous[i];
      });
      Reflect.deleteProperty(
        globalThis,
        Symbol.for('thoth-agents.pi-junie-bridge.registration.v1'),
      );
      rmSync(dir, { recursive: true, force: true });
    }
  },
  10000,
);

test('registers cached Junie models and guards a shared registry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-ext-')),
    old = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  mkdirSync(join(dir, 'junie-bridge'));
  writeFileSync(
    join(dir, 'junie-bridge/models.json'),
    JSON.stringify({
      version: 3,
      refreshedAt: '2026-11-12',
      models: [{ id: 'mix.auto', name: 'Auto' }],
      efforts: ['low', 'medium', 'high'],
    }),
  );
  const registerProvider = vi.fn(),
    handlers: ((event: unknown, ctx: unknown) => unknown)[] = [];
  const pi = {
    registerEntryRenderer: () => {},
    registerProvider,
    registerCommand: () => {},
    on: (_name: string, handler: (event: unknown, ctx: unknown) => unknown) =>
      handlers.push(handler),
  } as unknown as ExtensionAPI;
  try {
    extension(pi);
    expect(registerProvider).toHaveBeenCalledWith(
      'junie',
      expect.objectContaining({
        api: 'junie-bridge',
        baseUrl: 'junie-bridge://junie',
        apiKey: expect.any(String),
        models: [expect.objectContaining({ id: 'mix.auto' })],
      }),
    );
    registerProvider.mockClear();
    handlers.length = 0;
    extension(pi);
    expect(registerProvider).not.toHaveBeenCalled();
    const getProvider = vi.fn(() => ({ id: 'junie' }));
    await handlers[0](
      {},
      {
        cwd: dir,
        sessionManager: { getSessionId: () => 'pi-test' },
        modelRegistry: { getProvider },
      },
    );
    expect(registerProvider).not.toHaveBeenCalled();
    await handlers[0](
      {},
      {
        cwd: dir,
        sessionManager: { getSessionId: () => 'pi-test' },
        modelRegistry: { getProvider: () => undefined },
      },
    );
    expect(registerProvider).toHaveBeenCalledTimes(1);
  } finally {
    if (old === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = old;
    rmSync(dir, { recursive: true, force: true });
  }
});

test.each([
  true,
  false,
])('session lifecycle captures UI only when available, releases it on shutdown, and routes native approval (UI: %s)', async (hasUI) => {
  const { chmodSync, readFileSync } = await import('node:fs');
  const { normalizeContext } = await import('@earendil-works/pi-ai');
  const dir = mkdtempSync(join(tmpdir(), 'junie-lifecycle-'));
  const keys = [
    'PI_CODING_AGENT_DIR',
    'JUNIE_HOME',
    'JUNIE_BRIDGE_LAUNCHER',
    'FAKE_TRANSCRIPT',
    'FAKE_STREAM',
    'FAKE_NATIVE_PERMISSION',
    'FAKE_NATIVE_DETAIL',
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  const fixture = fileURLToPath(
    new URL('./fixtures/fake-junie.cjs', import.meta.url),
  );
  const shim = join(dir, process.platform === 'win32' ? 'junie.bat' : 'junie');
  writeFileSync(
    shim,
    process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`,
  );
  chmodSync(shim, 0o755);
  const transcript = join(dir, 'wire.jsonl');
  process.env.PI_CODING_AGENT_DIR = dir;
  process.env.JUNIE_BRIDGE_LAUNCHER = shim;
  process.env.FAKE_TRANSCRIPT = transcript;
  process.env.FAKE_STREAM = '1';
  process.env.FAKE_NATIVE_PERMISSION = '1';
  process.env.FAKE_NATIVE_DETAIL = '1';
  // Local Junie session settings drive the display-only per-turn model line.
  process.env.JUNIE_HOME = join(dir, 'junie');
  mkdirSync(join(dir, 'junie', 'sessions', 'fake-session'), {
    recursive: true,
  });
  writeFileSync(
    join(dir, 'junie', 'sessions', 'fake-session', 'settings.json'),
    JSON.stringify({
      formatVersion: 1,
      model: { modelId: 'gpt-6.1-terra', effortWireId: 'low' },
    }),
  );
  mkdirSync(join(dir, 'junie-bridge'));
  writeFileSync(
    join(dir, 'junie-bridge/models.json'),
    JSON.stringify({
      version: 3,
      models: [{ id: 'mix.auto', name: 'Auto' }],
      efforts: [],
    }),
  );
  Reflect.deleteProperty(
    globalThis,
    Symbol.for('thoth-agents.pi-junie-bridge.registration.v1'),
  );
  const registerProvider = vi.fn(),
    handlers = new Map<string, any>();
  const appendEntry = vi.fn(),
    registerEntryRenderer = vi.fn();
  try {
    extension({
      appendEntry,
      registerEntryRenderer,
      registerProvider,
      registerCommand: () => {},
      on: (name: string, handler: any) => handlers.set(name, handler),
    } as unknown as ExtensionAPI);
    expect(registerEntryRenderer).toHaveBeenCalledWith(
      'junie-native-event',
      expect.any(Function),
    );
    expect(handlers.has('session_shutdown')).toBe(true);
    const config = registerProvider.mock.calls[0][1];
    const ctx = {
      hasUI,
      ui: { select: async () => 'Allow once' },
      cwd: dir,
      sessionManager: { getSessionId: () => 'pi-session' },
      modelRegistry: { getProvider: () => ({}) },
    };
    const childAppend = vi.fn();
    extension({
      registerProvider,
      registerEntryRenderer: () => {},
      appendEntry: childAppend,
      registerCommand: () => {},
      on: (name: string, handler: any) => handlers.set(name, handler),
    } as unknown as ExtensionAPI);
    await handlers.get('session_start')({}, ctx);
    const model = config.models[0],
      input = normalizeContext({
        messages: [{ role: 'user', content: 'Hi', timestamp: 1 }],
      });
    const first = await config
      .streamSimple(model, input, { sessionId: 'pi-session' })
      .result();
    expect(first.stopReason).toBe('stop');
    // A display line belongs to the turn that produced it: a turn started before
    // it resolved drops it, so each turn's entries settle before the next one.
    if (hasUI)
      await expect
        .poll(() => childAppend.mock.calls.length, { timeout: 5000 })
        .toBe(2);
    const next = normalizeContext({
      messages: [
        ...input.messages,
        first,
        { role: 'user', content: 'Next', timestamp: 2 },
      ],
    });
    const second = await config
      .streamSimple(model, next, { sessionId: 'pi-session' })
      .result();
    expect(second.stopReason).toBe('stop');
    // Display lines are fire-and-forget: settlement is not tied to the turn or
    // shutdown, so wait for the entries before the sink is released.
    if (hasUI)
      await expect
        .poll(() => childAppend.mock.calls.length, { timeout: 5000 })
        .toBe(4);
    await handlers.get('session_shutdown')({}, ctx);
    await handlers.get('session_start')({}, { ...ctx, hasUI: false });
    const resumed = normalizeContext({
      messages: [
        ...next.messages,
        second,
        { role: 'user', content: 'After restart', timestamp: 3 },
      ],
    });
    expect(
      (
        await config
          .streamSimple(model, resumed, { sessionId: 'pi-session' })
          .result()
      ).stopReason,
    ).toBe('stop');
    await handlers.get('session_shutdown')({}, ctx);
    expect(appendEntry).not.toHaveBeenCalled();
    // Display-only entries follow the session headless policy: two turns of
    // native activity plus a per-turn model line with a UI, none without.
    expect(childAppend).toHaveBeenCalledTimes(hasUI ? 4 : 0);
    if (hasUI) {
      expect(childAppend.mock.calls[0]).toEqual([
        'junie-native-event',
        expect.objectContaining({ title: 'Edit file', status: 'completed' }),
      ]);
      const entries = childAppend.mock.calls.map((call) => call[1]);
      expect(
        entries.filter((entry) => entry.title === 'Edit file'),
      ).toHaveLength(2);
      expect(entries.filter((entry) => entry.usageLine)).toEqual([
        { usageLine: 'Junie · mix.auto → gpt-6.1-terra (low)' },
        { usageLine: 'Junie · mix.auto → gpt-6.1-terra (low)' },
      ]);
    }
    const wire = readFileSync(transcript, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(
      wire
        .filter((m) => m.method === 'fixture/native_decision')
        .map((m) => m.params.outcome),
    ).toEqual([
      { outcome: 'selected', optionId: hasUI ? 'yes' : 'no' },
      { outcome: 'selected', optionId: hasUI ? 'yes' : 'no' },
      { outcome: 'selected', optionId: 'no' },
    ]);
    expect(wire.filter((m) => m.method === 'initialize')).toHaveLength(2);
    expect(
      wire.filter((m) => m.method === 'session/new').map((m) => m.params.cwd),
    ).toEqual([dir]);
    expect(
      wire
        .filter((m) => m.method === 'session/resume')
        .map((m) => m.params.cwd),
    ).toEqual([dir]);
  } finally {
    await handlers.get('session_shutdown')?.(
      {},
      {
        sessionManager: { getSessionId: () => 'pi-session' },
      },
    );
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
    Reflect.deleteProperty(
      globalThis,
      Symbol.for('thoth-agents.pi-junie-bridge.registration.v1'),
    );
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}, 15000);

const KEY = Symbol.for('thoth-agents.pi-junie-bridge.registration.v1');

// A cached catalog keeps first-load discovery off the wire: these tests are
// about the process-global state, not model refresh.
function cachedAgentDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'junie-reload-'));
  mkdirSync(join(dir, 'junie-bridge'));
  writeFileSync(
    join(dir, 'junie-bridge/models.json'),
    JSON.stringify({
      version: 3,
      models: [{ id: 'mix.auto', name: 'Auto' }],
      efforts: [],
    }),
  );
  return dir;
}

function fakePi() {
  const appendEntry = vi.fn(),
    registerProvider = vi.fn(),
    handlers = new Map<string, any>();
  const pi = {
    appendEntry,
    registerEntryRenderer: () => {},
    registerProvider,
    registerCommand: () => {},
    on: (name: string, handler: any) => handlers.set(name, handler),
  } as unknown as ExtensionAPI;
  return { pi, appendEntry, registerProvider, handlers };
}

function sessionCtx(dir: string, hasUI = false) {
  return {
    hasUI,
    ui: { select: async () => 'Allow once' },
    cwd: dir,
    sessionManager: { getSessionId: () => 'pi-reload' },
    modelRegistry: { getProvider: () => ({ id: 'junie' }) },
  };
}

// The process-global state survives /reload, so a state written by the previous
// bundle must never be reused by the new one.
async function withLegacyState(
  provider: Record<string, unknown>,
  body: (seeded: {
    pi: ReturnType<typeof fakePi>;
    dir: string;
  }) => Promise<void>,
): Promise<void> {
  const dir = cachedAgentDir(),
    previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  // No version marker and no nativeSinks: the shape left by the bundle that
  // crashed on /reload.
  (globalThis as any)[KEY] = { sessions: new Map(), ui: new Map(), provider };
  const seeded = { pi: fakePi(), dir };
  try {
    await body(seeded);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    Reflect.deleteProperty(globalThis, KEY);
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}

test('replaces a pre-upgrade global state instead of reusing its stale provider', async () => {
  const legacyClose = vi.fn(async () => {}),
    legacyStreamSimple = () => {
      throw new Error('stale provider used');
    };
  await withLegacyState(
    { close: legacyClose, streamSimple: legacyStreamSimple },
    async ({ pi, dir }) => {
      extension(pi.pi);
      const config = pi.registerProvider.mock.calls[0][1];
      expect(config.streamSimple).not.toBe(legacyStreamSimple);
      expect(config.models).toHaveLength(1);
      expect(legacyClose).toHaveBeenCalledTimes(1);
      // Pre-fix this threw: the stale state had no nativeSinks map.
      await pi.handlers.get('session_start')({}, sessionCtx(dir));
      await pi.handlers.get('session_start')({}, sessionCtx(dir, true));
      await pi.handlers.get('session_shutdown')({}, sessionCtx(dir));
      expect(pi.appendEntry).not.toHaveBeenCalled();
    },
  );
});

test.each([
  [
    'throw',
    () => {
      throw new Error('close failed');
    },
  ],
  ['reject', () => Promise.reject(new Error('close failed'))],
])('swallows errors while disposing the previous provider (%s)', async (_kind, close) => {
  const legacyClose = vi.fn(close);
  await withLegacyState(
    { close: legacyClose, streamSimple: () => {} },
    async ({ pi }) => {
      expect(() => extension(pi.pi)).not.toThrow();
      expect(legacyClose).toHaveBeenCalledTimes(1);
      expect(pi.registerProvider).toHaveBeenCalledTimes(1);
    },
  );
});

test('replaces a same-version state whose provider cannot close', async () => {
  const legacyStreamSimple = () => {
    throw new Error('stale provider used');
  };
  await withLegacyState(
    { streamSimple: legacyStreamSimple },
    async ({ pi, dir }) => {
      Object.assign((globalThis as any)[KEY], {
        version: 2,
        nativeSinks: new Map(),
      });
      extension(pi.pi);
      const config = pi.registerProvider.mock.calls[0][1];
      expect(config.streamSimple).not.toBe(legacyStreamSimple);
      await pi.handlers.get('session_start')({}, sessionCtx(dir));
      await pi.handlers.get('session_shutdown')({}, sessionCtx(dir));
    },
  );
});

test('reuses same-version state across a reload', async () => {
  const dir = cachedAgentDir(),
    previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  const pi = fakePi();
  try {
    extension(pi.pi);
    const state = (globalThis as any)[KEY],
      provider = state.provider;
    expect(pi.registerProvider).toHaveBeenCalledTimes(1);
    pi.registerProvider.mockClear();
    pi.handlers.clear();
    // A reload of the same bundle version: in-process subagent and session
    // sharing depends on this state object surviving.
    extension(pi.pi);
    expect((globalThis as any)[KEY]).toBe(state);
    expect((globalThis as any)[KEY].provider).toBe(provider);
    expect(pi.registerProvider).not.toHaveBeenCalled();
    await pi.handlers.get('session_start')({}, sessionCtx(dir));
    expect(pi.registerProvider).not.toHaveBeenCalled();
    await pi.handlers.get('session_shutdown')({}, sessionCtx(dir));
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    Reflect.deleteProperty(globalThis, KEY);
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});
