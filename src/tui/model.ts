/** Pure view-model for the `/subagents-model` panel: no dialogs, no RPC. */
import type { ProfileRpcInput, ProfileState } from '../opencode/profile-rpc';

export const DEFAULT_PROFILE = 'default';

export type Profile = ProfileRpcInput<'create'>['profile'];
export type RoleModel = Profile['agents'][keyof Profile['agents'] & string];
export type Role = ProfileState['roles'][number];
export type Scope = 'global' | 'project';
export type SelectionScope = 'session' | 'project' | 'global';
export type ProfileKey = 'default' | `${Scope}:${string}`;

export interface ProfileRow {
  key: ProfileKey;
  name: string;
  /** Undefined for the virtual `default`. */
  scope?: Scope;
  shadowed: boolean;
  profile: Profile;
  revision?: string;
}

export interface Markers {
  effective: boolean;
  session: boolean;
  project: boolean;
  global: boolean;
}

export const profileKey = (name: string, scope?: Scope): ProfileKey =>
  scope ? `${scope}:${name}` : 'default';

export function profileRows(state: ProfileState): ProfileRow[] {
  return [
    {
      key: 'default',
      name: DEFAULT_PROFILE,
      shadowed: false,
      profile: state.defaultProfile,
    },
    ...state.profiles.map((entry) => ({
      key: profileKey(entry.name, entry.scope),
      name: entry.name,
      scope: entry.scope,
      shadowed: entry.shadowed,
      profile: entry.profile,
      revision: entry.revision,
    })),
  ];
}

export function markersFor(state: ProfileState, row: ProfileRow): Markers {
  // Pointers resolve by name to the winning (unshadowed) profile only.
  const points = (scope: SelectionScope) =>
    !row.shadowed && state.selections[scope] === row.name;
  const { effective } = state;
  return {
    effective:
      effective.name === row.name &&
      (effective.source === undefined || effective.source === row.scope) &&
      !row.shadowed,
    session: points('session'),
    project: points('project'),
    global: points('global'),
  };
}

export const markerLetters = (markers: Markers): string =>
  [
    markers.session ? 'S' : '',
    markers.project ? 'P' : '',
    markers.global ? 'G' : '',
  ].join('');

/** `● SPG name` — ● marks the profile runs currently use. */
export function profileTitle(row: ProfileRow, markers: Markers): string {
  const flags = `${markers.effective ? '●' : ' '} ${markerLetters(markers).padEnd(3)}`;
  return `${flags} ${row.name}${row.shadowed ? ' ~' : ''}`;
}

export function profileDescription(row: ProfileRow): string {
  if (!row.scope) return 'built-in · read-only';
  return `${row.scope}${row.shadowed ? ' · shadowed by project profile' : ''}`;
}

export const PROFILE_LEGEND =
  '● effective · S session · P project pin · G global · ~ shadowed';

export interface RoleView {
  role: Role;
  /** True when the row has no own model and shows a fallback. */
  inherited: boolean;
  model?: string;
  variant?: string;
  /** Where an inherited value comes from. */
  inheritedFrom?: 'default' | 'session';
  /** False when an own variant-only entry overrides the inherited variant. */
  variantInherited?: boolean;
}

/** model + variant are a pair: an entry with a model owns its variant. */
export function roleViews(
  state: ProfileState,
  profile: Profile,
  isDefault: boolean,
): RoleView[] {
  return state.roles.map((role) => {
    const own = profile.agents[role];
    if (own?.model)
      return { role, inherited: false, model: own.model, variant: own.variant };
    // A variant-only entry applies its variant to the inherited model.
    const ownVariant = own?.variant;
    const withVariant = (view: RoleView): RoleView =>
      ownVariant
        ? { ...view, variant: ownVariant, variantInherited: false }
        : view;
    const base = state.defaultProfile.agents[role];
    if (!isDefault && base?.model)
      return withVariant({
        role,
        inherited: true,
        model: base.model,
        variant: base.variant,
        inheritedFrom: 'default',
      });
    if (role === 'orchestrator' && state.orchestrator?.model)
      return withVariant({
        role,
        inherited: true,
        model: state.orchestrator.model,
        variant: state.orchestrator.variant,
        inheritedFrom: 'session',
      });
    return { role, inherited: true };
  });
}

export function roleLabel(view: RoleView): string {
  const model = view.model ?? 'unset';
  const variant = view.model ? (view.variant ?? 'none') : '-';
  const prefix = `${view.role.padEnd(12)} ${model}`;
  if (view.inherited && view.variantInherited === false)
    return `${prefix} (inherited) · ${variant}`;
  const text = `${prefix} · ${variant}`;
  return view.inherited ? `${text} (inherited)` : text;
}

