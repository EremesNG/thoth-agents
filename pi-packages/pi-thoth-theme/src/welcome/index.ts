import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { VERSION as PI_VERSION } from '@earendil-works/pi-coding-agent';
import type { Component, TUI } from '@earendil-works/pi-tui';
import { cachedComponent } from '../shared/cache.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { type ActiveThemeLike, renderWelcomeHeader } from './render.ts';
import {
  collectStartupResources,
  type StartupResourceOptions,
  type WelcomeData,
} from './resources.ts';

export { formatAge } from './age.ts';
export { getThothLogoLines, THOTH_WORDMARK } from './logo.ts';
export { type ActiveThemeLike, renderWelcomeHeader } from './render.ts';
export {
  collectStartupResources,
  fetchRecentSessions,
  type StartupResourceOptions,
  type WelcomeData,
  type WelcomeProvider,
  type WelcomeResourceCounts,
  type WelcomeSession,
} from './resources.ts';

export class WelcomeComponent implements Component {
  private data: WelcomeData;
  private readonly renderCache: Component;
  private _disposed = false;

  constructor(
    theme: ActiveThemeLike,
    config: ThemeConfig,
    initialData: WelcomeData,
  ) {
    this.data = initialData;
    this.renderCache = cachedComponent((width) =>
      renderWelcomeHeader(theme, this.data, width, config.icons),
    );
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  updateData(newData: WelcomeData): void {
    if (this._disposed) return;
    this.data = newData;
    this.invalidate();
  }

  invalidate(): void {
    this.renderCache.invalidate();
  }

  dispose(): void {
    this._disposed = true;
  }

  render(width: number): string[] {
    return this.renderCache.render(width);
  }
}

export function registerWelcome(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: ThemeConfig,
  options?: StartupResourceOptions,
): void {
  if (!ctx.hasUI || !ctx.ui?.setHeader) return;

  const initialData: WelcomeData = {
    version: PI_VERSION,
    model: ctx.model?.name || ctx.model?.id,
    provider: ctx.model?.provider,
    resources: {
      tools:
        typeof pi.getAllTools === 'function'
          ? (pi.getAllTools()?.length ?? 0)
          : typeof pi.getActiveTools === 'function'
            ? (pi.getActiveTools()?.length ?? 0)
            : undefined,
      skills:
        typeof pi.getCommands === 'function'
          ? (pi
              .getCommands()
              ?.filter(
                (c) =>
                  c?.source === 'skill' ||
                  (typeof c?.name === 'string' && c.name.startsWith('skill:')),
              )?.length ?? undefined)
          : undefined,
      extensions: undefined,
    },
    providers: [],
    sessions: [],
  };

  let activeComponent: WelcomeComponent | undefined;

  ctx.ui.setHeader((tui: TUI, theme: Theme) => {
    if (activeComponent && !activeComponent.isDisposed) {
      activeComponent.dispose();
    }

    const activeTheme = theme as unknown as ActiveThemeLike;
    const component = new WelcomeComponent(activeTheme, config, initialData);
    activeComponent = component;

    // Asynchronously populate full resource details and recent sessions
    void collectStartupResources(pi, ctx, {
      ...options,
      iconMode: options?.iconMode ?? config.icons,
    })
      .then((fullData) => {
        if (!component.isDisposed && activeComponent === component) {
          component.updateData(fullData);
          tui?.requestRender?.();
        }
      })
      .catch(() => {
        // Resource collection is best-effort and must never break startup
      });

    return component;
  });
}
