import type { Plugin } from '@opencode/plugin/tui';
import { describe, expect, it, vi } from 'vitest';
import { profileRpc } from '../opencode/profile-rpc';
import { toolRpc } from '../opencode/tool-rpc';
import plugin from './index';

type Context = Parameters<Plugin.Definition['setup']>[0];

describe('tui entry', () => {
  it('registers both slash commands sharing one reentrancy guard', async () => {
    let layer:
      | (() => { commands: { slash: { name: string }; run(): unknown }[] })
      | undefined;
    let release: (() => void) | undefined;
    const select = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          release = () => resolve(undefined);
        }),
    );
    const state = async () => ({
      ok: true,
      value: { specialists: [], inventory: [], roles: [], warnings: [] },
    });
    plugin.setup({
      location: { directory: 'C:/home-project' },
      client: { rpc: () => ({ state }) },
      ui: {
        router: { current: () => ({ type: 'home' }) },
        dialog: { select, prompt: vi.fn(), confirm: vi.fn(), alert: vi.fn() },
        toast: { show: vi.fn() },
      },
      keymap: {
        layer: (fn: never) => {
          layer = fn;
        },
      },
    } as never);
    const commands = layer?.().commands ?? [];
    expect(commands.map((c) => c.slash.name)).toEqual([
      'subagents-model',
      'subagents-tools',
    ]);
    const tools = commands[1];
    const first = tools.run();
    await vi.waitFor(() => expect(select).toHaveBeenCalledOnce());
    await commands[0].run(); // guarded: returns immediately
    await tools.run();
    expect(select).toHaveBeenCalledOnce();
    release?.();
    await first;
  });
});

it.each([
  { slash: 'subagents-tools', definition: toolRpc, input: {} },
  {
    slash: 'subagents-model',
    definition: profileRpc,
    input: { sessionID: 'session-test' },
  },
])('routes /$slash to the location active when opened', async ({
  slash,
  definition,
  input,
}) => {
  const state = vi.fn().mockResolvedValue({
    ok: false,
    error: {
      code: 'OPERATION_FAILED',
      message: 'Stop after the initial request',
    },
  });
  const rpc = vi.fn(() => ({ state }));
  const layer = vi.fn<Context['keymap']['layer']>();
  let location: { directory: string } | undefined;
  let route: ReturnType<Context['ui']['router']['current']> = { type: 'home' };
  const home = { directory: 'C:/home-project' };
  const session = { directory: 'C:/session-project' };
  await plugin.setup({
    get location() {
      return location;
    },
    data: { location: { default: () => home } },
    client: { rpc },
    keymap: { layer },
    ui: {
      dialog: {},
      router: { current: () => route },
      toast: { show: vi.fn() },
    },
  } as unknown as Context);
  const [getLayer] = layer.mock.calls[0];
  const command = getLayer().commands?.find(
    (command) => command.slash?.name === slash,
  );
  if (!command) throw new Error(`Missing /${slash} command`);

  await command.run();
  location = session;
  route = { type: 'session', sessionID: 'session-test' };
  await command.run();

  expect(rpc).toHaveBeenCalledWith(definition);
  expect(state.mock.calls).toEqual([
    [{}, { location: home }],
    [input, { location: session }],
  ]);
});
