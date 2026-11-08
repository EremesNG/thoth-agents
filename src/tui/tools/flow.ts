/** `/subagents-tools` flow. Talks only to injected UI and RPC ports. */
import type {
  ToolError,
  ToolRpcInput,
  ToolRpcMethod,
  ToolRpcOutput,
  ToolState,
} from '../../opencode/tool-rpc';
import type { Ui } from '../flow';
import {
  applyOverrides,
  countMatches,
  defaultScope,
  type Effect,
  entryDescription,
  isDirty,
  LOCKED_MESSAGE,
  manualEntries,
  maskGlobal,
  OVERVIEW_LEGEND,
  openDraft,
  overviewTitle,
  previewRows,
  ROLE_LEGEND,
  removeOverride,
  roleOf,
  roleSummary,
  rowDescription,
  rowTitle,
  type Scope,
  scopeStatus,
  searchOptions,
  setOverride,
  type ToolDraft,
  type ToolRole,
  validatePattern,
} from './model';

export type ToolsRpcPort = {
  [M in ToolRpcMethod]: (input: ToolRpcInput<M>) => Promise<ToolRpcOutput<M>>;
};

export interface ToolsFlowPorts {
  ui: Ui;
  rpc: ToolsRpcPort;
}

type Outcome = { ok: true; value: ToolState } | { ok: false; error: ToolError };

const TITLE = 'Subagent tool permissions';
const EFFECTS: readonly Effect[] = ['allow', 'ask', 'deny'];

