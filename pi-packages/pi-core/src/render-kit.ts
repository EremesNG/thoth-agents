import type {
  Theme,
  ThemeColor,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import { formatDuration } from './duration.js';
import type { ToolRenderersLike } from './tool-registry.js';

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

/** Single glyphs and native labels used only in rendered UI, never model text. */
export type SemanticGlyphName =
  | 'branch'
  | 'folder'
  | 'model'
  | 'effort'
  | 'context'
  | 'cost'
  | 'elapsed'
  | 'tokensIn'
  | 'tokensOut'
  | 'cache'
  | 'throughput'
  | 'agent'
  | 'tool'
  | 'bash'
  | 'read'
  | 'write'
  | 'edit'
  | 'search'
  | 'file'
  | 'separator'
  | 'ellipsis'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowLeft'
  | 'arrowRight'
  | 'selection'
  | 'selectionSelected'
  | 'selectionUnselected'
  | 'taskInProgress'
  | 'separatorHeavy'
  | 'boxTopLeft'
  | 'boxTopRight'
  | 'boxVertical'
  | 'boxBottomLeft'
  | 'boxBottomRight'
  | 'boxHorizontal'
  | 'boxTDown'
  | 'boxTUp'
  | 'boxTRight'
  | 'boxTLeft'
  | 'boxCross'
  | 'close'
  | 'scrollUp'
  | 'scrollDown'
  | 'ready'
  | 'warning';

export type SemanticFrameName = 'spinnerFrames' | 'workingFrames';
export type SemanticIconName = SemanticGlyphName | SemanticFrameName;

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
  /** Footer decoration only; never changes the border tone. */
  status?: RenderStatus;
  /** Status + tool context requests the standard footer unless `footer` is supplied. */
  context?: RenderIndicatorContext;
  /** Optional terminal tool summary for the standard footer. */
  summary?: RenderToolFooterOptions['summary'];
  /** Draws an `error` border, taking precedence over `isSuccess`. */
  isError?: boolean;
  /**
   * Affirmative terminal success: only `true` draws a `success` border unless
   * `isError` is true; absent or false keeps non-error borders `accent`.
   * Changes only the border, without adding a footer or status glyph.
   * Pass consistently across split card parts.
   */
  isSuccess?: boolean;
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

export interface RenderToolFooterOptions {
  /**
   * running/in_progress use the running form; completed/deleted use ✓;
   * failed/cancelled/interrupted/blocked use ✗; other statuses stay literal.
   */
  status: RenderStatus;
  context?: RenderIndicatorContext;
  /** Producer-owned duration takes precedence over context timing. */
  elapsedMs?: number;
  /** Terminal summary; running footers show only status and elapsed time. */
  summary?: string | readonly string[];
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
  /** Compose tool renderers like the host resolver; legacy v1 kits may omit this. */
  resolveToolRenderers?(
    toolName: string,
    next: () => ToolRenderersLike | undefined,
  ): ToolRenderersLike | undefined;
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
  /** Standard tool footer; legacy v1 kits may omit it. */
  toolFooter?(theme: RenderKitTheme, options: RenderToolFooterOptions): string;
  /** UI-only semantic glyph or frame lookup; legacy v1 kits may omit it. */
  icon?(name: SemanticIconName): string | readonly string[];
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

const nativeIcons: Record<SemanticGlyphName, string> = {
  branch: '⑂',
  folder: 'dir',
  model: '●',
  effort: '◐',
  context: 'ctx',
  cost: '$',
  elapsed: '◷',
  tokensIn: '↑',
  tokensOut: '↓',
  cache: 'cache',
  throughput: 'tok/s',
  agent: '\u{f08c7}',
  tool: '*',
  bash: '$',
  read: 'read',
  write: 'write',
  edit: 'edit',
  search: 'search',
  file: 'file',
  separator: '·',
  ellipsis: '…',
  arrowUp: '↑',
  arrowDown: '↓',
  arrowLeft: '←',
  arrowRight: '→',
  selection: '›',
  selectionSelected: '●',
  selectionUnselected: '○',
  taskInProgress: '◇',
  separatorHeavy: '┃',
  boxTopLeft: '╭',
  boxTopRight: '╮',
  boxVertical: '│',
  boxBottomLeft: '╰',
  boxBottomRight: '╯',
  boxHorizontal: '─',
  boxTDown: '┬',
  boxTUp: '┴',
  boxTRight: '├',
  boxTLeft: '┤',
  boxCross: '┼',
  close: '✕',
  scrollUp: '↑',
  scrollDown: '↓',
  ready: '▲',
  warning: '⚠',
};

const nativeFrames: Record<SemanticFrameName, readonly string[]> = {
  spinnerFrames: Object.freeze([
    '⠋',
    '⠙',
    '⠹',
    '⠸',
    '⠼',
    '⠴',
    '⠦',
    '⠧',
    '⠇',
    '⠏',
  ]),
  workingFrames: Object.freeze(['△', '◭', '▲', '◮']),
};

/** Resolve caller-owned animation frames on each render; never starts a timer. */
export function resolveFrames(
  name: SemanticFrameName,
  fallback?: readonly string[],
): readonly string[] {
  try {
    const frames = getRenderKit()?.icon?.(name);
    if (
      Array.isArray(frames) &&
      frames.length > 0 &&
      [...frames].every((frame) => typeof frame === 'string')
    )
      return frames;
  } catch {
    // Foreign kits may throw or return arrays with invalid accessors.
  }
  return fallback ?? nativeFrames[name];
}

/** Preserve a surface's native literal by supplying its current fallback. */
export function resolveIcon(
  name: SemanticGlyphName,
  fallback?: string,
): string {
  try {
    const icon = getRenderKit()?.icon?.(name);
    if (typeof icon === 'string') return icon;
  } catch {
    // A buggy optional lookup must not break native UI rendering.
  }
  return fallback ?? nativeIcons[name];
}

const nativeStatusGlyphs: Record<RenderStatus, string> = {
  pending: '○',
  queued: '○',
  in_progress: '◐',
  running: '◐',
  completed: '✓',
  failed: '✗',
  cancelled: '■',
  interrupted: '■',
  stopping: '■',
  deleted: '⊘',
  blocked: '⊘',
  unknown: '?',
};

const unstyledTheme: RenderKitTheme = {
  fg: (_role, text) => text,
  bold: (text) => text,
  strikethrough: (text) => text,
};

/** Resolve an unstyled status glyph, preserving caller-specific native defaults. */
export function resolveStatusGlyph(
  status: RenderStatus,
  fallback?: string,
): string {
  try {
    const glyph = getRenderKit()?.statusGlyph(unstyledTheme, status);
    if (typeof glyph === 'string') return glyph;
  } catch {
    // Keep the caller's native status when a foreign implementation fails.
  }
  return fallback ?? nativeStatusGlyphs[status];
}

const terminalFooterGlyphs: Partial<Record<RenderStatus, '✓' | '✗'>> = {
  completed: '✓',
  deleted: '✓',
  failed: '✗',
  cancelled: '✗',
  interrupted: '✗',
  blocked: '✗',
};

/**
 * Shared context timing uses `state.startedAt` and `state.completedElapsedMs`.
 * Starts on executing running/in_progress renders and freezes on terminal status,
 * regardless of partial/error flags. Terminal elapsed overrides replace the frozen
 * duration. Unknown elapsed stays undefined. Never creates timers or invalidates.
 */
export function getToolElapsedMs(
  options: Pick<RenderToolFooterOptions, 'status' | 'context' | 'elapsedMs'>,
): number | undefined {
  const context = options.context;
  const state = context?.state;
  if (options.elapsedMs !== undefined) {
    const elapsedMs = Number.isFinite(options.elapsedMs)
      ? Math.max(0, options.elapsedMs)
      : undefined;
    if (
      state &&
      terminalFooterGlyphs[options.status] &&
      elapsedMs !== undefined
    ) {
      state.completedElapsedMs = elapsedMs;
    }
    return elapsedMs;
  }
  if (!state) return undefined;
  if (
    context.executionStarted &&
    (options.status === 'running' || options.status === 'in_progress') &&
    state.startedAt === undefined
  ) {
    state.startedAt = Date.now();
  }
  if (
    typeof state.completedElapsedMs === 'number' &&
    Number.isFinite(state.completedElapsedMs)
  ) {
    return Math.max(0, state.completedElapsedMs);
  }
  if (
    typeof state.startedAt !== 'number' ||
    !Number.isFinite(state.startedAt)
  ) {
    return undefined;
  }
  const elapsedMs = Math.max(0, Date.now() - state.startedAt);
  if (terminalFooterGlyphs[options.status])
    state.completedElapsedMs = elapsedMs;
  return elapsedMs;
}

/** Delegate to the kit, or use a plain, whole-second tool footer. */
export function renderToolFooter(
  kit: ThothRenderKit | undefined,
  theme: RenderKitTheme,
  options: RenderToolFooterOptions,
): string {
  if (kit?.toolFooter) return kit.toolFooter(theme, options);
  const elapsedMs = getToolElapsedMs(options);
  const elapsed =
    elapsedMs === undefined
      ? ''
      : formatDuration(Math.floor(elapsedMs / 1000) * 1000);
  const terminalGlyph = terminalFooterGlyphs[options.status];
  const status =
    terminalGlyph ??
    (options.status === 'in_progress' ? 'running' : options.status);
  const summary =
    typeof options.summary === 'string'
      ? [options.summary]
      : (options.summary ?? []);
  return [status, elapsed, ...(terminalGlyph ? summary : [])]
    .filter(Boolean)
    .join(' · ');
}

export type RenderKitToken = symbol;

const RENDER_KIT_VERSION = 1;
const registryKey = Symbol.for(
  `thoth-agents.pi-core.render-kit.v${RENDER_KIT_VERSION}`,
);
interface Registration {
  kit: ThothRenderKit;
  owner: object;
  token: RenderKitToken;
}
const shared = globalThis as typeof globalThis & {
  [registryKey]?: unknown;
};

function registration(): Registration | undefined {
  try {
    const record = shared[registryKey] as Registration | null;
    if (
      record &&
      typeof record.token === 'symbol' &&
      record.owner !== null &&
      (typeof record.owner === 'object' || typeof record.owner === 'function')
    )
      return record;
  } catch {
    // Foreign registrations may expose throwing accessors.
  }
  return undefined;
}

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
  if (registration()?.token === token) delete shared[registryKey];
}

/** Discover on each render, never cache across renders or extension reloads. */
export function getRenderKit(): ThothRenderKit | undefined {
  try {
    const kit = registration()?.kit;
    if (
      kit?.version === RENDER_KIT_VERSION &&
      (!('resolveToolRenderers' in kit) ||
        typeof kit.resolveToolRenderers === 'function') &&
      (!('toolFooter' in kit) || typeof kit.toolFooter === 'function') &&
      (!('icon' in kit) || typeof kit.icon === 'function') &&
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

/** Memoize input-stable transcript lines; look up the kit even on cache hits. */
export function createKitRenderMemo() {
  let cached:
    | { width: number; kit: ThothRenderKit | undefined; lines: string[] }
    | undefined;

  return {
    render(
      width: number,
      build: (kit: ThothRenderKit | undefined) => string[],
    ): string[] {
      const kit = getRenderKit();
      if (!cached || cached.width !== width || cached.kit !== kit) {
        cached = { width, kit, lines: build(kit) };
      }
      return cached.lines;
    },
    invalidate(): void {
      cached = undefined;
    },
  };
}
