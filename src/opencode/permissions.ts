import type { Plugin } from '@opencode/plugin';
import type { OpenCodeDependencies } from './context';

export async function registerPermissions(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  const specialists = new Set(
    deps.agentDefs
      .map(({ name }) => name)
      .filter((name) => name !== 'orchestrator'),
  );
  await ctx.permission.hook('evaluate', (event) => {
    if (
      event.action !== 'subagent' ||
      !event.agent ||
      !specialists.has(event.agent)
    )
      return;
    event.effect = 'deny';
    event.message = `Thoth role "${event.agent}" cannot delegate: only orchestrator may call subagent.`;
  });
}
