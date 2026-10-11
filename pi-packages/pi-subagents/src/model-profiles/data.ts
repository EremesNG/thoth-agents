import { loadSubagents, readSubagentsConfig } from '../config.js';
import { resolveDefaultSubagentProfile } from '../profile-resolver.js';
import type {
  ModelRef,
  SubagentDefinitionScope,
  ThinkingEffort,
} from '../types.js';
import { modelProfilePaths } from './store.js';

type AvailableModel = { provider: string; id: string; label: string };

/** One listed subagent with the values the virtual `default` profile yields. */
export type AgentRow = {
  /** Normalized (trimmed, lowercase) agent key used by profiles. */
  key: string;
  name: string;
  description: string;
  scope: SubagentDefinitionScope;
  defaultModel?: ModelRef;
  defaultEffort?: ThinkingEffort;
};

export function globalSubagentsConfigPath(agentDir?: string): string {
  return modelProfilePaths({ cwd: process.cwd(), agentDir }).global;
}
export function projectSubagentsConfigPath(cwd: string): string {
  return modelProfilePaths({ cwd }).project;
}

export function modelKey(model: ModelRef): string {
  return `${model.provider}/${model.id}`;
}

function modelFromAny(raw: any): AvailableModel | undefined {
  const provider =
    typeof raw?.provider === 'string'
      ? raw.provider
      : typeof raw?.provider?.id === 'string'
        ? raw.provider.id
        : typeof raw?.provider?.name === 'string'
          ? raw.provider.name
          : undefined;
  const id =
    typeof raw?.id === 'string'
      ? raw.id
      : typeof raw?.model === 'string'
        ? raw.model
        : typeof raw?.name === 'string'
          ? raw.name
          : undefined;
  if (!provider || !id) return undefined;
  return { provider, id, label: String(raw?.label ?? raw?.displayName ?? id) };
}

export function groupAvailableModelsByProvider(
  rawModels: any[] = [],
): Record<string, AvailableModel[]> {
  const grouped: Record<string, AvailableModel[]> = {};
  for (const raw of rawModels) {
    const model = modelFromAny(raw);
    if (!model) continue;
    grouped[model.provider] ??= [];
    if (!grouped[model.provider].some((existing) => existing.id === model.id))
      grouped[model.provider].push(model);
  }
  for (const models of Object.values(grouped))
    models.sort((a, b) => a.id.localeCompare(b.id));
  return Object.fromEntries(
    Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function availableModelSet(rawModels: any[] = []): Set<string> {
  return new Set(
    Object.values(groupAvailableModelsByProvider(rawModels))
      .flat()
      .map((model) => modelKey(model)),
  );
}

export function buildAgentRows(ctx: any = {}): AgentRow[] {
  const cwd = ctx.cwd ?? process.cwd();
  const config = readSubagentsConfig(cwd);
  const byName = new Map<string, ReturnType<typeof loadSubagents>[number]>();
  for (const definition of loadSubagents(cwd))
    byName.set(definition.name, definition);
  return [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((definition) => {
      const resolved = resolveDefaultSubagentProfile({
        agentName: definition.name,
        definition,
        config,
        ctx,
      });
      return {
        key: definition.name.trim().toLowerCase(),
        name: definition.name,
        description: definition.description,
        scope: definition.scope ?? 'global',
        defaultModel: resolved.model.value,
        defaultEffort: resolved.effort.value,
      };
    });
}
