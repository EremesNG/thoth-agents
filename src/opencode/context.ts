import { fileURLToPath } from 'node:url';
// @opencode/plugin is type-only; the host provides the runtime.
import type { Plugin } from '@opencode/plugin';
import { type AgentDefinition, createAgents } from '../agents';
import { loadPluginConfig, type PluginConfig } from '../config';
import { renderOpenCodeAgentConfigs } from '../harness/adapters/opencode';
import {
  type EffectiveRoster,
  type ModelProfileSelection,
  ModelProfileStore,
  mergeProfileModelChain,
  type ProfileRole,
  type RoleProfile,
  resolveRoleProfile,
} from './profiles';
import { ToolsOverrideStore, type ToolsState } from './tool-overrides';

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
  toolState: {
    store: ToolsOverrideStore;
    state: ToolsState;
    /** Re-read global/project overrides for the next agent transform. */
    refresh(): void;
  };
  profileState: {
    store: ModelProfileStore;
    roster: EffectiveRoster;
    selection: ModelProfileSelection;
    roles: Partial<Record<ProfileRole, RoleProfile>>;
    /** Re-read global/project selection and update the transform's mutable defaults. */
    refresh(): void;
  };
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

  // Build the profile roster from the rendered runtime defaults, not raw overrides:
  // array entries intentionally do not inherit a scalar variant.
  const roster: EffectiveRoster = {};
  const configuredChains: Record<string, ModelEntry[]> = {};
  const baseArrays = structuredClone(effectiveModelArrays);
  const baseRuntimeChains = structuredClone(runtimeChains);
  for (const { name } of agentDefs) {
    const role = name as ProfileRole;
    const first = effectiveModelArrays[name]?.[0];
    roster[role] = first
      ? { model: first.id, variant: first.variant }
      : { model: agents[name]?.model, variant: agents[name]?.variant };
    configuredChains[name] =
      effectiveModelArrays[name] ??
      (agents[name]?.model
        ? [{ id: agents[name].model, variant: agents[name].variant }]
        : []);
  }
  const store = new ModelProfileStore({
    cwd: directory,
    roster,
    warn: (message) => console.warn(`[thoth-agents] ${message}`),
  });
  const profileState: OpenCodeDependencies['profileState'] = {
    store,
    roster,
    selection: store.resolve(),
    roles: {},
    refresh() {
      this.selection = store.resolve();
      applyProfile();
    },
  };
  function applyProfile(): void {
    for (const { name } of agentDefs) {
      const role = name as ProfileRole;
      profileState.roles[role] = resolveRoleProfile(
        role,
        profileState.selection.profile,
        roster,
      );
      // The virtual default is an exact no-op, including retry eligibility and
      // variant-less arrays. Named profiles prepend to eligible retry tails.
      if (profileState.selection.name === 'default') {
        if (baseArrays[name])
          effectiveModelArrays[name] = structuredClone(baseArrays[name]);
        else delete effectiveModelArrays[name];
        if (baseRuntimeChains[name])
          runtimeChains[name] = [...baseRuntimeChains[name]];
        else delete runtimeChains[name];
      } else {
        const chain = mergeProfileModelChain(
          profileState.roles[role],
          config.fallback?.enabled === false && !modelArrayMap[name]
            ? []
            : configuredChains[name],
        );
        effectiveModelArrays[name] = chain;
        runtimeChains[name] = chain.map(({ id }) => id);
      }
    }
  }
  applyProfile();

  const toolStore = new ToolsOverrideStore({
    cwd: directory,
    warn: (message) => console.warn(`[thoth-agents] ${message}`),
  });
  const toolState: OpenCodeDependencies['toolState'] = {
    store: toolStore,
    state: toolStore.resolve(),
    refresh() {
      this.state = toolStore.resolve();
    },
  };

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
    profileState,
    toolState,
  };
}
