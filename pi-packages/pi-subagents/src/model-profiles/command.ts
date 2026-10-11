import {
  type Api,
  getSupportedThinkingLevels,
  type Model,
} from '@earendil-works/pi-ai';
import { Input } from '@earendil-works/pi-tui';
import { resolveIcon } from '@thoth-agents/pi-core';
import {
  createListEditor,
  type ListEditorContext,
  type ListEditorRow,
  normalizePanelKey,
  openPanelOverlay,
  type PanelRowInput,
  type PanelTheme,
  padPanelText,
  panelHintRow,
  renderPanelFrame,
} from '@thoth-agents/pi-core/panel';
import type { ModelRef, ThinkingEffort } from '../types.js';
import { themeAccent } from '../ui/theme.js';
import {
  type AgentRow,
  availableModelSet,
  buildAgentRows,
  groupAvailableModelsByProvider,
  modelKey,
} from './data.js';
import {
  type AgentEdit,
  DEFAULT_PROFILE,
  isDraft,
  isEntryDirty,
  ModelProfileWorkspace,
  type ProfileEntry,
  type ProfilePointer,
} from './editor.js';
import {
  buildNonTuiModelProfilesMessage,
  describeEntry,
  joinColumns,
  profileEntryLabel,
  renderProfileSidebar,
  scopeTag,
  sidebarWidthFor,
} from './formatting.js';
import { ModelProfileStore, type ProfileScope } from './store.js';

export { buildNonTuiModelProfilesMessage } from './formatting.js';

