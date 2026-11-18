import {
  type ModelProfileSelection,
  ModelProfileStore,
} from './model-profiles/store.js';
import type {
  EffectiveSubagentProfile,
  ModelRef,
  ProfileValueSource,
  ResolvedProfileField,
  SubagentDefinition,
  SubagentsConfig,
  ThinkingEffort,
} from './types.js';

function modelLabel(model: ModelRef): string {
  return `${model.provider}/${model.id}`;
}

function effortFromCtx(ctx: any): ThinkingEffort | undefined {
  const effort =
    ctx?.pi?.getThinkingLevel?.() ??
    ctx?.getThinkingLevel?.() ??
    ctx?.thinkingLevel;
  return typeof effort === 'string' ? (effort as ThinkingEffort) : undefined;
}

function modelFromCtx(ctx: any): ModelRef | undefined {
  const model = ctx?.model;
  if (!model || typeof model !== 'object') return undefined;
  const provider =
    typeof model.provider === 'string' ? model.provider : undefined;
  const id =
    typeof model.id === 'string'
      ? model.id
      : typeof model.name === 'string'
        ? model.name
        : undefined;
  return provider && id ? { provider, id } : undefined;
}

export function profileSourceLabel<T>(
  source: ProfileValueSource,
  value: T | undefined,
  format: (value: T) => string,
): string {
  return value === undefined ? 'unresolved' : `${source}: ${format(value)}`;
}

function field<T>(
  source: ProfileValueSource,
  value: T | undefined,
  format: (value: T) => string,
): ResolvedProfileField<T> {
  return { value, source, label: profileSourceLabel(source, value, format) };
}

function resolveModel(
  definition: SubagentDefinition,
  config: SubagentsConfig,
  ctx: any,
): ResolvedProfileField<ModelRef> {
  const profile = ctx?.modelProfile?.profile.agents[definition.name];
  if (profile?.model) return field('profile', profile.model, modelLabel);
  if (definition.model)
    return field('definition', definition.model, modelLabel);
  if (config.default_model)
    return field('default', config.default_model, modelLabel);
  const orchestratorModel = modelFromCtx(ctx);
  if (orchestratorModel)
    return field('orchestrator', orchestratorModel, modelLabel);
  return field('unresolved', undefined, modelLabel);
}

/**
 * Chain from the first source (profile entry, definition, subagents.json
 * default) that configures one. Duplicates of the primary and of earlier
 * entries are removed after choosing the source, even if none remain.
 */
export function resolveFallbackChain(
  candidates: Partial<
    Record<Exclude<FallbackSource, 'none'>, readonly ModelRef[]>
  >,
  primary: ModelRef | undefined,
): { models: ModelRef[]; source: FallbackSource } {
  const source = (['profile', 'agent', 'default'] as const).find(
    (candidate) => candidates[candidate]?.length,
  );
  if (!source) return { models: [], source: 'none' };

  const models = classifyFallbackEntries(candidates[source] ?? [], primary)
    .filter((entry) => !entry.skipped)
    .map(({ model }) => ({ provider: model.provider, id: model.id }));
  return { models, source };
}

export type FallbackSkip = 'primary' | 'duplicate';

/**
 * The runtime's per-entry decision for one configured list: an entry equal to
 * the primary, or to an earlier kept entry, is skipped; the rest get their
 * 1-based effective ordinal. `resolveFallbackChain` is built on this.
 */
export function classifyFallbackEntries(
  list: readonly ModelRef[],
  primary: ModelRef | undefined,
): Array<{ model: ModelRef; skipped?: FallbackSkip; ordinal?: number }> {
  const primaryKey = primary ? modelLabel(primary) : undefined;
  const seen = new Set<string>();
  let ordinal = 0;
  return list.map((model) => {
    const key = modelLabel(model);
    if (key === primaryKey) return { model, skipped: 'primary' as const };
    if (seen.has(key)) return { model, skipped: 'duplicate' as const };
    seen.add(key);
    ordinal += 1;
    return { model, ordinal };
  });
}

export type FallbackSource = 'profile' | 'agent' | 'default' | 'none';

function resolveFallbackModels(
  definition: SubagentDefinition,
  config: SubagentsConfig,
  ctx: any,
  primary: ModelRef | undefined,
): ModelRef[] {
  return resolveFallbackChain(
    {
      profile:
        ctx?.modelProfile?.profile.agents[definition.name]?.fallback_models,
      agent: definition.fallback_models,
      default: config.default_fallback_models,
    },
    primary,
  ).models;
}

function resolveEffort(
  definition: SubagentDefinition,
  config: SubagentsConfig,
  ctx: any,
): ResolvedProfileField<ThinkingEffort> {
  const profile = ctx?.modelProfile?.profile.agents[definition.name];
  if (profile?.effort) return field('profile', profile.effort, String);
  if (definition.effort) return field('definition', definition.effort, String);
  if (config.default_effort)
    return field('default', config.default_effort, String);
  const orchestratorEffort = effortFromCtx(ctx);
  if (orchestratorEffort)
    return field('orchestrator', orchestratorEffort, String);
  return field('unresolved', undefined, String);
}

export type SubagentProfileInput = {
  agentName: string;
  definition: SubagentDefinition;
  config: SubagentsConfig;
  ctx: any;
};

/** Definition/scalar/parent chain, explicitly excluding named profiles. */
export function resolveDefaultSubagentProfile(
  input: SubagentProfileInput,
): EffectiveSubagentProfile {
  const definition = {
    ...input.definition,
    name: input.agentName.trim().toLowerCase(),
  };
  const ctx = { ...input.ctx, modelProfile: undefined };
  const model = resolveModel(definition, input.config, ctx);
  return {
    agent: definition.name,
    model,
    fallbackModels: resolveFallbackModels(
      definition,
      input.config,
      ctx,
      model.value,
    ),
    effort: resolveEffort(definition, input.config, ctx),
  };
}

export function resolveEffectiveSubagentProfile(
  input: SubagentProfileInput,
): EffectiveSubagentProfile {
  const definition = {
    ...input.definition,
    name: input.agentName.trim().toLowerCase(),
  };
  const selection: ModelProfileSelection =
    input.ctx?.modelProfile ??
    new ModelProfileStore({
      cwd: input.ctx?.cwd ?? process.cwd(),
      agentDir: input.ctx?.agentDir,
    }).resolve(input.ctx?.sessionModelProfile);
  const ctx = { ...input.ctx, modelProfile: selection };
  const model = resolveModel(definition, input.config, ctx);
  const effort = resolveEffort(definition, input.config, ctx);
  for (const resolved of [model, effort])
    if (resolved.source === 'profile')
      resolved.label = resolved.label.replace(
        'profile:',
        `profile (${selection.name}):`,
      );
  return {
    agent: definition.name,
    model,
    fallbackModels: resolveFallbackModels(
      definition,
      input.config,
      ctx,
      model.value,
    ),
    effort,
    profileName: selection.name,
    warnings: selection.warnings,
  };
}
