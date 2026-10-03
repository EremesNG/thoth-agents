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
  TuiAltScreen,
} from '@earendil-works/pi-tui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import orcaImages from '../src/index.ts';

type LifecycleEvent = SessionStartEvent | AgentStartEvent;
type LifecycleHandler = (
  event: LifecycleEvent,
  ctx: ExtensionContext,
) => void | Promise<void>;

const settingsOverrides = { trueColor: false, hyperlinks: true };
const originalAltScreenPrototype = Object.getOwnPropertyDescriptors(
  TuiAltScreen.prototype,
);
const originalAltScreenKeys = new Set(Reflect.ownKeys(TuiAltScreen.prototype));

beforeEach(() => {
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
  for (const key of Reflect.ownKeys(TuiAltScreen.prototype)) {
    if (!originalAltScreenKeys.has(key))
      Reflect.deleteProperty(TuiAltScreen.prototype, key);
  }
  Object.defineProperties(TuiAltScreen.prototype, originalAltScreenPrototype);
  vi.unstubAllEnvs();
  setCapabilityOverrides({});
  resetCapabilitiesCache();
});

function loadPackage() {
  const registerTool = vi.fn();
  const registerToolRenderer = vi.fn<ExtensionAPI['registerToolRenderer']>();
  const settingsAccess = vi.fn(() => {
    throw new Error('Pi settings are unavailable during extension load');
  });
  const subscriptions: Array<{
    event: string;
    handler: LifecycleHandler;
  }> = [];
  const pi = {
    registerTool,
    registerToolRenderer,
    get getSettings() {
      return settingsAccess();
    },
    on(event: string, handler: LifecycleHandler) {
      subscriptions.push({ event, handler });
    },
  } as unknown as ExtensionAPI;
  orcaImages(pi);

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
    settingsAccess,
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
    const session = loadPackage();
    expect(session.registerTool).not.toHaveBeenCalled();
    expect(session.registerToolRenderer).not.toHaveBeenCalled();
    expect(session.settingsAccess).not.toHaveBeenCalled();
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

  it('keeps both fullscreen hooks idempotent across native extension reloads', async () => {
    const first = loadPackage();
    const render = Object.getOwnPropertyDescriptor(
      TuiAltScreen.prototype,
      'doRender',
    )?.value;
    const focus = Object.getOwnPropertyDescriptor(
      TuiAltScreen.prototype,
      'handleViewportInput',
    )?.value;
    expect(render).not.toBe(originalAltScreenPrototype.doRender.value);
    expect(focus).not.toBe(
      originalAltScreenPrototype.handleViewportInput.value,
    );
    await first.start();

    const reloaded = loadPackage();
    expect(
      Object.getOwnPropertyDescriptor(TuiAltScreen.prototype, 'doRender')
        ?.value,
    ).toBe(render);
    expect(
      Object.getOwnPropertyDescriptor(
        TuiAltScreen.prototype,
        'handleViewportInput',
      )?.value,
    ).toBe(focus);
    await reloaded.start('reload');
    setCapabilityOverrides(settingsOverrides);
    await reloaded.startAgent();

    expect(getCapabilities()).toEqual({
      images: 'kitty',
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
    const session = loadPackage();

    await session.start('reload');
    setCapabilityOverrides(settingsOverrides);
    await session.startAgent();

    expect(getCapabilities()).toEqual({
      images: null,
      trueColor: false,
      hyperlinks: true,
    });
  });

  it.each([
    'none',
    'NONE',
    'nOnE',
    '0',
  ])('bypasses all package behaviors with PI_IMAGE_PROTOCOL=%s and explicit Kitty settings', async (protocol) => {
    vi.stubEnv('PI_IMAGE_PROTOCOL', protocol);
    const session = loadPackage();
    await session.start();
    expect(getCapabilities().images).toBeNull();

    await session.start('reload');
    setCapabilityOverrides({ ...settingsOverrides, images: 'kitty' });
    const nativeCapabilities = getCapabilities();
    await session.startAgent();

    expect(getCapabilities()).toBe(nativeCapabilities);
    expect(getCapabilities().images).toBe('kitty');
    expect(
      Object.getOwnPropertyDescriptor(TuiAltScreen.prototype, 'doRender')
        ?.value,
    ).toBe(originalAltScreenPrototype.doRender.value);
    expect(
      Object.getOwnPropertyDescriptor(
        TuiAltScreen.prototype,
        'handleViewportInput',
      )?.value,
    ).toBe(originalAltScreenPrototype.handleViewportInput.value);
  });

  it('preserves a native image protocol selected by reloaded settings', async () => {
    const session = loadPackage();

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
