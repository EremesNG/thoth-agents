import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import type { SessionEntriesSource } from './cost.ts';

export interface SessionTokenTotals {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** Main-session totals across the same entry types and history scope as cost. */
export function calculateSessionTokens(
  source: readonly SessionEntry[] | SessionEntriesSource | undefined | null,
): SessionTokenTotals {
  const entries: readonly SessionEntry[] = Array.isArray(source)
    ? source
    : source &&
        typeof (source as SessionEntriesSource).getEntries === 'function'
      ? (source as SessionEntriesSource).getEntries()
      : [];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const entry of entries) {
    if (!entry) continue;
    const usage =
      entry.type === 'message'
        ? (entry.message?.role === 'assistant' ||
            entry.message?.role === 'toolResult') &&
          'usage' in entry.message
          ? entry.message.usage
          : undefined
        : (entry.type === 'branch_summary' ||
              entry.type === 'compaction' ||
              entry.type === 'usage') &&
            'usage' in entry
          ? entry.usage
          : undefined;
    if (!usage) continue;
    for (const field of [
      'input',
      'output',
      'cacheRead',
      'cacheWrite',
    ] as const) {
      const value = usage[field];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        totals[field] += value;
      }
    }
  }
  return totals;
}
