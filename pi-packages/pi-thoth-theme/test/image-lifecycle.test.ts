import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionStartEvent,
} from '@earendil-works/pi-coding-agent';
import {
  getCapabilities,
  resetCapabilitiesCache,
  setCapabilityOverrides,
} from '@earendil-works/pi-tui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import thothTheme from '../src/index.ts';

type LifecycleEvent = SessionStartEvent | AgentStartEvent;
type LifecycleHandler = (
  event: LifecycleEvent,
  ctx: ExtensionContext,
) => void | Promise<void>;

const settingsOverrides = { trueColor: false, hyperlinks: true };
let agentDir: string;

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), 'pi-thoth-theme-images-'));
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('TERM_PROGRAM', 'Orca');
  vi.stubEnv('TERM', 'xterm-256color');
  for (const key of [
    'TMUX',
    'PI_IMAGE_PROTOCOL',
    'KITTY_WINDOW_ID',
    'GHOSTTY_RESOURCES_DIR',
    'WEZTERM_PANE',
    'WARP_SESSION_ID',
    'WARP_TERMINAL_SESSION_UUID',
    'ITERM_SESSION_ID',
  ]) {
    vi.stubEnv(key, undefined);
  }
  setCapabilityOverrides(settingsOverrides);
  resetCapabilitiesCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  setCapabilityOverrides({});
  resetCapabilitiesCache();
  rmSync(agentDir, { recursive: true, force: true });
});

function loadTheme(imagesEnabled: boolean, toolsEnabled: boolean) {
  writeFileSync(
    join(agentDir, 'pi-thoth-theme.json'),
    JSON.stringify({
      images: { enabled: imagesEnabled },
      tools: { enabled: toolsEnabled },
      statusLine: { enabled: false },
      welcome: { enabled: false },
    }),
  );
  const registerTool = vi.fn();
  const registerToolRenderer = vi.fn<ExtensionAPI['registerToolRenderer']>();
  const subscriptions: Array<{
    event: string;
    handler: LifecycleHandler;
  }> = [];
  const pi = {
    registerTool,
    registerToolRenderer,
    on(event: string, handler: LifecycleHandler) {
      subscriptions.push({ event, handler });
    },
  } as unknown as ExtensionAPI;
  thothTheme(pi);

  async function emit(event: LifecycleEvent) {
    for (const subscription of subscriptions) {
      if (subscription.event === event.type) {
        await subscription.handler(event, {
          hasUI: false,
        } as ExtensionContext);
      }
    }
  }

  return {
    registerTool,
    registerToolRenderer,
    start(reason: SessionStartEvent['reason'] = 'startup') {
      return emit({ type: 'session_start', reason });
    },
    startAgent() {
      return emit({ type: 'agent_start' });
    },
  };
}

describe('Orca image lifecycle', () => {
  it('restores inline images before the next agent loop after native /reload resets overrides', async () => {
    const session = loadTheme(true, false);
    expect(session.registerTool).not.toHaveBeenCalled();
    expect(session.registerToolRenderer).not.toHaveBeenCalled();
    expect(getCapabilities()).toEqual({
      images: null,
      trueColor: false,
      hyperlinks: true,
    });

    await session.start();
    expect(getCapabilities()).toEqual({
      images: 'kitty',
      trueColor: false,
      hyperlinks: true,
    });

    // AgentSession.reload() emits session_start before interactive mode calls
    // applyRuntimeSettings(), whose setter replaces the capability overrides.
    await session.start('reload');
    setCapabilityOverrides({ trueColor: true, hyperlinks: false });
    expect(getCapabilities().images).toBeNull();

    // agent_start precedes prompt messages and tool image results, including
    // continuations that do not emit before_agent_start.
    await session.startAgent();
    expect(getCapabilities()).toEqual({
      images: 'kitty',
      trueColor: true,
      hyperlinks: false,
    });

    const capabilities = getCapabilities();
    await session.startAgent();
    expect(getCapabilities()).toBe(capabilities);
  });

  it.each([
    { images: false, tools: true, protocol: null, resolverCount: 1 },
    { images: true, tools: false, protocol: 'kitty', resolverCount: 0 },
    { images: true, tools: true, protocol: 'kitty', resolverCount: 1 },
    { images: false, tools: false, protocol: null, resolverCount: 0 },
  ])('keeps images=$images independent of tools=$tools', async ({
    images,
    tools,
    protocol,
    resolverCount,
  }) => {
    const session = loadTheme(images, tools);
    expect(session.registerTool).not.toHaveBeenCalled();
    expect(session.registerToolRenderer).toHaveBeenCalledTimes(resolverCount);
    expect(getCapabilities().images).toBeNull();

    await session.start();

    expect(getCapabilities()).toEqual({
      images: protocol,
      trueColor: false,
      hyperlinks: true,
    });

    await session.start('reload');
    setCapabilityOverrides(settingsOverrides);
    await session.startAgent();

    expect(getCapabilities()).toEqual({
      images: protocol,
      trueColor: false,
      hyperlinks: true,
    });
  });

  it.each([
    { guard: 'a non-Orca terminal', env: { TERM_PROGRAM: 'unknown' } },
    { guard: 'tmux', env: { TMUX: '/tmp/tmux-1000/default,123,0' } },
    { guard: 'an explicit image protocol', env: { PI_IMAGE_PROTOCOL: 'none' } },
  ])('preserves native fallback after reload with $guard', async ({ env }) => {
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value);
    }
    const session = loadTheme(true, false);

    await session.start('reload');
    setCapabilityOverrides(settingsOverrides);
    await session.startAgent();

    expect(getCapabilities()).toEqual({
      images: null,
      trueColor: false,
      hyperlinks: true,
    });
  });

  it('preserves a native image protocol selected by reloaded settings', async () => {
    const session = loadTheme(true, false);

    await session.start('reload');
    setCapabilityOverrides({ ...settingsOverrides, images: 'iterm2' });
    await session.startAgent();

    expect(getCapabilities()).toEqual({
      images: 'iterm2',
      trueColor: false,
      hyperlinks: true,
    });
  });
});
