import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  getCapabilities,
  getCellDimensions,
  Image,
  resetCapabilitiesCache,
  setCapabilities,
  setCapabilityOverrides,
  setCellDimensions,
  type Terminal,
  type TerminalCapabilities,
  TuiAltScreen,
} from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installAltScreenImageFocus,
  installAltScreenImageOrder,
} from './alt-screen-image-order.ts';
import orcaImages from './index.ts';

function fakeFocusScreen() {
  return class FakeFocusScreen {
    events: string[] = [];
    inputs: Array<{ data: string; args: unknown[] }> = [];
    forcedRedraws: boolean[] = [];
    result = { consume: true };

    handleViewportInput(data: string, ...args: unknown[]) {
      this.events.push('native');
      this.inputs.push({ data, args });
      return this.result;
    }

    requestRender(force: boolean) {
      this.events.push('redraw');
      this.forcedRedraws.push(force);
    }
  };
}

function fakeAltScreen(env: NodeJS.ProcessEnv) {
  return class FakeAltScreen {
    imageProtocol: string | null = null;
    resetEnv: string | undefined;
    failure: Error | undefined;
    previousScreen = ['previous frame'];
    invalidations = 0;
    uploadedKittyImages = new Map([[42, 'retained payload']]);

    invalidate() {
      this.invalidations += 1;
    }

    applyLineResets(lines: string[]) {
      this.resetEnv = env.WEZTERM_PANE;
      return lines;
    }

    doRender() {
      const componentEnv = env.WEZTERM_PANE;
      const lines = this.applyLineResets(['image']);
      if (this.failure) throw this.failure;
      return {
        protocol: this.imageProtocol,
        wezterm: env.WEZTERM_PANE,
        componentEnv,
        resetEnv: this.resetEnv,
        lines,
      };
    }
  };
}

const originalPrototype = Object.getOwnPropertyDescriptors(
  TuiAltScreen.prototype,
);
const originalPrototypeKeys = new Set(Reflect.ownKeys(TuiAltScreen.prototype));
const originalCellDimensions = getCellDimensions();
const activeTuis: TuiAltScreen[] = [];

afterEach(() => {
  for (const tui of activeTuis.splice(0)) tui.stop({ preserveScreen: true });
  for (const key of Reflect.ownKeys(TuiAltScreen.prototype)) {
    if (!originalPrototypeKeys.has(key))
      Reflect.deleteProperty(TuiAltScreen.prototype, key);
  }
  Object.defineProperties(TuiAltScreen.prototype, originalPrototype);
  vi.unstubAllEnvs();
  setCellDimensions(originalCellDimensions);
  setCapabilityOverrides({});
  resetCapabilitiesCache();
});

function orcaEnvironment() {
  vi.stubEnv('TERM_PROGRAM', 'Orca');
  vi.stubEnv('TERM', 'xterm-256color');
  for (const key of [
    'TMUX',
    'PI_IMAGE_PROTOCOL',
    'PI_TRUE_COLOR',
    'PI_HYPERLINKS',
    'COLORTERM',
    'KITTY_WINDOW_ID',
    'GHOSTTY_RESOURCES_DIR',
    'WEZTERM_PANE',
    'WARP_SESSION_ID',
    'WARP_TERMINAL_SESSION_UUID',
    'ITERM_SESSION_ID',
    'WT_SESSION',
    'TERMINAL_EMULATOR',
  ])
    vi.stubEnv(key, undefined);
}

