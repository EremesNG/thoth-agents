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
  IMAGE_REDRAW_DEBOUNCE_MS,
  IMAGE_REDRAW_MAX_WAIT_MS,
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

interface FakeRedrawTimer {
  at: number;
  callback: () => void;
  unref: ReturnType<typeof vi.fn>;
}

class RedrawClock {
  time = 0;
  timers = new Set<FakeRedrawTimer>();
  scheduled: FakeRedrawTimer[] = [];

  now = () => this.time;
  setTimeout = (callback: () => void, delay: number) => {
    const timer = { at: this.time + delay, callback, unref: vi.fn() };
    this.timers.add(timer);
    this.scheduled.push(timer);
    return timer;
  };
  clearTimeout = (timer: { unref: () => void }) => {
    this.timers.delete(timer as FakeRedrawTimer);
  };

  advanceTo(time: number) {
    while (true) {
      const next = [...this.timers].sort((a, b) => a.at - b.at)[0];
      if (!next || next.at > time) break;
      this.time = next.at;
      this.timers.delete(next);
      next.callback();
    }
    this.time = time;
  }
}

const kittyTransmission = '\x1b_Ga=T,i=42;payload\x1b\\';
const kittyPlacement = '\x1b_Ga=p,i=43;\x1b\\';
const kittyEviction = '\x1b_Ga=d,d=I,i=99;\x1b\\';

function fakeDebounceScreen() {
  return class FakeDebounceScreen {
    imageProtocol: string | null = 'kitty';
    previousScreen = ['previous frame'];
    previousScreenWidth = 20;
    previousScreenHeight = 6;
    terminal = { columns: 20, rows: 6 };
    stopped = false;
    altScreenActive = true;
    uploadedKittyImages = new Map<number, string>();
    forcedRedraws: boolean[] = [];
    prepareCalls = 0;
    lastPrepared: { lines: string[]; evictedImageDeletion: string } | undefined;

    applyLineResets(lines: string[]) {
      return lines;
    }

    prepareKittyScreen(lines: string[]) {
      this.prepareCalls += 1;
      this.uploadedKittyImages.set(42, 'prepared payload');
      const result = { lines, evictedImageDeletion: kittyEviction };
      this.lastPrepared = result;
      return result;
    }

    doRender(lines = ['text', kittyTransmission, '', kittyPlacement]) {
      const result = this.prepareKittyScreen(this.applyLineResets(lines));
      this.previousScreen = lines;
      this.previousScreenWidth = Math.max(1, this.terminal.columns);
      this.previousScreenHeight = Math.max(1, this.terminal.rows);
      return result;
    }

    requestRender(force: boolean) {
      this.forcedRedraws.push(force);
      if (force) this.previousScreen = [];
    }
  };
}

type DebounceScreen = InstanceType<ReturnType<typeof fakeDebounceScreen>>;

