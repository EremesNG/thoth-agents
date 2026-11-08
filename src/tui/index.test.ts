import { describe, expect, it, vi } from 'vitest';
import plugin from './index';

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
