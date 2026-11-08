import type { Plugin } from '@opencode/plugin';
import { expect, test, vi } from 'vitest';
import plugin from './index.js';
import tui from './tui/index.js';

test('server entry composes account registry and provider parity and cleans up registrations', async () => {
  expect(plugin.id).toBe('thoth-multi-codex');
  const dispose = vi.fn(async () => {});
  const transform = vi.fn(async () => ({ dispose }));
  const hook = vi.fn(async (_name: string) => ({ dispose }));
  const ctx = {
    options: {},
    storage: { get: async () => undefined, set: async () => {} },
    integration: { list: async () => ({ data: [] }) },
    provider: { transform },
    model: { transform },
    session: { hook },
    rpc: { register: vi.fn(async () => ({ dispose })) },
  } as unknown as Plugin.Context;
  const cleanup = await plugin.setup(ctx);
  expect(transform).toHaveBeenCalledTimes(2);
  expect(hook.mock.calls.map((call) => call[0])).toEqual([
    'model.request',
    'context',
    'compaction',
    'model.request',
    'http.request',
    'experimental.ws.handshake',
    'http.response',
    'http.response',
    'experimental.ws.receive',
    'retry',
  ]);
  await cleanup();
  expect(dispose).toHaveBeenCalledTimes(12);
});

test('TUI entry registers four native slash commands with one shared panel guard', async () => {
  expect(tui.id).toBe('thoth-multi-codex.tui');
  let finish: ((value: unknown) => void) | undefined;
  const state = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const layer = vi.fn();
  const context = {
    client: { rpc: () => ({ state }) },
    keymap: { layer },
    ui: {
      router: { current: () => ({ type: 'session', sessionID: 'child' }) },
      dialog: { select: vi.fn(), confirm: vi.fn(), alert: vi.fn() },
      toast: { show: vi.fn() },
    },
  } as unknown as Parameters<typeof tui.setup>[0];
  expect(tui.setup(context)).toBeUndefined();
  const commands = layer.mock.calls[0][0]().commands;
  expect(
    commands.map((command: { slash: { name: string } }) => command.slash.name),
  ).toEqual(['codex-add', 'codex-remove', 'codex-switch', 'codex-status']);
  const running = commands[0].run();
  await commands[1].run();
  expect(state).toHaveBeenCalledExactlyOnceWith({ sessionID: 'child' });
  finish?.({
    ok: false,
    error: { code: 'OPERATION_FAILED', message: 'offline' },
  });
  await running;
  const next = commands[2].run();
  expect(state).toHaveBeenCalledTimes(2);
  finish?.({
    ok: false,
    error: { code: 'OPERATION_FAILED', message: 'offline' },
  });
  await next;
});
