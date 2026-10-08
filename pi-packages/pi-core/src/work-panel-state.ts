import type { WorkPanelProvider } from './work-panel.js';
import type { WorkPanelHost } from './work-panel-host.js';
import type { WorkPanelLifecycleState } from './work-panel-lifecycle.js';

export const WORK_PANEL_VERSION = 1 as const;

export interface Registration {
  provider: WorkPanelProvider;
  unsubscribe?: () => void;
  removeShutdown?: () => void;
}
export interface Lifecycle {
  sessionId: string;
  state: WorkPanelLifecycleState;
  candidates: string[];
  dispose?: () => void;
}
interface Registry {
  version: typeof WORK_PANEL_VERSION;
  providers: Map<string, Registration>;
  hosts: Map<object, WorkPanelHost>;
  lifecycle: {
    sessions: WeakMap<object, Lifecycle>;
    listeners: WeakMap<object, Set<() => void>>;
  };
}

// Never version this key: all contracts must arbitrate ownership before installing UI.
// Keep the old providers/hosts fields so a legacy copy activated later sees our host.
const registryKey = Symbol.for('thoth.pi-core.work-panel');
const shared = globalThis as typeof globalThis & { [registryKey]?: unknown };

/** Incompatible (including pre-change layout) owners are left untouched. */
export function workPanelRegistry(create = true): Registry | undefined {
  try {
    if (create && shared[registryKey] === undefined) {
      shared[registryKey] = {
        version: WORK_PANEL_VERSION,
        providers: new Map(),
        hosts: new Map(),
        lifecycle: { sessions: new WeakMap(), listeners: new WeakMap() },
      };
    }
    const state = shared[registryKey] as Registry | null;
    if (
      state?.version === WORK_PANEL_VERSION &&
      state.providers instanceof Map &&
      state.hosts instanceof Map &&
      state.lifecycle?.sessions instanceof WeakMap &&
      state.lifecycle.listeners instanceof WeakMap
    )
      return state;
  } catch {
    // Foreign records and accessors must not break extension activation.
  }
  return undefined;
}
