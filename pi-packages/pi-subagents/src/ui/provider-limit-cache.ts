import {
  type ProviderLimitEntry,
  subscribeProviderLimits,
} from '@thoth-agents/pi-core';
import { getInteractionSessionRegistry } from '../runner/interaction-session-registry.js';

const MAX_OBSERVATIONS = 512;

function formatResetTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/** UI-owned observations, captured before the runner removes child attribution. */
export class SubagentProviderLimitCache {
  private readonly entries = new Map<
    string,
    { taskId: string; entry: ProviderLimitEntry }
  >();
  private readonly unsubscribe: () => void;
  private readonly listeners = new Set<() => void>();
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.unsubscribe = subscribeProviderLimits((entry) => {
      const metadata = getInteractionSessionRegistry().get(entry.sessionId);
      const taskId = metadata?.requester?.taskId;
      if (
        metadata?.origin !== 'subagent' ||
        typeof taskId !== 'string' ||
        !taskId
      )
        return;
      const key = JSON.stringify([taskId, entry.provider, entry.window]);
      this.entries.delete(key);
      this.entries.set(key, { taskId, entry });
      if (this.entries.size > MAX_OBSERVATIONS) {
        const oldest = this.entries.keys().next().value;
        if (oldest !== undefined) this.entries.delete(oldest);
      }
      this.scheduleReset();
      this.notify();
    });
  }

  warningText(taskId: string, now = Date.now()): string | undefined {
    const warnings: string[] = [];
    for (const observation of this.entries.values()) {
      const entry = observation.entry;
      if (
        observation.taskId !== taskId ||
        entry.status === 'allowed' ||
        (entry.resetsAt !== undefined && entry.resetsAt <= now)
      )
        continue;
      const status =
        entry.status === 'rejected' ? 'rate limited' : 'rate limit warning';
      const reset =
        entry.resetsAt === undefined
          ? ''
          : ` · reset ${formatResetTime(entry.resetsAt)}`;
      warnings.push(`${entry.provider}/${entry.window}: ${status}${reset}`);
    }
    return warnings.length ? warnings.join('; ') : undefined;
  }

  onChange(notify: () => void): () => void {
    this.listeners.add(notify);
    return () => {
      this.listeners.delete(notify);
    };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      if (!this.listeners.has(listener)) continue;
      try {
        listener();
      } catch {
        // A stale UI consumer must not break other consumers or reset timers.
      }
    }
  }

  private scheduleReset(): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = undefined;
    const now = Date.now();
    let next = Infinity;
    for (const [key, { entry }] of this.entries) {
      if (entry.resetsAt === undefined) continue;
      if (entry.resetsAt <= now) this.entries.delete(key);
      else next = Math.min(next, entry.resetsAt);
    }
    if (next === Infinity) return;
    // Node clamps oversized delays to 1ms; long windows need bounded wakeups.
    this.resetTimer = setTimeout(
      () => {
        this.scheduleReset();
        this.notify();
      },
      Math.min(next - now, 2_147_483_647),
    );
    this.resetTimer.unref?.();
  }

  dispose(): void {
    this.unsubscribe();
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = undefined;
    this.listeners.clear();
    this.entries.clear();
  }
}
