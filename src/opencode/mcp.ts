import type { Plugin } from '@opencode/plugin';
import { createBuiltinMcps } from '../mcp';
import type { OpenCodeDependencies } from './context';

export async function registerMcp(
  ctx: Plugin.Context,
  deps: OpenCodeDependencies,
): Promise<void> {
  await ctx.mcp.transform((editor) => {
    for (const [name, config] of Object.entries(
      createBuiltinMcps(deps.config.disabled_mcps),
    )) {
      editor.set(name, config);
    }
  });
}
