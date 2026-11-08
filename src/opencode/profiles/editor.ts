import { isDeepStrictEqual } from 'node:util';
import { resolveRoleProfile } from './resolver.js';
import {
  DEFAULT_PROFILE,
  type ModelProfileStore,
  parseRoleProfile,
  validateProfileName,
} from './store.js';
import {
  type NamedModelProfile,
  PROFILE_ROLES,
  type ProfileRole,
  type ProfileScope,
  type RoleProfile,
} from './types.js';

export type ProfileEntry = {
  key: string;
  name: string;
  /** Undefined only for the read-only virtual default. */
  scope?: ProfileScope;
  agents: NamedModelProfile['agents'];
  /** Original persisted snapshot; undefined for an unsaved draft. */
  base?: NamedModelProfile;
  shadowed: boolean;
};
/** null removes an override, restoring effective config inheritance. */
export type RoleEdit = { model?: string | null; variant?: string | null };
const entryKey = (scope: ProfileScope | undefined, name: string): string =>
  scope ? `${scope}:${name}` : DEFAULT_PROFILE;
export const isDraft = (entry: ProfileEntry): boolean =>
  !!entry.scope && !entry.base;
export const isEntryDirty = (entry: ProfileEntry): boolean =>
  !!entry.scope &&
  (!entry.base || !isDeepStrictEqual(entry.agents, entry.base.agents));

/**
 * Draft-until-save editor. Use entries() again after reload/save/discard/rename/delete.
 * Entries are working copies; file operations re-read and save rejects stale baselines.
 * Session selection remains caller-owned, not persisted by this host-neutral editor.
 */
export class ModelProfileWorkspace {
  private current: ProfileEntry[] = [];
  constructor(readonly store: ModelProfileStore) {
    this.reload();
  }

  /** Refresh disk state while retaining dirty working copies and their original baselines. */
  reload(): void {
    const documents = {
      global: this.store.read('global'),
      project: this.store.read('project'),
    };
    const dirty = this.current.filter(isEntryDirty);
    const next: ProfileEntry[] = [
      {
        key: DEFAULT_PROFILE,
        name: DEFAULT_PROFILE,
        agents: this.store.defaultProfile().agents,
        shadowed: false,
      },
    ];
    for (const scope of ['project', 'global'] as const) {
      for (const name of Object.keys(documents[scope].profiles).sort()) {
        const profile = documents[scope].profiles[name];
        const key = entryKey(scope, name);
        next.push(
          dirty.find((entry) => entry.key === key) ?? {
            key,
            name,
            scope,
            agents: structuredClone(profile.agents),
            base: structuredClone(profile),
            shadowed: false,
          },
        );
      }
    }
    for (const entry of dirty)
      if (!next.some((item) => item.key === entry.key)) next.push(entry);
    for (const entry of next)
      entry.shadowed =
        entry.scope === 'global' &&
        Object.hasOwn(documents.project.profiles, entry.name);
    this.current = next;
  }

  entries(): ProfileEntry[] {
    return [...this.current];
  }
  pendingCount(): number {
    return this.current.filter(isEntryDirty).length;
  }

  valuesFor(entry: ProfileEntry, role: ProfileRole): RoleProfile {
    return resolveRoleProfile(
      role,
      { agents: entry.agents },
      this.store.defaultProfile().agents,
    );
  }

  private assertEditable(
    entry: ProfileEntry,
  ): asserts entry is ProfileEntry & { scope: ProfileScope } {
    if (!entry.scope || entry.name === DEFAULT_PROFILE)
      throw new Error('The default profile is read-only; clone it to edit.');
    if (!this.current.includes(entry))
      throw new Error('Stale workspace entry; reload entries.');
  }

  private newName(name: string, scope: ProfileScope): string {
    const key = validateProfileName(name, true);
    if (
      this.current.some((entry) => entry.scope === scope && entry.name === key)
    )
      throw new Error(`Profile already exists: ${scope}:${key}`);
    return key;
  }

  createDraft(
    source: ProfileEntry,
    name: string,
    scope: ProfileScope,
  ): ProfileEntry {
    const key = this.newName(name, scope);
    const agents = Object.fromEntries(
      PROFILE_ROLES.map((role) => [role, this.valuesFor(source, role)]),
    );
    const draft = {
      key: entryKey(scope, key),
      name: key,
      scope,
      agents,
      shadowed: false,
    };
    this.current.push(draft);
    return draft;
  }

  edit(entry: ProfileEntry, role: ProfileRole, edit: RoleEdit): void {
    this.assertEditable(entry);
    if (!PROFILE_ROLES.includes(role))
      throw new Error(`Unknown profile role: ${role}`);
    const next = { ...entry.agents[role] };
    for (const field of ['model', 'variant'] as const) {
      if (edit[field] === null) delete next[field];
      else if (edit[field] !== undefined) next[field] = edit[field];
    }
    entry.agents[role] = parseRoleProfile(next);
  }

  /** Materialize all effective roles. A concurrent same-profile edit requires reload. */
  save(entry: ProfileEntry): string {
    this.assertEditable(entry);
    const agents = Object.fromEntries(
      PROFILE_ROLES.map((role) => [role, this.valuesFor(entry, role)]),
    );
    this.store.save(
      entry.scope,
      entry.name,
      { agents },
      { expected: entry.base ?? null },
    );
    this.current = this.current.filter((item) => item !== entry);
    this.reload();
    return this.store.paths[entry.scope];
  }

  /** Drop a draft or revert an edit to the latest persisted value. */
  discard(entry: ProfileEntry): void {
    this.assertEditable(entry);
    this.current = this.current.filter((item) => item !== entry);
    this.reload();
  }

  rename(entry: ProfileEntry, name: string): void {
    this.assertEditable(entry);
    const target = this.newName(name, entry.scope);
    if (!isDraft(entry)) this.store.rename(entry.scope, entry.name, target);
    entry.name = target;
    entry.key = entryKey(entry.scope, target);
    this.reload();
  }

  delete(entry: ProfileEntry): void {
    this.assertEditable(entry);
    if (!isDraft(entry)) this.store.delete(entry.scope, entry.name);
    this.current = this.current.filter((item) => item !== entry);
    this.reload();
  }
}
