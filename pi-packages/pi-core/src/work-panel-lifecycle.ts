import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';

export interface WorkPanelLifecycleState {
  readonly epoch: number;
  /** Terminal rows belong to the epoch in which they ended (Unix milliseconds). */
  readonly epochStartedAt: number;
  readonly busy: boolean;
}

interface Lifecycle {
  sessionId: string;
  state: WorkPanelLifecycleState;
  candidates: string[];
  dispose?: () => void;
}
interface LifecycleRegistry {
  sessions: WeakMap<object, Lifecycle>;
  listeners: WeakMap<object, Set<() => void>>;
}
const registryKey = Symbol.for('thoth.pi-core.work-panel-lifecycle.v1');
const shared = globalThis as typeof globalThis & {
  [registryKey]?: LifecycleRegistry;
};
const CANDIDATE_LIMIT = 4;
function registry(): LifecycleRegistry {
  if (!shared[registryKey]) {
    shared[registryKey] = {
      sessions: new WeakMap(),
      listeners: new WeakMap(),
    };
  }
  return shared[registryKey];
}
function isBusy(ctx: ExtensionContext): boolean {
  return typeof ctx.isIdle === 'function' && !ctx.isIdle();
}
function notify(key: object): void {
  for (const listener of registry().listeners.get(key) ?? []) listener();
}
function lifecycle(ctx: ExtensionContext): Lifecycle {
  const sessions = registry().sessions;
  const key = ctx.sessionManager;
  const sessionId = key.getSessionId();
  let current = sessions.get(key);
  if (current?.sessionId !== sessionId) {
    current?.dispose?.();
    current = {
      sessionId,
      state: { epoch: 0, epochStartedAt: Date.now(), busy: isBusy(ctx) },
      candidates: [],
    };
    sessions.set(key, current);
  }
  return current;
}

/** Read-only session snapshot; does not install event handlers or UI. */
export function getWorkPanelLifecycle(
  ctx: ExtensionContext,
): WorkPanelLifecycleState {
  return { ...lifecycle(ctx).state };
}

/** Internal host notification seam, shared across separately bundled copies. */
export function onWorkPanelLifecycleChanged(
  ctx: ExtensionContext,
  listener: () => void,
): () => void {
  const key = ctx.sessionManager;
  const listeners = registry().listeners.get(key) ?? new Set();
  registry().listeners.set(key, listeners);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) registry().listeners.delete(key);
  };
}

/**
 * Extensions bind on activation, before ensureWorkPanel(ctx), regardless of retention.
 * Context-only provider registration cannot install these ExtensionAPI handlers.
 * The first live binding owns the subscriptions; later bindings are inert.
 * Disposal, session replacement and shutdown allow a new binding to take over.
 * Prompt identity is deliberately only observed-text equality, not origin proof.
 */
export function bindWorkPanelLifecycle(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
): () => void {
  const current = lifecycle(ctx);
  if (current.dispose) return () => {};
  const key = ctx.sessionManager;
  const removers: Array<() => void> = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const remove of removers.splice(0)) remove();
    current.candidates.length = 0;
    current.dispose = undefined;
    if (registry().sessions.get(key) === current)
      registry().sessions.delete(key);
    notify(key);
  };
  current.dispose = dispose;
  const active = (eventCtx: ExtensionContext) => {
    if (disposed || eventCtx.sessionManager !== key) return false;
    if (key.getSessionId() !== current.sessionId) {
      dispose();
      return false;
    }
    return true;
  };
  const refreshBusy = (_event: unknown, eventCtx: ExtensionContext) => {
    if (!active(eventCtx)) return;
    current.state = { ...current.state, busy: isBusy(eventCtx) };
    notify(key);
  };
  removers.push(
    pi.on('input', (event, eventCtx) => {
      if (
        !active(eventCtx) ||
        !['interactive', 'rpc'].includes(event.source) ||
        !eventCtx.isIdle() ||
        !event.text.trim()
      )
        return;
      current.candidates.push(event.text);
      current.candidates = current.candidates.slice(-CANDIDATE_LIMIT);
    }),
    pi.on('before_agent_start', (event, eventCtx) => {
      if (!active(eventCtx)) return;
      const index = current.candidates.indexOf(event.prompt);
      if (index < 0) return;
      current.candidates.splice(index, 1);
      current.state = {
        ...current.state,
        epoch: current.state.epoch + 1,
        epochStartedAt: Date.now(),
      };
      notify(key);
    }),
    pi.on('agent_start', refreshBusy),
    pi.on('agent_settled', refreshBusy),
    pi.on('session_start', (_event, eventCtx) => {
      active(eventCtx);
    }),
    pi.on('session_shutdown', (_event, eventCtx) => {
      if (eventCtx.sessionManager === key) dispose();
    }),
  );
  return dispose;
}
