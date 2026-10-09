export interface UIPreferences {
  absorbedWorkPanelSources: string[];
  /** Evaluated on collection; false or throwing owners do not absorb sources. */
  isActive?: () => boolean;
}
export type UIPreferencesToken = symbol;

interface Registry {
  owners: Map<UIPreferencesToken, UIPreferences>;
  listeners: Set<() => void>;
}
const key = Symbol.for('thoth.pi-core.ui-preferences.v1');
const shared = globalThis as typeof globalThis & { [key]?: Registry };
function registry(): Registry {
  shared[key] ??= { owners: new Map(), listeners: new Set() };
  return shared[key];
}
function notify(): void {
  for (const listener of registry().listeners) {
    try {
      listener();
    } catch {
      // One UI owner must not prevent other hosts from refreshing.
    }
  }
}

/** Returns the live process-wide union; caller mutation and predicate failures are isolated. */
export function getUIPreferences(): UIPreferences {
  return {
    absorbedWorkPanelSources: [
      ...new Set(
        [...registry().owners.values()].flatMap((entry) => {
          try {
            return !entry.isActive || entry.isActive()
              ? entry.absorbedWorkPanelSources
              : [];
          } catch {
            // A lost UI owner must not hide sources or break other owners.
            return [];
          }
        }),
      ),
    ],
  };
}
export function registerUIPreferences(
  preferences: UIPreferences,
): UIPreferencesToken {
  const token = Symbol('ui-preferences-owner');
  registry().owners.set(token, {
    absorbedWorkPanelSources: [...preferences.absorbedWorkPanelSources],
    isActive: preferences.isActive,
  });
  notify();
  return token;
}
export function updateUIPreferences(
  token: UIPreferencesToken,
  preferences: UIPreferences,
): void {
  if (!registry().owners.has(token)) return;
  registry().owners.set(token, {
    absorbedWorkPanelSources: [...preferences.absorbedWorkPanelSources],
    isActive: preferences.isActive,
  });
  notify();
}
export function withdrawUIPreferences(token: UIPreferencesToken): void {
  if (registry().owners.delete(token)) notify();
}
export function subscribeUIPreferences(listener: () => void): () => void {
  registry().listeners.add(listener);
  return () => {
    registry().listeners.delete(listener);
  };
}
