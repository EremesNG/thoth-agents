import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { createWorkPanelHost, type WorkPanelHost } from './work-panel-host.js';
import { safely } from './work-panel-render.js';

export const WORK_PANEL_VERSION = 1 as const;

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
  | 'muted';

export interface WorkPanelSegment {
  text: string;
  role: WorkPanelSegmentRole;
}

/** Provider-owned formatting gets the body width, excluding selection/tree/status gutters. */
export interface WorkPanelRowContent {
  text: string;
  /** Styled counterpart of text; separators belong to the segments. */
  segments?: readonly WorkPanelSegment[];
  /** Styled counterparts of extraRows, in the same order. */
  extraSegments?: readonly (readonly WorkPanelSegment[])[];
  /** Narrow-width metrics or other continuations; never independently selectable. */
  extraRows?: readonly string[];
}

export interface WorkPanelRow {
  id: string;
  primary: string;
  segments?: readonly WorkPanelSegment[];
  /** Nonselectable section summary; excluded from item caps and overflow counts. */
  summary?: boolean;
  providerId?: string;
  name?: string;
  status?: string;
  statusTone?: WorkPanelStatusTone;
  /** Override the state-derived color, e.g. pending Todos use normal text. */
  statusGlyphRole?: WorkPanelSegmentRole;
  /** Overrides the host indicator, including producer-owned animated glyphs. */
  statusGlyph?: string | ((now: number) => string);
  render?: (width: number, now: number) => WorkPanelRowContent;
  extraRows?: readonly string[];
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
  evidence: { label: string; text: string };
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
  /** Resolve only once the custom detail UI is closed; input is suspended until then. */
  // biome-ignore lint/suspicious/noConfusingVoidType: synchronous no-ops and awaited custom UIs are supported.
  open?(id: string, ctx: ExtensionContext): void | Promise<unknown>;
  summary?(): WorkPanelSummary | string;
  showSection?(rows: WorkPanelRow[], now: number): boolean;
  parentRow?(now: number): WorkPanelRow | null;
  onVisibleChanged?(notify: () => void): () => void;
  /** Host ticks only while this provider has running/in_progress rows (minimum 100ms). */
  refreshIntervalMs?: number;
  /** Preferred item cap; spare height shows more items. Summaries do not count. Default 3. */
  rowCap?: number;
}

// All mutable ownership, including in-flight installation, lives across bundled copies.
const registryKey = Symbol.for('thoth.pi-core.work-panel');
interface Registration {
  provider: WorkPanelProvider;
  unsubscribe?: () => void;
  removeShutdown?: () => void;
}
interface Registry {
  version: typeof WORK_PANEL_VERSION;
  providers: Map<string, Registration>;
  hosts: Map<object, WorkPanelHost>;
}
const shared = globalThis as typeof globalThis & { [registryKey]?: Registry };
function registry(): Registry {
  if (!shared[registryKey]) {
    shared[registryKey] = {
      version: WORK_PANEL_VERSION,
      providers: new Map(),
      hosts: new Map(),
    };
  }
  return shared[registryKey];
}

function refresh(): void {
  for (const host of registry().hosts.values()) host.refresh();
}

/**
 * Read-only root editor identity/focus/overlay/suspension guard for this session.
 * Unlike Work navigation, this does not require an empty editor or panel focus.
 * Returns undefined if the session has no installed host; callers own that fallback.
 */
export function isWorkPanelRootEditorInputActive(
  ctx: ExtensionContext,
): boolean | undefined {
  const host = shared[registryKey]?.hosts.get(ctx?.sessionManager);
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
  const state = registry();
  const previous = state.providers.get(provider.id);
  safely(() => previous?.unsubscribe?.(), undefined);
  safely(() => previous?.removeShutdown?.(), undefined);
  const registration: Registration = { provider };
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
  registration.unsubscribe = safely(
    () => provider.onVisibleChanged?.(refresh),
    undefined,
  );
  refresh();
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    if (state.providers.get(provider.id) !== registration) return;
    state.providers.delete(provider.id);
    safely(() => registration.unsubscribe?.(), undefined);
    safely(() => registration.removeShutdown?.(), undefined);
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
  const state = registry();
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
