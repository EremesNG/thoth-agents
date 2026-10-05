import type {
  Theme,
  ThemeColor,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';

/** Minimal structural theme; Pi Theme satisfies this without a runtime import. */
export type RenderKitTheme = Pick<Theme, 'fg'> &
  Partial<Pick<Theme, 'bold' | 'strikethrough'>>;

export type RenderStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'stopping'
  | 'deleted'
  | 'blocked'
  | 'unknown';

/** A callback receives the available body width, excluding frame and padding. */
export type RenderRows =
  | readonly string[]
  | ((width: number) => readonly string[]);

export interface RenderCardSection {
  /** A divider precedes every section, with an optional label. */
  title?: string;
  rows: RenderRows;
}

export interface RenderCardOptions {
  title?: string;
  body?: RenderRows;
  sections?: readonly RenderCardSection[];
  footer?: string;
  /** Embedded in the footer by the implementer's visual language. */
  status?: RenderStatus;
  isError?: boolean;
  /** Wrap body rows to the content width instead of truncating. */
  wrap?: boolean;
  /** Split tool call/result frames: start omits bottom; end omits top. */
  part?: 'full' | 'start' | 'end';
}

export interface RenderCollapseOptions
  extends Partial<Pick<ToolRenderResultOptions, 'expanded'>> {
  /** Visible content rows, excluding the hint; default 8, Infinity disables folding. */
  budget?: number;
  /** Complete hint, e.g. "ctrl+o to expand"; default resolved by implementer. */
  expandHint?: string;
}

/** Public SDK render-context subset; state is shared across call/result renders. */
export interface RenderIndicatorContext {
  executionStarted?: boolean;
  isPartial?: boolean;
  isError?: boolean;
  invalidate?: () => void;
  state?: Record<string, unknown>;
}

export interface RenderIndicatorOptions {
  status?: RenderStatus;
  /** Optional producer-owned elapsed time (e.g. background task runtime). */
  elapsedMs?: number;
  /** Caller-owned braille animation frame for running/in_progress; no extra timer. */
  frame?: number;
  label?: string;
}

export interface RenderIndicator {
  glyph: string;
  elapsedMs?: number;
  /** Empty when elapsed time is unavailable. */
  elapsed: string;
  /** Styled status/label plus elapsed, suitable for a card footer. */
  text: string;
}

export interface RenderWidgetHeadingOptions {
  title: string;
  counts?: { completed: number; total: number };
  status?: RenderStatus;
  suffix?: string;
}

export interface RenderTreeRowOptions {
  /** Already sanitized/styled content; the kit owns the tree rail and selection. */
  text: string;
  depth?: number;
  last?: boolean;
  selected?: boolean;
  status?: RenderStatus;
}

/** Version 1. Only the theme implements visuals and owner-scoped ticker lifecycle. */
export interface ThothRenderKit {
  readonly version: 1;
  card(
    theme: RenderKitTheme,
    options: RenderCardOptions,
    width: number,
  ): string[];
  collapse(
    theme: RenderKitTheme,
    rows: readonly string[],
    options?: RenderCollapseOptions,
  ): string[];
  /** Per-instance, per-width cache; invalidate clears all widths. */
  cachedComponent(render: (width: number) => string[]): Component;
  /** Call at render time; timers and state cleanup belong to the registering UI owner. */
  indicator(
    theme: RenderKitTheme,
    context?: RenderIndicatorContext,
    options?: RenderIndicatorOptions,
  ): RenderIndicator;
  statusGlyph(theme: RenderKitTheme, status: RenderStatus): string;
  widgetHeading(
    theme: RenderKitTheme,
    options: RenderWidgetHeadingOptions,
    width: number,
  ): string;
  treeRow(
    theme: RenderKitTheme,
    options: RenderTreeRowOptions,
    width: number,
  ): string;
  fg(theme: RenderKitTheme, role: ThemeColor, text: string): string;
}

export type RenderKitToken = symbol;

const registryKey = Symbol.for('thoth-agents.pi-core.render-kit.v1');
interface Registration {
  kit: ThothRenderKit;
  owner: object;
  token: RenderKitToken;
}
const shared = globalThis as typeof globalThis & {
  [registryKey]?: Registration;
};

/** Replaces the current kit; even re-registration by the same owner gets a new token. */
export function registerRenderKit(
  kit: ThothRenderKit,
  owner: object,
): RenderKitToken {
  const token = Symbol('render-kit-registration');
  shared[registryKey] = { kit, owner, token };
  return token;
}

/** A stale or foreign token cannot withdraw a newer registration. No stack restoration. */
export function withdrawRenderKit(token: RenderKitToken): void {
  if (shared[registryKey]?.token === token) delete shared[registryKey];
}

/** Discover on each render, never cache across renders or extension reloads. */
export function getRenderKit(): ThothRenderKit | undefined {
  try {
    const kit = shared[registryKey]?.kit;
    if (
      kit?.version === 1 &&
      [
        'card',
        'collapse',
        'cachedComponent',
        'indicator',
        'statusGlyph',
        'widgetHeading',
        'treeRow',
        'fg',
      ].every(
        (method) => typeof kit[method as keyof ThothRenderKit] === 'function',
      )
    )
      return kit;
  } catch {
    // Foreign/reloaded extensions may leave incompatible records or accessors.
  }
  return undefined;
}