function startImageTui(images: TerminalCapabilities['images'] = 'kitty') {
  orcaEnvironment();
  setCellDimensions({ widthPx: 8, heightPx: 16 });
  setCapabilities({ images, trueColor: true, hyperlinks: true });
  const writes: string[] = [];
  let onInput: (data: string) => void = () => {
    throw new Error('Terminal input was not started');
  };
  const terminal: Terminal = {
    columns: 20,
    rows: 6,
    kittyProtocolActive: false,
    start(handleInput) {
      onInput = handleInput;
    },
    stop() {},
    async drainInput() {},
    write(data) {
      writes.push(data);
    },
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {},
  };
  // Valid 16×48 red PNG: two columns and three rows with the fixed cell size.
  const image = new Image(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAwCAYAAAAYX/pXAAAAJ0lEQVR4nO3MMREAAAgAoe9fWkO4eQysNDUXCQQCgUAgEAgEgq/BAp6T+kz+a47MAAAAAElFTkSuQmCC',
    'image/png',
    { fallbackColor: (text) => text },
    { maxWidthCells: 2, maxHeightCells: 3 },
  );
  const componentEnvs: Array<string | undefined> = [];
  const tui = new TuiAltScreen(terminal, false, undefined, { mouse: false });
  tui.addChild({ render: () => ['before'], invalidate() {} });
  tui.addChild({
    render(width) {
      componentEnvs.push(process.env.WEZTERM_PANE);
      return image.render(width);
    },
    invalidate() {
      image.invalidate();
    },
  });
  tui.addChild({ render: () => ['after'], invalidate() {} });
  activeTuis.push(tui);
  tui.start();
  return {
    tui,
    image,
    componentEnvs,
    async input(data: string) {
      writes.length = 0;
      onInput(data);
      // Pi's forced render runs on nextTick; drain it without a timer or polling.
      await new Promise<void>((resolve) => process.nextTick(resolve));
      return writes.join('');
    },
    renderFrame(force = false) {
      writes.length = 0;
      tui.renderNow(force);
      return writes.join('');
    },
  };
}

