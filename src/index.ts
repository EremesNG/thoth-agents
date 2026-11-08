import type { Plugin } from '@opencode/plugin';
import { registerAgents } from './opencode/agents';
import { registerCommand } from './opencode/command';
import { loadOpenCodeDependencies } from './opencode/context';
import { registerDelegationHooks } from './opencode/delegation-hooks';
import { registerMcp } from './opencode/mcp';
import { registerPermissions } from './opencode/permissions';
import { registerSessionHooks } from './opencode/session-hooks';
import { registerSkills } from './opencode/skills';
import { registerTools } from './opencode/tools';

const plugin = {
  id: 'thoth-agents',
  async setup(ctx) {
    const deps = loadOpenCodeDependencies(ctx);
    await registerAgents(ctx, deps);
    await registerTools(ctx, deps);
    await registerMcp(ctx, deps);
    await registerCommand(ctx, deps);
    await registerSkills(ctx, deps);
    await registerPermissions(ctx, deps);
    await registerDelegationHooks(ctx, deps);
    await registerSessionHooks(ctx, deps);
  },
} satisfies Plugin.Plugin;

export default plugin;

export type {
  AgentName,
  AgentOverrideConfig,
  McpName,
  PluginConfig,
} from './config';
export type { RemoteMcpConfig } from './mcp';
