import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import type { RenderStatus } from './render-kit.js';
import { createWorkPanelHost } from './work-panel-host.js';
import {
  safely,
  workPanelRenderStatus,
  workPanelStatusGlyph,
} from './work-panel-render.js';
import {
  type Registration,
  WORK_PANEL_VERSION,
  workPanelRegistry,
} from './work-panel-state.js';

export { WORK_PANEL_VERSION } from './work-panel-state.js';

/** Queued/stopping work is normalized to running; timed-out work to failed. */
export type WorkPanelItemState = 'running' | 'failed' | 'done';

export type WorkPanelStatusTone =
  | 'running'
  | 'success'
  | 'failed'
  | 'warning'
  | 'muted';

/** Semantic hierarchy resolved by the host against the current theme. */
export type WorkPanelSegmentRole =
  | 'primary'
  | 'secondary'
  | 'meta'
  | 'dim'
  | 'accent'
  | 'warning'
  | 'error'
  | 'success'
  | 'muted'
  | 'completed';

export interface WorkPanelSegment {
  text: string;
  role: WorkPanelSegmentRole;
}

/** Data-only rendered body and continuations, excluding selection/tree/status gutters. */
export interface WorkPanelRowContent {
  text: string;
  /** Styled counterpart of text; separators belong to the segments. */
  segments?: readonly WorkPanelSegment[];
  /** Styled counterparts of extraRows, in the same order. */
  extraSegments?: readonly (readonly WorkPanelSegment[])[];
  /** Narrow-width metrics or other continuations; never independently selectable. */
  extraRows?: readonly string[];
}

export interface WorkPanelMetricGroup {
  segments: readonly WorkPanelSegment[];
  /** Optional compact counterpart when metrics move below the identity line. */
  continuation?: readonly WorkPanelSegment[];
}

export type WorkPanelStatusGlyph = RenderStatus | 'taskInProgress';

export interface WorkPanelRow {
  id: string;
  primary: string;
  segments?: readonly WorkPanelSegment[];
  /** Responsive identity: labels shrink before names; warning/error attention is protected. */
  identity?: readonly WorkPanelSegment[];
  /** Atomic groups joined with the semantic separator, inline or in wrapped continuations. */
  metrics?: readonly WorkPanelMetricGroup[];
  /** Section summary; excluded from item caps and overflow counts. Informational by default. */
  summary?: boolean;
  /** Prefer dropping this item before other items when the panel exceeds its height budget. */
  dropFirst?: boolean;
  providerId?: string;
  name?: string;
  status?: string;
  /** Required by prompt-retained providers; presentation status remains provider-owned. */
  state?: WorkPanelItemState;
  /** Terminal completion time in Unix milliseconds, required for prompt retention. */
  endedAt?: number;
  statusTone?: WorkPanelStatusTone;
  /** Override the state-derived color, e.g. pending Todos use normal text. */
  statusGlyphRole?: WorkPanelSegmentRole;
  /** Semantic override, never a literal glyph or callback. Running overrides animate natively. */
  statusGlyph?: WorkPanelStatusGlyph;
  extraRows?: readonly string[];
  extraSegments?: readonly (readonly WorkPanelSegment[])[];
  secondary?: string;
  elapsed?: string;
  kind?: string;
  model?: string;
  effort?: string;
  tool?: string;
  tokens?: string;
  command?: string;
  facts?: string[];
  sortStartedAt?: number;
  expiresAt?: number;
}

export interface WorkPanelSummary {
  /** Complete heading counter when the provider has domain-specific wording. */
  text?: string;
  segments?: readonly WorkPanelSegment[];
  running?: number;
  failed?: number;
  completed?: number;
  total?: number;
}

export interface WorkPanelDetail {
  providerId?: string;
  id: string;
  title: string;
  status?: string;
  statusTone?: WorkPanelStatusTone;
  subtitle?: string;
  metadata: Array<{ label: string; value: string }>;
  foldedSections?: Array<{
    id: string;
    label: string;
    text: string;
    collapsedText?: string;
    expandedByDefault?: boolean;
  }>;
  evidence: {
    label: string;
    text: string;
    /** Shown dim when text is empty; defaults to `(no output yet)`. */
    emptyText?: string;
  };
  footerActions?: string[];
}

export interface WorkPanelCloseOutcome {
  action: string;
  providerId: string;
  id: string;
  status?: string;
}

