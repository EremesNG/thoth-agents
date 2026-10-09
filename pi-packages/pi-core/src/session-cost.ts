/** Structural session entry contract; the helper has no runtime Pi dependency. */
export interface SessionCostEntry {
  type: string;
  message?: {
    role: string;
    usage?: { cost?: { total?: number } };
  };
  usage?: { cost?: { total?: number } };
}
export interface SessionCostOptions {
  subscriptionProviders?: readonly string[];
  /** The current model provider, not the provider on historical messages. */
  providerOf?: () => string | undefined;
}
export interface SessionCost {
  cost: number;
  isSubscription: boolean;
}

/** Aggregate all session entries, including summaries, compactions and usage. */
export function computeSessionCost(
  entries: readonly (SessionCostEntry | null | undefined)[] | null | undefined,
  { subscriptionProviders = [], providerOf }: SessionCostOptions = {},
): SessionCost {
  let cost = 0;
  for (const entry of entries ?? []) {
    if (!entry) continue;
    if (entry.type === 'message') {
      const message = entry.message;
      if (message?.role === 'assistant' || message?.role === 'toolResult')
        cost += message.usage?.cost?.total || 0;
    } else if (['branch_summary', 'compaction', 'usage'].includes(entry.type)) {
      cost += entry.usage?.cost?.total || 0;
    }
  }
  const provider = providerOf?.();
  return {
    cost,
    isSubscription:
      provider !== undefined && subscriptionProviders.includes(provider),
  };
}

/** Pass the latest cumulative snapshot total, never a sum of past snapshots. */
export function combineSessionAndSubagentCost(
  sessionCost: number,
  latestSubagentCost = 0,
): number {
  return sessionCost + latestSubagentCost;
}
