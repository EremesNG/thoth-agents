import { getCapabilities, TuiAltScreen } from '@earendil-works/pi-tui';
import { isOrcaImagesEnabled } from './environment.ts';

interface AltScreenImageDependencies {
  env: NodeJS.ProcessEnv;
  altScreenClass: { prototype: object } | null | undefined;
  getCapabilities: typeof getCapabilities;
}

// Keep installation idempotent even across native /reload module instances.
const RENDER_INSTALLED = Symbol.for(
  '@thoth-agents/pi-orca-images.alt-screen-image-order',
);
const FOCUS_INSTALLED = Symbol.for(
  '@thoth-agents/pi-orca-images.alt-screen-image-focus',
);

interface AltScreenInternals {
  [RENDER_INSTALLED]?: boolean;
  [FOCUS_INSTALLED]?: boolean;
  handleViewportInput?: (data: string, ...args: unknown[]) => unknown;
  requestRender?: (force: boolean) => void;
  imageProtocol?: string | null;
  previousScreen?: string[];
  invalidate?: () => void;
  uploadedKittyImages?: { clear?: () => void };
  applyLineResets: (lines: string[]) => string[];
  doRender: (...args: unknown[]) => unknown;
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

export function installAltScreenImageOrder(
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
    proto[RENDER_INSTALLED] ||
    typeof proto.doRender !== 'function' ||
    typeof proto.applyLineResets !== 'function'
  )
    return;
  const original = proto.doRender;
  proto.doRender = function (this: AltScreenInternals, ...args) {
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