export function roleDescription(view: RoleView): string {
  if (!view.inherited) return 'set in this profile';
  if (view.inheritedFrom === 'session') return 'inherited from session model';
  return view.inheritedFrom === 'default'
    ? 'inherited from default'
    : 'unset · host default';
}

export interface ModelChoice {
  id: string;
  name: string;
  variants: string[];
}

export function providerModels(
  state: ProfileState,
  providerID: string,
): { id: string; name: string; models: ModelChoice[] } | undefined {
  const provider = state.providers.find((item) => item.id === providerID);
  return (
    provider && {
      id: provider.id,
      name: provider.name,
      models: provider.models.map((model) => ({
        ...model,
        // Profiles store the full `provider/model` id.
        id: `${provider.id}/${model.id}`,
      })),
    }
  );
}

export function variantsOf(state: ProfileState, modelId: string): string[] {
  for (const provider of state.providers)
    for (const model of provider.models)
      if (`${provider.id}/${model.id}` === modelId) return model.variants;
  return [];
}

/** Case-insensitive search over title, id and description. */
export function searchOptions<
  T extends { title: string; description?: string; value: unknown },
>(query: string, options: readonly T[]): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return options.filter((option) => {
    const text = `${option.title} ${option.description ?? ''}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function validateProfileName(
  raw: string,
  scope: Scope,
  state: ProfileState,
): string | undefined {
  const name = raw.trim();
  if (!name) return 'Profile name must not be empty.';
  if (name.toLowerCase() === DEFAULT_PROFILE)
    return '"default" is reserved and read-only.';
  if (state.profiles.some((p) => p.scope === scope && p.name === name))
    return `A ${scope} profile named "${name}" already exists.`;
  return undefined;
}

const normalize = (profile: Profile): string =>
  JSON.stringify(
    Object.entries(profile.agents)
      .filter(([, value]) => value?.model || value?.variant)
      .map(([role, value]) => [role, value?.model, value?.variant])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );

/** Draft-until-save working copy of one persisted or new profile. */
export interface Draft {
  scope: Scope;
  name: string;
  isNew: boolean;
  /** Last persisted profile, for dirty detection. */
  base: Profile;
  /** Opaque token from the server; undefined until a new draft is created. */
  revision?: string;
  profile: Profile;
}

export const isDirty = (draft: Draft): boolean =>
  draft.isNew || normalize(draft.profile) !== normalize(draft.base);

export function withRole(
  profile: Profile,
  role: Role,
  value: RoleModel | undefined,
): Profile {
  const agents = { ...profile.agents };
  if (value?.model || value?.variant) agents[role] = value;
  else delete agents[role];
  return { agents };
}

export function cloneProfile(profile: Profile): Profile {
  return { agents: structuredClone(profile.agents) };
}

export function openDraft(row: ProfileRow): Draft | undefined {
  if (!row.scope) return undefined;
  return {
    scope: row.scope,
    name: row.name,
    isNew: false,
    base: cloneProfile(row.profile),
    revision: row.revision,
    profile: cloneProfile(row.profile),
  };
}

export function newDraft(scope: Scope, name: string, from: Profile): Draft {
  return {
    scope,
    name,
    isNew: true,
    base: { agents: {} },
    profile: cloneProfile(from),
  };
}

const SCOPE_LABEL: Record<SelectionScope, string> = {
  session: 'this session',
  project: 'this project',
  global: 'globally',
};

function effectiveSummary(state: ProfileState): string {
  const { effective } = state;
  return effective.selectedBy === 'default'
    ? `${effective.name} (built-in) is effective`
    : `${effective.name} is effective (${effective.selectedBy} selection)`;
}

export function activationMessage(
  scope: SelectionScope,
  name: string,
  state: ProfileState,
): string {
  const { effective } = state;
  const head = `${name} set ${SCOPE_LABEL[scope]}`;
  if (effective.selectedBy === scope && effective.name === name)
    return `${head}; it is now effective.`;
  if (effective.selectedBy === 'session' && scope !== 'session')
    return `${head}, but this session keeps its session selection: ${effectiveSummary(state)}.`;
  if (effective.selectedBy === 'project' && scope === 'global')
    return `${head}, but the project pin takes precedence: ${effectiveSummary(state)}.`;
  return `${head}; ${effectiveSummary(state)}.`;
}

export function clearMessage(
  scope: SelectionScope,
  state: ProfileState,
): string {
  return `Cleared ${scope} selection; ${effectiveSummary(state)}.`;
}

export function selectionClearable(
  state: ProfileState,
  sessionAvailable: boolean,
): SelectionScope[] {
  return (['session', 'project', 'global'] as const).filter(
    (scope) =>
      state.selections[scope] !== undefined &&
      (scope !== 'session' || sessionAvailable),
  );
}
