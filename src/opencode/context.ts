import { fileURLToPath } from 'node:url';
// @opencode/plugin is type-only; the host provides the runtime.
import type { Plugin } from '@opencode/plugin';
import { type AgentDefinition, createAgents } from '../agents';
import { loadPluginConfig, type PluginConfig } from '../config';
import { renderOpenCodeAgentConfigs } from '../harness/adapters/opencode';

type ModelEntry = { id: string; variant?: string };

export interface OpenCodeDependencies {
  directory: string;
  packageRoot: string;
  config: PluginConfig;
  agentDefs: AgentDefinition[];
  agents: ReturnType<typeof renderOpenCodeAgentConfigs>;
  modelArrayMap: Record<string, ModelEntry[]>;
  effectiveModelArrays: Record<string, ModelEntry[]>;
  runtimeChains: Record<string, string[]>;
}

export function loadOpenCodeDependencies(
  ctx: Plugin.Context,
): OpenCodeDependencies {
  const directory = ctx.location.directory;
  const config = loadPluginConfig(directory);
  const agentDefs = createAgents(config);
  const agents = renderOpenCodeAgentConfigs(config);
  const modelArrayMap: Record<string, ModelEntry[]> = {};
  const runtimeChains: Record<string, string[]> = {};
  const effectiveModelArrays: Record<string, ModelEntry[]> = {};

  for (const agent of agentDefs) {
    if (!agent._modelArray?.length) continue;
    modelArrayMap[agent.name] = [...agent._modelArray];
    effectiveModelArrays[agent.name] = [...agent._modelArray];
    runtimeChains[agent.name] = agent._modelArray.map((model) => model.id);
  }

  // Explicit model arrays remain active even when configured fallback is disabled.
  if (config.fallback?.enabled !== false) {
    for (const [name, models] of Object.entries(
      config.fallback?.chains ?? {},
    )) {
      if (!models?.length) continue;
      const currentModel = agents[name]?.model;
      const effective =
        effectiveModelArrays[name] ??
        (currentModel
          ? [{ id: currentModel, variant: agents[name]?.variant }]
          : []);
      for (const id of models) {
        if (!effective.some((model) => model.id === id)) effective.push({ id });
      }
      // Retry eligibility must include the same configured primary we register,
      // not just the appended fallbacks (which would look like an override).
      runtimeChains[name] = effective.map((model) => model.id);
      effectiveModelArrays[name] = effective;
    }
  }

  return {
    directory,
    // Both src/opencode/context.ts and dist/index.js (or a root chunk) resolve
    // the package root here; nested source modules need one extra parent.
    packageRoot: fileURLToPath(
      new URL(
        import.meta.url.endsWith('.ts') ? '../..' : '..',
        import.meta.url,
      ),
    ),
    config,
    agentDefs,
    agents,
    modelArrayMap,
    effectiveModelArrays,
    runtimeChains,
  };
}
