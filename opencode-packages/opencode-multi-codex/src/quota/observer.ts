import type { Plugin } from '@opencode/plugin';
import type { AccountRegistry } from '../accounts/registry.js';
import type { registerRequests } from '../request/requests.js';
import { parseHeaders } from './parsers.js';
import { QuotaTracker } from './quota.js';

export async function registerQuota(
  ctx: Pick<Plugin.Context, 'session'>,
  registry: Pick<AccountRegistry, 'list'>,
  requests: Pick<
    Awaited<ReturnType<typeof registerRequests>>,
    'resolveCredential' | 'accountForSentHeaders'
  >,
) {
  const quota = new QuotaTracker(registry, requests);
  await quota.listQuota({ refresh: false });
  const observer = await ctx.session.hook('http.response', async (event) => {
    try {
      const account = requests.accountForSentHeaders(event.request.headers);
      if (account === undefined) return;
      const snapshot = parseHeaders(event.response.headers);
      if (!snapshot) return;
      // Synchronize account additions/removals without issuing any quota HTTP request.
      await quota.getQuota(account, { refresh: false });
      quota.observeRateLimits(account, snapshot);
    } catch {
      // Observability must never fail a model request or consume its response body.
    }
  });
  return Object.assign(quota, { dispose: () => observer.dispose() });
}
