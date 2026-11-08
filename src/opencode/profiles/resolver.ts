import {
  type EffectiveRoster,
  type ModelEntry,
  type NamedModelProfile,
  PROFILE_ROLES,
  type ProfileRole,
  type RoleProfile,
} from './types.js';

/** Normalize the effective config's scalar/array models without changing fallback order. */
export function configuredModelChain(
  config: EffectiveRoster[ProfileRole],
): ModelEntry[] {
  const models = config?.model;
  return (typeof models === 'string' ? [models] : (models ?? [])).map(
    (entry) => {
      const value = typeof entry === 'string' ? { id: entry } : { ...entry };
      // Runtime arrays own per-entry variants; the scalar variant is ignored.
      const variant = Array.isArray(models) ? value.variant : config?.variant;
      return { ...value, ...(variant ? { variant } : {}) };
    },
  );
}

/** Resolve one layer as a pair, matching runtime scalar/array model semantics. */
export function resolveModelPair(
  config: EffectiveRoster[ProfileRole],
  inherited: RoleProfile = {},
): RoleProfile {
  const first = configuredModelChain(config)[0];
  const model = first?.id ?? inherited.model;
  const variant =
    config?.model !== undefined
      ? first?.variant
      : (config?.variant ?? inherited.variant);
  return { ...(model ? { model } : {}), ...(variant ? { variant } : {}) };
}

/** Model overrides own their variant; variant-only overrides inherit the model. */
export function resolveRoleProfile(
  role: ProfileRole,
  profile: NamedModelProfile,
  roster: EffectiveRoster,
): RoleProfile {
  return resolveModelPair(profile.agents[role], resolveModelPair(roster[role]));
}

export function defaultModelProfile(
  roster: EffectiveRoster,
): NamedModelProfile {
  return {
    agents: Object.fromEntries(
      PROFILE_ROLES.map((role) => [
        role,
        resolveRoleProfile(role, { agents: {} }, roster),
      ]),
    ),
  };
}

/** Profile first; a model ID occurs at most once, even if its variant differs. */
export function mergeProfileModelChain(
  profile: RoleProfile,
  configured: readonly ModelEntry[],
): ModelEntry[] {
  const entries = profile.model
    ? [
        {
          id: profile.model,
          ...(profile.variant ? { variant: profile.variant } : {}),
        },
        ...configured,
      ]
    : configured;
  const seen = new Set<string>();
  return entries
    .filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((entry) => ({ ...entry }));
}

/** Native subagent input format. Undefined means no model could be resolved. */
export function formatModelString(profile: RoleProfile): string | undefined {
  return profile.model
    ? `${profile.model}${profile.variant ? `#${profile.variant}` : ''}`
    : undefined;
}
