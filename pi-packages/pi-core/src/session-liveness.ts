const REGISTRY_KEY = Symbol.for('@agegr/pi-web/session-liveness/v1');

export interface SessionLivenessProvider {
  name: string;
  sessionId: string;
  sessionFile?: string;
  isActive(): unknown;
}

export interface SessionLivenessRegistry {
  version: 1;
  register(provider: SessionLivenessProvider): () => void;
  hasActiveProvider(session: {
    sessionId?: string;
    sessionFile?: string;
  }): boolean;
}

const noop = () => {};
const nonblank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Shares Orca's v1 registry regardless of extension load order. An occupied,
 * incompatible slot is left untouched; callers then register as a no-op. */
export function getOrInstallSessionLivenessRegistry():
  | SessionLivenessRegistry
  | undefined {
  const shared = globalThis as unknown as Record<symbol, unknown>;
  const existing = shared[REGISTRY_KEY];
  if (existing !== undefined) {
    const registry = existing as Partial<SessionLivenessRegistry> | null;
    return registry &&
      typeof registry === 'object' &&
      registry.version === 1 &&
      typeof registry.register === 'function' &&
      typeof registry.hasActiveProvider === 'function'
      ? (registry as SessionLivenessRegistry)
      : undefined;
  }
  const providers = new Map<symbol, SessionLivenessProvider>();
  const registry: SessionLivenessRegistry = {
    version: 1,
    register(provider) {
      if (
        !provider ||
        typeof provider !== 'object' ||
        !nonblank(provider.name) ||
        !nonblank(provider.sessionId) ||
        (provider.sessionFile !== undefined &&
          !nonblank(provider.sessionFile)) ||
        typeof provider.isActive !== 'function'
      )
        throw new Error('Session liveness provider is invalid');
      // Retain the original object: Orca reads identifiers and activity live.
      const key = Symbol(String(provider.name));
      providers.set(key, provider);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        providers.delete(key);
      };
    },
    hasActiveProvider(session) {
      const identifiers = new Set(
        [session.sessionId, session.sessionFile].filter(Boolean),
      );
      for (const provider of providers.values()) {
        if (
          !identifiers.has(provider.sessionId) &&
          !(provider.sessionFile && identifiers.has(provider.sessionFile))
        )
          continue;
        try {
          if (provider.isActive() !== false) return true;
        } catch {
          return true;
        }
      }
      return false;
    },
  };
  shared[REGISTRY_KEY] = registry;
  return registry;
}

export function registerSessionLivenessProvider(
  provider: SessionLivenessProvider,
): () => void {
  return getOrInstallSessionLivenessRegistry()?.register(provider) ?? noop;
}
