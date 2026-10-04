import { getCapabilities, TuiAltScreen } from '@earendil-works/pi-tui';
import { isOrcaImagesEnabled } from './environment.ts';

interface AltScreenImageDependencies {
  env: NodeJS.ProcessEnv;
  altScreenClass: { prototype: object } | null | undefined;
  getCapabilities: typeof getCapabilities;
  now?: () => number;
  setTimeout?: (callback: () => void, delay: number) => ImageRedrawTimer;
  clearTimeout?: (timer: ImageRedrawTimer) => void;
}

interface ImageRedrawTimer {
  unref: () => void;
}

export const IMAGE_REDRAW_DEBOUNCE_MS = 150;
export const IMAGE_REDRAW_MAX_WAIT_MS = 1000;

interface ImageRedrawState {
  fullRedraw: boolean;
  lastEmission?: number;
  firstSuppressed?: number;
  timer?: ImageRedrawTimer;
}

// Keep installation idempotent even across native /reload module instances.
const RENDER_INSTALLED = Symbol.for(
  '@thoth-agents/pi-orca-images.alt-screen-image-order',
);
const FOCUS_INSTALLED = Symbol.for(
  '@thoth-agents/pi-orca-images.alt-screen-image-focus',
);
const DEBOUNCE_INSTALLED = Symbol.for(
  '@thoth-agents/pi-orca-images.alt-screen-image-debounce',
);
const LATEST_INSTANCE = Symbol.for(
  '@thoth-agents/pi-orca-images.latest-alt-screen-instance',
);

interface AltScreenInternals {
  [RENDER_INSTALLED]?: boolean;
  [FOCUS_INSTALLED]?: boolean;
  [DEBOUNCE_INSTALLED]?: WeakMap<AltScreenInternals, ImageRedrawState>;
  [LATEST_INSTANCE]?: AltScreenInternals;
  prepareKittyScreen?: (screen: string[]) => unknown;
  handleViewportInput?: (data: string, ...args: unknown[]) => unknown;
  requestRender?: (force: boolean) => void;
  imageProtocol?: string | null;
  previousScreen?: string[];
  previousScreenWidth?: number;
  previousScreenHeight?: number;
  terminal?: { columns: number; rows: number };
  stopped?: boolean;
  altScreenActive?: boolean;
  invalidate?: () => void;
  uploadedKittyImages?: { clear?: () => void };
  applyLineResets: (lines: string[]) => string[];
  doRender: (...args: unknown[]) => unknown;
}

export function requestLatestAltScreenRender(
  altScreenClass: { prototype: object } | null | undefined = TuiAltScreen,
): void {
  const proto = altScreenClass?.prototype as AltScreenInternals | undefined;
  const tui = proto?.[LATEST_INSTANCE];
  if (
    tui &&
    !tui.stopped &&
    tui.altScreenActive &&
    typeof tui.requestRender === 'function'
  )
    tui.requestRender(false);
}

export function installAltScreenImageFocus(
  {
    env,
    altScreenClass,
    getCapabilities: readCapabilities,
  }: AltScreenImageDependencies = {
    env: process.env,
    altScreenClass: TuiAltScreen,
    getCapabilities,
  },
): void {
  if (!isOrcaImagesEnabled(env) || !altScreenClass?.prototype) return;
  const proto = altScreenClass.prototype as AltScreenInternals;
  if (
    proto[FOCUS_INSTALLED] ||
    typeof proto.handleViewportInput !== 'function' ||
    typeof proto.requestRender !== 'function'
  )
    return;
  const original = proto.handleViewportInput;
  // Pi's constructor listener resolves this method at input time, including
  // on instances created before the extension was loaded.
  proto.handleViewportInput = function (
    this: AltScreenInternals,
    data,
    ...args
  ) {
    const result = original.call(this, data, ...args);
    if (
      data === '\x1b[I' &&
      isOrcaImagesEnabled(env) &&
      readCapabilities().images === 'kitty' &&
      typeof this.requestRender === 'function'
    )
      this.requestRender(true);
    return result;
  };
  Object.defineProperty(proto, FOCUS_INSTALLED, {
    value: true,
    configurable: true,
  });
}

function getImageRedrawState(
  states: WeakMap<AltScreenInternals, ImageRedrawState>,
  tui: AltScreenInternals,
): ImageRedrawState {
  let state = states.get(tui);
  if (!state) {
    state = { fullRedraw: false };
    states.set(tui, state);
  }
  return state;
}

function isKittyImageLine(line: unknown): boolean {
  // Pi 1.0.1 does not export its image-line helper; fall back to Kitty APC.
  return typeof line === 'string' && line.includes('\x1b_G');
}

