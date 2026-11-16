import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import {
  type CacheExpiryConfig,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_PROVIDER_CACHE_TTL_MINUTES,
  usableTtlMinutes,
} from '../shared/config.ts';

const MINUTE_MS = 60_000;

/** Request start of the assistant message that last wrote the prompt cache. */
export interface CacheAnchor {
  /** Unix milliseconds when that request started. */
  readonly timestamp: number;
  readonly provider?: string;
}

export interface ResolvedCacheExpiry {
  enabled: boolean;
  ttlMinutes: number;
  providerTtlMinutes: Record<string, number>;
}

/**
 * Applies the package defaults to a config section, so programmatic configs
 * that omit `cacheExpiry` behave like the loaded ones.
 */
export function resolveCacheExpiry(
  settings: CacheExpiryConfig | undefined,
): ResolvedCacheExpiry {
  return {
    enabled: settings?.enabled ?? true,
    ttlMinutes:
      usableTtlMinutes(settings?.ttlMinutes) ?? DEFAULT_CACHE_TTL_MINUTES,
    providerTtlMinutes: {
      ...DEFAULT_PROVIDER_CACHE_TTL_MINUTES,
      ...settings?.providerTtlMinutes,
    },
  };
}

/**
 * Branch id chain from the leaf to the root. A `null` leaf means the current
 * branch is empty (`resetLeaf`), and an unresolvable id cannot be trusted: both
 * hide the countdown instead of borrowing another branch's request.
 */
function branchIds(
  entries: readonly SessionEntry[],
  leafId: string | null,
): Set<string> | undefined {
  if (leafId === null) return undefined;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (!byId.has(leafId)) return undefined;
  const ids = new Set<string>();
  for (
    let entry = byId.get(leafId);
    entry !== undefined && !ids.has(entry.id);
    entry = entry.parentId === null ? undefined : byId.get(entry.parentId)
  ) {
    ids.add(entry.id);
  }
  return ids;
}

/**
 * Latest assistant request in the session branch: its `timestamp` is when the
 * prompt cache was written, so a later request can reuse it. Entries without a
 * usable timestamp (legacy messages) and other message roles are skipped. A
 * branch that cannot be resolved (no leaf after `resetLeaf`, or an unknown
 * leaf) yields no anchor.
 */
export function findCacheAnchor(
  entries: readonly SessionEntry[] | undefined | null,
  leafId: string | null,
): CacheAnchor | undefined {
  if (!entries?.length) return undefined;
  const branch = branchIds(entries, leafId);
  if (!branch) return undefined;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (!branch.has(entry.id)) continue;
    if (entry.type !== 'message' || entry.message?.role !== 'assistant')
      continue;
    const message: { timestamp?: unknown; provider?: unknown } = entry.message;
    const timestamp = message.timestamp;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) continue;
    return typeof message.provider === 'string'
      ? { timestamp, provider: message.provider }
      : { timestamp };
  }
  return undefined;
}

/**
 * Milliseconds until the estimated prompt-cache expiry, rounded up to whole
 * seconds so repeated reads inside one second share a render key. Negative
 * values mean the cache already expired. `undefined` hides the indicator.
 */
export function cacheExpiryRemainingMs(
  anchor: CacheAnchor | undefined,
  settings: CacheExpiryConfig | undefined,
  now: number,
): number | undefined {
  const resolved = resolveCacheExpiry(settings);
  if (!resolved.enabled || anchor === undefined) return undefined;
  const minutes =
    resolved.providerTtlMinutes[anchor.provider ?? ''] ?? resolved.ttlMinutes;
  const remaining = anchor.timestamp + minutes * MINUTE_MS - now;
  return Math.ceil(remaining / 1000) * 1000;
}
