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
import { normalizeContext } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, expect, test, vi } from 'vitest';
import extension from '../extensions/index.js';
import { createSessionStore } from '../src/session-store.js';

const key = Symbol.for('thoth-agents.pi-junie-bridge.registration.v1');
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  Reflect.deleteProperty(globalThis, key);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'junie-isolation-'));
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
  vi.stubEnv('PI_CODING_AGENT_DIR', dir);
  vi.stubEnv('JUNIE_BRIDGE_LAUNCHER', shim);
  vi.stubEnv('FAKE_TRANSCRIPT', join(dir, 'wire.jsonl'));
  vi.stubEnv('FAKE_STREAM', '1');
  mkdirSync(join(dir, 'junie-bridge'));
  writeFileSync(
    join(dir, 'junie-bridge/models.json'),
    JSON.stringify({
      version: 3,
      models: [{ id: 'mix.auto', name: 'Auto' }],
      efforts: [],
    }),
  );
  Reflect.deleteProperty(globalThis, key);
  const handlers = new Map<string, any>();
  const registerProvider = vi.fn();
  extension({
    registerEntryRenderer: () => {},
    registerProvider,
    registerCommand: () => {},
    on: (name: string, handler: any) => handlers.set(name, handler),
  } as unknown as ExtensionAPI);
  const config = registerProvider.mock.calls[0][1];
  const contexts = new Map<string, any>();
  const start = async (id: string, hasUI = false) => {
    const cwd = join(dir, id);
    mkdirSync(cwd, { recursive: true });
    const ctx = {
      cwd,
      hasUI,
      ui: { select: vi.fn(async () => 'Allow once') },
      sessionManager: { getSessionId: () => id },
      modelRegistry: { getProvider: () => ({}) },
    };
    contexts.set(id, ctx);
    await handlers.get('session_start')({}, ctx);
    return ctx;
  };
  const shutdown = (id: string) =>
    handlers.get('session_shutdown')({}, contexts.get(id));
  cleanup.push(async () => {
    for (const id of contexts.keys()) await shutdown(id);
    await (globalThis as any)[key]?.provider.close();
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });
  const input = normalizeContext({
    messages: [{ role: 'user', content: 'Hello', timestamp: 1 }],
  });
  return {
    dir,
    start,
    shutdown,
    input,
    turn: (
      id: string,
      context = input,
      options: Record<string, unknown> = {},
    ) =>
      config
        .streamSimple(config.models[0], context, { sessionId: id, ...options })
        .result(),
    store: createSessionStore(join(dir, 'junie-bridge', 'sessions')),
    wire: () =>
      readFileSync(join(dir, 'wire.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
  };
}

test('headless child cannot borrow parent permission UI, including without a session_start entry', async () => {
  vi.stubEnv('FAKE_NATIVE_PERMISSION', '1');
  const h = setup();
  const parent = await h.start('PARENT', true);
  expect((await h.turn('UNREGISTERED-CHILD')).stopReason).toBe('stop');
  await h.start('CHILD');
  expect((await h.turn('CHILD')).stopReason).toBe('stop');
  expect(parent.ui.select).not.toHaveBeenCalled();
  expect((await h.turn('PARENT')).stopReason).toBe('stop');
  expect(parent.ui.select).toHaveBeenCalledTimes(1);
  expect(
    h
      .wire()
      .filter((m) => m.method === 'fixture/native_decision')
      .map((m) => m.params.outcome.optionId),
  ).toEqual(['no', 'no', 'yes']);
  expect(h.store.load('CHILD')).toMatchObject({ cwd: join(h.dir, 'CHILD') });
  expect(h.store.load('PARENT')).toMatchObject({ cwd: join(h.dir, 'PARENT') });
});

test.each([
  'PARENT',
  'CHILD',
])('parked %s survives an interleaved call and shutdown of the other session', async (survivor) => {
  const h = setup();
  const other = survivor === 'PARENT' ? 'CHILD' : 'PARENT';
  await h.start(survivor, true);
  const tools = normalizeContext({
    messages: [{ role: 'user', content: 'Read a file', timestamp: 1 }],
    tools: [
      {
        name: 'read',
        description: 'Read file',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
    ],
  });
  vi.stubEnv('FAKE_MCP', '1');
  const parked = await h.turn(survivor, tools);
  expect(parked.stopReason, parked.errorMessage).toBe('toolUse');
  const call = parked.content.find((block: any) => block.type === 'toolCall');
  vi.stubEnv('FAKE_MCP', '');
  await h.start(other);
  expect((await h.turn(other)).stopReason).toBe('stop');
  expect(h.store.load(other)).toMatchObject({ cwd: join(h.dir, other) });
  await h.shutdown(other);
  const continued = await h.turn(
    survivor,
    normalizeContext({
      messages: [
        ...tools.messages,
        parked,
        {
          role: 'toolResult',
          toolCallId: call.id,
          toolName: 'read',
          isError: false,
          content: [{ type: 'text', text: 'file contents' }],
          timestamp: 2,
        },
      ],
    }),
  );
  expect(continued.stopReason, continued.errorMessage).toBe('stop');
  expect(continued.content).toEqual([
    { type: 'text', text: 'Tool results received in same turn' },
  ]);
  expect(h.wire().filter((m) => m.method === 'initialize')).toHaveLength(2);
  expect(
    h
      .wire()
      .filter((m) => m.method === 'fixture/mcp_result')
      .map((m) => m.params.isError),
  ).toEqual([false]);
  expect(h.store.load(survivor)).toMatchObject({ cwd: join(h.dir, survivor) });
});

test('missing session metadata warns and uses only session-local ephemeral process cwd state', async () => {
  const h = setup();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await h.start('PARENT', true);
  expect((await h.turn('UNREGISTERED-CHILD')).stopReason).toBe('stop');
  expect(h.wire().find((m) => m.method === 'session/new').params.cwd).toBe(
    process.cwd(),
  );
  expect(warning).toHaveBeenCalledWith(
    expect.stringMatching(/UNREGISTERED-CHILD.*cwd.*ephemeral/i),
  );
  expect(h.store.load('UNREGISTERED-CHILD')).toBeNull();
});

test.each([
  'call',
  'context',
])('missing session metadata prefers %s cwd to the host or another session', async (source) => {
  const h = setup();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await h.start('PARENT', true);
  const cwd = join(h.dir, 'unregistered-workspace');
  mkdirSync(cwd);
  const context = source === 'context' ? { ...h.input, cwd } : h.input;
  const options = source === 'call' ? { cwd } : {};
  expect(
    (await h.turn('UNREGISTERED-CHILD', context, options)).stopReason,
  ).toBe('stop');
  expect(h.wire().find((m) => m.method === 'session/new').params.cwd).toBe(cwd);
  expect(warning).not.toHaveBeenCalled();
});
