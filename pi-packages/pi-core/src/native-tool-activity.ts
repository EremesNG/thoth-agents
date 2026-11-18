/** A provider-native tool currently in flight; since is Unix milliseconds. */
export interface NativeToolActivity {
  readonly key: string;
  readonly name: string;
  readonly since: number;
}

interface Registry {
  version: 1;
  sessions: Map<string, Map<string, NativeToolActivity>>;
}

const registryKey = Symbol.for('thoth.pi-core.native-tool-activity.v1');
const shared = globalThis as typeof globalThis & { [registryKey]?: unknown };
const noop = () => {};
const nonblank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

function registry(): Registry | undefined {
  try {
    if (shared[registryKey] === undefined) {
      shared[registryKey] = { version: 1, sessions: new Map() };
    }
    const state = shared[registryKey] as Registry | null;
    if (state?.version !== 1 || !(state.sessions instanceof Map))
      return undefined;
    for (const [session, entries] of state.sessions) {
      if (!nonblank(session) || !(entries instanceof Map)) return undefined;
      for (const [key, entry] of entries) {
        if (
          !nonblank(key) ||
          !entry ||
          entry.key !== key ||
          typeof entry.name !== 'string' ||
          !Number.isFinite(entry.since) ||
          entry.since < 0
        )
          return undefined;
      }
    }
    return state;
  } catch {
    return undefined;
  }
}

/** Re-beginning a key refreshes its start time and supersedes its prior release. */
export function beginNativeTool(
  sessionId: string,
  key: string,
  name: string,
): () => void {
  try {
    if (!nonblank(sessionId) || !nonblank(key) || typeof name !== 'string')
      return noop;
    const state = registry();
    if (!state) return noop;
    let entries = state.sessions.get(sessionId);
    if (!entries) {
      entries = new Map();
      state.sessions.set(sessionId, entries);
    }
    const entry = { key, name, since: Date.now() };
    entries.set(key, entry);
    let released = false;
    return () => {
      try {
        if (released) return;
        released = true;
        if (
          state.sessions.get(sessionId) !== entries ||
          entries.get(key) !== entry
        )
          return;
        entries.delete(key);
        if (entries.size === 0) state.sessions.delete(sessionId);
      } catch {
        // Foreign state must never break callers.
      }
    };
  } catch {
    return noop;
  }
}

/** Clear only the selected session, including any leaked entries. */
export function clearNativeTools(sessionId: string): void {
  try {
    if (nonblank(sessionId)) registry()?.sessions.delete(sessionId);
  } catch {
    // Ignore incompatible or externally modified state.
  }
}

/** Return snapshots, so callers cannot mutate shared entries. */
export function listNativeTools(
  sessionId: string,
): readonly NativeToolActivity[] {
  try {
    if (!nonblank(sessionId)) return [];
    const entries = registry()?.sessions.get(sessionId);
    return entries
      ? Array.from(entries.values(), ({ key, name, since }) => ({
          key,
          name,
          since,
        }))
      : [];
  } catch {
    return [];
  }
}
