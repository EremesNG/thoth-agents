import type { Plugin } from '@opencode/plugin';
import type { AccountRegistry } from '../accounts/registry.js';
import type { MultiCodexConfig } from '../config.js';
import { parseRateLimitEvent } from '../quota/parsers.js';
import type { QuotaTracker } from '../quota/quota.js';
import type { registerRequests } from '../request/requests.js';
import { usageLimit } from './errors.js';

type Requests = Awaited<ReturnType<typeof registerRequests>>;
type Quota = Pick<
  QuotaTracker,
  'getQuota' | 'remainingPercent' | 'resetAt' | 'observeRateLimits'
>;

function headerReset(headers: Headers): number | undefined {
  const resets: number[] = [];
  const exhausted: number[] = [];
  for (const window of ['primary', 'secondary']) {
    const prefix = `x-codex-${window}`;
    const absolute = headers.get(`${prefix}-reset-at`);
    const relative =
      headers.get(`${prefix}-reset-after-seconds`) ??
      headers.get(`${prefix}-reset-after`);
    const value = absolute?.trim() ? Number(absolute) : undefined;
    const seconds = relative?.trim() ? Number(relative) : undefined;
    const reset =
      value !== undefined && Number.isFinite(value) && value >= 0
        ? value < 10_000_000_000
          ? value * 1000
          : value
        : seconds !== undefined && Number.isFinite(seconds) && seconds >= 0
          ? Date.now() + seconds * 1000
          : undefined;
    if (reset !== undefined && reset > Date.now()) {
      resets.push(reset);
      const used = Number(headers.get(`${prefix}-used-percent`));
      if (Number.isFinite(used) && used >= 100) exhausted.push(reset);
    }
  }
  if (exhausted.length) return Math.max(...exhausted);
  return resets.length ? Math.min(...resets) : undefined;
}

/** One instance per plugin process, shared across sessions and request kinds. */
export async function registerRotation(
  ctx: Pick<Plugin.Context, 'session'>,
  registry: Pick<AccountRegistry, 'list'>,
  requests: Requests,
  quota: Quota,
  config: MultiCodexConfig,
) {
  type Block = { until: number; fallback: boolean; refresh?: Promise<void> };
  const blocks = new Map<number, Block>();
  const blocked = async (account: number): Promise<boolean> => {
    const block = blocks.get(account);
    if (!block) return false;
    if (block.until > Date.now()) return true;
    if (block.fallback) {
      block.refresh ??= (async () => {
        // Even unavailable quota is a completed refresh attempt; unknown quota ranks last.
        await quota.getQuota(account, { refresh: true });
        const reset = quota.resetAt(account);
        if (blocks.get(account) !== block) return;
        if (
          quota.remainingPercent(account) === 0 &&
          reset !== undefined &&
          reset > Date.now()
        )
          blocks.set(account, { until: reset, fallback: false });
        else blocks.delete(account);
      })();
      await block.refresh;
    } else if (blocks.get(account) === block) blocks.delete(account);
    // A simultaneous real 429 may have replaced this block while quota was refreshing.
    return blocks.has(account);
  };
  const accounts = async () =>
    (await registry.list())
      .filter((a) => a.state === 'ok')
      .map((a) => a.number);
  const available = async () => {
    const numbers = await accounts();
    const states = await Promise.all(numbers.map(blocked));
    return numbers.filter((_, i) => !states[i]);
  };
  const observe = (
    account: number,
    value: unknown,
    headers = new Headers(),
  ) => {
    const error = usageLimit(value);
    if (!error) return;
    const reset =
      error.resetAt ?? headerReset(headers) ?? quota.resetAt(account);
    blocks.set(account, {
      until: reset ?? Date.now() + 5 * 60_000,
      fallback: reset === undefined,
    });
  };
  requests.setRouter(async ({ accountNumber }) => {
    if (!config.autoSwitchOn429 || !(await blocked(accountNumber)))
      return accountNumber;
    let candidates = await available();
    await Promise.all(candidates.map((n) => quota.getQuota(n)));
    // A concurrent response can block a candidate while its quota refresh is in flight.
    const eligible = new Set(await available());
    candidates = candidates.filter((n) => eligible.has(n));
    candidates.sort(
      (a, b) =>
        (quota.remainingPercent(b) ?? -1) - (quota.remainingPercent(a) ?? -1) ||
        a - b,
    );
    return candidates[0] ?? accountNumber;
  });
  const registrations = [
    await ctx.session.hook('http.response', async (event) => {
      if (event.response.status !== 429) return;
      const account = requests.accountForSentHeaders(event.request.headers);
      if (account === undefined) return;
      try {
        observe(
          account,
          {
            status: event.response.status,
            body: await event.response.clone().json(),
          },
          event.response.headers,
        );
      } catch {
        // Observation must not consume the original body or fail a model request.
      }
    }),
    await ctx.session.hook('experimental.ws.receive', async (event) => {
      const account = requests.accountForWebSocket(event.sessionID);
      if (account === undefined) return;
      const snapshot = parseRateLimitEvent(event.frame);
      if (snapshot) {
        await quota.getQuota(account, { refresh: false });
        quota.observeRateLimits(account, snapshot);
      }
      observe(account, event.frame);
    }),
    await ctx.session.hook('retry', async (event) => {
      if (
        !config.autoSwitchOn429 ||
        !/^openai(?:-codex-([2-9]|[1-9]\d+))?$/.test(event.model.providerID)
      )
        return;
      // The normalized error has no request identity. Never infer an account here.
      if (usageLimit(event.error) && (await available()).length)
        event.decision = { retry: true, delay: 0 };
    }),
  ];
  return {
    /** Status-only read: never expires entries or triggers quota refresh/routing. */
    blockedUntil(accountNumber: number): number | null {
      const until = blocks.get(accountNumber)?.until;
      return until !== undefined && until > Date.now() ? until : null;
    },
    async dispose() {
      requests.setRouter(undefined);
      blocks.clear();
      for (const registration of registrations) await registration.dispose();
    },
  };
}
