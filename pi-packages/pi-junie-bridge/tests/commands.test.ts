import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { expect, test, vi } from 'vitest';
import extension from '../extensions/index.js';
import { readCatalog } from '../src/catalog.js';

// The public command boundary catches missing dispatch, stale catalogs and leaked UI status.
test('junie command reports quota on demand and refreshes registered models without inference', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-command-')),
    transcript = join(dir, 'wire.jsonl');
  const keys = [
    'PI_CODING_AGENT_DIR',
    'JUNIE_BRIDGE_LAUNCHER',
    'FAKE_STATS',
    'FAKE_TRANSCRIPT',
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
  process.env.PI_CODING_AGENT_DIR = dir;
  process.env.JUNIE_BRIDGE_LAUNCHER = shim;
  process.env.FAKE_STATS = 'success';
  process.env.FAKE_TRANSCRIPT = transcript;
  mkdirSync(join(dir, 'junie-bridge'));
  writeFileSync(
    join(dir, 'junie-bridge/models.json'),
    JSON.stringify({
      version: 1,
      models: [{ id: 'old', name: 'Old' }],
      efforts: [],
    }),
  );
  const key = Symbol.for('thoth-agents.pi-junie-bridge.registration.v1');
  Reflect.deleteProperty(globalThis, key);
  const commands = new Map<string, any>(),
    handlers = new Map<string, any>(),
    registerProvider = vi.fn();
  const ui = { notify: vi.fn(), setStatus: vi.fn() };
  const ctx = {
    cwd: dir,
    ui,
    sessionManager: { getSessionId: () => 'USER-SESSION' },
    modelRegistry: { getProvider: () => ({}) },
  };
  try {
    extension({
      registerProvider,
      registerCommand: (name: string, command: any) =>
        commands.set(name, command),
      on: (name: string, handler: any) => handlers.set(name, handler),
    } as unknown as ExtensionAPI);
    const command = commands.get('junie');
    expect(command).toBeDefined();
    await handlers.get('session_start')({}, ctx);
    await command.handler('', ctx);
    await command.handler('other', ctx);
    expect(
      ui.notify.mock.calls.every((call) => /quota.*models/.test(call[0])),
    ).toBe(true);
    await command.handler('quota', ctx);
    expect(ui.notify).toHaveBeenLastCalledWith(
      expect.stringContaining('Balance left: 64.75 credits'),
      'info',
    );
    expect(ui.setStatus).toHaveBeenCalledWith(
      'junie-quota',
      'checking junie quota…',
    );
    expect(ui.setStatus).toHaveBeenLastCalledWith('junie-quota', undefined);
    await command.handler('models', ctx);
    expect(ui.notify).toHaveBeenLastCalledWith(
      expect.stringMatching(/2.*models/i),
      'info',
    );
    expect(readCatalog(dir)?.models).toHaveLength(2);
    expect(registerProvider.mock.calls.at(-1)?.[1].models).toHaveLength(2);
    const wire = readFileSync(transcript, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(wire.filter((m) => m.method === 'initialize')).toHaveLength(2);
    expect(
      wire
        .filter((m) => m.method === 'session/prompt')
        .map((m) => m.params.prompt),
    ).toEqual([[{ type: 'text', text: '/stats' }]]);
    expect(wire.some((m) => m.params?.sessionId === 'USER-SESSION')).toBe(
      false,
    );
  } finally {
    await handlers.get('session_shutdown')?.({}, ctx);
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
    Reflect.deleteProperty(globalThis, key);
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}, 15000);