function installImageRedrawDebounce(
  proto: AltScreenInternals,
  env: NodeJS.ProcessEnv,
  readCapabilities: typeof getCapabilities,
  now: () => number,
  scheduleTimeout: (callback: () => void, delay: number) => ImageRedrawTimer,
  cancelTimeout: (timer: ImageRedrawTimer) => void,
): void {
  if (
    proto[DEBOUNCE_INSTALLED] ||
    typeof proto.prepareKittyScreen !== 'function'
  )
    return;
  const original = proto.prepareKittyScreen;
  const states = new WeakMap<AltScreenInternals, ImageRedrawState>();
  proto.prepareKittyScreen = function (this: AltScreenInternals, screen) {
    const result = original.call(this, screen);
    if (
      !isOrcaImagesEnabled(env) ||
      readCapabilities().images !== 'kitty' ||
      typeof this.requestRender !== 'function' ||
      !result ||
      typeof result !== 'object' ||
      !('lines' in result) ||
      !Array.isArray(result.lines)
    )
      return result;
    if (!result.lines.some(isKittyImageLine)) return result;
    const state = getImageRedrawState(states, this);
    const time = now();
    if (
      !state.fullRedraw &&
      (state.firstSuppressed !== undefined ||
        (state.lastEmission !== undefined &&
          time - state.lastEmission < IMAGE_REDRAW_DEBOUNCE_MS))
    ) {
      state.firstSuppressed ??= time;
      if (state.timer) cancelTimeout(state.timer);
      const deadline = Math.min(
        time + IMAGE_REDRAW_DEBOUNCE_MS,
        state.firstSuppressed + IMAGE_REDRAW_MAX_WAIT_MS,
      );
      state.timer = scheduleTimeout(
        () => {
          state.timer = undefined;
          state.firstSuppressed = undefined;
          if (
            this.stopped ||
            !this.altScreenActive ||
            !isOrcaImagesEnabled(env) ||
            readCapabilities().images !== 'kitty' ||
            typeof this.requestRender !== 'function'
          )
            return;
          this.requestRender(true);
        },
        Math.max(0, deadline - time),
      );
      state.timer.unref();
      return {
        ...result,
        lines: result.lines.map((line) => (isKittyImageLine(line) ? '' : line)),
      };
    }
    if (state.timer) cancelTimeout(state.timer);
    state.timer = undefined;
    state.firstSuppressed = undefined;
    state.lastEmission = time;
    return result;
  };
  // Existing render wrappers can also find a prepare hook added after /reload.
  Object.defineProperty(proto, DEBOUNCE_INSTALLED, {
    value: states,
    configurable: true,
  });
}

export function installAltScreenImageOrder(
  {
    env,
    altScreenClass,
    getCapabilities: readCapabilities,
    now = () => performance.now(),
    setTimeout: scheduleTimeout = globalThis.setTimeout,
    clearTimeout: cancelTimeout = (timer) =>
      globalThis.clearTimeout(timer as NodeJS.Timeout),
  }: AltScreenImageDependencies = {
    env: process.env,
    altScreenClass: TuiAltScreen,
    getCapabilities,
  },
): void {
  if (!isOrcaImagesEnabled(env) || !altScreenClass?.prototype) return;
  const proto = altScreenClass.prototype as AltScreenInternals;
  if (
    typeof proto.doRender !== 'function' ||
    typeof proto.applyLineResets !== 'function'
  )
    return;
  installImageRedrawDebounce(
    proto,
    env,
    readCapabilities,
    now,
    scheduleTimeout,
    cancelTimeout,
  );
  if (proto[RENDER_INSTALLED]) return;
  const original = proto.doRender;
  Object.defineProperty(proto, LATEST_INSTANCE, {
    value: undefined,
    writable: true,
    configurable: true,
  });
  proto.doRender = function (this: AltScreenInternals, ...args) {
    proto[LATEST_INSTANCE] = this;
    // Warm Pi's detection cache before substituting the environment.
    if (
      !isOrcaImagesEnabled(env) ||
      readCapabilities().images !== 'kitty' ||
      typeof this.applyLineResets !== 'function'
    )
      return original.apply(this, args);
    // Refresh cached fallbacks and re-emit an already rendered frame once.
    if (this.imageProtocol !== 'kitty') {
      this.imageProtocol = 'kitty';
      this.invalidate?.();
      this.previousScreen = [];
    }
    const states = proto[DEBOUNCE_INSTALLED];
    const redrawState = states && getImageRedrawState(states, this);
    if (redrawState) {
      redrawState.fullRedraw =
        this.previousScreen?.length === 0 ||
        (this.terminal !== undefined &&
          (this.previousScreenWidth !== Math.max(1, this.terminal.columns) ||
            this.previousScreenHeight !== Math.max(1, this.terminal.rows)));
    }
    // Orca can delete retained payloads when clears erase the last image tile.
    if (typeof this.uploadedKittyImages?.clear === 'function') {
      this.uploadedKittyImages.clear();
    }
    const previousPane = env.WEZTERM_PANE;
    const ownReset = Object.getOwnPropertyDescriptor(this, 'applyLineResets');
    // Pi calls this after component/overlay rendering, before its WezTerm check.
    this.applyLineResets = (lines) => {
      const result = proto.applyLineResets.call(this, lines);
      if (!env.WEZTERM_PANE) env.WEZTERM_PANE = '1';
      return result;
    };
    try {
      return original.apply(this, args);
    } finally {
      if (redrawState) redrawState.fullRedraw = false;
      Reflect.deleteProperty(this, 'applyLineResets');
      if (ownReset) Object.defineProperty(this, 'applyLineResets', ownReset);
      if (previousPane === undefined) delete env.WEZTERM_PANE;
      else env.WEZTERM_PANE = previousPane;
    }
  };
  Object.defineProperty(proto, RENDER_INSTALLED, {
    value: true,
    configurable: true,
  });
}
