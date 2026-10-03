import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionStartEvent,
} from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import thothTheme from './index.ts';

type LifecycleHandler = (
  event: SessionStartEvent,
  ctx: ExtensionContext,
) => void | Promise<void>;
type ModuleName = 'statusLine' | 'tools' | 'welcome';

let agentDir: string;

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), 'pi-thoth-theme-composition-'));
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(agentDir, { recursive: true, force: true });
});

function loadTheme(
  config: Partial<Record<ModuleName, { enabled: boolean }>> = {},
) {
  writeFileSync(join(agentDir, 'pi-thoth-theme.json'), JSON.stringify(config));
  const subscriptions: Array<{
    event: string;
    handler: LifecycleHandler;
  }> = [];
  const registerTool = vi.fn();
  const registerToolRenderer = vi.fn<ExtensionAPI['registerToolRenderer']>();
  const registerMarkdownTransformer = vi.fn();
  const on = vi.fn((event: string, handler: LifecycleHandler) => {
    subscriptions.push({ event, handler });
    return () => {};
  });
  const settingsAccess = vi.fn(() => {
    throw new Error('Pi settings are unavailable during extension load');
  });
  const pi = {
    registerTool,
    registerToolRenderer,
    registerMarkdownTransformer,
    on,
    get getSettings() {
      return settingsAccess();
    },
  } as unknown as ExtensionAPI;
  const ui = {
    setFooter: vi.fn<ExtensionContext['ui']['setFooter']>(),
    setHeader: vi.fn<ExtensionContext['ui']['setHeader']>(),
    setEditorComponent: vi.fn<ExtensionContext['ui']['setEditorComponent']>(),
  };
  const ctx = {
    hasUI: true,
    ui,
    get getSettings() {
      return settingsAccess();
    },
  } as unknown as ExtensionContext;

  thothTheme(pi);

  return {
    registerTool,
    registerToolRenderer,
    registerMarkdownTransformer,
    on,
    ui,
    settingsAccess,
    async start() {
      const handlers = subscriptions.filter(
        ({ event }) => event === 'session_start',
      );
      if (handlers.length === 0)
        throw new Error('session_start was not registered');
      for (const { handler } of handlers) {
        await handler({ type: 'session_start', reason: 'startup' }, ctx);
      }
    },
  };
}

describe('Thoth extension composition', () => {
  it('installs default surfaces without Pi settings or the editor slot', async () => {
    const session = loadTheme();

    expect(session.registerTool).not.toHaveBeenCalled();
    expect(session.registerToolRenderer).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
    );
    expect(session.registerMarkdownTransformer).not.toHaveBeenCalled();
    expect(session.on).toHaveBeenCalledWith(
      'session_start',
      expect.any(Function),
    );
    expect(session.settingsAccess).not.toHaveBeenCalled();
    expect(session.ui.setFooter).not.toHaveBeenCalled();
    expect(session.ui.setHeader).not.toHaveBeenCalled();
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();

    await session.start();

    expect(session.ui.setFooter).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
    );
    expect(session.ui.setHeader).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
    );
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();
  });

  it.each([
    {
      disabled: 'statusLine',
      resolverCount: 1,
      footerCount: 0,
      headerCount: 1,
      transformerCount: 0,
    },
    {
      disabled: 'tools',
      resolverCount: 0,
      footerCount: 1,
      headerCount: 1,
      transformerCount: 0,
    },
    {
      disabled: 'welcome',
      resolverCount: 1,
      footerCount: 1,
      headerCount: 0,
      transformerCount: 0,
    },
  ] as const)('leaves native $disabled behavior while retaining other defaults', async ({
    disabled,
    resolverCount,
    footerCount,
    headerCount,
    transformerCount,
  }) => {
    const session = loadTheme({ [disabled]: { enabled: false } });

    await session.start();

    expect(session.registerTool).not.toHaveBeenCalled();
    expect(session.registerToolRenderer).toHaveBeenCalledTimes(resolverCount);
    expect(session.registerMarkdownTransformer).toHaveBeenCalledTimes(
      transformerCount,
    );
    expect(session.ui.setFooter).toHaveBeenCalledTimes(footerCount);
    expect(session.ui.setHeader).toHaveBeenCalledTimes(headerCount);
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();
  });

  it('leaves every native surface untouched when all modules are disabled', async () => {
    const session = loadTheme({
      statusLine: { enabled: false },
      tools: { enabled: false },
      welcome: { enabled: false },
    });

    await session.start();

    expect(session.registerTool).not.toHaveBeenCalled();
    expect(session.registerToolRenderer).not.toHaveBeenCalled();
    expect(session.registerMarkdownTransformer).not.toHaveBeenCalled();
    expect(session.ui.setFooter).not.toHaveBeenCalled();
    expect(session.ui.setHeader).not.toHaveBeenCalled();
    expect(session.ui.setEditorComponent).not.toHaveBeenCalled();
  });
});
