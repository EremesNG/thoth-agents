import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  type Catalog,
  projectModels,
  readCatalog,
  refreshCatalog,
} from '../src/catalog.js';
import {
  type NativeToolActivity,
  renderNativeEvent,
} from '../src/native-display.js';
import { createPermissionGate, type PermissionUI } from '../src/permissions.js';
import { createJunieProvider } from '../src/provider.js';
import { fetchJunieQuota } from '../src/quota.js';
export { createJunieProvider };

const KEY = Symbol.for('thoth-agents.pi-junie-bridge.registration.v1');
/**
 * The state below lives on the process-global object, so it survives `/reload`
 * and an upgrade replaces the bundle while the state object stays. Bump this
 * whenever the shape changes or the provider contract it holds changes: a state
 * from another version is disposed and rebuilt, never reused, so a reload always
 * runs the new bundle's provider code and never reads a map the old one lacked.
 */
const STATE_VERSION = 3;
interface SharedState {
  version: number;
  refresh?: Promise<Catalog>;
  ui: Map<string, PermissionUI>;
  nativeSinks: Map<string, (event: NativeToolActivity) => void>;
  sessions: Map<string, { cwd: string }>;
  provider: ReturnType<typeof createJunieProvider>;
}
type Shared = Partial<Omit<SharedState, 'provider'>> & {
  provider?: Partial<SharedState['provider']>;
};
const shared = globalThis as typeof globalThis & { [KEY]?: Shared };

/** A state from this exact version, with every map the handlers below touch. */
function reusable(candidate: Shared | undefined): candidate is SharedState {
  return (
    candidate?.version === STATE_VERSION &&
    candidate.ui instanceof Map &&
    candidate.nativeSinks instanceof Map &&
    candidate.sessions instanceof Map &&
    typeof candidate.provider?.streamSimple === 'function' &&
    typeof candidate.provider.close === 'function'
  );
}

/**
 * Best effort: the previous bundle's provider may lack `close`, throw, or reject
 * while tearing down, and a reload must continue regardless.
 */
function dispose(stale: Shared): void {
  try {
    const closing = stale.provider?.close?.();
    void Promise.resolve(closing).catch(() => {});
  } catch {
    // Unreachable for this version's provider; an older one may still throw.
  }
}

function forget<V>(map: Map<string, V> | undefined, id: string): void {
  map?.delete(id);
}

export default function junieBridge(pi: ExtensionAPI): void {
  pi.registerEntryRenderer('junie-native-event', renderNativeEvent);
  const existing = shared[KEY];
  const reused = reusable(existing) ? existing : undefined;
  // `first` means this bundle created the state, so it also owns registration:
  // on an upgrade the state is rebuilt and the new provider is registered at
  // load, exactly like a cold start.
  const first = !reused;
  let state = reused;
  if (!state) {
    if (existing) dispose(existing);
    const gate = createPermissionGate();
    const fresh: SharedState = {
      version: STATE_VERSION,
      sessions: new Map(),
      ui: new Map(),
      nativeSinks: new Map(),
      provider: createJunieProvider({
        onCatalogUpdate: (catalog) => register(catalog),
        onNativeEvent: (event, id) => {
          if (id) fresh.nativeSinks.get(id)?.(event);
        },
        getSession: (id) => fresh.sessions.get(id),
        onPermission: (params, signal, id) =>
          gate.request(params, {
            signal,
            ui: id ? fresh.ui.get(id) : undefined,
          }),
      }),
    };
    shared[KEY] = fresh;
    state = fresh;
  }
  const register = (catalog = readCatalog()) =>
    pi.registerProvider('junie', {
      name: 'Junie (JetBrains AI)',
      api: 'junie-bridge',
      baseUrl: 'junie-bridge://junie',
      apiKey: 'not-required',
      models: catalog ? projectModels(catalog) : [],
      streamSimple: state.provider.streamSimple,
    });
  if (first) register();
  pi.on('session_start', (_event, ctx) => {
    const id = ctx.sessionManager.getSessionId();
    state.sessions.set(id, { cwd: ctx.cwd });
    forget(state.ui, id);
    forget(state.nativeSinks, id);
    if (ctx.hasUI) {
      state.ui.set(id, ctx.ui);
      state.nativeSinks.set(id, (event) =>
        pi.appendEntry('junie-native-event', event),
      );
    }
    if (!first && !ctx.modelRegistry.getProvider('junie')) register();
  });
  pi.on('session_shutdown', async (_event, ctx) => {
    const id = ctx.sessionManager.getSessionId();
    forget(state.ui, id);
    forget(state.sessions, id);
    try {
      await state.provider.close(id);
    } finally {
      // Released after close, without waiting for display-only telemetry: a line
      // that resolves past this point has no sink and is dropped.
      forget(state.nativeSinks, id);
    }
  });
  pi.registerCommand('junie', {
    description: 'Junie: quota or models (refresh model catalog)',
    handler: async (args, ctx) => {
      switch (args.trim()) {
        case 'quota':
          ctx.ui.setStatus('junie-quota', 'checking junie quota…');
          try {
            ctx.ui.notify(await fetchJunieQuota({ cwd: ctx.cwd }), 'info');
          } finally {
            ctx.ui.setStatus('junie-quota', undefined);
          }
          break;
        case 'models':
          try {
            state.refresh ??= refreshCatalog({ cwd: ctx.cwd });
            const refresh = state.refresh;
            try {
              const catalog = await refresh;
              register(catalog);
              ctx.ui.notify(
                `${catalog.models.length} Junie models refreshed`,
                'info',
              );
            } finally {
              if (state.refresh === refresh) state.refresh = undefined;
            }
          } catch (error) {
            ctx.ui.notify(
              `Junie models unavailable: ${error instanceof Error ? error.message : String(error)}`,
              'warning',
            );
          }
          break;
        default:
          ctx.ui.notify('Usage: /junie quota | /junie models', 'info');
      }
    },
  });
  // Discovery never prompts. A missing/login-required CLI is surfaced explicitly.
  if (first && !readCatalog()) {
    state.refresh = refreshCatalog();
    const refresh = state.refresh;
    void refresh
      .then((catalog) => register(catalog))
      .catch((error) =>
        console.warn(
          `Junie model discovery failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
      .finally(() => {
        if (state.refresh === refresh) state.refresh = undefined;
      });
  }
}