describe('Orca fullscreen image ordering', () => {
  it.each([
    { guard: 'an unknown terminal', TERM_PROGRAM: 'unknown' },
    { guard: 'a missing terminal', TERM_PROGRAM: undefined },
    { guard: 'tmux', TERM_PROGRAM: 'Orca', TMUX: '/tmp/tmux,123,0' },
    { guard: 'an empty TMUX', TERM_PROGRAM: 'Orca', TMUX: '' },
  ])('does not install for $guard', ({ guard: _guard, ...env }) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const altScreenClass = fakeAltScreen(env);
    const nativeRender = altScreenClass.prototype.doRender;
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });

    expect(altScreenClass.prototype.doRender).toBe(nativeRender);
    expect(new altScreenClass().doRender().protocol).toBeNull();
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(false);
  });

  it.each([
    { missing: 'class', altScreenClass: undefined },
    { missing: 'null class', altScreenClass: null },
    {
      missing: 'doRender',
      altScreenClass: {
        prototype: { applyLineResets: (lines: string[]) => lines },
      },
    },
    {
      missing: 'callable doRender',
      altScreenClass: {
        prototype: {
          doRender: 'removed',
          applyLineResets: (lines: string[]) => lines,
        },
      },
    },
    {
      missing: 'applyLineResets',
      altScreenClass: { prototype: { doRender: () => 'native' } },
    },
    {
      missing: 'callable applyLineResets',
      altScreenClass: {
        prototype: { doRender: () => 'native', applyLineResets: 'removed' },
      },
    },
  ])('degrades silently without $missing', ({ altScreenClass }) => {
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const proto = altScreenClass?.prototype;
    const descriptors = proto && Object.getOwnPropertyDescriptors(proto);

    expect(() =>
      installAltScreenImageOrder({ env, altScreenClass, getCapabilities }),
    ).not.toThrow();
    if (proto)
      expect(Object.getOwnPropertyDescriptors(proto)).toEqual(descriptors);
  });

  it('leaves an instance unchanged when its reset method is unavailable', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    class AltScreen {
      imageProtocol: string | null = null;
      applyLineResets(lines: string[]) {
        return lines;
      }
      doRender() {
        return { protocol: this.imageProtocol, wezterm: env.WEZTERM_PANE };
      }
    }
    const tui = new AltScreen();
    Object.defineProperty(tui, 'applyLineResets', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const nativeFrame = tui.doRender();
    installAltScreenImageOrder({
      env,
      altScreenClass: AltScreen,
      getCapabilities,
    });

    expect(tui.doRender()).toEqual(nativeFrame);
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(false);
    expect(tui.applyLineResets).toBeUndefined();
  });

  it.each([
    'none',
    'NONE',
    'nOnE',
    '0',
  ])('bypasses ordering with PI_IMAGE_PROTOCOL=%s even after explicit Kitty settings', (protocol) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeAltScreen(env);
    const tui = new altScreenClass();
    tui.imageProtocol = 'kitty';
    const nativeFrame = tui.doRender();
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    env.PI_IMAGE_PROTOCOL = protocol;

    expect(tui.doRender()).toEqual(nativeFrame);
    expect(tui.invalidations).toBe(0);
    expect(tui.previousScreen).toEqual(['previous frame']);
    expect(tui.uploadedKittyImages.size).toBe(1);
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(false);
    expect(getCapabilities().images).toBe('kitty');
  });

  it('warms the real capability cache before the temporary WezTerm environment', () => {
    orcaEnvironment();
    setCapabilityOverrides({ images: 'kitty' });
    class AltScreen extends fakeAltScreen(process.env) {
      override doRender() {
        const frame = super.doRender();
        return { ...frame, capabilities: getCapabilities() };
      }
    }
    installAltScreenImageOrder({
      env: process.env,
      altScreenClass: AltScreen,
      getCapabilities,
    });

    const frame = new AltScreen().doRender();

    expect(frame.wezterm).toBeTruthy();
    expect(frame.capabilities.images).toBe('kitty');
    expect(frame.capabilities.hyperlinks).toBe(false);
    expect(getCapabilities()).toBe(frame.capabilities);
    expect(Object.hasOwn(process.env, 'WEZTERM_PANE')).toBe(false);
  });

  it('installs only once across repeated extension loads', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeAltScreen(env);
    const deps = { env, altScreenClass, getCapabilities };
    installAltScreenImageOrder(deps);
    const installedRender = altScreenClass.prototype.doRender;

    installAltScreenImageOrder(deps);

    expect(altScreenClass.prototype.doRender).toBe(installedRender);
    expect(new altScreenClass().doRender().wezterm).toBeTruthy();
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(false);
  });

  it('invalidates components and forces a full redraw only on protocol promotion', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeAltScreen(env);
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();

    tui.doRender();

    expect(tui.invalidations).toBe(1);
    expect(tui.previousScreen).toEqual([]);
    tui.previousScreen = ['current frame'];
    tui.doRender();
    expect(tui.invalidations).toBe(1);
    expect(tui.previousScreen).toEqual(['current frame']);
  });

  it('forgets retained Kitty payloads before every render', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeAltScreen(env);
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();

    tui.doRender();
    expect(tui.uploadedKittyImages.size).toBe(0);
    tui.uploadedKittyImages.set(42, 'new payload');
    tui.doRender();
    expect(tui.uploadedKittyImages.size).toBe(0);
  });

  it.each([
    undefined,
    {},
    { clear: 'unavailable' },
  ])('skips only payload clearing when the upload cache is %j', (cache) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeAltScreen(env);
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();
    Object.defineProperty(tui, 'uploadedKittyImages', { value: cache });

    expect(tui.doRender().wezterm).toBeTruthy();
    expect(tui.invalidations).toBe(1);
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(false);
  });

  it.each([
    null,
    'iterm2',
  ] as const)('leaves a frame unchanged when live capabilities report %s', (images) => {
    setCapabilities({ images, trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeAltScreen(env);
    const tui = new altScreenClass();
    tui.imageProtocol = 'iterm2';
    const nativeFrame = tui.doRender();
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });

    expect(tui.doRender()).toEqual(nativeFrame);
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(false);
    expect(Object.hasOwn(tui, 'applyLineResets')).toBe(false);
  });

  it.each([
    '',
    'pane-42',
  ])('preserves WEZTERM_PANE=%j outside the output phase', (pane) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca', WEZTERM_PANE: pane };
    const altScreenClass = fakeAltScreen(env);
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();

    const frame = tui.doRender();

    expect(frame.wezterm).toBeTruthy();
    if (pane) expect(frame.wezterm).toBe(pane);
    expect(frame.componentEnv).toBe(pane);
    expect(frame.resetEnv).toBe(pane);
    expect(env.WEZTERM_PANE).toBe(pane);
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(true);
  });

  it.each([
    undefined,
    '',
    'pane-42',
  ])('restores the environment and an own reset method after a thrown render with WEZTERM_PANE=%j', (pane) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    if (pane !== undefined) env.WEZTERM_PANE = pane;
    const altScreenClass = fakeAltScreen(env);
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();
    const ownReset = (lines: string[]) => lines;
    Object.defineProperty(tui, 'applyLineResets', {
      value: ownReset,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    const descriptor = Object.getOwnPropertyDescriptor(tui, 'applyLineResets');
    const failure = new Error('terminal write failed');
    tui.failure = failure;

    expect(() => tui.doRender()).toThrow(failure);
    expect(env.WEZTERM_PANE).toBe(pane);
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(pane !== undefined);
    expect(Object.getOwnPropertyDescriptor(tui, 'applyLineResets')).toEqual(
      descriptor,
    );
  });

  it.each([
    'Orca',
    'orca',
    'ORCA',
    'oRcA',
  ])('substitutes WezTerm only after component rendering in %s and restores an absent value', (terminal) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: terminal };
    const altScreenClass = fakeAltScreen(env);
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();

    const frame = tui.doRender();

    expect(frame.protocol).toBe('kitty');
    expect(frame.wezterm).toBeTruthy();
    expect(frame.componentEnv).toBeUndefined();
    expect(frame.resetEnv).toBeUndefined();
    expect(frame.lines).toEqual(['image']);
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(false);
    expect(Object.hasOwn(tui, 'applyLineResets')).toBe(false);
  });
});