const FALLBACK_EFFORT_CHOICES: Array<ThinkingEffort | 'inherit'> = [
  'inherit',
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

type EffortChoice = { value: ThinkingEffort | 'inherit'; label: string };
type ModelContext = {
  model?: Model<Api>;
  modelRuntime?: {
    getModel?: (provider: string, id: string) => Model<Api> | undefined;
  };
  modelRegistry?: {
    find?: (provider: string, id: string) => Model<Api> | undefined;
  };
};

function buildEffortChoices(
  modelRef: ModelRef | undefined,
  currentEffort: ThinkingEffort | undefined,
  availableModels: Model<Api>[],
  ctx: ModelContext = {},
): EffortChoice[] {
  let model: Model<Api> | undefined;
  if (modelRef) {
    const matches = (candidate: ModelRef | undefined) =>
      candidate?.provider === modelRef.provider &&
      candidate?.id === modelRef.id;
    const lookups = [
      () => ctx.modelRuntime?.getModel?.(modelRef.provider, modelRef.id),
      () => ctx.modelRegistry?.find?.(modelRef.provider, modelRef.id),
      () => availableModels.find(matches),
      () => (matches(ctx.model) ? ctx.model : undefined),
    ];
    for (const lookup of lookups) {
      try {
        const candidate = lookup();
        if (candidate && typeof candidate.reasoning === 'boolean') {
          model = candidate;
          break;
        }
      } catch {
        // An unavailable lookup must not prevent editing saved profiles.
      }
    }
  }
  const supported: Array<ThinkingEffort | 'inherit'> = model
    ? ['inherit', ...getSupportedThinkingLevels(model)]
    : FALLBACK_EFFORT_CHOICES;
  const choices: EffortChoice[] = supported.map((value) => ({
    value,
    label: value,
  }));
  if (currentEffort && !supported.includes(currentEffort))
    choices.push({
      value: currentEffort,
      label: `${currentEffort} (current; unsupported, clamped by Pi)`,
    });
  return choices;
}

export type SubagentModelProfilesModalResult = {
  action: 'close';
  /** Unsaved drafts/edits dropped when the panel was closed. */
  discarded: number;
};

type ModalComponent = {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
};

type ModalInput = {
  workspace: ModelProfileWorkspace;
  availableModels?: any[];
  modelContext?: ModelContext;
  tui?: { requestRender?: () => void };
  theme?: PanelTheme;
  maxHeight?: () => number;
  done: (result: SubagentModelProfilesModalResult) => void;
};

type Status = { text: string; tone: 'success' | 'warning' | 'error' };
type Prompt = {
  title: string;
  input: Input;
  error?: string;
  /** Returns an error to keep the prompt open. */
  submit: (value: string) => string | undefined;
};
type Choice = { id: string; label: string };

const POINTER_LABEL: Record<ProfilePointer, string> = {
  session: 'session selection',
  project: 'project pin',
  global: 'global active',
};

function activationMessage(
  pointer: ProfilePointer,
  entry: ProfileEntry,
  result: 'set' | 'cleared',
): string {
  if (result === 'cleared')
    return `Cleared the ${POINTER_LABEL[pointer]} (${entry.name}).`;
  const target = {
    session: 'Session now uses',
    project: 'Project pinned to',
    global: 'Global active profile is',
  }[pointer];
  const note = isEntryDirty(entry) ? ' Unsaved edits are not applied.' : '';
  return `${target} ${entry.name}.${note}`;
}

export function createSubagentModelProfilesModal(
  input: ModalInput,
): ModalComponent {
  const { workspace } = input;
  const availableByProvider = groupAvailableModelsByProvider(
    input.availableModels ?? [],
  );
  const providerNames = Object.keys(availableByProvider);
  const availableKeys = availableModelSet(input.availableModels ?? []);

  let profileIndex = 0;
  let prompt: Prompt | undefined;
  let status: Status | undefined;
  let stacked = true;

  const entries = () => workspace.entries();
  const current = (): ProfileEntry => {
    const all = entries();
    profileIndex = Math.max(0, Math.min(profileIndex, all.length - 1));
    return all[profileIndex];
  };
  const selectKey = (key: string) => {
    profileIndex = Math.max(
      0,
      entries().findIndex((entry) => entry.key === key),
    );
  };
  const rowOf = (key: string | undefined): AgentRow | undefined =>
    workspace.rows.find((row) => row.key === key);
  const notify = (text: string, tone: Status['tone'] = 'success') => {
    status = { text, tone };
  };
  const attempt = (action: () => void) => {
    try {
      action();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const moveHint = () =>
    `${resolveIcon('arrowUp', '↑')}/${resolveIcon('arrowDown', '↓')}/j/k move`;
  const separator = () => ` ${resolveIcon('separator', '·')} `;
  const modelText = (model?: ModelRef): string => {
    if (!model) return 'unresolved';
    const label = `${model.provider}/${model.id}`;
    return availableKeys.size && !availableKeys.has(modelKey(model))
      ? `${label} (unavailable)`
      : label;
  };

  const choose = (
    title: string,
    header: string[],
    choices: Choice[],
    onPick: (id: string) => void,
  ) =>
    editor.openPicker({
      title,
      hints: () => ['choose', 'enter: select', 'esc/q: back'].join(separator()),
      header: () => header,
      rows: () => choices,
      onAction: (key, choice) => {
        if (key !== 'enter') return false;
        editor.showOverview();
        if (choice) attempt(() => onPick(choice.id));
        return true;
      },
    });

  const askName = (
    title: string,
    value: string,
    submit: (name: string) => void,
  ) => {
    const nameInput = new Input({ prompt: 'name: ' });
    nameInput.setValue(value);
    nameInput.handleInput('\u0005'); // Start rename at the end of the existing name.
    prompt = {
      title,
      input: nameInput,
      submit: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return 'Profile name must be non-empty';
        if (trimmed === DEFAULT_PROFILE)
          return 'default is a reserved virtual profile';
        prompt = undefined;
        attempt(() => submit(trimmed));
        return undefined;
      },
    };
  };

  const startDraft = (source: ProfileEntry, verb: 'New' | 'Clone') =>
    askName(`${verb} profile from ${source.name}`, '', (name) =>
      choose(
        `Scope for ${name}`,
        [
          `Where should ${name} be stored? Nothing is written until you press s.`,
        ],
        [
          { id: 'project', label: 'project (local) — .pi/thoth/profiles.json' },
          { id: 'global', label: 'global — shared by every project' },
        ],
        (scope) => {
          const draft = workspace.createDraft(
            source,
            name,
            scope as ProfileScope,
          );
          selectKey(draft.key);
          notify(
            `Draft ${draft.name} ${scopeTag(draft)} created from ${source.name}; press s to save.`,
            'warning',
          );
        },
      ),
    );

  const applyEdit = (entry: ProfileEntry, row: AgentRow, edit: AgentEdit) =>
    attempt(() => workspace.edit(entry, row.key, edit));

  const effortPicker = (entry: ProfileEntry, row: AgentRow) => {
    const values = workspace.valuesFor(entry, row);
    const choices = buildEffortChoices(
      values.model,
      values.effort,
      input.availableModels ?? [],
      input.modelContext,
    );
    editor.openPicker(
      {
        title: 'Choose effort',
        hints: () =>
          ['choose effort', 'enter: select', 'esc/q: back'].join(separator()),
        header: () => [
          `profile: ${entry.name}${separator()}agent: ${row.name}`,
        ],
        rows: () =>
          choices.map((choice) => ({
            id: choice.value,
            label:
              choice.value === 'inherit'
                ? 'reset to default effort'
                : choice.label,
          })),
        onAction: (key, choice) => {
          if (key !== 'enter') return false;
          const effort = choices.find(
            (item) => item.value === choice?.id,
          )?.value;
          if (effort === 'inherit') applyEdit(entry, row, { reset: 'effort' });
          else if (effort) applyEdit(entry, row, { effort });
          editor.showOverview();
          return true;
        },
      },
      Math.max(
        0,
        choices.findIndex((choice) => choice.value === values.effort),
      ),
    );
  };

  const modelPicker = (
    entry: ProfileEntry,
    row: AgentRow,
    provider: string,
    thenEffort: boolean,
  ) => {
    const models = availableByProvider[provider] ?? [];
    const modelsById = new Map(
      models.map((model) => [`${model.provider}/${model.id}`, model]),
    );
    const searchText = (id: string) =>
      `${modelsById.get(id)?.label ?? ''} ${id}`;
    editor.openPicker({
      title: 'Choose model',
      maxVisibleRows: 10,
      hints: () =>
        [
          moveHint(),
          'type search',
          'backspace clear',
          'enter select',
          'esc back',
        ].join(separator()),
      filter: {
        placeholder: '(type to filter)',
        text: (choice) => searchText(choice.id),
      },
      rows: () =>
        models.map((model) => ({
          id: `${model.provider}/${model.id}`,
          label: `${model.label} (${model.provider}/${model.id})`,
        })),
      header: ({ filter }) => {
        const query = filter.trim().toLowerCase();
        const count = [...modelsById.keys()].filter((id) =>
          searchText(id).toLowerCase().includes(query),
        ).length;
        return [
          `Select ${provider} model for ${row.name} in ${entry.name}`,
          `provider: ${provider}${separator()}${filter ? `${count}/${models.length} match${count === 1 ? '' : 'es'}` : `${models.length} model${models.length === 1 ? '' : 's'}`}`,
        ];
      },
      onAction: (key, choice) => {
        if (key !== 'enter') return false;
        const model = choice && modelsById.get(choice.id);
        if (model)
          applyEdit(entry, row, {
            model: { provider: model.provider, id: model.id },
          });
        editor.showOverview();
        if (model && thenEffort) effortPicker(entry, row);
        return true;
      },
    });
  };

  const providerPicker = (
    entry: ProfileEntry,
    row: AgentRow,
    thenEffort: boolean,
  ) =>
    editor.openPicker({
      title: 'Choose model provider',
      maxVisibleRows: 10,
      hints: () =>
        ['choose provider', 'enter: select', 'esc/q: back'].join(separator()),
      header: () => [
        `Select model provider for ${row.name} in ${entry.name}`,
        ...(!providerNames.length
          ? ['No available models found; reset remains available.']
          : []),
      ],
      rows: () => [
        { id: 'reset', label: 'reset to default model' },
        ...providerNames.map((provider) => ({
          id: `provider:${provider}`,
          label: provider,
        })),
      ],
      onAction: (key, choice) => {
        if (key !== 'enter') return false;
        if (choice?.id === 'reset') {
          applyEdit(entry, row, { reset: 'model' });
          editor.showOverview();
          if (thenEffort) effortPicker(entry, row);
        } else if (choice)
          modelPicker(
            entry,
            row,
            choice.id.slice('provider:'.length),
            thenEffort,
          );
        return true;
      },
    });

  const editAgent = (
    agent: string | undefined,
    mode: 'both' | 'model' | 'effort',
  ) => {
    const entry = current();
    const row = rowOf(agent);
    if (!row) return;
    if (!entry.scope) {
      choose(
        'default is read-only',
        [
          'Edits need a profile of their own.',
          `Create a new profile from default to edit ${row.name}?`,
        ],
        [
          { id: 'yes', label: 'Create a new profile from default' },
          { id: 'no', label: 'Cancel' },
        ],
        (id) => {
          if (id === 'yes') startDraft(entry, 'New');
        },
      );
      return;
    }
    if (mode === 'effort') effortPicker(entry, row);
    else providerPicker(entry, row, mode === 'both');
  };

  const save = () => {
    const entry = current();
    if (!entry.scope) throw new Error('default is read-only; nothing to save.');
    if (!isDraft(entry) && !isEntryDirty(entry)) {
      notify(`No unsaved changes in ${entry.name}.`, 'warning');
      return;
    }
    const file = workspace.save(entry);
    selectKey(entry.key);
    notify(`Saved ${entry.name} ${scopeTag(entry)} to ${file}.`);
  };

  const rename = () => {
    const entry = current();
    if (!entry.scope) throw new Error('default cannot be renamed.');
    askName(`Rename ${entry.name}`, entry.name, (name) => {
      const key = `${entry.scope}:${name}`;
      workspace.rename(entry, name);
      selectKey(key);
      notify(`Renamed ${entry.name} to ${name}.`);
    });
  };

  const remove = () => {
    const entry = current();
    if (!entry.scope) throw new Error('default cannot be deleted.');
    const pointers = isDraft(entry) ? [] : workspace.pointerTargets(entry);
    choose(
      `Delete ${entry.name}?`,
      [
        isDraft(entry)
          ? `${entry.name} is an unsaved draft and will be discarded.`
          : `${entry.name} ${scopeTag(entry)} will be removed from its file.`,
        ...(pointers.length
          ? [
              `This clears: ${pointers.map((pointer) => POINTER_LABEL[pointer]).join(', ')}.`,
            ]
          : []),
      ],
      [
        { id: 'yes', label: `Delete ${entry.name}` },
        { id: 'no', label: 'Keep it' },
      ],
      (id) => {
        if (id !== 'yes') return;
        const cleared = workspace.delete(entry);
        profileIndex = Math.max(0, profileIndex - 1);
        notify(
          `Deleted ${entry.name}.${cleared.length ? ` Cleared ${cleared.map((pointer) => POINTER_LABEL[pointer]).join(', ')}.` : ''}`,
          cleared.length ? 'warning' : 'success',
        );
      },
    );
  };

  const use = (pointer: ProfilePointer) => {
    const entry = current();
    notify(
      activationMessage(pointer, entry, workspace.activate(entry, pointer)),
    );
  };

  const tableColumns = (context: ListEditorContext) => {
    const effort = 10;
    const name = Math.max(12, Math.min(22, Math.floor(context.width * 0.28)));
    return {
      name,
      effort,
      model: Math.max(8, context.width - name - effort - 4),
    };
  };

  const agentLabel = (row: AgentRow, context: ListEditorContext): string => {
    const values = workspace.valuesFor(current(), row);
    const model = modelText(values.model);
    const effort = values.effort ?? 'unresolved';
    if (context.layout === 'compact')
      return `${row.name}${separator()}${model}${separator()}${effort}`;
    const columns = tableColumns(context);
    return `${padPanelText(row.name, columns.name)}  ${padPanelText(model, columns.model)}  ${padPanelText(effort, columns.effort)}`;
  };

  const rowDirty = (row: AgentRow): boolean => {
    const entry = current();
    if (!entry.base) return false;
    const a = entry.agents[row.key];
    const b = entry.base[row.key];
    return (
      a?.model?.provider !== b?.model?.provider ||
      a?.model?.id !== b?.model?.id ||
      a?.effort !== b?.effort
    );
  };

  const sidebarRows = (): Array<{ text: string }> =>
    entries().map((entry) => ({
      text: profileEntryLabel(entry, workspace.markers(entry)),
    }));

  const stackedProfileRows = (): PanelRowInput[] => {
    const all = sidebarRows();
    const size = Math.min(3, all.length);
    const start = Math.max(
      0,
      Math.min(profileIndex - Math.floor(size / 2), all.length - size),
    );
    return all.slice(start, start + size).map((row, offset) => {
      const selected = start + offset === profileIndex;
      return {
        text: `${selected ? resolveIcon('selection', '›') : ' '} ${row.text}`,
        selected,
      };
    });
  };

  const editor = createListEditor({
    wideBreakpoint: 60,
    maxHeight: input.maxHeight,
    theme: input.theme,
    pendingCount: () => workspace.pendingCount(),
    requestRender: () => input.tui?.requestRender?.(),
    overview: {
      title: 'Subagent model profiles',
      maxVisibleRows: 12,
      hints: () =>
        [
          `${resolveIcon('arrowLeft', '←')}/${resolveIcon('arrowRight', '→')} profile`,
          `${resolveIcon('arrowUp', '↑')}/${resolveIcon('arrowDown', '↓')} agent`,
          'enter edit',
          'm model',
          'e effort',
          'esc/q close',
        ].join(separator()),
      header: (context) => {
        const entry = current();
        const total = entries().length;
        return [
          panelHintRow(
            [
              'n new',
              'c clone',
              's save',
              'r rename',
              'd delete',
              'u session',
              'g global',
              'p pin',
            ].join(separator()),
          ),
          {
            text: `profile ${profileIndex + 1}/${total}${separator()}${describeEntry(entry, workspace.markers(entry), input.theme)}`,
          },
          ...(stacked ? stackedProfileRows() : []),
          panelHintRow(
            context.layout === 'wide'
              ? `    ${padPanelText('agent', tableColumns(context).name)}  ${padPanelText('model', tableColumns(context).model)}  ${padPanelText('effort', tableColumns(context).effort)}`
              : `agent ${separator().trim()} model ${separator().trim()} effort`,
          ),
        ];
      },
      rows: (): ListEditorRow[] =>
        workspace.rows.map((row) => ({
          id: row.key,
          dirty: rowDirty(row),
          label: (context) => agentLabel(row, context),
        })),
      footer: ({ index }) => {
        const row = workspace.rows[index];
        const values = row && workspace.valuesFor(current(), row);
        return [
          ...(status ? [{ text: status.text, tone: status.tone }] : []),
          row && values
            ? `selected: ${themeAccent(input.theme, row.name)}${separator()}model: ${modelText(values.model)}${separator()}effort: ${values.effort ?? 'unresolved'}`
            : 'selected: (none)',
        ];
      },
      onAction: (key, choice) => {
        if (key === 'left') profileIndex = Math.max(0, profileIndex - 1);
        else if (key === 'right')
          profileIndex = Math.min(entries().length - 1, profileIndex + 1);
        else if (key === 'enter') editAgent(choice?.id, 'both');
        else if (key === 'm') editAgent(choice?.id, 'model');
        else if (key === 'e') editAgent(choice?.id, 'effort');
        else if (key === 'n') startDraft(entries()[0], 'New');
        else if (key === 'c') attempt(() => startDraft(current(), 'Clone'));
        else if (key === 's') attempt(save);
        else if (key === 'r') attempt(rename);
        else if (key === 'd') attempt(remove);
        else if (key === 'u') attempt(() => use('session'));
        else if (key === 'p') attempt(() => use('project'));
        else return false;
        return true;
      },
    },
    onSave: () => ({ success: true }),
    onCancel: () =>
      input.done({ action: 'close', discarded: workspace.pendingCount() }),
  });

  const renderPrompt = (active: Prompt, width: number): string[] => {
    const rows: PanelRowInput[] = [
      panelHintRow('type a name · enter confirm · esc cancel'),
      ...active.input.render(Math.max(0, width - 4)),
      ...(active.error ? [{ text: active.error, tone: 'error' as const }] : []),
    ];
    return renderPanelFrame({
      title: active.title,
      rows,
      width,
      maxHeight: input.maxHeight?.(),
      theme: input.theme,
    });
  };

  const promptInput = (active: Prompt, data: string) => {
    const key = normalizePanelKey(data);
    if (key === 'escape') prompt = undefined;
    else if (key === 'enter')
      active.error = active.submit(active.input.getValue());
    else if (key === 'ctrl+u') active.input.setValue('');
    else active.input.handleInput(data);
    input.tui?.requestRender?.();
  };

  return {
    render: (width) => {
      if (prompt) return renderPrompt(prompt, width);
      const side =
        editor.getState().view === 'overview' ? sidebarWidthFor(width) : 0;
      stacked = side === 0;
      if (!side) return editor.render(width);
      const main = editor.render(width - side);
      return joinColumns(
        renderProfileSidebar({
          rows: sidebarRows(),
          selected: profileIndex,
          width: side,
          height: main.length,
          theme: input.theme,
        }),
        main,
        side,
        width - side,
      );
    },
    handleInput: (data) => {
      if (prompt) return promptInput(prompt, data);
      const key =
        data === 'enter'
          ? '\r'
          : data === 'esc' || data === 'escape'
            ? '\u001b'
            : data;
      status = undefined;
      const state = editor.getState();
      // The shell reads a bare `g` as Home; the overview owns it for "global".
      if (state.view === 'overview' && !state.completed && key === 'g') {
        attempt(() => use('global'));
        input.tui?.requestRender?.();
        return;
      }
      editor.handleInput(key);
    },
    invalidate: () => editor.invalidate(),
  };
}

async function getAvailableModels(ctx: any): Promise<any[]> {
  try {
    const available = await ctx?.modelRegistry?.getAvailable?.();
    return Array.isArray(available) ? available : [];
  } catch {
    return [];
  }
}

function entryChoice(workspace: ModelProfileWorkspace, entry: ProfileEntry) {
  const markers = workspace.markers(entry);
  const detail = workspace.rows
    .map((row) => {
      const values = workspace.valuesFor(entry, row);
      return `${row.name}=${values.model ? `${values.model.provider}/${values.model.id}` : '?'}`;
    })
    .join(', ');
  return `${profileEntryLabel(entry, markers, true)}${detail ? ` — ${detail}` : ''}`;
}

async function selectActivation(ctx: any, workspace: ModelProfileWorkspace) {
  const entries = workspace.entries();
  const labels = entries.map((entry) => entryChoice(workspace, entry));
  const picked = await ctx.ui.select('Select model profile:', [
    ...labels,
    'Cancel',
  ]);
  const entry = entries[labels.indexOf(picked)];
  if (!entry) return 'Cancelled. No model profile changes.';
  const actions: Array<[string, ProfilePointer]> = [
    ...(workspace.canUseSession
      ? ([['Use for this session', 'session']] as Array<
          [string, ProfilePointer]
        >)
      : []),
    ['Set as global active', 'global'],
    ['Pin to this project', 'project'],
  ];
  const action = await ctx.ui.select(`Use ${entry.name}:`, [
    ...actions.map(([label]) => label),
    'Cancel',
  ]);
  const pointer = actions.find(([label]) => label === action)?.[1];
  if (!pointer) return 'Cancelled. No model profile changes.';
  return activationMessage(
    pointer,
    entry,
    workspace.activate(entry, pointer, false),
  );
}

export async function runSubagentModelsCommand(ctx: any = {}): Promise<string> {
  const agentDir = ctx?.agentDir;
  const hasCustomUi = typeof ctx?.ui?.custom === 'function';
  const hasSelectUi = typeof ctx?.ui?.select === 'function';
  const cwd = ctx.cwd ?? process.cwd();

  let workspace: ModelProfileWorkspace;
  try {
    workspace = new ModelProfileWorkspace(
      new ModelProfileStore({ cwd, agentDir }),
      buildAgentRows({ ...ctx, cwd }),
      {
        get: ctx.getSessionModelProfile,
        set: ctx.setSessionModelProfile,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui?.notify?.(message, 'error');
    return message;
  }

  if (!hasCustomUi && !hasSelectUi)
    return buildNonTuiModelProfilesMessage(workspace, agentDir);

  if (hasCustomUi) {
    const availableModels = await getAvailableModels(ctx);
    const result = await openPanelOverlay<SubagentModelProfilesModalResult>(
      ctx,
      (tui, theme, _keybindings, done, host) =>
        createSubagentModelProfilesModal({
          workspace,
          availableModels,
          modelContext: ctx,
          tui,
          theme,
          maxHeight: host.maxHeight,
          done,
        }),
    );
    const discarded = result?.discarded ?? 0;
    const message = discarded
      ? `Closed model profiles; discarded ${discarded} unsaved draft${discarded === 1 ? '' : 's'}/edit${discarded === 1 ? '' : 's'}.`
      : 'Closed model profiles.';
    ctx.ui.notify?.(message, discarded ? 'warning' : 'info');
    return message;
  }

  try {
    const message = await selectActivation(ctx, workspace);
    ctx.ui.notify?.(message, 'info');
    return message;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify?.(message, 'error');
    return message;
  }
}
