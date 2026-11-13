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
      version: 1,
      refreshedAt: '2026-11-12',
      models: [{ id: 'mix.auto', name: 'Auto' }],
      efforts: ['low', 'medium', 'high'],
    }),
  );
  const registerProvider = vi.fn(),
    handlers: ((event: unknown, ctx: unknown) => unknown)[] = [];
  const pi = {
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
    'JUNIE_BRIDGE_LAUNCHER',
    'FAKE_TRANSCRIPT',
    'FAKE_STREAM',
    'FAKE_NATIVE_PERMISSION',
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
  mkdirSync(join(dir, 'junie-bridge'));
  writeFileSync(
    join(dir, 'junie-bridge/models.json'),
    JSON.stringify({
      version: 1,
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
  try {
    extension({
      registerProvider,
      registerCommand: () => {},
      on: (name: string, handler: any) => handlers.set(name, handler),
    } as unknown as ExtensionAPI);
    expect(handlers.has('session_shutdown')).toBe(true);
    const config = registerProvider.mock.calls[0][1];
    const ctx = {
      hasUI,
      ui: { select: async () => 'Allow once' },
      cwd: dir,
      sessionManager: { getSessionId: () => 'pi-session' },
      modelRegistry: { getProvider: () => ({}) },
    };
    await handlers.get('session_start')({}, ctx);
    const model = config.models[0],
      input = normalizeContext({
        messages: [{ role: 'user', content: 'Hi', timestamp: 1 }],
      });
    const first = await config
      .streamSimple(model, input, { sessionId: 'pi-session' })
      .result();
    expect(first.stopReason).toBe('stop');
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
