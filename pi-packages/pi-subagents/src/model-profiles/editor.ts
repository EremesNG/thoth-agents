import type {
  ModelRef,
  SubagentModelProfile,
  SubagentModelProfiles,
  ThinkingEffort,
} from '../types.js';
import type { AgentRow } from './data.js';
import type {
  ModelProfileStore,
  NamedModelProfile,
  ProfileScope,
} from './store.js';

export const DEFAULT_PROFILE = 'default';

export type ProfileEntry = {
  /** `default` or `<scope>:<name>`; stable across reloads. */
  key: string;
  name: string;
  /** Undefined only for the virtual, read-only `default`. */
  scope?: ProfileScope;
  /** Working copy; differs from `base` when the entry has unsaved edits. */
  agents: SubagentModelProfiles;
  /** Persisted agents, or undefined for an in-memory draft. */
  base?: SubagentModelProfiles;
  /** Working copy of the orchestrator; undefined keeps the session model. */
  orchestrator?: SubagentModelProfile;
  /** Persisted orchestrator (undefined for drafts or when unset). */
  baseOrchestrator?: SubagentModelProfile;
  /** Other non-agent keys of the persisted profile, preserved across saves. */
  extras: Record<string, unknown>;
  /** A same-name project profile hides this global one from name lookups. */
  shadowed: boolean;
};

export type ProfilePointer = 'session' | 'project' | 'global';
export type ProfileMarkers = Record<ProfilePointer | 'effective', boolean>;

export type AgentEdit = {
  model?: ModelRef;
  effort?: ThinkingEffort;
  reset?: 'model' | 'effort';
};

const entryKey = (scope: ProfileScope | undefined, name: string): string =>
  scope ? `${scope}:${name}` : DEFAULT_PROFILE;

function cloneAgent(profile: SubagentModelProfile = {}): SubagentModelProfile {
  return {
    ...(profile.model ? { model: { ...profile.model } } : {}),
    ...(profile.effort ? { effort: profile.effort } : {}),
  };
}

function cloneAgents(agents: SubagentModelProfiles): SubagentModelProfiles {
  return Object.fromEntries(
    Object.entries(agents).map(([name, agent]) => [name, cloneAgent(agent)]),
  );
}

const cloneOrchestrator = (
  orchestrator?: SubagentModelProfile,
): SubagentModelProfile | undefined => {
  const copy = cloneAgent(orchestrator);
  return copy.model || copy.effort ? copy : undefined;
};

const signature = (
  agents: SubagentModelProfiles,
  orchestrator?: SubagentModelProfile,
): string =>
  JSON.stringify([
    Object.entries(agents)
      .map(([name, agent]) => [
        name,
        agent.model ? `${agent.model.provider}/${agent.model.id}` : null,
        agent.effort ?? null,
      ])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
    orchestrator?.model
      ? `${orchestrator.model.provider}/${orchestrator.model.id}`
      : null,
    orchestrator?.effort ?? null,
  ]);

function extrasOf(profile: NamedModelProfile): Record<string, unknown> {
  const { agents: _agents, orchestrator: _orchestrator, ...extras } = profile;
  return extras;
}

type Staged = {
  agents: SubagentModelProfiles;
  orchestrator?: SubagentModelProfile;
};

export const isDraft = (entry: ProfileEntry): boolean =>
  !!entry.scope && !entry.base;

export function isEntryDirty(entry: ProfileEntry): boolean {
  if (!entry.scope) return false;
  return (
    !entry.base ||
    signature(entry.agents, entry.orchestrator) !==
      signature(entry.base, entry.baseOrchestrator)
  );
}

/**
 * In-memory profile manager over a ModelProfileStore. Drafts and edits live
 * here until `save`; every store failure propagates to the caller.
 */
export class ModelProfileWorkspace {
  private saved: ProfileEntry[] = [];
  private drafts: ProfileEntry[] = [];
  private edits = new Map<string, Staged>();
  /** Persisted `active` names, cached so rendering never touches the disk. */
  private active: { project?: string; global?: string } = {};