export async function runToolsFlow(ports: ToolsFlowPorts): Promise<void> {
  const { ui, rpc } = ports;

  async function call(run: () => Promise<Outcome>): Promise<Outcome> {
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
  const fail = (error: ToolError) =>
    toast(`${error.code}: ${error.message}`, 'error');

  const loaded = await call(() => rpc.state({}));
  if (!loaded.ok) return fail(loaded.error);
  let state: ToolState = loaded.value;

  const refresh = async (): Promise<boolean> => {
    const next = await call(() => rpc.state({}));
    if (!next.ok) {
      fail(next.error);
      return false;
    }
    state = next.value;
    return true;
  };

  // ---- persistence ------------------------------------------------------

  /** Replaces the draft with the on-disk values of its role and scope. */
  const reopen = (draft: ToolDraft) =>
    Object.assign(draft, openDraft(state, draft.role, draft.scope));

  /** On conflict the file changed on disk: offer to reload it. */
  async function offerReload(draft: ToolDraft, error: ToolError) {
    const reload = await ui.confirm({
      title: 'Tool overrides changed on disk',
      message: `${error.message}\nReload the saved overrides and discard your edits?`,
      label: { confirm: 'Reload', cancel: 'Keep editing' },
    });
    if (reload && (await refresh())) reopen(draft);
  }

  /** Returns true when persisted; false when the user must keep editing. */
  async function persist(draft: ToolDraft): Promise<boolean> {
    const saved = await call(() =>
      rpc.save({
        scope: draft.scope,
        role: draft.role,
        overrides: draft.overrides,
        baseRevision: draft.revision,
      }),
    );
    if (!saved.ok) {
      if (saved.error.code === 'TOOLS_CONFLICT')
        await offerReload(draft, saved.error);
      else fail(saved.error);
      return false;
    }
    state = saved.value;
    reopen(draft);
    toast(`Saved ${draft.role} (${draft.scope}).`, 'success');
    return true;
  }

  async function resetRole(draft: ToolDraft): Promise<void> {
    const ok = await ui.confirm({
      title: `Reset ${draft.role} to defaults`,
      message: `Remove all ${draft.scope} overrides for ${draft.role}${
        isDirty(draft) ? ' and discard unsaved edits' : ''
      }?${
        draft.scope === 'project'
          ? ''
          : ' A project entry for this role would still replace global.'
      }`,
      label: { confirm: 'Reset', cancel: 'Cancel' },
    });
    if (!ok) return;
    const result = await call(() =>
      rpc.reset({
        scope: draft.scope,
        role: draft.role,
        baseRevision: draft.revision,
      }),
    );
    if (!result.ok) {
      if (result.error.code === 'TOOLS_CONFLICT')
        await offerReload(draft, result.error);
      else fail(result.error);
      return;
    }
    state = result.value;
    reopen(draft);
    toast(`Reset ${draft.role} (${draft.scope}) to defaults.`, 'success');
  }

  // ---- pickers ----------------------------------------------------------

  async function pickScope(role: ToolRole): Promise<Scope | undefined> {
    const view = roleOf(state, role);
    const describe = (scope: Scope) => {
      const entries = view[scope].overrides.length;
      return `${entries} override${entries === 1 ? '' : 's'}${
        view.effectiveScope === scope
          ? ' · in effect'
          : scope === 'global' && view.project.present
            ? ' · inactive (project replaces global)'
            : ''
      }`;
    };
    return ui.select<Scope>({
      title: `Edit ${role} — project replaces global for this role`,
      current: defaultScope(view),
      options: (['global', 'project'] as const).map((scope) => ({
        title: scope,
        value: scope,
        description: describe(scope),
      })),
    });
  }

  type EffectPick = Effect | 'inherit' | 'remove';

  async function pickEffect(
    title: string,
    current: EffectPick | undefined,
    extra: 'inherit' | 'remove',
  ): Promise<EffectPick | undefined> {
    return ui.select<EffectPick>({
      title,
      current,
      options: [
        {
          title: extra === 'inherit' ? 'Inherit' : 'Remove entry',
          value: extra,
          description:
            extra === 'inherit'
              ? 'drop exact entries for this action; the default applies'
              : 'delete this override',
        },
        ...EFFECTS.map((effect) => ({
          title: effect,
          value: effect as EffectPick,
        })),
      ],
    });
  }

  /** Prompts for a pattern, previews its match count, then asks for the effect. */
  async function addPattern(draft: ToolDraft): Promise<void> {
    let value: string | undefined;
    for (;;) {
      const raw = await ui.prompt({
        title: 'Add pattern',
        description:
          'Tool action or wildcard (* and ?), e.g. github_* — last match wins',
        placeholder: 'e.g. webfetch or github_*',
        value,
      });
      if (raw === undefined) return;
      const problem = validatePattern(raw);
      if (problem) {
        toast(problem, 'warning');
        value = raw;
        continue;
      }
      const pattern = raw.trim();
      const count = countMatches(state, pattern);
      const picked = await ui.select<Effect | 'edit'>({
        title: `${pattern} matches ${count} action${count === 1 ? '' : 's'}${
          count === 0 ? ' (none registered yet)' : ''
        } — effect?`,
        options: [
          ...EFFECTS.map((effect) => ({ title: effect, value: effect })),
          {
            title: 'Edit pattern…',
            value: 'edit' as const,
            description: 'go back to the prompt',
          },
        ],
      });
      if (picked === undefined) return;
      if (picked === 'edit') {
        value = raw;
        continue;
      }
      applyOverrides(
        draft,
        setOverride(draft.overrides, { action: pattern, effect: picked }),
      );
      return;
    }
  }

  type LeaveChoice = 'save' | 'discard' | 'keep';

  /** True when the user may leave; false to keep editing. */
  async function settle(draft: ToolDraft): Promise<boolean> {
    if (!isDirty(draft)) return true;
    const choice = await ui.select<LeaveChoice>({
      title: `Unsaved changes in ${draft.role} (${draft.scope})`,
      options: [
        { title: 'Save', value: 'save' },
        { title: 'Discard', value: 'discard' },
        { title: 'Keep editing', value: 'keep' },
      ],
    });
    if (!choice || choice === 'keep') return false;
    return choice === 'discard' || (await persist(draft));
  }

  // ---- role view --------------------------------------------------------

  type RolePick =
    | { t: 'action'; action: string }
    | { t: 'entry'; index: number }
    | { t: 'add' | 'mask' | 'save' | 'discard' | 'reset' | 'scope' | 'back' };

  /** Returns 'scope' when the user wants to switch scope, otherwise undefined. */
  async function roleView(draft: ToolDraft): Promise<'scope' | undefined> {
    for (;;) {
      const rows = previewRows(state, draft);
      const manual = manualEntries(state, draft);
      const dirty = isDirty(draft);
      const options = [
        ...rows.map((row) => ({
          title: rowTitle(row),
          value: { t: 'action', action: row.action } as RolePick,
          description: rowDescription(row),
          category: 'Actions',
        })),
        ...manual.map((entry) => ({
          title: `${entry.effect.padEnd(5)} ${entry.action}`,
          value: {
            t: 'entry',
            index: draft.overrides.findIndex(
              (o) => o.action === entry.action && o.effect === entry.effect,
            ),
          } as RolePick,
          description: entryDescription(entry),
          category: 'Manual entries',
        })),
        {
          title: 'Add pattern…',
          value: { t: 'add' } as RolePick,
          description: 'allow, ask or deny an action or wildcard',
          category: 'Manual entries',
        },
        ...(dirty
          ? [
              {
                title: 'Save changes',
                value: { t: 'save' } as RolePick,
                category: 'Edit',
              },
              {
                title: 'Discard edits',
                value: { t: 'discard' } as RolePick,
                category: 'Edit',
              },
            ]
          : []),
        ...(draft.scope === 'project' && !draft.present
          ? [
              {
                title:
                  'Mask global overrides for this project (save empty list)',
                value: { t: 'mask' } as RolePick,
                description: 'a present empty project entry replaces global',
                category: 'Manage',
              },
            ]
          : []),
        ...(draft.scope === 'project' &&
        draft.basePresent &&
        !draft.overrides.length
          ? [
              {
                title: 'Remove project entry (use global)',
                value: { t: 'reset' } as RolePick,
                description: 'global overrides are masked until removed',
                category: 'Manage',
              },
            ]
          : []),
        {
          title: 'Reset to defaults',
          value: { t: 'reset' } as RolePick,
          description: `remove all ${draft.scope} overrides`,
          category: 'Manage',
        },
        {
          title: 'Switch scope',
          value: { t: 'scope' } as RolePick,
          description: `editing ${draft.scope}`,
          category: 'Manage',
        },
        { title: 'Back', value: { t: 'back' } as RolePick, category: 'Manage' },
      ];
      const pick = await ui.select<RolePick>({
        title: `${draft.role} (${draft.scope})${dirty ? ' *' : ''} — ${scopeStatus(state, draft)} — ${ROLE_LEGEND}`,
        placeholder: 'Search actions and tools',
        options,
        search: searchOptions,
      });
      if (!pick || pick.t === 'back') {
        if (await settle(draft)) return undefined;
        continue;
      }
      if (pick.t === 'action') {
        const row = rows.find((item) => item.action === pick.action);
        if (!row) continue;
        if (row.locked) {
          toast(LOCKED_MESSAGE, 'info');
          continue;
        }
        const exact = draft.overrides.findLast(
          (entry) => entry.action === row.action,
        );
        const picked = await pickEffect(
          `${row.action} — ${row.effect}`,
          exact?.effect ?? 'inherit',
          'inherit',
        );
        if (!picked) continue;
        if (picked === 'inherit' || picked === 'remove') {
          applyOverrides(draft, removeOverride(draft.overrides, row.action));
          if (!exact && row.source === 'pattern')
            toast(`${row.via} still applies; edit it under Manual entries.`);
        } else
          applyOverrides(
            draft,
            setOverride(draft.overrides, {
              action: row.action,
              effect: picked,
            }),
          );
      } else if (pick.t === 'entry') {
        const entry = draft.overrides[pick.index];
        if (!entry) continue;
        const picked = await pickEffect(
          `${entry.action} — ${entry.effect}`,
          entry.effect,
          'remove',
        );
        if (!picked) continue;
        applyOverrides(
          draft,
          picked === 'remove' || picked === 'inherit'
            ? removeOverride(draft.overrides, entry.action)
            : setOverride(draft.overrides, {
                action: entry.action,
                effect: picked,
              }),
        );
      } else if (pick.t === 'add') await addPattern(draft);
      else if (pick.t === 'mask') maskGlobal(draft);
      else if (pick.t === 'save') await persist(draft);
      else if (pick.t === 'discard') {
        const ok = await ui.confirm({
          title: 'Discard changes',
          message: `Discard unsaved changes to ${draft.role} (${draft.scope})?`,
          label: { confirm: 'Discard', cancel: 'Keep editing' },
        });
        if (ok) reopen(draft);
      } else if (pick.t === 'reset') await resetRole(draft);
      else if (pick.t === 'scope') {
        if (dirty) {
          toast(
            'Save or discard your edits before switching scope.',
            'warning',
          );
          continue;
        }
        return 'scope';
      }
    }
  }

  async function editRole(role: ToolRole): Promise<void> {
    for (;;) {
      const scope = await pickScope(role);
      if (!scope) return;
      const draft = openDraft(state, role, scope);
      if ((await roleView(draft)) !== 'scope') return;
    }
  }

  // ---- overview ---------------------------------------------------------

  let last: ToolRole | undefined;
  for (;;) {
    const roles = state.specialists.map((role) => roleOf(state, role));
    const pick = await ui.select<ToolRole | 'warnings'>({
      title: TITLE,
      placeholder: `Search roles · ${OVERVIEW_LEGEND}`,
      current: last,
      options: [
        ...roles.map((role) => ({
          title: overviewTitle(role),
          value: role.role as ToolRole | 'warnings',
          description: roleSummary(role),
          category: 'Specialists',
        })),
        ...(state.warnings.length
          ? [
              {
                title: `Warnings (${state.warnings.length})`,
                value: 'warnings' as const,
                description: state.warnings[0],
                category: 'Actions',
              },
            ]
          : []),
      ],
      search: searchOptions,
    });
    if (!pick) return;
    if (pick === 'warnings')
      await ui.alert({
        title: 'Tool permission warnings',
        message: state.warnings.join('\n'),
      });
    else {
      last = pick;
      await editRole(pick);
    }
  }
}