export interface WorkPanelProvider {
  readonly version: typeof WORK_PANEL_VERSION;
  id: string;
  label: string;
  priority: number;
  /** Linger terminal outcomes, then collapse idle sections to history. */
  retention?: 'prompt';
  /** Advisory provider count; host cues and focus use selectable section rows instead. */
  visibleCount(): number;
  listRows(now: number): WorkPanelRow[];
  detail(
    id: string,
    now: number,
    options?: { logTailLines?: number },
  ): WorkPanelDetail | null;
  armCloseLabel(row: WorkPanelRow): string;
  // biome-ignore lint/suspicious/noConfusingVoidType: no-op providers need not return an outcome.
  close(id: string): WorkPanelCloseOutcome | void;
  /** Generic detail uses the 10/25-line tail and enables `l` only when declared. */
  supportsLogTail?: boolean;
  /** Resolve only once the custom detail UI is closed; input is suspended until then. */
  // biome-ignore lint/suspicious/noConfusingVoidType: synchronous no-ops and awaited custom UIs are supported.
  open?(id: string, ctx: ExtensionContext): void | Promise<unknown>;
  /** Heading/summary action; resolves only after the provider's UI closes. */
  // biome-ignore lint/suspicious/noConfusingVoidType: synchronous no-ops and awaited custom UIs are supported.
  openHistory?(ctx: ExtensionContext): void | Promise<unknown>;
  /** Make the expanded section heading selectable; Enter calls openHistory. */
  selectableHeading?: boolean;
  /** Make provider and overflow summary lines selectable; Enter calls openHistory. */
  selectableSummary?: boolean;
  /** Label for the exact number of omitted dropFirst items; other overflow stays `+N more`. */
  droppedSummary?(count: number): string;
  summary?(): WorkPanelSummary | string;
  showSection?(rows: WorkPanelRow[], now: number): boolean;
  parentRow?(now: number): WorkPanelRow | null;
  onVisibleChanged?(notify: () => void): () => void;
  /** Host ticks only while this provider has running/in_progress rows (minimum 100ms). */
  refreshIntervalMs?: number;
  /** Preferred item cap; spare height shows more items. Summaries do not count. Default 3. */
  rowCap?: number;
}

export type WorkPanelAction = 'open' | 'history' | 'close';
export type WorkPanelActionResult = 'ok' | 'unavailable' | 'missing';

/** Actions require a live context bound to an installed host in the same session. */
export async function invokeWorkPanelAction(
  ctx: ExtensionContext,
  id: string,
  rowId: string | undefined,
  action: WorkPanelAction,
): Promise<WorkPanelActionResult> {
  const state = workPanelRegistry(false);
  const provider = state?.providers.get(id)?.provider;
  if (!provider) return 'missing';
  const host = safely(() => {
    const current = state.hosts.get(ctx.sessionManager);
    return current?.sessionId === ctx.sessionManager.getSessionId()
      ? current
      : undefined;
  }, undefined);
  try {
    return await (host?.invokeAction?.(ctx, provider, rowId, action) ??
      'unavailable');
  } catch {
    return 'unavailable';
  }
}

export interface WorkPanelSource {
  id: string;
  label: string;
  priority: number;
  version: typeof WORK_PANEL_VERSION;
  revision: number;
  selectableHeading: boolean;
  selectableSummary: boolean;
  rowCap: number;
}

/** Discovery never claims the ownership slot or installs UI. */
export function listWorkPanelSources(): WorkPanelSource[] {
  return [...(workPanelRegistry(false)?.providers.values() ?? [])]
    .map(({ provider, revision }) => ({
      id: provider.id,
      label: provider.label,
      priority: provider.priority,
      version: provider.version,
      revision,
      selectableHeading: provider.selectableHeading === true,
      selectableSummary: provider.selectableSummary === true,
      rowCap: provider.rowCap ?? 3,
    }))
    .sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
}

/** Provider-ordered rows, independent of host visibility/retention and height budgets. */
export function getWorkPanelSourceRows(
  id: string,
  options: { maxRows: number },
): WorkPanelRow[] {
  const provider = workPanelRegistry(false)?.providers.get(id)?.provider;
  if (!provider || !Number.isFinite(options.maxRows)) return [];
  const cap = provider.rowCap ?? 3;
  if (!Number.isFinite(cap)) return [];
  const limit = Math.max(0, Math.floor(Math.min(options.maxRows, cap)));
  return limit
    ? safely(
        () =>
          provider
            .listRows(Date.now())
            .slice(0, limit)
            .map((row) => {
              // Discard legacy render callbacks and executable top-level members at this public boundary.
              const data = Object.fromEntries(
                Object.entries(row).filter(
                  ([key, value]) =>
                    key !== 'render' && typeof value !== 'function',
                ),
              ) as unknown as WorkPanelRow;
              if (
                row.statusGlyph !== undefined &&
                workPanelStatusGlyph(row) === undefined
              )
                data.statusGlyph = workPanelRenderStatus(row);
              return data;
            }),
        [],
      )
    : [];
}

