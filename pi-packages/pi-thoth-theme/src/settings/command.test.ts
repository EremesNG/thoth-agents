import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import { getAnimationLevel, setAnimationLevel } from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../shared/config.ts';
import { registerThemeSettings } from './index.ts';

type OverlayFactory = (
  tui: unknown,
  theme: unknown,
  keys: unknown,
  close: (result: unknown) => void,
  host: { maxHeight(): number; requestRender(): void },
) => Component;

const overlay = vi.hoisted(() => ({
  panel: undefined as Component | undefined,
  requestRender: vi.fn(),
}));

vi.mock('@thoth-agents/pi-core/panel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@thoth-agents/pi-core/panel')>()),
  openPanelOverlay: (_ctx: unknown, factory: OverlayFactory) =>
    new Promise((resolve) => {
      overlay.panel = factory(
        {},
        { fg: (_role: string, value: string) => value },
        {},
        resolve,
        { maxHeight: () => 30, requestRender: overlay.requestRender },
      );
    }),
}));

const DOWN = '\u001b[B';
const RIGHT = '\u001b[C';
const ENTER = '\r';
const ESC = '\u001b';

let agentDir: string;
let path: string;
beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), 'pi-thoth-theme-settings-'));
  path = join(agentDir, 'pi-thoth-theme.json');
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  overlay.panel = undefined;
  overlay.requestRender.mockClear();
});
afterEach(() => {
  setAnimationLevel('full');
  vi.unstubAllEnvs();
  rmSync(agentDir, { recursive: true, force: true });
});

function setup(initial: object, ctxOverrides: object = {}) {
  writeFileSync(path, JSON.stringify(initial));
  const config = loadConfig();
  const registerCommand = vi.fn<ExtensionAPI['registerCommand']>();
  registerThemeSettings({ registerCommand } as unknown as ExtensionAPI, config);
  const ui = {
    notify: vi.fn(),
    setWorkingIndicator: vi.fn(),
    setWorkingMessage: vi.fn(),
  };
  const ctx = {
    hasUI: true,
    mode: 'tui',
    ui,
    ...ctxOverrides,
  } as unknown as ExtensionContext;
  const command = registerCommand.mock.calls.find(
    ([name]) => name === 'thoth-theme',
  )?.[1];
  if (!command) throw new Error('thoth-theme was not registered');
  return {
    config,
    ui,
    registerCommand,
    /** Starts the command; resolves once the panel exists. */
    async open() {
      const done = command.handler(
        '',
        ctx as Parameters<typeof command.handler>[1],
      );
      await Promise.resolve();
      return {
        done,
        press: (...keys: string[]) => {
          for (const key of keys) overlay.panel?.handleInput?.(key);
        },
        text: () => overlay.panel?.render(80).join('\n') ?? '',
      };
    },
  };
}

describe('/thoth-theme command', () => {
  it('registers only /thoth-theme', () => {
    const { registerCommand } = setup({});
    expect(registerCommand.mock.calls.map(([name]) => name)).toEqual([
      'thoth-theme',
    ]);
  });

  it.each([
    ['without a UI', { hasUI: false }],
    ['outside TUI mode', { mode: 'rpc' }],
  ])('requires the TUI %s', async (_name, ctx) => {
    const session = setup({}, ctx);
    await session.open();
    expect(overlay.panel).toBeUndefined();
    expect(session.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('TUI'),
      'error',
    );
  });

  it('persists, applies live settings and announces a reload only for module changes', async () => {
    const session = setup({
      icons: 'nerd',
      tools: { respectPackages: ['x'] },
      custom: 1,
    });
    const panel = await session.open();
    // icons → unicode, animation → minimal, density → line, welcome off
    panel.press(RIGHT, DOWN, RIGHT, RIGHT, DOWN, RIGHT, RIGHT);
    panel.press(DOWN, DOWN, DOWN, DOWN, ' ', ENTER);
    await panel.done;
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      icons: 'unicode',
      animation: 'minimal',
      tools: { respectPackages: ['x'], collapsed: 'line' },
      welcome: { enabled: false },
      custom: 1,
    });
    expect(session.config.icons).toBe('unicode');
    expect(session.config.tools.collapsed).toBe('line');
    expect(session.config.welcome.enabled).toBe(false);
    expect(getAnimationLevel()).toBe('minimal');
    expect(overlay.requestRender).toHaveBeenCalled();
    expect(session.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('/reload'),
      'info',
    );
  });

  it('applies animation changes live without a reload notice', async () => {
    const session = setup({ animation: 'reduced' });
    const panel = await session.open();
    panel.press(DOWN, RIGHT, RIGHT, ENTER);
    await panel.done;
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      animation: 'off',
    });
    expect(getAnimationLevel()).toBe('off');
    expect(session.ui.setWorkingIndicator).toHaveBeenCalled();
    expect(session.ui.notify).not.toHaveBeenCalled();
  });

  it('keeps the in-memory config and shows the error when the save fails', async () => {
    const session = setup({ animation: 'reduced' });
    rmSync(path);
    mkdirSync(path);
    const panel = await session.open();
    panel.press(DOWN, RIGHT, ENTER);
    expect(panel.text()).toContain('EISDIR');
    panel.press(ESC);
    await panel.done;
    expect(session.config.animation).toBe('reduced');
    expect(getAnimationLevel()).toBe('full');
    expect(session.ui.setWorkingIndicator).not.toHaveBeenCalled();
    expect(session.ui.notify).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a malformed config', async () => {
    const session = setup({});
    const panel = await session.open();
    writeFileSync(path, '{ "icons": ');
    panel.press(RIGHT, ENTER);
    expect(panel.text()).toContain('Save failed: Cannot save theme settings');
    panel.press(ESC);
    await panel.done;
    expect(readFileSync(path, 'utf8')).toBe('{ "icons": ');
    expect(session.config.icons).toBe('nerd');
  });

  it('writes nothing when saved without changes', async () => {
    const session = setup({ animation: 'reduced' });
    const panel = await session.open();
    panel.press(ENTER);
    await panel.done;
    expect(readFileSync(path, 'utf8')).toBe('{"animation":"reduced"}');
    expect(session.ui.notify).not.toHaveBeenCalled();
  });

  it('cancels without writing or applying', async () => {
    const session = setup({ animation: 'reduced' });
    const panel = await session.open();
    panel.press(RIGHT, DOWN, RIGHT, ESC);
    await panel.done;
    expect(readFileSync(path, 'utf8')).toBe('{"animation":"reduced"}');
    expect(session.config.icons).toBe('nerd');
    expect(session.ui.notify).not.toHaveBeenCalled();
  });
});
