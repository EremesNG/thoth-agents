import { fetchQuota, type QuotaCredentials } from './client.js';
import type { QuotaSnapshot } from './parsers.js';

export const QUOTA_FRESHNESS_MS = 5 * 60_000;
export type QuotaState = {
  accountNumber: number;
  state: 'fresh' | 'stale' | 'unavailable';
  snapshot?: QuotaSnapshot;
  fetchedAt?: number;
  error?: string;
};
type AccountSource = {
  list(): Promise<
    Array<{ number: number; credentialID: string; state: 'ok' | 'missing' }>
  >;
};
type Entry = {
  snapshot?: QuotaSnapshot;
  fetchedAt?: number;
  error?: string;
  primaryAt?: number;
  secondaryAt?: number;
};

export class QuotaTracker {
  private readonly entries = new Map<number, Entry>();
  private readonly pending = new Map<number, Promise<void>>();
  private readonly bindings = new Map<number, string>();
  constructor(
    private readonly registry: AccountSource,
    private readonly requests: QuotaCredentials,
    private readonly options: { fetch?: typeof fetch } = {},
  ) {}

  private view(accountNumber: number): QuotaState {
    const entry = this.entries.get(accountNumber);
    const now = Date.now();
    const resets = [
      entry?.snapshot?.primary?.resetAt,
      entry?.snapshot?.secondary?.resetAt,
    ];
    const fresh =
      entry?.fetchedAt !== undefined &&
      entry.fetchedAt <= now &&
      now - entry.fetchedAt < QUOTA_FRESHNESS_MS &&
      !entry.error &&
      !resets.some((reset) => reset !== undefined && reset <= now);
    return {
      accountNumber,
      snapshot: entry?.snapshot ? structuredClone(entry.snapshot) : undefined,
      fetchedAt: entry?.fetchedAt,
      state: entry?.snapshot ? (fresh ? 'fresh' : 'stale') : 'unavailable',
      error:
        entry?.error ??
        (entry?.snapshot ? undefined : 'Quota not yet fetched.'),
    };
  }

  private async syncAccounts() {
    const accounts = await this.registry.list();
    const current = new Map(
      accounts
        .filter((account) => account.state === 'ok')
        .map((account) => [account.number, account.credentialID]),
    );
    for (const [number, credentialID] of this.bindings) {
      if (current.get(number) !== credentialID) this.entries.delete(number);
    }
    this.bindings.clear();
    for (const [number, credentialID] of current)
      this.bindings.set(number, credentialID);
    return accounts;
  }

  async getQuota(
    accountNumber: number,
    options: { refresh?: boolean } = {},
  ): Promise<QuotaState> {
    try {
      await this.syncAccounts();
      if (!this.bindings.has(accountNumber))
        return {
          accountNumber,
          state: 'unavailable',
          error: 'Account credential unavailable.',
        };
      if (
        options.refresh !== false &&
        (options.refresh || this.view(accountNumber).state !== 'fresh')
      ) {
        let pending = this.pending.get(accountNumber);
        if (!pending) {
          pending = this.refresh(accountNumber).finally(() =>
            this.pending.delete(accountNumber),
          );
          this.pending.set(accountNumber, pending);
        }
        await pending;
      }
      return this.view(accountNumber);
    } catch {
      return {
        accountNumber,
        state: 'unavailable',
        error: 'Account registry unavailable.',
      };
    }
  }

  private async refresh(accountNumber: number) {
    const previous = this.entries.get(accountNumber);
    const binding = this.bindings.get(accountNumber);
    try {
      const snapshot = await fetchQuota(
        accountNumber,
        this.requests,
        this.options.fetch,
      );
      const now = Date.now();
      if (
        this.bindings.get(accountNumber) === binding &&
        this.entries.get(accountNumber) === previous
      )
        this.entries.set(accountNumber, {
          snapshot,
          fetchedAt: now,
          primaryAt: snapshot.primary ? now : undefined,
          secondaryAt: snapshot.secondary ? now : undefined,
        });
    } catch (error) {
      if (
        this.bindings.get(accountNumber) === binding &&
        this.entries.get(accountNumber) === previous
      )
        this.entries.set(accountNumber, {
          ...previous,
          error: error instanceof Error ? error.message : 'Quota unavailable.',
        });
    }
  }

  async listQuota(options: { refresh?: boolean } = {}): Promise<QuotaState[]> {
    const accounts = await this.syncAccounts();
    return Promise.all(
      accounts.map((account) => this.getQuota(account.number, options)),
    );
  }

  /** HTTP observations and handshake-attributed WebSocket events share this seam. */
  observeRateLimits(accountNumber: number, snapshot: QuotaSnapshot): void {
    if (
      !this.bindings.has(accountNumber) ||
      (!snapshot.primary && !snapshot.secondary)
    )
      return;
    const previous = this.entries.get(accountNumber);
    const now = Date.now();
    const primaryAt = snapshot.primary ? now : previous?.primaryAt;
    const secondaryAt = snapshot.secondary ? now : previous?.secondaryAt;
    const timestamps = [primaryAt, secondaryAt].filter(
      (value) => value !== undefined,
    );
    this.entries.set(accountNumber, {
      snapshot: structuredClone({
        primary: snapshot.primary ?? previous?.snapshot?.primary,
        secondary: snapshot.secondary ?? previous?.snapshot?.secondary,
        planType: snapshot.planType ?? previous?.snapshot?.planType,
      }),
      primaryAt,
      secondaryAt,
      fetchedAt: Math.min(...timestamps),
    });
  }

  /** Synchronous routing read: stale, reset or unavailable data is never ranked. */
  remainingPercent(accountNumber: number): number | undefined {
    const quota = this.view(accountNumber);
    if (quota.state !== 'fresh') return undefined;
    const windows = [quota.snapshot?.primary, quota.snapshot?.secondary].filter(
      (window) => window !== undefined,
    );
    return windows.length
      ? Math.min(...windows.map((window) => 100 - window.usedPercent))
      : undefined;
  }

  /** Future block-reset candidate: latest exhausted-window reset, otherwise earliest known reset. */
  resetAt(accountNumber: number): number | undefined {
    const snapshot = this.entries.get(accountNumber)?.snapshot;
    const known: number[] = [];
    const exhausted: number[] = [];
    for (const window of [snapshot?.primary, snapshot?.secondary]) {
      if (window?.resetAt === undefined || window.resetAt <= Date.now())
        continue;
      known.push(window.resetAt);
      if (window.usedPercent >= 100) exhausted.push(window.resetAt);
    }
    if (exhausted.length) return Math.max(...exhausted);
    return known.length ? Math.min(...known) : undefined;
  }
}
