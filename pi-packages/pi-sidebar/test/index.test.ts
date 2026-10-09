import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import sidebar from '../src/index.js';

it('registers sidebar lifecycle and command without shortcuts; headless activation installs no UI', async () => {
  const handlers = new Map<string, (event: any, ctx: any) => unknown>();
  const commands = new Map<string, any>();
  const shortcuts = new Map<string, any>();
  sidebar({
    on: (name: string, handler: (event: any, ctx: any) => unknown) => {
      handlers.set(name, handler);
    },
    registerCommand: (name: string, options: any) =>
      commands.set(name, options),
    registerShortcut: (name: string, options: any) =>
      shortcuts.set(name, options),
  } as unknown as ExtensionAPI);
  expect(commands.has('sidebar')).toBe(true);
  expect(shortcuts.size).toBe(0);
  expect(commands.get('sidebar').description).toContain('resize');
  expect(commands.get('sidebar').getArgumentCompletions('res')).toEqual([
    { value: 'resize', label: 'resize' },
  ]);
  const ui = { setWidget: vi.fn() };
  await handlers.get('session_start')?.(
    { reason: 'startup' },
    { mode: 'print', hasUI: false, ui },
  );
  expect(ui.setWidget).not.toHaveBeenCalled();
  await handlers.get('session_shutdown')?.({}, { mode: 'print', ui });
});

afterEach(() => vi.restoreAllMocks());
