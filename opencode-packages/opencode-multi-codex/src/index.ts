import type { Plugin } from '@opencode/plugin';
import { openCodeCredentials } from './accounts/opencode.js';
import { AccountRegistry } from './accounts/registry.js';
import { configFromContext } from './config.js';
import { registerProviders } from './provider/providers.js';
import { registerQuota } from './quota/observer.js';
import { registerRequests } from './request/requests.js';
import { registerRotation } from './rotation/rotation.js';
import { registerCodexRpc } from './rpc-handlers.js';

/** Shared composition seam for request routing and account-management RPC. */
export async function setupMultiCodex(ctx: Plugin.Context) {
  const registry = new AccountRegistry(
    ctx.storage,
    openCodeCredentials(ctx.integration),
  );
  const providers = await registerProviders(ctx, registry);
  const requests = await registerRequests(ctx, registry);
  const quota = await registerQuota(ctx, registry, requests);
  const config = configFromContext(ctx);
  const rotation = await registerRotation(
    ctx,
    registry,
    requests,
    quota,
    config,
  );
  return {
    registry,
    config,
    refreshProviders: providers.refreshProviders,
    requests,
    quota,
    blockedUntil: rotation.blockedUntil,
    async dispose() {
      await rotation.dispose();
      await quota.dispose();
      await requests.dispose();
      await providers.dispose();
    },
  };
}

const plugin = {
  id: 'thoth-multi-codex',
  async setup(ctx: Plugin.Context) {
    const runtime = await setupMultiCodex(ctx);
    await registerCodexRpc(ctx, runtime);
    return runtime.dispose;
  },
} satisfies Plugin.Plugin;

export default plugin;
