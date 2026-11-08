/** `/subagents-model` flow. Talks only to injected UI and RPC ports. */
import type { Plugin } from '@opencode/plugin/tui';
import type {
  ProfileError,
  ProfileRpcInput,
  ProfileRpcMethod,
  ProfileRpcOutput,
  ProfileState,
} from '../opencode/profile-rpc';
import {
  activationMessage,
  clearMessage,
  type Draft,
  isDirty,
  type Markers,
  markersFor,
  newDraft,
  openDraft,
  PROFILE_LEGEND,
  type Profile,
  type ProfileKey,
  type ProfileRow,
  profileDescription,
  profileKey,
  profileRows,
  profileTitle,
  providerModels,
  type Role,
  type RoleView,
  roleDescription,
  roleLabel,
  roleViews,
  type Scope,
  type SelectionScope,
  searchOptions,
  selectionClearable,
  validateProfileName,
  variantsOf,
  withRole,
} from './model';

export type Ui = Pick<
  Plugin.Context['ui']['dialog'],
  'select' | 'prompt' | 'confirm' | 'alert'
> & { toast: Pick<Plugin.Context['ui']['toast'], 'show'> };

export type RpcPort = {
  [M in ProfileRpcMethod]: (
    input: ProfileRpcInput<M>,
  ) => Promise<ProfileRpcOutput<M>>;
};

export interface FlowPorts {
  ui: Ui;
  rpc: RpcPort;
  /** Current session, if the TUI is showing one. */
  sessionID: () => string | undefined;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: ProfileError };

const TITLE = 'Subagent model profiles';
const NONE = 'none';