function startDebounceScreen() {
  setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
  const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
  const altScreenClass = fakeDebounceScreen();
  const clock = new RedrawClock();
  const deps = {
    env,
    altScreenClass,
    getCapabilities,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  };
  installAltScreenImageOrder(deps);
  return { tui: new altScreenClass(), clock, deps };
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

function stubTerminal(rows = 6) {
  const writes: string[] = [];
  let onInput: (data: string) => void = () => {
    throw new Error('Terminal input was not started');
  };
  const terminal: Terminal = {
    columns: 20,
    rows,
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
  return { terminal, writes, input: (data: string) => onInput(data) };
}

function testImage() {
  // Valid 16×48 red PNG: two columns and three rows with the fixed cell size.
  return new Image(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAwCAYAAAAYX/pXAAAAJ0lEQVR4nO3MMREAAAgAoe9fWkO4eQysNDUXCQQCgUAgEAgEgq/BAp6T+kz+a47MAAAAAElFTkSuQmCC',
    'image/png',
    { fallbackColor: (text) => text },
    { maxWidthCells: 2, maxHeightCells: 3 },
  );
}

function startImageTui(images: TerminalCapabilities['images'] = 'kitty') {
  orcaEnvironment();
  setCellDimensions({ widthPx: 8, heightPx: 16 });
  setCapabilities({ images, trueColor: true, hyperlinks: true });
  const { terminal, writes, input: onInput } = stubTerminal();
  const image = testImage();
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

function startScrollImageTui(clock: RedrawClock) {
  orcaEnvironment();
  setCellDimensions({ widthPx: 8, heightPx: 16 });
  setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
  const { terminal, writes } = stubTerminal(80);
  const tui = new TuiAltScreen(terminal, false, undefined, { mouse: false });
  tui.addChild({
    render: () => Array.from({ length: 40 }, (_, row) => `before-${row}`),
    invalidate() {},
  });
  for (let i = 0; i < 4; i++) {
    const image = testImage();
    tui.addChild({
      render: (width) => image.render(width),
      invalidate: () => image.invalidate(),
    });
  }
  tui.addChild({
    render: () => Array.from({ length: 100 }, (_, row) => `after-${row}`),
    invalidate() {},
  });
  activeTuis.push(tui);
  tui.start();
  // Pi's follow-end view needs its first layout before scrollToTop takes effect.
  tui.renderNow();
  tui.scrollToTop();
  // Establish a full top-of-content frame so measured scrolls are ordinary
  // redraws, including when another instance already has the hooks installed.
  tui.renderNow(true);
  installAltScreenImageOrder({
    env: process.env,
    altScreenClass: TuiAltScreen,
    getCapabilities,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  });
  return {
    tui,
    scrollFrame() {
      writes.length = 0;
      tui.scrollBy(1);
      tui.renderNow();
      return writes.join('');
    },
    async scheduledFrame() {
      writes.length = 0;
      await new Promise<void>((resolve) => process.nextTick(resolve));
      return writes.join('');
    },
  };
}

function kittyTransmissions(frame: string) {
  return frame.split('\x1b_Ga=T').length - 1;
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

describe('Orca fullscreen image redraw debounce', () => {
  it('suppresses even the first ordinary transmission and placement while preserving text, eviction and native preparation', () => {
    const { tui, clock } = startDebounceScreen();
    const lines = ['text', kittyTransmission, '', kittyPlacement];

    expect(tui.doRender(lines).lines).toEqual(['text', '', '', '']);
    clock.advanceTo(50);
    const suppressed = tui.doRender(lines);

    expect(suppressed.lines).toEqual(['text', '', '', '']);
    expect(suppressed.evictedImageDeletion).toBe(kittyEviction);
    expect(lines).toEqual(['text', kittyTransmission, '', kittyPlacement]);
    expect(tui.prepareCalls).toBe(2);
    expect(tui.uploadedKittyImages.get(42)).toBe('prepared payload');
  });

  it('keeps a burst suppressed and reschedules exactly one trailing forced redraw after 400 ms of quiet', () => {
    const { tui, clock } = startDebounceScreen();
    for (const time of [0, 50, 140, 280]) {
      clock.advanceTo(time);
      expect(tui.doRender().lines).toEqual(['text', '', '', '']);
      expect(clock.timers.size).toBe(1);
    }
    clock.advanceTo(679);
    expect(tui.forcedRedraws).toEqual([]);
    clock.advanceTo(680);
    expect(tui.forcedRedraws).toEqual([true]);
    expect(clock.timers.size).toBe(0);
    expect(tui.doRender().lines).toEqual([
      'text',
      kittyTransmission,
      '',
      kittyPlacement,
    ]);
    clock.advanceTo(1000);
    expect(tui.forcedRedraws).toEqual([true]);
  });

  it('bounds a continuous burst at 3000 ms from the first suppressed frame, not the previous full emission', () => {
    const { tui, clock } = startDebounceScreen();
    tui.previousScreen = [];
    expect(tui.doRender().lines).toContain(kittyTransmission);
    for (const time of [
      ...Array.from({ length: 30 }, (_, index) => 10 + index * 100),
      2999,
    ]) {
      clock.advanceTo(time);
      expect(tui.doRender().lines).toEqual(['text', '', '', '']);
      expect(clock.timers.size).toBe(1);
    }
    clock.advanceTo(3009);
    expect(tui.forcedRedraws).toEqual([]);
    clock.advanceTo(3010);
    expect(tui.forcedRedraws).toEqual([true]);
    expect(tui.doRender().lines).toContain(kittyTransmission);
    clock.advanceTo(3020);
    expect(tui.doRender().lines).not.toContain(kittyTransmission);
    clock.advanceTo(3419);
    expect(tui.forcedRedraws).toEqual([true]);
    clock.advanceTo(3420);
    expect(tui.forcedRedraws).toEqual([true, true]);
  });

  it.each([
    {
      reason: 'forced redraw',
      force: (tui: DebounceScreen) => tui.requestRender(true),
    },
    {
      reason: 'activation with an empty previous screen',
      force: (tui: DebounceScreen) => {
        tui.previousScreen = [];
      },
    },
    {
      reason: 'width resize',
      force: (tui: DebounceScreen) => {
        tui.terminal.columns = 21;
      },
    },
    {
      reason: 'height resize',
      force: (tui: DebounceScreen) => {
        tui.terminal.rows = 7;
      },
    },
    {
      reason: 'width resize clamped to one cell',
      force: (tui: DebounceScreen) => {
        tui.terminal.columns = 0;
      },
    },
    {
      reason: 'height resize clamped to one cell',
      force: (tui: DebounceScreen) => {
        tui.terminal.rows = 0;
      },
    },
    {
      reason: 'protocol promotion',
      force: (tui: DebounceScreen) => {
        tui.imageProtocol = null;
      },
    },
  ])('emits images on $reason and cancels the obsolete trailing render', ({
    force,
  }) => {
    const { tui, clock } = startDebounceScreen();
    tui.doRender();
    clock.advanceTo(50);
    expect(tui.doRender().lines).not.toContain(kittyTransmission);
    clock.advanceTo(60);
    force(tui);
    const forcedRequests = [...tui.forcedRedraws];

    expect(tui.doRender().lines).toContain(kittyTransmission);
    expect(clock.timers.size).toBe(0);
    clock.advanceTo(1000);
    expect(tui.forcedRedraws).toEqual(forcedRequests);
    // The bypass belongs only to the full frame, not every later render.
    expect(tui.doRender().lines).not.toContain(kittyTransmission);
    expect(clock.timers.size).toBe(1);
  });

  it.each([
    {
      reason: 'stopped',
      pause: (tui: DebounceScreen) => {
        tui.stopped = true;
      },
    },
    {
      reason: 'inactive alternate screen',
      pause: (tui: DebounceScreen) => {
        tui.altScreenActive = false;
      },
    },
  ])('drops the trailing redraw when $reason and starts a fresh trailing settle on ordinary resume', ({
    pause,
  }) => {
    const { tui, clock } = startDebounceScreen();
    tui.doRender();
    clock.advanceTo(50);
    tui.doRender();
    pause(tui);
    clock.advanceTo(450);

    expect(tui.forcedRedraws).toEqual([]);
    expect(clock.timers.size).toBe(0);
    tui.stopped = false;
    tui.altScreenActive = true;
    clock.advanceTo(460);
    expect(tui.doRender().lines).not.toContain(kittyTransmission);
    expect(clock.timers.size).toBe(1);
    clock.advanceTo(859);
    expect(tui.forcedRedraws).toEqual([]);
    clock.advanceTo(860);
    expect(tui.forcedRedraws).toEqual([true]);
    expect(tui.doRender().lines).toContain(kittyTransmission);
  });

  it('unrefs the first and every replacement timer while keeping only one pending per instance', () => {
    const { tui, clock } = startDebounceScreen();
    for (const time of [10, 20, 30]) {
      clock.advanceTo(time);
      tui.doRender();
      expect(clock.timers.size).toBe(1);
    }
    expect(clock.scheduled).toHaveLength(3);
    for (const timer of clock.scheduled)
      expect(timer.unref).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([
    { guard: 'non-Orca', env: { TERM_PROGRAM: 'unknown' }, images: 'kitty' },
    { guard: 'tmux', env: { TMUX: '/tmp/tmux,123,0' }, images: 'kitty' },
    { guard: 'empty TMUX', env: { TMUX: '' }, images: 'kitty' },
    { guard: 'none', env: { PI_IMAGE_PROTOCOL: 'none' }, images: 'kitty' },
    { guard: 'NONE', env: { PI_IMAGE_PROTOCOL: 'NONE' }, images: 'kitty' },
    { guard: '0', env: { PI_IMAGE_PROTOCOL: '0' }, images: 'kitty' },
    { guard: 'non-Kitty', env: {}, images: null },
  ] as const)('leaves native image frames untouched and drops a pending redraw with $guard after installation', ({
    env,
    images,
  }) => {
    const { tui, clock, deps } = startDebounceScreen();
    tui.doRender();
    clock.advanceTo(50);
    tui.doRender();
    Object.assign(deps.env, env);
    setCapabilities({ images, trueColor: true, hyperlinks: true });
    clock.advanceTo(60);

    expect(tui.doRender()).toBe(tui.lastPrepared);
    expect(tui.lastPrepared?.lines).toContain(kittyTransmission);
    clock.advanceTo(450);
    expect(tui.forcedRedraws).toEqual([]);
    expect(clock.timers.size).toBe(0);
  });

  it.each([
    undefined,
    'removed',
  ])('degrades without suppressing images if requestRender becomes %j', (requestRender) => {
    const { tui, clock } = startDebounceScreen();
    tui.doRender();
    clock.advanceTo(50);
    tui.doRender();
    Object.defineProperty(tui, 'requestRender', { value: requestRender });
    clock.advanceTo(60);

    expect(tui.doRender()).toBe(tui.lastPrepared);
    expect(() => clock.advanceTo(450)).not.toThrow();
    expect(tui.forcedRedraws).toEqual([]);
    expect(clock.timers.size).toBe(0);
  });

  it('exports the documented quiet and maximum wait intervals', () => {
    expect([IMAGE_REDRAW_DEBOUNCE_MS, IMAGE_REDRAW_MAX_WAIT_MS]).toEqual([
      400, 3000,
    ]);
  });

  it('never emits a leading frame, even 400 ms or long after a full redraw', () => {
    const { tui, clock } = startDebounceScreen();
    tui.previousScreen = [];
    expect(tui.doRender().lines).toContain(kittyTransmission);
    clock.advanceTo(400);

    expect(tui.doRender().lines).not.toContain(kittyTransmission);
    expect(clock.timers.size).toBe(1);
    tui.previousScreen = [];
    expect(tui.doRender().lines).toContain(kittyTransmission);
    expect(clock.timers.size).toBe(0);
    clock.advanceTo(2000);
    expect(tui.doRender().lines).not.toContain(kittyTransmission);
    expect(clock.timers.size).toBe(1);
    clock.advanceTo(2399);
    expect(tui.forcedRedraws).toEqual([]);
    clock.advanceTo(2400);
    expect(tui.forcedRedraws).toEqual([true]);
  });

  it('keeps frames without image lines untouched, without postponing or cancelling an image burst', () => {
    const { tui, clock } = startDebounceScreen();
    const text = ['header', '', 'body'];
    expect(tui.doRender(text)).toBe(tui.lastPrepared);
    expect(clock.timers.size).toBe(0);
    clock.advanceTo(10);
    expect(tui.doRender().lines).not.toContain(kittyTransmission);
    clock.advanceTo(50);
    tui.doRender();
    clock.advanceTo(100);
    tui.previousScreen = [];

    expect(tui.doRender(text)).toBe(tui.lastPrepared);
    expect(tui.lastPrepared?.lines).toBe(text);
    expect(clock.timers.size).toBe(1);
    clock.advanceTo(449);
    expect(tui.forcedRedraws).toEqual([]);
    clock.advanceTo(450);
    expect(tui.forcedRedraws).toEqual([true]);
  });

  it('keeps suppression, burst deadlines and cancellation independent between instances', () => {
    const { tui: first, clock, deps } = startDebounceScreen();
    const second = new deps.altScreenClass();
    expect(first.doRender().lines).not.toContain(kittyTransmission);
    clock.advanceTo(50);
    first.doRender();
    clock.advanceTo(75);
    expect(second.doRender().lines).not.toContain(kittyTransmission);
    clock.advanceTo(100);
    expect(second.doRender().lines).not.toContain(kittyTransmission);
    expect(clock.timers.size).toBe(2);
    clock.advanceTo(150);
    first.previousScreen = [];
    expect(first.doRender().lines).toContain(kittyTransmission);
    expect(clock.timers.size).toBe(1);
    clock.advanceTo(499);
    expect(first.forcedRedraws).toEqual([]);
    expect(second.forcedRedraws).toEqual([]);
    clock.advanceTo(500);
    expect(first.forcedRedraws).toEqual([]);
    expect(second.forcedRedraws).toEqual([true]);
    expect(second.doRender().lines).toContain(kittyTransmission);
  });

  it.each([
    { TERM_PROGRAM: 'unknown' },
    { TERM_PROGRAM: undefined },
    { TERM_PROGRAM: 'Orca', TMUX: '/tmp/tmux,123,0' },
    { TERM_PROGRAM: 'Orca', TMUX: '' },
    { TERM_PROGRAM: 'Orca', PI_IMAGE_PROTOCOL: 'nOnE' },
    { TERM_PROGRAM: 'Orca', PI_IMAGE_PROTOCOL: '0' },
  ])('does not install the prepare hook in %j', (env) => {
    const altScreenClass = fakeDebounceScreen();
    const nativePrepare = altScreenClass.prototype.prepareKittyScreen;
    installAltScreenImageOrder({ env, altScreenClass, getCapabilities });

    expect(altScreenClass.prototype.prepareKittyScreen).toBe(nativePrepare);
  });

  it.each([
    undefined,
    'removed',
  ])('skips only the debounce when prepareKittyScreen is %j', (prepare) => {
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeDebounceScreen();
    const nativeRender = altScreenClass.prototype.doRender;
    Object.defineProperty(altScreenClass.prototype, 'prepareKittyScreen', {
      value: prepare,
      writable: true,
      configurable: true,
    });

    expect(() =>
      installAltScreenImageOrder({ env, altScreenClass, getCapabilities }),
    ).not.toThrow();
    expect(altScreenClass.prototype.prepareKittyScreen).toBe(prepare);
    expect(altScreenClass.prototype.doRender).not.toBe(nativeRender);
  });

  it.each([
    undefined,
    null,
    {},
    { evictedImageDeletion: kittyEviction },
    { lines: undefined },
    { lines: 'removed' },
  ])('preserves malformed native preparation results %j without scheduling a timer', (result) => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeDebounceScreen();
    const nativePrepare = vi.fn(() => result);
    Object.defineProperty(altScreenClass.prototype, 'prepareKittyScreen', {
      value: nativePrepare,
      writable: true,
      configurable: true,
    });
    const clock = new RedrawClock();
    installAltScreenImageOrder({
      env,
      altScreenClass,
      getCapabilities,
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    });
    const tui = new altScreenClass();

    expect(tui.doRender()).toBe(result);
    expect(tui.doRender()).toBe(result);
    expect(nativePrepare).toHaveBeenCalledTimes(2);
    expect(clock.timers.size).toBe(0);
  });

  it('installs the debounce once across reloads with a marker independent of the ordering hook', async () => {
    const { tui, clock, deps } = startDebounceScreen();
    const render = deps.altScreenClass.prototype.doRender;
    const prepare = deps.altScreenClass.prototype.prepareKittyScreen;
    vi.resetModules();
    const reloaded = await import('./alt-screen-image-order.ts');
    reloaded.installAltScreenImageOrder(deps);
    installAltScreenImageFocus(deps);
    reloaded.installAltScreenImageOrder(deps);

    expect(deps.altScreenClass.prototype.doRender).toBe(render);
    expect(deps.altScreenClass.prototype.prepareKittyScreen).toBe(prepare);
    tui.doRender();
    clock.advanceTo(50);
    tui.doRender();
    clock.advanceTo(450);
    expect(tui.forcedRedraws).toEqual([true]);
    expect(tui.prepareCalls).toBe(2);
  });

  it('can install a newly available prepare hook without replacing the existing ordering wrapper', () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const env: NodeJS.ProcessEnv = { TERM_PROGRAM: 'Orca' };
    const altScreenClass = fakeDebounceScreen();
    const prepare = Object.getOwnPropertyDescriptor(
      altScreenClass.prototype,
      'prepareKittyScreen',
    );
    Reflect.deleteProperty(altScreenClass.prototype, 'prepareKittyScreen');
    const clock = new RedrawClock();
    const deps = {
      env,
      altScreenClass,
      getCapabilities,
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    };
    installAltScreenImageOrder(deps);
    const render = altScreenClass.prototype.doRender;
    Object.defineProperty(
      altScreenClass.prototype,
      'prepareKittyScreen',
      prepare as PropertyDescriptor,
    );
    installAltScreenImageOrder(deps);
    const tui = new altScreenClass();
    tui.doRender();
    clock.advanceTo(50);
    expect(tui.doRender().lines).not.toContain(kittyTransmission);
    tui.previousScreen = [];

    expect(tui.doRender().lines).toContain(kittyTransmission);
    expect(altScreenClass.prototype.doRender).toBe(render);
    expect(clock.timers.size).toBe(0);
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

describe('real fullscreen scroll-burst image transmissions', () => {
  it.each([
    { sequence: '6 scrolls 300 ms apart', count: 6, interval: 300, sets: 1 },
    { sequence: '6 scrolls 600 ms apart', count: 6, interval: 600, sets: 6 },
    {
      sequence: '30 rapid scrolls in 580 ms',
      count: 30,
      interval: 20,
      sets: 1,
    },
  ])('emits zero images on $sequence and $sets trailing transmission sets', async ({
    sequence,
    count,
    interval,
    sets,
  }) => {
    const clock = new RedrawClock();
    const { tui, scrollFrame, scheduledFrame } = startScrollImageTui(clock);
    const fullRedraws = tui.fullRedraws;
    const frames: string[] = [];
    const beforeDeadline: string[] = [];
    const trailing: string[] = [];
    for (let row = 0; row < count; row++) {
      const time = row * interval;
      clock.advanceTo(time);
      frames.push(scrollFrame());
      if (interval > 400 || row === count - 1) {
        clock.advanceTo(time + 399);
        beforeDeadline.push(await scheduledFrame());
        clock.advanceTo(time + 400);
        trailing.push(await scheduledFrame());
      }
    }
    const lastScroll = (count - 1) * interval;
    process.stdout.write(
      `${sequence}: scroll a=T ${frames.map(kittyTransmissions).join(',')}; trailing a=T ${trailing.map(kittyTransmissions).join(',')}\n`,
    );

    expect(frames.map(kittyTransmissions)).toEqual(Array(count).fill(0));
    expect(frames.join('')).not.toContain('\x1b_Ga=p');
    expect(frames[count - 1]).toContain('\x1b[2K');
    expect(frames[count - 1]).toContain(`before-${count}`);
    expect(tui.getScreenLines()[0]).toContain(`before-${count}`);
    expect(beforeDeadline).toEqual(Array(sets).fill(''));
    expect(trailing.map(kittyTransmissions)).toEqual(Array(sets).fill(4));
    expect(trailing.join('')).not.toContain('\x1b_Ga=p');
    expect(tui.fullRedraws).toBe(fullRedraws + sets);
    clock.advanceTo(lastScroll + 4000);
    expect(await scheduledFrame()).toBe('');
    expect(clock.timers.size).toBe(0);
  });

  it('emits all four images at 3000 ms maximum wait during continuous scrolling, then once after stopping', async () => {
    const clock = new RedrawClock();
    const { tui, scrollFrame, scheduledFrame } = startScrollImageTui(clock);
    const fullRedraws = tui.fullRedraws;
    const frames: string[] = [];
    for (let row = 0; row < 30; row++) {
      clock.advanceTo(row * 100);
      frames.push(scrollFrame());
    }
    clock.advanceTo(2999);
    const beforeMaximumWait = await scheduledFrame();
    clock.advanceTo(3000);
    const maximumWaitFrame = await scheduledFrame();
    for (const time of [3000, 3100, 3200, 3300, 3400, 3500]) {
      clock.advanceTo(time);
      frames.push(scrollFrame());
    }
    clock.advanceTo(3899);
    const beforeQuiet = await scheduledFrame();
    clock.advanceTo(3900);
    const trailing = await scheduledFrame();
    process.stdout.write(
      `Continuous scroll: scroll a=T ${frames.map(kittyTransmissions).join(',')}; max-wait a=T ${kittyTransmissions(maximumWaitFrame)}; trailing a=T ${kittyTransmissions(trailing)}\n`,
    );

    expect(frames.map(kittyTransmissions)).toEqual(Array(36).fill(0));
    expect(frames.join('')).not.toContain('\x1b_Ga=p');
    expect(beforeMaximumWait).toBe('');
    expect(kittyTransmissions(maximumWaitFrame)).toBe(4);
    expect(maximumWaitFrame).not.toContain('\x1b_Ga=p');
    expect(beforeQuiet).toBe('');
    expect(kittyTransmissions(trailing)).toBe(4);
    expect(trailing).not.toContain('\x1b_Ga=p');
    expect(tui.getScreenLines()[0]).toContain('before-36');
    expect(tui.fullRedraws).toBe(fullRedraws + 2);
    clock.advanceTo(7000);
    expect(await scheduledFrame()).toBe('');
    expect(clock.timers.size).toBe(0);
  });

  it('keeps trailing redraw deadlines independent for two real fullscreen instances', async () => {
    const clock = new RedrawClock();
    const first = startScrollImageTui(clock);
    const second = startScrollImageTui(clock);
    const fullRedraws = [first.tui.fullRedraws, second.tui.fullRedraws];
    const frames = [first.scrollFrame()];
    clock.advanceTo(100);
    frames.push(second.scrollFrame());
    clock.advanceTo(300);
    frames.push(first.scrollFrame());
    clock.advanceTo(499);
    // Drain both terminals together; a nextTick for one can render the other.
    const beforeDeadline = await Promise.all([
      first.scheduledFrame(),
      second.scheduledFrame(),
    ]);
    clock.advanceTo(500);
    const atSecondDeadline = await Promise.all([
      first.scheduledFrame(),
      second.scheduledFrame(),
    ]);
    clock.advanceTo(699);
    const beforeFirstDeadline = await first.scheduledFrame();
    clock.advanceTo(700);
    const atFirstDeadline = await Promise.all([
      first.scheduledFrame(),
      second.scheduledFrame(),
    ]);
    process.stdout.write(
      `Independent instances: scroll a=T ${frames.map(kittyTransmissions).join(',')}; 500 ms a=T ${atSecondDeadline.map(kittyTransmissions).join(',')}; 700 ms a=T ${atFirstDeadline.map(kittyTransmissions).join(',')}\n`,
    );

    expect(frames.map(kittyTransmissions)).toEqual([0, 0, 0]);
    expect(frames.join('')).not.toContain('\x1b_Ga=p');
    expect(beforeDeadline).toEqual(['', '']);
    expect(atSecondDeadline.map(kittyTransmissions)).toEqual([0, 4]);
    expect(beforeFirstDeadline).toBe('');
    expect(atFirstDeadline.map(kittyTransmissions)).toEqual([4, 0]);
    expect([...atSecondDeadline, ...atFirstDeadline].join('')).not.toContain(
      '\x1b_Ga=p',
    );
    expect(first.tui.fullRedraws).toBe(fullRedraws[0] + 1);
    expect(second.tui.fullRedraws).toBe(fullRedraws[1] + 1);
    clock.advanceTo(4000);
    expect(
      await Promise.all([first.scheduledFrame(), second.scheduledFrame()]),
    ).toEqual(['', '']);
    expect(clock.timers.size).toBe(0);
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