  constructor(
    readonly store: ModelProfileStore,
    readonly rows: readonly AgentRow[],
    private session: {
      get?: () => string | undefined;
      set?: (profile?: string) => void;
    } = {},
  ) {
    this.reload();
  }

  get canUseSession(): boolean {
    return typeof this.session.set === 'function';
  }

  get sessionSelection(): string | undefined {
    return this.session.get?.();
  }

  /** Re-read both files; drafts and unsaved edits survive when still valid. */
  reload(): void {
    const documents = {
      global: this.store.read('global'),
      project: this.store.read('project'),
    };
    const next: ProfileEntry[] = [];
    for (const scope of ['project', 'global'] as const) {
      const names = Object.keys(documents[scope].profiles).sort((a, b) =>
        a.localeCompare(b),
      );
      for (const name of names) {
        const profile = documents[scope].profiles[name];
        const key = entryKey(scope, name);
        const edited = this.edits.get(key);
        next.push({
          key,
          name,
          scope,
          agents: cloneAgents(edited?.agents ?? profile.agents),
          base: cloneAgents(profile.agents),
          orchestrator: cloneOrchestrator(
            edited ? edited.orchestrator : profile.orchestrator,
          ),
          baseOrchestrator: cloneOrchestrator(profile.orchestrator),
          extras: extrasOf(profile),
          shadowed:
            scope === 'global' &&
            Object.hasOwn(documents.project.profiles, name),
        });
      }
    }
    for (const key of [...this.edits.keys()])
      if (!next.some((entry) => entry.key === key)) this.edits.delete(key);
    this.saved = next;
    this.active = {
      project: documents.project.active,
      global: documents.global.active,
    };
  }

  /** Default first, then project profiles, then global ones. */
  entries(): ProfileEntry[] {
    return [this.defaultEntry(), ...this.saved, ...this.drafts];
  }

  private defaultEntry(): ProfileEntry {
    return {
      key: DEFAULT_PROFILE,
      name: DEFAULT_PROFILE,
      agents: this.defaultAgents(),
      extras: {},
      shadowed: false,
    };
  }

  /** Full copy of the `default` effective model/effort for every listed agent. */
  defaultAgents(): SubagentModelProfiles {
    return Object.fromEntries(
      this.rows.map((row) => [
        row.key,
        {
          ...(row.defaultModel ? { model: { ...row.defaultModel } } : {}),
          ...(row.defaultEffort ? { effort: row.defaultEffort } : {}),
        },
      ]),
    );
  }

  pendingCount(): number {
    return this.entries().filter(isEntryDirty).length;
  }

  /** Effective values: explicit profile value, else the default value. */
  valuesFor(entry: ProfileEntry, row: AgentRow): SubagentModelProfile {
    const own = entry.scope ? entry.agents[row.key] : undefined;
    return {
      model: own?.model ?? row.defaultModel,
      effort: own?.effort ?? row.defaultEffort,
    };
  }

  pointers(): Partial<Record<ProfilePointer, string>> {
    return { session: this.sessionSelection, ...this.active };
  }

  /** Mirrors ModelProfileStore.resolve from cached data. */
  effective(): { name: string; scope?: ProfileScope } {
    const pointers = this.pointers();
    for (const level of ['session', 'project', 'global'] as const) {
      const name = pointers[level];
      if (!name) continue;
      if (name === DEFAULT_PROFILE) return { name };
      const global = this.saved.find(
        (e) => e.name === name && e.scope === 'global',
      );
      if (level === 'global' && !global) continue;
      const hit =
        this.saved.find((e) => e.name === name && e.scope === 'project') ??
        global;
      if (hit) return { name, scope: hit.scope };
    }
    return { name: DEFAULT_PROFILE };
  }

  /** Which pointers resolve to this entry, and whether it is the effective one. */
  markers(entry: ProfileEntry): ProfileMarkers {
    const pointers = this.pointers();
    const resolvesHere = (pointer: ProfilePointer): boolean => {
      if (pointers[pointer] !== entry.name || isDraft(entry)) return false;
      if (!entry.scope) return true;
      if (pointer === 'global') return entry.scope === 'global';
      return entry.scope === 'project' || !entry.shadowed;
    };
    const effective = this.effective();
    return {
      session: resolvesHere('session'),
      project: resolvesHere('project'),
      global: resolvesHere('global'),
      effective:
        effective.name === entry.name &&
        effective.scope === entry.scope &&
        !isDraft(entry),
    };
  }