/** Synchronous post-mutation notifications; one listener cannot break another. */
export function subscribeWorkPanelRegistry(
  listener: (id: string) => void,
): () => void {
  const state = workPanelRegistry();
  if (!state) return () => {};
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

function notifyRegistry(id: string): void {
  for (const listener of [...(workPanelRegistry(false)?.listeners ?? [])])
    safely(() => listener(id), undefined);
}

function refresh(): void {
  for (const host of workPanelRegistry()?.hosts.values() ?? []) host.refresh();
}

/**
 * Read-only root editor identity/focus/overlay/suspension guard for this session.
 * Unlike Work navigation, this does not require an empty editor or panel focus.
 * Returns undefined if the session has no installed host; callers own that fallback.
 */
export function isWorkPanelRootEditorInputActive(
  ctx: ExtensionContext,
): boolean | undefined {
  const host = workPanelRegistry(false)?.hosts.get(ctx?.sessionManager);
  if (!host || host.sessionId !== ctx.sessionManager.getSessionId())
    return undefined;
  return host.isRootEditorInputActive();
}

/**
 * Register with `pi` to automatically tear down the session host on session_shutdown.
 * Context-only callers must release the disposer returned by ensureWorkPanel on shutdown.
 * Replacing an id is token-owned: a stale unregister cannot remove its replacement.
 */
export function registerWorkPanelProvider(
  owner: ExtensionAPI | ExtensionContext,
  provider: WorkPanelProvider,
): () => void {
  if (provider.version !== WORK_PANEL_VERSION) return () => {};
  const state = workPanelRegistry();
  if (!state) return () => {};
  const previous = state.providers.get(provider.id);
  safely(() => previous?.unsubscribe?.(), undefined);
  safely(() => previous?.removeShutdown?.(), undefined);
  const revision = (state.revisions.get(provider.id) ?? 0) + 1;
  state.revisions.set(provider.id, revision);
  const registration: Registration = { provider, revision };
  state.providers.set(provider.id, registration);
  if ('on' in owner) {
    registration.removeShutdown = owner.on(
      'session_shutdown',
      (_event, ctx) => {
        const host = state.hosts.get(ctx.sessionManager);
        host?.dispose();
      },
    );
  }
  notifyRegistry(provider.id);
  if (state.providers.get(provider.id) !== registration) return () => {};
  registration.unsubscribe = safely(
    () =>
      provider.onVisibleChanged?.(() => {
        if (state.providers.get(provider.id) !== registration) return;
        registration.revision += 1;
        state.revisions.set(provider.id, registration.revision);
        notifyRegistry(provider.id);
        refresh();
      }),
    undefined,
  );
  if (state.providers.get(provider.id) !== registration) {
    safely(() => registration.unsubscribe?.(), undefined);
    return () => {};
  }
  refresh();
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    if (state.providers.get(provider.id) !== registration) return;
    state.providers.delete(provider.id);
    safely(() => registration.unsubscribe?.(), undefined);
    safely(() => registration.removeShutdown?.(), undefined);
    notifyRegistry(provider.id);
    if (!state.providers.size) {
      for (const host of [...state.hosts.values()]) host.dispose();
    } else refresh();
  };
}

/**
 * Lazily install one host per session manager/session id, sharing concurrent installs.
 * Every call holds a reference; release is idempotent and the last release tears down.
 * Also torn down on the last provider unregister, or session_shutdown for pi owners.
 * With ctx-only registrations, callers MUST release on session_shutdown themselves.
 * Missing optional Pi peers/hooks fail closed (no input interception), never throw.
 */
export async function ensureWorkPanel(
  ctx: ExtensionContext,
): Promise<() => void> {
  if (!ctx.hasUI || ctx.mode !== 'tui') return () => {};
  const state = workPanelRegistry();
  if (!state) return () => {};
  const key = ctx.sessionManager;
  const sessionId = ctx.sessionManager.getSessionId();
  let host = state.hosts.get(key);
  if (host && host.sessionId !== sessionId) {
    host.dispose();
    host = undefined;
  }
  if (!host) {
    host = createWorkPanelHost(
      ctx,
      () => [...state.providers.values()].map(({ provider }) => provider),
      () => {
        if (state.hosts.get(key) === host) state.hosts.delete(key);
      },
    );
    state.hosts.set(key, host);
  }
  const held = host;
  held.holders += 1;
  await held.ready;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.holders -= 1;
    if (!held.holders) held.dispose();
  };
}