describe('Orca fullscreen focus recovery', () => {
  it('handles focus-in natively before forcing a redraw and preserves the native result', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeFocusScreen();
    const tui = new altScreenClass();
    installAltScreenImageFocus({ env, altScreenClass, getCapabilities });

    expect(tui.handleViewportInput('\x1b[I', 'extra')).toBe(tui.result);
    expect(tui.inputs).toEqual([{ data: '\x1b[I', args: ['extra'] }]);
    expect(tui.events).toEqual(['native', 'redraw']);
    expect(tui.forcedRedraws).toEqual([true]);
  });

  it.each([
    { guard: 'non-Orca', env: { TERM_PROGRAM: 'unknown' }, images: 'kitty' },
    { guard: 'tmux', env: { TMUX: '/tmp/tmux,123,0' }, images: 'kitty' },
    { guard: 'empty TMUX', env: { TMUX: '' }, images: 'kitty' },
    { guard: 'none', env: { PI_IMAGE_PROTOCOL: 'none' }, images: 'kitty' },
    { guard: 'NONE', env: { PI_IMAGE_PROTOCOL: 'NONE' }, images: 'kitty' },
    {
      guard: 'mixed-case none',
      env: { PI_IMAGE_PROTOCOL: 'nOnE' },
      images: 'kitty',
    },
    { guard: '0', env: { PI_IMAGE_PROTOCOL: '0' }, images: 'kitty' },
    { guard: 'text fallback', env: {}, images: null },
    { guard: 'iTerm2', env: {}, images: 'iterm2' },
  ] as const)('preserves native focus handling without redraw for $guard after installation', ({
    env: guardEnv,
    images,
  }) => {
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeFocusScreen();
    installAltScreenImageFocus({ env, altScreenClass, getCapabilities });
    Object.assign(env, guardEnv);
    setCapabilities({ images, trueColor: true, hyperlinks: true });
    const tui = new altScreenClass();

    expect(tui.handleViewportInput('\x1b[I')).toBe(tui.result);
    expect(tui.events).toEqual(['native']);
    expect(tui.forcedRedraws).toEqual([]);
  });

  it.each([
    { TERM_PROGRAM: 'unknown' },
    { TERM_PROGRAM: undefined },
    { TERM_PROGRAM: 'Orca', TMUX: '' },
    { TERM_PROGRAM: 'Orca', PI_IMAGE_PROTOCOL: 'NONE' },
    { TERM_PROGRAM: 'Orca', PI_IMAGE_PROTOCOL: '0' },
  ])('does not install focus recovery in %j', (env) => {
    const altScreenClass = fakeFocusScreen();
    const nativeInput = altScreenClass.prototype.handleViewportInput;
    installAltScreenImageFocus({ env, altScreenClass, getCapabilities });

    expect(altScreenClass.prototype.handleViewportInput).toBe(nativeInput);
  });

  it.each([
    '\x1b[O',
    'x',
    '\x1b[Iextra',
  ])('does not force redraw for other input %j', (data) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const altScreenClass = fakeFocusScreen();
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    installAltScreenImageFocus({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();

    expect(tui.handleViewportInput(data)).toBe(tui.result);
    expect(tui.events).toEqual(['native']);
    expect(tui.forcedRedraws).toEqual([]);
  });

  it.each([
    undefined,
    null,
    { prototype: {} },
    { prototype: { handleViewportInput: 'removed', requestRender() {} } },
    { prototype: { handleViewportInput() {} } },
    { prototype: { handleViewportInput() {}, requestRender: 'removed' } },
  ])('degrades without callable focus internals: %j', (altScreenClass) => {
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const proto = altScreenClass?.prototype;
    const descriptors = proto && Object.getOwnPropertyDescriptors(proto);

    expect(() =>
      installAltScreenImageFocus({ env, altScreenClass, getCapabilities }),
    ).not.toThrow();
    if (proto)
      expect(Object.getOwnPropertyDescriptors(proto)).toEqual(descriptors);
  });

  it('skips redraw when an instance no longer has requestRender', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeFocusScreen();
    installAltScreenImageFocus({ env, altScreenClass, getCapabilities });
    const tui = new altScreenClass();
    Object.defineProperty(tui, 'requestRender', { value: undefined });

    expect(tui.handleViewportInput('\x1b[I')).toBe(tui.result);
    expect(tui.events).toEqual(['native']);
  });

  it('preserves native failures without requesting a redraw', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const failure = new Error('native focus failure');
    class AltScreen extends fakeFocusScreen() {
      override handleViewportInput(): never {
        throw failure;
      }
    }
    installAltScreenImageFocus({
      env,
      altScreenClass: AltScreen,
      getCapabilities,
    });
    const tui = new AltScreen();

    expect(() => tui.handleViewportInput()).toThrow(failure);
    expect(tui.forcedRedraws).toEqual([]);
  });

  it.each([
    'focus',
    'ordering',
  ])('installs independent, idempotent hooks with %s installed first', (first) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    class AltScreen extends fakeFocusScreen() {
      applyLineResets(lines: string[]) {
        return lines;
      }
      doRender() {
        this.applyLineResets([]);
        return env.WEZTERM_PANE;
      }
    }
    const deps = { env, altScreenClass: AltScreen, getCapabilities };
    const installers =
      first === 'focus'
        ? [installAltScreenImageFocus, installAltScreenImageOrder]
        : [installAltScreenImageOrder, installAltScreenImageFocus];
    for (const install of installers) install(deps);
    const render = AltScreen.prototype.doRender;
    const input = AltScreen.prototype.handleViewportInput;
    for (const install of installers) install(deps);
    expect(AltScreen.prototype.doRender).toBe(render);
    expect(AltScreen.prototype.handleViewportInput).toBe(input);
    const tui = new AltScreen();

    expect(tui.doRender()).toBeTruthy();
    expect(tui.handleViewportInput('\x1b[I')).toBe(tui.result);
    expect(tui.forcedRedraws).toEqual([true]);
    expect(Object.hasOwn(env, 'WEZTERM_PANE')).toBe(false);
  });
});