export async function runModelProfilesFlow(ports: FlowPorts): Promise<void> {
  const { ui, rpc } = ports;
  const sessionID = ports.sessionID();
  const session = sessionID ? { sessionID } : {};
  const sessionRequired = 'Open a session to use this action.';

  async function call<T>(run: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
    try {
      return await run();
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'OPERATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
  const toast = (
    message: string,
    variant: 'info' | 'success' | 'warning' | 'error' = 'info',
  ) => ui.toast.show({ title: TITLE, message, variant, duration: 6000 });
  const fail = (error: ProfileError) =>
    toast(`${error.code}: ${error.message}`, 'error');

  let state: ProfileState;
  const loaded = await call(() => rpc.state(session));
  if (!loaded.ok) return fail(loaded.error);
  state = loaded.value;

  const refresh = async (): Promise<boolean> => {
    const next = await call(() => rpc.state(session));
    if (!next.ok) {
      fail(next.error);
      return false;
    }
    state = next.value;
    return true;
  };
  const rowOf = (key: ProfileKey) =>
    profileRows(state).find((row) => row.key === key);
  const markers = (row: ProfileRow): Markers => markersFor(state, row);
  const effectiveText = () =>
    state.effective.selectedBy === 'default'
      ? `${state.effective.name} (built-in)`
      : `${state.effective.name} (${state.effective.selectedBy})`;

  // ---- model / variant pickers ------------------------------------------

  async function pickProvider(role: Role): Promise<string | undefined | null> {
    if (!state.providers.length) {
      toast('No models available in the catalog.', 'warning');
      return undefined;
    }
    const picked = await ui.select<string>({
      title: `Provider for ${role}`,
      placeholder: 'Search providers',
      options: [
        {
          title: 'Reset to inherited',
          value: '',
          category: 'Actions',
          description: 'remove this role override',
        },
        ...state.providers.map((provider) => ({
          title: provider.name,
          value: provider.id,
          description: `${provider.models.length} model${provider.models.length === 1 ? '' : 's'}`,
          category: 'Providers',
        })),
      ],
      search: searchOptions,
    });
    return picked === undefined ? undefined : picked || null;
  }

  async function pickModel(
    role: Role,
    providerID: string,
    current?: string,
  ): Promise<string | undefined> {
    const provider = providerModels(state, providerID);
    if (!provider) return undefined;
    return ui.select<string>({
      title: `${provider.name} model for ${role}`,
      placeholder: 'Search models',
      current,
      options: provider.models.map((model) => ({
        // Names can collide across Codex/API models and dated snapshots. Put
        // the exact local ID first; a non-shrinking footer crowds it out.
        title: model.id.slice(provider.id.length + 1),
        value: model.id,
        description: model.variants.length
          ? `${model.name} · variants: ${model.variants.join(', ')}`
          : model.name,
      })),
      search: searchOptions,
    });
  }

  /** Returns the chosen variant, NONE, or undefined when cancelled. */
  async function pickVariant(
    role: Role,
    modelId: string,
    current?: string,
  ): Promise<string | undefined> {
    const variants = variantsOf(state, modelId);
    return ui.select<string>({
      title: `Variant for ${role}`,
      placeholder: 'Search variants',
      current: current ?? NONE,
      options: [
        {
          title: NONE,
          value: NONE,
          description: `${modelId} default`,
        },
        ...variants.map((variant) => ({ title: variant, value: variant })),
      ],
      search: searchOptions,
    });
  }

  async function editModel(
    draft: Draft,
    view: RoleView,
    withVariant: boolean,
  ): Promise<void> {
    const providerID = await pickProvider(view.role);
    if (providerID === undefined) return;
    if (providerID === null) {
      draft.profile = withRole(draft.profile, view.role, undefined);
      return;
    }
    const model = await pickModel(view.role, providerID, view.model);
    if (!model) return;
    let variant: string | undefined;
    if (withVariant && variantsOf(state, model).length) {
      const picked = await pickVariant(view.role, model);
      if (picked === undefined) return;
      variant = picked === NONE ? undefined : picked;
    }
    draft.profile = withRole(draft.profile, view.role, {
      model,
      ...(variant ? { variant } : {}),
    });
  }

  async function editVariant(draft: Draft, view: RoleView): Promise<void> {
    if (!view.model) {
      toast('Set a model first; the variant belongs to the model.', 'warning');
      return;
    }
    if (!variantsOf(state, view.model).length) {
      toast(`${view.model} has no variants.`, 'info');
      return;
    }
    const picked = await pickVariant(view.role, view.model, view.variant);
    if (picked === undefined) return;
    if (!view.inherited) {
      draft.profile = withRole(draft.profile, view.role, {
        model: view.model,
        ...(picked === NONE ? {} : { variant: picked }),
      });
      return;
    }
    // An inherited row stores a variant-only entry; the model stays inherited.
    draft.profile = withRole(
      draft.profile,
      view.role,
      picked === NONE ? undefined : { variant: picked },
    );
  }

  async function editRole(draft: Draft, view: RoleView): Promise<void> {
    type Pick = 'both' | 'variant' | 'reset';
    const picked = await ui.select<Pick>({
      title: `Edit ${view.role}`,
      options: [
        {
          title: 'Change model and variant',
          value: 'both',
          description: view.model ? `now ${roleLabel(view)}` : undefined,
        },
        {
          title: 'Change variant only',
          value: 'variant',
          description: view.model
            ? `variants of ${view.model}`
            : 'needs a model first',
        },
        {
          title: 'Reset to inherited',
          value: 'reset',
          description: 'remove this role override',
          disabled: view.inherited && view.variantInherited !== false,
        },
      ],
    });
    if (picked === 'both') await editModel(draft, view, true);
    else if (picked === 'variant') await editVariant(draft, view);
    else if (picked === 'reset')
      draft.profile = withRole(draft.profile, view.role, undefined);
  }

  // ---- persistence ------------------------------------------------------

  /** Returns true when persisted; false when the user must keep editing. */
  async function persist(draft: Draft): Promise<boolean> {
    if (draft.isNew) {
      const created = await call(() =>
        rpc.create({
          scope: draft.scope,
          name: draft.name,
          profile: draft.profile,
        }),
      );
      if (!created.ok) {
        fail(created.error);
        return false;
      }
      draft.revision = created.value.revision;
    } else {
      const baseRevision = draft.revision;
      if (baseRevision === undefined) return false;
      const saved = await call(() =>
        rpc.save({
          scope: draft.scope,
          name: draft.name,
          profile: draft.profile,
          baseRevision,
        }),
      );
      if (!saved.ok) {
        if (saved.error.code === 'PROFILE_CONFLICT') {
          await offerReload(draft, saved.error);
          return false;
        }
        fail(saved.error);
        return false;
      }
      draft.revision = saved.value.revision;
    }
    draft.isNew = false;
    draft.base = { agents: structuredClone(draft.profile.agents) };
    await refresh();
    toast(`Saved ${draft.name} (${draft.scope}).`, 'success');
    return true;
  }

  /** On conflict the profile changed on disk: offer to reload it. */
  async function offerReload(draft: Draft, error: ProfileError) {
    const reload = await ui.confirm({
      title: 'Profile changed on disk',
      message: `${error.message}\nReload the saved profile and discard your edits?`,
      label: { confirm: 'Reload', cancel: 'Keep editing' },
    });
    if (!reload || !(await refresh())) return;
    const row = rowOf(profileKey(draft.name, draft.scope));
    const fresh = row && openDraft(row);
    if (fresh) Object.assign(draft, fresh);
    else toast(`${draft.name} no longer exists on disk.`, 'warning');
  }

  async function activate(
    draft: Draft | undefined,
    row: ProfileRow,
    scope: SelectionScope,
  ): Promise<void> {
    if (draft && isDirty(draft)) {
      const choice = await ui.select<'save' | 'cancel'>({
        title: 'Unsaved changes',
        options: [
          { title: 'Save, then activate', value: 'save' },
          { title: 'Cancel', value: 'cancel' },
        ],
      });
      if (choice !== 'save' || !(await persist(draft))) return;
    }
    if (row.shadowed) {
      const go = await ui.confirm({
        title: 'Shadowed profile',
        message: `A project profile named "${row.name}" shadows this global one; selecting by name activates the project profile.`,
        label: { confirm: 'Activate anyway', cancel: 'Cancel' },
      });
      if (!go) return;
    }
    const result = await call(() =>
      rpc.activate({ ...session, scope, name: row.name }),
    );
    if (!result.ok) return fail(result.error);
    state = result.value;
    toast(
      activationMessage(scope, row.name, state),
      state.effective.name === row.name ? 'success' : 'warning',
    );
  }

  async function clearSelection(scope: SelectionScope): Promise<void> {
    const result = await call(() => rpc.clear({ ...session, scope }));
    if (!result.ok) return fail(result.error);
    state = result.value;
    toast(clearMessage(scope, state), 'success');
  }

  // ---- create / rename / delete -----------------------------------------

  async function askName(
    scope: Scope,
    initial?: string,
  ): Promise<string | undefined> {
    let value = initial;
    for (;;) {
      const raw = await ui.prompt({
        title: 'Profile name',
        description: `New ${scope} profile (\`default\` is reserved)`,
        placeholder: 'e.g. fast-review',
        value,
      });
      if (raw === undefined) return undefined;
      const problem = validateProfileName(raw, scope, state);
      if (!problem) return raw.trim();
      toast(problem, 'warning');
      value = raw;
    }
  }

  /** Draft for a new profile, created from `source` (default when omitted). */
  async function startNew(source?: ProfileRow): Promise<Draft | undefined> {
    const scope = await ui.select<Scope>({
      title: 'Where should the profile live?',
      options: [
        { title: 'global', value: 'global', description: 'all projects' },
        {
          title: 'project',
          value: 'project',
          description: 'this project only (.opencode/thoth)',
        },
      ],
    });
    if (!scope) return undefined;
    const name = await askName(scope);
    if (!name) return undefined;
    const from: Profile = (source ?? profileRows(state)[0]).profile;
    return newDraft(scope, name, from);
  }

  async function pickSource(): Promise<ProfileRow | undefined> {
    const rows = profileRows(state);
    const key = await ui.select<ProfileKey>({
      title: 'Create from',
      placeholder: 'Search profiles',
      options: rows.map((row) => ({
        title:
          row.key === 'default' ? 'Start from default' : `Clone ${row.name}`,
        value: row.key,
        description: profileDescription(row),
        category: row.key === 'default' ? 'Default' : 'Clone',
      })),
      search: searchOptions,
    });
    return key ? rowOf(key) : undefined;
  }

  // ---- detail -----------------------------------------------------------

  type DetailPick =
    | { t: 'role'; role: Role }
    | {
        t:
          | 'save'
          | 'discard'
          | 'capture'
          | 'clone'
          | 'rename'
          | 'delete'
          | 'back';
      }
    | { t: 'use'; scope: SelectionScope };

  /** Unsaved drafts parked while the user works on a clone of them. */
  const pending = new Map<ProfileKey, Draft>();

  /** Resolves every parked draft; false when the user wants to keep editing. */
  async function settlePending(): Promise<boolean> {
    for (const [key, draft] of [...pending]) {
      const choice = await ui.select<'save' | 'discard' | 'keep'>({
        title: `Unsaved changes in ${draft.name}`,
        options: [
          { title: 'Save', value: 'save' },
          { title: 'Discard', value: 'discard' },
          { title: 'Keep editing', value: 'keep' },
        ],
      });
      if (!choice || choice === 'keep') return false;
      if (choice === 'save' && !(await persist(draft))) return false;
      pending.delete(key);
    }
    return true;
  }

  /** Returns a new draft to continue with (after a clone), otherwise undefined. */
  async function detail(start: ProfileRow | Draft): Promise<Draft | undefined> {
    const resumed = 'key' in start ? pending.get(start.key) : undefined;
    if (resumed && 'key' in start) pending.delete(start.key);
    let draft: Draft | undefined =
      'key' in start ? (resumed ?? openDraft(start)) : (start as Draft);
    const readonlyRow = 'key' in start && !draft ? start : undefined;
    for (;;) {
      const row: ProfileRow | undefined = draft
        ? (rowOf(profileKey(draft.name, draft.scope)) ??
          (draft.isNew
            ? {
                key: profileKey(draft.name, draft.scope),
                name: draft.name,
                scope: draft.scope,
                shadowed: false,
                profile: draft.profile,
              }
            : undefined))
        : readonlyRow && rowOf(readonlyRow.key);
      if (!row) return undefined;
      const profile = draft?.profile ?? row.profile;
      const views = roleViews(state, profile, row.key === 'default');
      const dirty = draft ? isDirty(draft) : false;
      const flags = markers(row);
      const options = [
        ...views.map((view) => ({
          title: roleLabel(view),
          value: { t: 'role', role: view.role } as DetailPick,
          description: roleDescription(view),
          category: 'Roles',
        })),
        ...(dirty
          ? [
              {
                title: 'Save changes',
                value: { t: 'save' } as DetailPick,
                category: 'Edit',
              },
              {
                title: draft?.isNew ? 'Discard draft' : 'Discard edits',
                value: { t: 'discard' } as DetailPick,
                category: 'Edit',
              },
            ]
          : []),
        ...(draft
          ? [
              {
                title: 'Capture session model into orchestrator',
                value: { t: 'capture' } as DetailPick,
                disabled: !sessionID,
                description: !sessionID
                  ? sessionRequired
                  : state.orchestrator?.model
                    ? `now ${state.orchestrator.model}${state.orchestrator.variant ? ` · ${state.orchestrator.variant}` : ''}`
                    : 'no session model yet',
                category: 'Edit',
              },
            ]
          : []),
        {
          title: 'Use for this session',
          value: { t: 'use', scope: 'session' } as DetailPick,
          category: 'Activate',
          disabled: !sessionID,
          description: !sessionID
            ? sessionRequired
            : flags.session
              ? 'already selected'
              : undefined,
        },
        {
          title: 'Pin to this project',
          value: { t: 'use', scope: 'project' } as DetailPick,
          category: 'Activate',
          description: flags.project ? 'already selected' : undefined,
        },
        {
          title: 'Set as global active',
          value: { t: 'use', scope: 'global' } as DetailPick,
          category: 'Activate',
          description: flags.global ? 'already selected' : undefined,
        },
        {
          title: 'Clone this profile',
          value: { t: 'clone' } as DetailPick,
          category: 'Manage',
        },
        ...(draft && !draft.isNew
          ? [
              {
                title: 'Rename',
                value: { t: 'rename' } as DetailPick,
                category: 'Manage',
              },
              {
                title: 'Delete',
                value: { t: 'delete' } as DetailPick,
                category: 'Manage',
              },
            ]
          : []),
        {
          title: 'Back',
          value: { t: 'back' } as DetailPick,
          category: 'Manage',
        },
      ];
      const title = `${profileTitle(row, flags).trim()}${row.scope ? ` (${row.scope})` : ''}${dirty ? ' *' : ''}`;
      const pick = await ui.select<DetailPick>({
        title: `${title} — ${effectiveText()} effective`,
        placeholder: draft ? 'Search roles and actions' : 'Search (read-only)',
        options,
        search: searchOptions,
      });
      if (!pick || pick.t === 'back') {
        if (draft && isDirty(draft)) {
          const choice = await ui.select<'save' | 'discard' | 'keep'>({
            title: `Unsaved changes in ${draft.name}`,
            options: [
              { title: 'Save', value: 'save' },
              { title: 'Discard', value: 'discard' },
              { title: 'Keep editing', value: 'keep' },
            ],
          });
          if (!choice || choice === 'keep') continue;
          if (choice === 'save' && !(await persist(draft))) continue;
        }
        return undefined;
      }
      if (pick.t === 'role') {
        const view = views.find((item) => item.role === pick.role);
        if (!view) continue;
        if (!draft) toast('default is read-only; clone it to edit.', 'info');
        else await editRole(draft, view);
      } else if (pick.t === 'save') await persist(draft as Draft);
      else if (pick.t === 'discard') {
        const ok = await ui.confirm({
          title: 'Discard changes',
          message: `Discard unsaved changes to ${draft?.name}?`,
          label: { confirm: 'Discard', cancel: 'Keep editing' },
        });
        if (!ok) continue;
        if (draft?.isNew) return undefined;
        const fresh = openDraft(row);
        if (fresh) draft = fresh;
      } else if (pick.t === 'capture' && sessionID) {
        const captured = await call(() => rpc.capture({ sessionID }));
        if (!captured.ok) fail(captured.error);
        else if (!captured.value.model)
          toast('No session model to capture yet.', 'warning');
        else if (draft) {
          const { model, variant } = captured.value;
          draft.profile = withRole(draft.profile, 'orchestrator', {
            model,
            ...(variant ? { variant } : {}),
          });
          toast(`Orchestrator set to ${model} (unsaved).`, 'info');
        }
      } else if (pick.t === 'use') await activate(draft, row, pick.scope);
      else if (pick.t === 'clone') {
        const clone = await startNew({ ...row, profile });
        if (clone) {
          if (draft && isDirty(draft)) {
            // Cloning carries the visible (draft) values; the original draft
            // stays pending so reopening it (or leaving the panel) resolves it.
            pending.set(profileKey(draft.name, draft.scope), draft);
            toast('Cloned including your unsaved edits.', 'info');
          }
          return clone;
        }
      } else if (pick.t === 'rename' && draft) {
        if (isDirty(draft)) {
          toast('Save or discard your edits before renaming.', 'warning');
          continue;
        }
        const newName = await askName(draft.scope, draft.name);
        if (!newName || newName === draft.name) continue;
        const renamed = await call(() =>
          rpc.rename({
            scope: draft?.scope as Scope,
            name: draft?.name as string,
            newName,
          }),
        );
        if (!renamed.ok) {
          fail(renamed.error);
          continue;
        }
        if (!(await refresh())) return undefined;
        const next = rowOf(profileKey(newName, draft.scope));
        draft = next && openDraft(next);
        toast(`Renamed to ${newName}.`, 'success');
        if (!draft) return undefined;
      } else if (pick.t === 'delete' && draft) {
        const ok = await ui.confirm({
          title: `Delete ${draft.name}`,
          message: `Delete the ${draft.scope} profile "${draft.name}"? Selections pointing at it fall back.`,
          label: { confirm: 'Delete', cancel: 'Cancel' },
        });
        if (!ok) continue;
        const deleted = await call(() =>
          rpc.delete({
            scope: draft?.scope as Scope,
            name: draft?.name as string,
          }),
        );
        if (!deleted.ok) {
          fail(deleted.error);
          continue;
        }
        await refresh();
        toast(`Deleted ${draft.name}.`, 'success');
        return undefined;
      }
    }
  }

  // ---- overview ---------------------------------------------------------

  // String values keep `current` comparable by equality.
  type OverviewPick =
    | `profile:${ProfileKey}`
    | 'new'
    | 'warnings'
    | `clear:${SelectionScope}`;

  let next: ProfileRow | Draft | undefined;
  let last: ProfileKey = state.effective.source
    ? profileKey(state.effective.name, state.effective.source)
    : 'default';
  for (;;) {
    if (next) {
      const follow = await detail(next);
      next = follow;
      continue;
    }
    const rows = profileRows(state);
    const clearable = selectionClearable(state, !!sessionID);
    const options = [
      ...rows.map((row) => ({
        title: profileTitle(row, markers(row)),
        value: `profile:${row.key}` as OverviewPick,
        description: profileDescription(row),
        category: 'Profiles',
      })),
      {
        title: 'New profile…',
        value: 'new' as OverviewPick,
        description: 'from default or by cloning',
        category: 'Actions',
      },
      ...(!sessionID
        ? [
            {
              title: 'Clear session selection',
              value: 'clear:session' as OverviewPick,
              disabled: true,
              description: sessionRequired,
              category: 'Actions',
            },
          ]
        : []),
      ...clearable.map((scope) => ({
        title: `Clear ${scope} selection`,
        value: `clear:${scope}` as OverviewPick,
        description: `currently ${state.selections[scope]}`,
        category: 'Actions',
      })),
      ...(state.warnings.length
        ? [
            {
              title: `Warnings (${state.warnings.length})`,
              value: 'warnings' as OverviewPick,
              description: state.warnings[0],
              category: 'Actions',
            },
          ]
        : []),
    ];
    const pick = await ui.select<OverviewPick>({
      title: `${TITLE} — ${effectiveText()}`,
      placeholder: `Search profiles · ${PROFILE_LEGEND}`,
      options,
      current: `profile:${last}` as OverviewPick,
      search: searchOptions,
    });
    if (!pick) {
      if (await settlePending()) return;
      continue;
    }
    if (pick.startsWith('profile:')) {
      last = pick.slice('profile:'.length) as ProfileKey;
      const row = rowOf(last);
      if (row) next = row;
    } else if (pick === 'new') {
      const source = await pickSource();
      if (source) next = await startNew(source);
    } else if (pick.startsWith('clear:'))
      await clearSelection(pick.slice('clear:'.length) as SelectionScope);
    else
      await ui.alert({
        title: 'Profile warnings',
        message: state.warnings.join('\n'),
      });
  }
}