  private agentFor(name: string): string {
    const key = name.trim().toLowerCase();
    if (!this.rows.some((row) => row.key === key))
      throw new Error(`Unknown subagent: ${name}`);
    return key;
  }

  private assertEditable(entry: ProfileEntry): void {
    if (!entry.scope)
      throw new Error(
        'The default profile is read-only. Create a new profile from it to edit.',
      );
  }

  private validateNewName(name: string, scope: ProfileScope): string {
    const value = name.trim();
    if (!value) throw new Error('Profile name must be non-empty');
    if (value === DEFAULT_PROFILE)
      throw new Error('default is a reserved virtual profile');
    if (this.entries().some((e) => e.scope === scope && e.name === value))
      throw new Error(`Profile already exists in ${scope} scope: ${value}`);
    return value;
  }

  /**
   * New draft from `source` (default => full copy of default values). Nothing
   * is written until `save`.
   */
  createDraft(
    source: ProfileEntry,
    name: string,
    scope: ProfileScope,
  ): ProfileEntry {
    const value = this.validateNewName(name, scope);
    const agents = this.defaultAgents();
    for (const [agent, own] of Object.entries(
      source.scope ? source.agents : {},
    ))
      agents[agent] = { ...agents[agent], ...cloneAgent(own) };
    const draft: ProfileEntry = {
      key: entryKey(scope, value),
      name: value,
      scope,
      agents,
      orchestrator: source.scope
        ? cloneOrchestrator(source.orchestrator)
        : undefined,
      extras: { ...source.extras },
      shadowed: false,
    };
    this.drafts.push(draft);
    return draft;
  }

  edit(entry: ProfileEntry, agentName: string, edit: AgentEdit): void {
    this.assertEditable(entry);
    const key = this.agentFor(agentName);
    const row = this.rows.find((item) => item.key === key) as AgentRow;
    const agent = cloneAgent(entry.agents[key]);
    if (edit.reset === 'model') agent.model = cloneModel(row.defaultModel);
    if (edit.reset === 'effort') agent.effort = row.defaultEffort;
    if (edit.model) agent.model = { ...edit.model };
    if (edit.effort) agent.effort = edit.effort;
    if (!agent.model) delete agent.model;
    if (!agent.effort) delete agent.effort;
    entry.agents[key] = agent;
    if (!isDraft(entry)) this.trackEdits(entry);
  }

  /** Stage an orchestrator edit; reset clears the field back to the session's. */
  editOrchestrator(entry: ProfileEntry, edit: AgentEdit): void {
    this.assertEditable(entry);
    const next = cloneAgent(entry.orchestrator);
    if (edit.reset === 'model') delete next.model;
    if (edit.reset === 'effort') delete next.effort;
    if (edit.model) next.model = { ...edit.model };
    if (edit.effort) next.effort = edit.effort;
    this.stageOrchestrator(entry, next);
  }

  /** Replace the orchestrator wholesale (e.g. a session capture). */
  setOrchestrator(
    entry: ProfileEntry,
    orchestrator?: SubagentModelProfile,
  ): void {
    this.assertEditable(entry);
    this.stageOrchestrator(entry, orchestrator);
  }

  private stageOrchestrator(
    entry: ProfileEntry,
    orchestrator?: SubagentModelProfile,
  ): void {
    entry.orchestrator = cloneOrchestrator(orchestrator);
    if (!isDraft(entry)) this.trackEdits(entry);
  }

  /** Persisted orchestrator of the effective profile (what activation applies). */
  effectiveOrchestrator(): SubagentModelProfile | undefined {
    const { name, scope } = this.effective();
    return this.saved.find((e) => e.name === name && e.scope === scope)
      ?.baseOrchestrator;
  }