describe('real fullscreen terminal output', () => {
  it('retransmits an unchanged image frame on focus-in while Pi still consumes focus events', async () => {
    const { tui, renderFrame, input } = startImageTui();
    // Install after construction: Pi's viewport listener must resolve the hook
    // at call time, even on a TUI that existed before loading the extension.
    orcaImages({ on() {} } as unknown as ExtensionAPI);
    const extensionInput = vi.fn();
    tui.addInputListener(extensionInput);
    expect(renderFrame()).toContain('\x1b_Ga=T');
    expect(renderFrame()).not.toContain('\x1b_G');
    const previousFullRedraws = tui.fullRedraws;

    const frame = await input('\x1b[I');

    expect(frame).toContain('\x1b_Ga=T');
    expect(frame).not.toContain('\x1b_Ga=p');
    expect(frame.slice(frame.indexOf('\x1b_Ga=T'))).not.toContain('\x1b[2K');
    expect(tui.fullRedraws).toBe(previousFullRedraws + 1);
    expect(extensionInput).not.toHaveBeenCalled();
    expect(await input('\x1b[O')).not.toContain('\x1b_G');
    expect(tui.fullRedraws).toBe(previousFullRedraws + 1);
    expect(extensionInput).not.toHaveBeenCalled();
    await input('x');
    expect(extensionInput).toHaveBeenCalledExactlyOnceWith('x');
  });

  it.each([
    { guard: 'non-Orca', env: { TERM_PROGRAM: 'unknown' }, images: 'kitty' },
    { guard: 'tmux', env: { TMUX: '/tmp/tmux,123,0' }, images: 'kitty' },
    { guard: 'none', env: { PI_IMAGE_PROTOCOL: 'none' }, images: 'kitty' },
    { guard: 'NONE', env: { PI_IMAGE_PROTOCOL: 'NONE' }, images: 'kitty' },
    {
      guard: 'mixed-case none',
      env: { PI_IMAGE_PROTOCOL: 'nOnE' },
      images: 'kitty',
    },
    { guard: '0', env: { PI_IMAGE_PROTOCOL: '0' }, images: 'kitty' },
    { guard: 'non-Kitty', env: {}, images: null },
  ] as const)('does not redraw on real focus-in with $guard, preserving Pi consumption and settings', async ({
    env,
    images,
  }) => {
    const { tui, renderFrame, input } = startImageTui(images);
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    orcaImages({ on() {} } as unknown as ExtensionAPI);
    const extensionInput = vi.fn();
    tui.addInputListener(extensionInput);
    renderFrame();
    expect(renderFrame()).not.toContain('\x1b_G');
    const previousFullRedraws = tui.fullRedraws;

    expect(await input('\x1b[I')).toBe('');
    expect(tui.fullRedraws).toBe(previousFullRedraws);
    expect(extensionInput).not.toHaveBeenCalled();
    expect(getCapabilities().images).toBe(images);
    expect(Object.hasOwn(process.env, 'WEZTERM_PANE')).toBe(false);
  });

  it('re-emits an already-rendered image when Kitty ordering activates', () => {
    const { tui, renderFrame } = startImageTui(null);
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    expect(renderFrame()).toContain('\x1b_Ga=T');
    expect(renderFrame()).not.toContain('\x1b_Ga=T');
    const previousFullRedraws = tui.fullRedraws;
    installAltScreenImageOrder();

    const frame = renderFrame();

    expect(frame).toContain('\x1b_Ga=T');
    expect(tui.fullRedraws).toBe(previousFullRedraws + 1);
    expect(renderFrame()).not.toContain('\x1b_Ga=T');
    expect(tui.fullRedraws).toBe(previousFullRedraws + 1);
  });

  it('invalidates a cached text fallback when Kitty ordering activates', () => {
    const { tui, image, renderFrame } = startImageTui(null);
    expect(renderFrame()).not.toContain('\x1b_G');
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    expect(image.render(20).join('')).not.toContain('\x1b_G');
    installAltScreenImageOrder();

    expect(renderFrame()).toContain('\x1b_Ga=T');
    expect(tui.getScreenLines()[1]).toContain('\x1b_Ga=T');
  });

  it('retransmits Kitty data on redraw instead of placing a retained payload', () => {
    const { renderFrame } = startImageTui();
    installAltScreenImageOrder();
    expect(renderFrame()).toContain('\x1b_Ga=T');

    const redraw = renderFrame(true);

    expect(redraw).toContain('\x1b_Ga=T');
    expect(redraw).not.toContain('\x1b_Ga=p');
    const nextRedraw = renderFrame(true);
    expect(nextRedraw).toContain('\x1b_Ga=T');
    expect(nextRedraw).not.toContain('\x1b_Ga=p');
  });

  it('clears every row before transmitting a multi-row Kitty image', () => {
    const { tui, image, renderFrame, componentEnvs } = startImageTui();
    installAltScreenImageOrder();

    const frame = renderFrame();

    expect(image.render(20)).toHaveLength(3);
    expect(tui.getScreenLines()[1]).toContain('\x1b_Ga=T');
    const imageIndex = frame.indexOf('\x1b_Ga=T');
    expect(imageIndex).toBeGreaterThan(0);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Match CSI row-clear sequences in actual terminal output.
    const clears = [...frame.matchAll(/\x1b\[(\d+);1H\x1b\[2K/g)];
    expect(clears.map((match) => Number(match[1]))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(clears.every((match) => match.index < imageIndex)).toBe(true);
    expect(frame.slice(imageIndex)).not.toContain('\x1b[2K');
    expect(componentEnvs.length).toBeGreaterThan(0);
    expect(componentEnvs.every((pane) => pane === undefined)).toBe(true);
    expect(Object.hasOwn(process.env, 'WEZTERM_PANE')).toBe(false);
  });
});
