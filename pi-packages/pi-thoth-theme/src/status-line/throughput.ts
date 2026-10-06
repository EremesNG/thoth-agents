export interface GenerationEvent {
  readonly type: 'message_start' | 'message_end';
  readonly message: {
    readonly role: string;
    readonly id?: string;
    readonly usage?: { readonly output: number };
  };
}

/** Runtime-only main-session assistant generation timing. */
export function createThroughputTracker() {
  let pending: { at: number; id?: string } | undefined;
  let outputTokens = 0;
  let generationMs = 0;
  const startedIds = new Set<string>();
  const endedIds = new Set<string>();
  let startedMessages = new WeakSet<object>();
  let endedMessages = new WeakSet<object>();

  return {
    observe(event: GenerationEvent, observedAt = Date.now()): void {
      if (event.message.role !== 'assistant') return;
      const id = event.message.id;
      if (event.type === 'message_start') {
        if (startedMessages.has(event.message) || (id && startedIds.has(id)))
          return;
        startedMessages.add(event.message);
        if (id) startedIds.add(id);
        pending = { at: observedAt, id };
        return;
      }
      if (endedMessages.has(event.message) || (id && endedIds.has(id))) return;
      const start = pending;
      if (!start || (start.id && id && start.id !== id)) return;
      pending = undefined;
      endedMessages.add(event.message);
      if (id) endedIds.add(id);
      const elapsed = observedAt - start.at;
      if (!Number.isFinite(elapsed) || elapsed <= 0) return;
      const output = event.message.usage?.output;
      if (typeof output !== 'number' || !Number.isFinite(output) || output < 0)
        return;
      outputTokens += output;
      generationMs += elapsed;
    },
    reset(): void {
      pending = undefined;
      outputTokens = 0;
      generationMs = 0;
      startedIds.clear();
      endedIds.clear();
      startedMessages = new WeakSet<object>();
      endedMessages = new WeakSet<object>();
    },
    get tokensPerSecond(): number | null {
      if (!Number.isFinite(generationMs) || generationMs <= 0) return null;
      const speed = (outputTokens * 1000) / generationMs;
      return Number.isFinite(speed) ? speed : null;
    },
  };
}
