import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { computeSessionCost } from '@thoth-agents/pi-core';
import type { IconMode } from '../shared/config.ts';
import { icon } from '../shared/icons.ts';

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

  return computeSessionCost(entries).cost;
}

/**
 * Formats a cost number (e.g. 1.234) with 3 decimal places and icon prefix
 * ('$' in ascii mode, nerd dollar icon in nerd mode).
 */
export function formatCost(cost: number, mode: IconMode): string {
  return `${icon('cost', mode)}${cost.toFixed(3)}`;
}
