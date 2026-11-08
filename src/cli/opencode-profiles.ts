import { LEGACY_OPENAI_PRESET } from '../config/constants';
import {
  type EffectiveRoster,
  ModelProfileStore,
  type NamedModelProfile,
  PROFILE_ROLES,
  resolveModelPair,
  resolveRoleProfile,
} from '../opencode/profiles';
import { getConfigDir } from './paths';
import { MODEL_MAPPINGS } from './providers';

/** The CLI edits global installation state, not a project's pin or shadow. */
export function openCodeProfileStore(
  roster?: EffectiveRoster,
): ModelProfileStore {
  return new ModelProfileStore({
    cwd: process.cwd(),
    configDir: getConfigDir(),
    roster,
  });
}

export function activeOpenCodeProfile(): {
  name?: string;
  profile?: NamedModelProfile;
} {
  const store = openCodeProfileStore();
  const document = store.read('global');
  return {
    name: document.active,
    profile: document.active
      ? store.lookup(document.active, 'global')?.profile
      : undefined,
  };
}

export function effectiveOpenCodeProfile(
  config: Record<string, unknown> | null,
): NamedModelProfile {
  const root = (config?.agents ?? {}) as EffectiveRoster;
  const roster: EffectiveRoster = Object.fromEntries(
    PROFILE_ROLES.map((role) => [
      role,
      resolveModelPair(root[role], MODEL_MAPPINGS.openai[role]),
    ]),
  );
  const selected = activeOpenCodeProfile().profile ?? { agents: {} };
  return {
    agents: Object.fromEntries(
      PROFILE_ROLES.map((role) => [
        role,
        resolveRoleProfile(role, selected, roster),
      ]),
    ),
  };
}

export function syncOpenCodeProfile(reset = false): void {
  const store = openCodeProfileStore();
  const document = store.read('global');
  const names = ['openai'];
  if (document.active === 'agents' && document.profiles.agents)
    names.push('agents');
  for (const name of names) {
    const previous = document.profiles[name]?.agents ?? {};
    const agents = Object.fromEntries(
      PROFILE_ROLES.map((role) => {
        const current = previous[role];
        const legacy = LEGACY_OPENAI_PRESET[role];
        const advance =
          current?.model === `openai/${legacy.model}` &&
          current?.variant === legacy.effort;
        return [
          role,
          (reset && name === 'openai') || advance
            ? MODEL_MAPPINGS.openai[role]
            : resolveRoleProfile(
                role,
                { agents: previous },
                MODEL_MAPPINGS.openai,
              ),
        ];
      }),
    );
    store.save('global', name, { agents });
  }
  if (!document.active || !store.lookup(document.active, 'global'))
    store.setGlobalActive('openai');
}

export function withoutLegacyPresets(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { preset: _preset, presets: _presets, ...rest } = config;
  return rest;
}
