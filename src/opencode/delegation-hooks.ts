import type { Plugin } from '@opencode/plugin';
import { createDelegateTaskRetryHook } from '../hooks/delegate-task-retry';
import { createJsonErrorRecoveryHook } from '../hooks/json-error-recovery';
import { createOracleGateVerdictHook } from '../hooks/oracle-gate-verdict';
import type { OpenCodeDependencies } from './context';

export async function registerDelegationHooks(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  const retry = createDelegateTaskRetryHook();
  const recover = createJsonErrorRecoveryHook();
  const verdict = createOracleGateVerdictHook({ directory: deps.directory });
  await ctx.tool.hook('execute.after', async (event) => {
    await retry(event);
    await recover(event);
    await verdict(event);
  });
}