  private trackEdits(entry: ProfileEntry): void {
    if (isEntryDirty(entry))
      this.edits.set(entry.key, {
        agents: entry.agents,
        orchestrator: entry.orchestrator,
      });
    else this.edits.delete(entry.key);
  }

  /** Persist a draft or edited profile as a self-contained copy. Returns the file. */
  save(entry: ProfileEntry): string {
    this.assertEditable(entry);
    const scope = entry.scope as ProfileScope;
    const agents = cloneAgents(entry.agents);
    for (const row of this.rows)
      agents[row.key] = {
        ...(row.defaultModel ? { model: { ...row.defaultModel } } : {}),
        ...(row.defaultEffort ? { effort: row.defaultEffort } : {}),
        ...cloneAgent(agents[row.key]),
      };
    const value = {
      ...entry.extras,
      agents,
      // Explicit undefined: store.save merges with the file, so omission would keep it.
      orchestrator: entry.orchestrator,
    };
    if (isDraft(entry)) this.store.create(scope, entry.name, value);
    else this.store.save(scope, entry.name, value);
    this.drafts = this.drafts.filter((draft) => draft !== entry);
    this.edits.delete(entry.key);
    this.reload();
    return this.store.paths[scope];
  }

  /** Rename a draft in memory, or a saved profile in its file. */
  rename(entry: ProfileEntry, name: string): void {
    this.assertEditable(entry);
    const scope = entry.scope as ProfileScope;
    const value = this.validateNewName(name, scope);
    if (isDraft(entry)) {
      entry.name = value;
      entry.key = entryKey(scope, value);
      return;
    }
    const pointers = this.pointerTargets(entry);
    const edited = this.edits.get(entry.key);
    this.store.rename(scope, entry.name, value);
    this.edits.delete(entry.key);
    if (edited) this.edits.set(entryKey(scope, value), edited);
    // Pointers that resolved to this profile follow it to its new name.
    if (pointers.includes('project') && scope === 'global')
      this.store.setProjectPin(value);
    if (pointers.includes('session')) this.session.set?.(value);
    this.reload();
  }

  /** Pointers that resolve to this entry (global active only for global ones). */
  pointerTargets(entry: ProfileEntry): ProfilePointer[] {
    const markers = this.markers(entry);
    return (['session', 'project', 'global'] as const).filter(
      (pointer) => markers[pointer],
    );
  }

  /** Remove a draft, or delete a saved profile and clear pointers to it. */
  delete(entry: ProfileEntry): ProfilePointer[] {
    this.assertEditable(entry);
    if (isDraft(entry)) {
      this.drafts = this.drafts.filter((draft) => draft !== entry);
      return [];
    }
    const scope = entry.scope as ProfileScope;
    const cleared = this.pointerTargets(entry);
    this.store.delete(scope, entry.name);
    if (cleared.includes('project') && scope === 'global')
      this.store.setProjectPin(undefined);
    if (cleared.includes('session')) this.session.set?.(undefined);
    this.edits.delete(entry.key);
    this.reload();
    return cleared;
  }

  /** Select (or, when already selected, clear) a profile for one pointer. */
  activate(
    entry: ProfileEntry,
    pointer: ProfilePointer,
    toggle = true,
  ): 'set' | 'cleared' {
    if (isDraft(entry)) throw new Error('Save the draft before using it.');
    if (entry.shadowed && pointer !== 'global')
      throw new Error(
        `Global ${entry.name} is shadowed by the local profile; select that one.`,
      );
    if (pointer === 'global' && entry.scope === 'project')
      throw new Error('Global active must be a global profile.');
    const already = toggle && this.markers(entry)[pointer];
    const next = already ? undefined : entry.name;
    if (pointer === 'session') {
      if (!this.session.set)
        throw new Error('Session selection is unavailable here.');
      this.session.set(next);
    } else if (pointer === 'project') this.store.setProjectPin(next);
    else this.store.setGlobalActive(next);
    this.reload();
    return next ? 'set' : 'cleared';
  }
}

function cloneModel(model?: ModelRef): ModelRef | undefined {
  return model ? { ...model } : undefined;
}
