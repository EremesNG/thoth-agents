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
interface SharedState {
  refresh?: Promise<Catalog>;
  ui: Map<string, PermissionUI>;
  nativeSinks: Map<string, (event: NativeToolActivity) => void>;
  sessions: Map<string, { cwd: string }>;
  provider: ReturnType<typeof createJunieProvider>;
}
const shared = globalThis as typeof globalThis & { [KEY]?: SharedState };
export default function junieBridge(pi: ExtensionAPI): void {
  pi.registerEntryRenderer('junie-native-event', renderNativeEvent);
  const first = !shared[KEY];
  if (!shared[KEY]) {
    const gate = createPermissionGate();
    const state: SharedState = {
      sessions: new Map(),
      ui: new Map(),
      nativeSinks: new Map(),
      provider: createJunieProvider({
        onCatalogUpdate: (catalog) => register(catalog),
        onNativeEvent: (event, id) => {
          if (id) state.nativeSinks.get(id)?.(event);
        },
        getSession: (id) => state.sessions.get(id),
        onPermission: (params, signal, id) =>
          gate.request(params, {
            signal,
            ui: id ? state.ui.get(id) : undefined,
          }),
      }),
    };
    shared[KEY] = state;
  }
  const state = shared[KEY]!;
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
    state.ui.delete(id);
    state.nativeSinks.delete(id);
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
    state.ui.delete(id);
    state.sessions.delete(id);
    try {
      await state.provider.close(id);
    } finally {
      // Released after close, without waiting for display-only telemetry: a line
      // that resolves past this point has no sink and is dropped.
      state.nativeSinks.delete(id);
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
