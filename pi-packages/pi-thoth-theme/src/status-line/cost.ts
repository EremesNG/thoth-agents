import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import type { IconMode } from '../shared/config.ts';
import { iconFor } from '../shared/icons.ts';

export interface SessionEntriesSource {
  getEntries(): readonly SessionEntry[];
}

/**
 * Aggregates cumulative cost across all session entries.
 * Evaluates assistant messages, tool results, compactions, branch summaries,
 * and usage entries.
 */
export function calculateSessionCost(
  source: readonly SessionEntry[] | SessionEntriesSource | undefined | null,
): number {
  if (!source) return 0;
  const entries: readonly SessionEntry[] = Array.isArray(source)
    ? source
    : typeof (source as SessionEntriesSource).getEntries === 'function'
      ? (source as SessionEntriesSource).getEntries()
      : [];

  let totalCost = 0;
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.type === 'message') {
      const msg = entry.message;
      if (
        (msg?.role === 'assistant' || msg?.role === 'toolResult') &&
        'usage' in msg &&
        msg.usage?.cost?.total
      ) {
        totalCost += msg.usage.cost.total;
      }
    } else if (
      (entry.type === 'branch_summary' ||
        entry.type === 'compaction' ||
        entry.type === 'usage') &&
      'usage' in entry &&
      entry.usage?.cost?.total
    ) {
      totalCost += entry.usage.cost.total;
    }
  }

  return totalCost;
}

/**
 * Formats a cost number (e.g. 1.234) with 3 decimal places and icon prefix
 * ('$' in ascii mode, nerd dollar icon in nerd mode).
 */
export function formatCost(cost: number, mode: IconMode): string {
  const icon = iconFor('cost', mode);
  return `${icon}${cost.toFixed(3)}`;
}
