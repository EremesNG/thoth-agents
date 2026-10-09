import {
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from './validation.js';

/** Account-wide observation; timestamps are Unix milliseconds. */
export interface ProviderLimitEntry {
  readonly provider: string;
  readonly window: string;
  readonly status: 'allowed' | 'allowed_warning' | 'rejected';
  readonly utilization?: number;
  readonly resetsAt?: number;
  readonly observedAt: number;
  readonly windowType?: string;
  readonly overageInUse?: boolean;
  readonly overageEnabled?: boolean;
  readonly isUsingOverage?: boolean;
  readonly sessionId: string;
}

export type ProviderLimitListener = (entry: ProviderLimitEntry) => void;

interface Registry {
  version: 1;
  entries: Map<string, ProviderLimitEntry>;
  listeners: Set<ProviderLimitListener>;
}

const registryKey = Symbol.for('thoth.pi-core.provider-limits.v1');
const shared = globalThis as typeof globalThis & { [registryKey]?: unknown };

function registry(): Registry | undefined {
  try {
    if (shared[registryKey] === undefined) {
      shared[registryKey] = {
        version: 1,
        entries: new Map(),
        listeners: new Set(),
      };
    }
    const state = shared[registryKey] as Registry | null;
    if (
      state?.version !== 1 ||
      !(state.entries instanceof Map) ||
      !(state.listeners instanceof Set)
    )
      return undefined;
    for (const [key, value] of state.entries) {
      const entry = parseEntry(value);
      if (!entry || key !== entryKey(entry)) return undefined;
    }
    for (const listener of state.listeners) {
      if (typeof listener !== 'function') return undefined;
    }
    return state;
  } catch {
    // Incompatible copies and foreign accessors must not break extension activation.
    return undefined;
  }
}

function entryKey(entry: ProviderLimitEntry): string {
  return JSON.stringify([entry.provider, entry.window]);
}

const entryKeys = [
  'provider',
  'window',
  'status',
  'utilization',
  'resetsAt',
  'observedAt',
  'windowType',
  'overageInUse',
  'overageEnabled',
  'isUsingOverage',
  'sessionId',
] as const;

function parseEntry(value: unknown): ProviderLimitEntry | undefined {
  if (!isRecord(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    !keys.every(
      (key) =>
        typeof key === 'string' && entryKeys.some((allowed) => allowed === key),
    )
  )
    return undefined;
  // Capture values once so foreign getters cannot change fields after validation.
  const entry = Object.fromEntries(
    keys.map((key) => [key, value[key as string]]),
  );
  if (
    !isNonEmptyString(entry.provider) ||
    !isNonEmptyString(entry.window) ||
    !isNonEmptyString(entry.sessionId) ||
    !['allowed', 'allowed_warning', 'rejected'].some(
      (status) => status === entry.status,
    ) ||
    !isNonNegativeInteger(entry.observedAt) ||
    (entry.resetsAt !== undefined && !isNonNegativeInteger(entry.resetsAt)) ||
    (entry.utilization !== undefined &&
      !(
        typeof entry.utilization === 'number' &&
        Number.isFinite(entry.utilization) &&
        entry.utilization >= 0 &&
        entry.utilization <= 1
      )) ||
    (entry.windowType !== undefined && !isNonEmptyString(entry.windowType)) ||
    !['overageInUse', 'overageEnabled', 'isUsingOverage'].every(
      (key) => entry[key] === undefined || typeof entry[key] === 'boolean',
    )
  )
    return undefined;
  return Object.freeze(entry) as unknown as ProviderLimitEntry;
}

/** Replace one provider/window; malformed observations are ignored, never thrown. */
export function reportProviderLimit(value: unknown): boolean {
  try {
    const entry = parseEntry(value);
    if (!entry) return false;
    const state = registry();
    if (!state) return false;
    state.entries.set(entryKey(entry), entry);
    for (const listener of [...state.listeners]) {
      if (!state.listeners.has(listener)) continue;
      try {
        listener(entry);
      } catch {
        // One consumer must not prevent attribution capture by the others.
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Read the latest observations across all in-process sessions. */
export function listProviderLimits(now = Date.now()): ProviderLimitEntry[] {
  try {
    const state = registry();
    if (!state) return [];
    const result: ProviderLimitEntry[] = [];
    for (const value of state.entries.values()) {
      const entry = parseEntry(value);
      if (!entry) return [];
      if (entry.resetsAt === undefined || entry.resetsAt > now) {
        result.push(entry);
      } else {
        const { utilization: _utilization, ...expired } = entry;
        result.push(Object.freeze({ ...expired, status: 'allowed' }));
      }
    }
    return result;
  } catch {
    return [];
  }
}

/** Observe reports immediately; no initial replay or UI installation. */
export function subscribeProviderLimits(
  listener: ProviderLimitListener,
): () => void {
  try {
    const state = registry();
    if (!state || typeof listener !== 'function') return () => {};
    const subscription: ProviderLimitListener = (entry) => listener(entry);
    state.listeners.add(subscription);
    return () => {
      try {
        state.listeners.delete(subscription);
      } catch {
        // A foreign copy may have replaced the listener set since subscription.
      }
    };
  } catch {
    return () => {};
  }
}
