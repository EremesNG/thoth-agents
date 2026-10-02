export interface PriorityToken {
  provider: string;
  baseId: string;
}

export interface PriorityGuard {
  /** Arm a one-shot token for the next request; replaces any previous token. */
  arm(token: PriorityToken): void;
  disarm(): void;
  /** Patched payload (shallow copy) when it belongs to the armed token, otherwise undefined. */
  apply(payload: unknown): Record<string, unknown> | undefined;
}

/**
 * A route is followed immediately by the request it produced, so the first payload
 * after arming either matches the routed base model or proves the token stale (the
 * routed request failed before reaching the provider, or another package sent an
 * unrelated request). Any payload therefore consumes the token: a stale token can
 * never grant priority to a later request for the same base model, for example one
 * chosen by a compaction-model package.
 */
export function createPriorityGuard(): PriorityGuard {
  let token: PriorityToken | undefined;
  return {
    arm(next) {
      token = next;
    },
    disarm() {
      token = undefined;
    },
    apply(payload) {
      const armed = token;
      token = undefined;
      if (!armed || typeof payload !== 'object' || payload === null)
        return undefined;
      const record = payload as Record<string, unknown>;
      if (record.model !== armed.baseId) return undefined;
      return { ...record, service_tier: 'priority' };
    },
  };
}
