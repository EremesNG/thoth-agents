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
  panelVisibleWidth,
  renderPanelFrame,
} from '@thoth-agents/pi-core/panel';
import { classifyFallbackEntries } from '../profile-resolver.js';
import type {
  ModelRef,
  SubagentModelProfile,
  ThinkingEffort,
} from '../types.js';
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
  ORCHESTRATOR_ROW_ID,
  orchestratorDrift,
  orchestratorValueText,
  profileEntryLabel,
  renderProfileSidebar,
  scopeTag,
  sidebarWidthFor,
  truncateToVisibleWidth,
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

/** Live session accessors; read at render/key time, never snapshotted. */
export type ModalSession = {
  model?: () => ModelRef | undefined;
  effort?: () => ThinkingEffort | undefined;
  /** Applies the effective profile's orchestrator to the session. */
  applyOrchestrator?: () => Promise<{
    status: 'applied' | 'clamped' | 'untouched' | 'unavailable';
    message: string;
  }>;
};

type ModalInput = {
  workspace: ModelProfileWorkspace;
  session?: ModalSession;
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
/** What the pickers edit: a subagent row or the profile's orchestrator. */
type EditTarget = {
  name: string;
  values: SubagentModelProfile;
  /** Model used to list supported efforts when `values` has none. */
  fallbackModel?: ModelRef;
  resetModel: string;
  resetEffort: string;
  apply: (edit: AgentEdit) => void;
};

/** Returns a model picker's result to the fallback editor, not the overview. */
type FallbackPick = { select: (model: ModelRef) => void; back: () => void };

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

  /** `Name — provider/id` when the model has a human name, else `label (provider/id)`. */
  const modelRowLabel = (model: {
    provider: string;
    id: string;
    label: string;
    name?: string;
  }): string => {
    const saved = `${model.provider}/${model.id}`;
    return model.name && model.name !== model.id
      ? `${model.name} — ${saved}`
      : `${model.label} (${saved})`;
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

  const liveModel = (): ModelRef | undefined => {
    const model = input.session?.model?.();
    return model ? { provider: model.provider, id: model.id } : undefined;
  };

  const targetFor = (
    entry: ProfileEntry,
    id: string | undefined,
  ): EditTarget | undefined => {
    if (id === ORCHESTRATOR_ROW_ID)
      return {
        name: 'orchestrator',
        get values() {
          return entry.orchestrator ?? {};
        },
        fallbackModel: liveModel(),
        resetModel: 'reset to session model',
        resetEffort: 'reset to session effort',
        apply: (edit) => workspace.editOrchestrator(entry, edit),
      };
    const row = rowOf(id);
    return (
      row && {
        name: row.name,
        get values() {
          return workspace.valuesFor(entry, row);
        },
        resetModel: 'reset to default model',
        resetEffort: 'reset to default effort',
        apply: (edit) => workspace.edit(entry, row.key, edit),
      }
    );
  };

  const applyEdit = (target: EditTarget, edit: AgentEdit) =>
    attempt(() => target.apply(edit));

  const effortPicker = (entry: ProfileEntry, target: EditTarget) => {
    const { values } = target;
    const choices = buildEffortChoices(
      values.model ?? target.fallbackModel,
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
          `profile: ${entry.name}${separator()}agent: ${target.name}`,
        ],
        rows: () =>
          choices.map((choice) => ({
            id: choice.value,
            label:
              choice.value === 'inherit' ? target.resetEffort : choice.label,
          })),
        onAction: (key, choice) => {
          if (key !== 'enter') return false;
          const effort = choices.find(
            (item) => item.value === choice?.id,
          )?.value;
          if (effort === 'inherit') applyEdit(target, { reset: 'effort' });
          else if (effort) applyEdit(target, { effort });
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
    target: EditTarget,
    provider: string,
    thenEffort: boolean,
    pick?: FallbackPick,
  ) => {
    const models = availableByProvider[provider] ?? [];
    const modelsById = new Map(
      models.map((model) => [`${model.provider}/${model.id}`, model]),
    );
    const searchText = (id: string) => {
      const model = modelsById.get(id);
      return [model?.name, model?.label, id].filter((part) => !!part).join(' ');
    };
    editor.openPicker({
      title: 'Choose model',
      maxVisibleRows: 10,
      hints: () =>
        [
          moveHint(),
          'type search',
          'backspace delete',
          'ctrl+u clear',
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
          label: modelRowLabel(model),
        })),
      header: ({ filter }) => {
        const query = filter.trim().toLowerCase();
        const count = [...modelsById.keys()].filter((id) =>
          searchText(id).toLowerCase().includes(query),
        ).length;
        return [
          `Select ${provider} model for ${target.name} in ${entry.name}`,
          `provider: ${provider}${separator()}${filter ? `${count}/${models.length} match${count === 1 ? '' : 'es'}` : `${models.length} model${models.length === 1 ? '' : 's'}`}`,
        ];
      },
      onAction: (key, choice) => {
        if (pick && key === 'escape') {
          pick.back();
          return true;
        }
        if (key !== 'enter') return false;
        const model = choice && modelsById.get(choice.id);
        if (pick) {
          if (model) pick.select({ provider: model.provider, id: model.id });
          else pick.back();
          return true;
        }
        if (model)
          applyEdit(target, {
            model: { provider: model.provider, id: model.id },
          });
        editor.showOverview();
        if (model && thenEffort) effortPicker(entry, target);
        return true;
      },
    });
  };

  const providerPicker = (
    entry: ProfileEntry,
    target: EditTarget,
    thenEffort: boolean,
    pick?: FallbackPick,
  ) =>
    editor.openPicker({
      title: pick ? 'Choose fallback provider' : 'Choose model provider',
      maxVisibleRows: 10,
      hints: () =>
        ['choose provider', 'enter: select', 'esc/q: back'].join(separator()),
      header: () => [
        `Select model provider for ${target.name} in ${entry.name}`,
        ...(!providerNames.length
          ? ['No available models found; reset remains available.']
          : []),
      ],
      rows: () => [
        ...(pick ? [] : [{ id: 'reset', label: target.resetModel }]),
        ...providerNames.map((provider) => ({
          id: `provider:${provider}`,
          label: provider,
        })),
      ],
      onAction: (key, choice) => {
        if (pick && (key === 'escape' || key === 'q')) {
          pick.back();
          return true;
        }
        if (key !== 'enter') return false;
        if (choice?.id === 'reset') {
          applyEdit(target, { reset: 'model' });
          editor.showOverview();
          if (thenEffort) effortPicker(entry, target);
        } else if (choice)
          modelPicker(
            entry,
            target,
            choice.id.slice('provider:'.length),
            thenEffort,
            pick,
          );
        return true;
      },
    });

  const editAgent = (
    agent: string | undefined,
    mode: 'both' | 'model' | 'effort',
  ) => {
    const entry = current();
    const target = targetFor(entry, agent);
    if (!target) return;
    if (!entry.scope)
      return offerDraftFromDefault(entry, `edit ${target.name}`);
    if (mode === 'effort') effortPicker(entry, target);
    else providerPicker(entry, target, mode === 'both');
  };

  const chainSeparator = () => ` ${resolveIcon('arrowRight', '→')} `;

  /** Keeps the head and the (distinguishing) tail: `openrouter/…20241022:beta-07`. */
  const middleTruncate = (text: string, width: number): string => {
    if (cells(text) <= width) return text;
    const ellipsis = resolveIcon('ellipsis', '…');
    const room = Math.max(0, width - cells(ellipsis));
    const tailRoom = Math.ceil(room * 0.6);
    const take = (chars: string[], limit: number) => {
      const out: string[] = [];
      let used = 0;
      for (const char of chars) {
        if (used + cells(char) > limit) break;
        out.push(char);
        used += cells(char);
      }
      return out;
    };
    const chars = [...text];
    const head = take(chars, room - tailRoom).join('');
    const tail = take([...chars].reverse(), tailRoom)
      .reverse()
      .join('');
    return `${head}${ellipsis}${tail}`;
  };

  /** Width the picker rows may use; the shell renders pickers full width. */
  let panelWidth = 80;
  const rowWidth = () => Math.max(8, panelWidth - 8);

  /**
   * Fallback list of one agent. Unfiltered so a/d/[/]/c/v reach onAction.
   * Rows are the profile's own list, else the inherited chain (read-only
   * context). Enter or `v` opens a detail view with the whole id. Read-only
   * for the virtual default profile: same rows and detail, edit keys explain.
   */
  const fallbackEditor = (
    entry: ProfileEntry,
    row: AgentRow,
    index = 0,
  ): void => {
    const readOnly = !entry.scope;
    const explicit = (): ModelRef[] =>
      entry.agents[row.key]?.fallback_models ?? [];
    /**
     * Raw rows keep their raw index (d/[/] act on it); each also carries the
     * runtime verdict from the resolver: skipped (primary/duplicate) or its
     * effective ordinal out of `effective`.
     */
    const shown = () => {
      const own = explicit();
      const values = workspace.valuesFor(entry, row);
      const entries: ReturnType<typeof classifyFallbackEntries> = own.length
        ? classifyFallbackEntries(own, values.model)
        : values.fallback_models.map((model, i) => ({
            model,
            ordinal: i + 1,
          }));
      return {
        entries,
        effective: entries.filter((item) => !item.skipped).length,
        inherited: !own.length,
        source: own.length ? ('profile' as const) : values.fallbackSource,
      };
    };
    const skipNote = (skipped: 'primary' | 'duplicate') =>
      `skipped (${skipped})`;
    const reopen = (at: number) => fallbackEditor(entry, row, at);
    const run = (action: () => boolean, noop: string, at: number) => {
      attempt(() => {
        if (!action()) notify(noop, 'warning');
      });
      reopen(at);
    };
    const indexOf = (id?: string) =>
      id ? Number(id.startsWith('inh:') ? id.slice(4) : id) : 0;
    const unavailable = (model: ModelRef) =>
      availableKeys.size > 0 && !availableKeys.has(modelKey(model));

    const detail = (at: number) => {
      const { entries, effective, inherited, source } = shown();
      const item = entries[at];
      if (!item) return reopen(Math.max(0, entries.length - 1));
      const { model } = item;
      const text = `${modelKey(model)}${!item.skipped && unavailable(model) ? ' (unavailable)' : ''}`;
      const place = item.skipped
        ? item.skipped === 'primary'
          ? 'skipped: same as primary'
          : 'skipped: duplicate of an earlier entry'
        : `${item.ordinal} of ${effective} effective`;
      const back = () => {
        reopen(at);
        return true;
      };
      editor.openPicker({
        title: `Fallback ${item.skipped ? 'skipped' : `#${item.ordinal}/${effective}`}${separator()}${row.name}`,
        hints: () => 'full model id' + separator() + 'enter/esc/q back',
        rows: () => [
          {
            id: 'position',
            label: `${place}${separator()}[${source}]${separator()}${inherited ? 'inherited chain' : 'own list'}`,
          },
          ...chunkCells(text, rowWidth()).map((chunk, i) => ({
            id: `id:${i}`,
            label: chunk,
          })),
        ],
        onAction: (key) =>
          key === 'enter' || key === 'escape' || key === 'q' || key === 'v'
            ? back()
            : false,
      });
    };

    const target = targetFor(entry, row.key);
    editor.openPicker(
      {
        title: `Fallback models${separator()}${row.name}${readOnly ? `${separator()}read-only` : ''}`,
        homeEndAliases: false,
        maxVisibleRows: 10,
        hints: () =>
          (readOnly
            ? ['enter/v detail', moveHint(), 'esc/q back']
            : [
                'enter/v detail',
                'a add',
                'd delete',
                '[/] reorder',
                'c clear (inherit)',
                'esc/q back',
              ]
          ).join(separator()),
        header: () => {
          const { entries, effective, inherited, source } = shown();
          const values = workspace.valuesFor(entry, row);
          return [
            `profile: ${entry.name}${separator()}agent: ${themeAccent(input.theme, row.name)}${separator()}primary: ${modelText(values.model)}`,
            readOnly
              ? `${entry.name} is read-only; press n on the overview for a profile you can edit`
              : !inherited
                ? `own list (${entries.length}${entries.length === effective ? '' : `, ${effective} effective`}); tried in order after the primary fails`
                : entries.length
                  ? `inherited [${source}] chain (read-only here); a starts this profile's own list`
                  : 'no fallback chain; a adds a model to this profile',
          ];
        },
        rows: () => {
          const { entries, effective, inherited } = shown();
          return entries.map((item, i) => ({
            id: inherited ? `inh:${i}` : String(i),
            // The id tail distinguishes similar models, so shorten the middle.
            label: (context: ListEditorContext) => {
              const { model } = item;
              const prefix = `${inherited ? 'inherited ' : ''}${item.skipped ? '-' : `${item.ordinal}/${effective}`} `;
              const note = item.skipped
                ? ` ${skipNote(item.skipped)}`
                : unavailable(model)
                  ? ' (unavailable)'
                  : '';
              return `${prefix}${middleTruncate(modelKey(model), context.width - cells(prefix) - cells(note))}${note}`;
            },
          }));
        },
        footer: () =>
          status ? [{ text: status.text, tone: status.tone }] : [],
        onAction: (key, choice) => {
          const at = indexOf(choice?.id);
          if ((key === 'enter' || key === 'v') && choice) {
            detail(at);
            return true;
          }
          if (/^[adc[\]]$/.test(key) && readOnly) {
            notify(
              `${entry.name} is read-only; edit a profile of your own (n on the overview).`,
              'warning',
            );
            return true;
          }
          if (choice?.id.startsWith('inh:') && /^[d[\]]$/.test(key)) {
            notify(
              "Inherited entries are read-only; a starts this profile's own list.",
              'warning',
            );
            return true;
          }
          if (key === 'a') {
            const pick: FallbackPick = {
              select: (model) => {
                const added = workspace.appendFallback(entry, row.name, model);
                if (!added)
                  notify(
                    `${modelKey(model)} is the primary or already in the list.`,
                    'warning',
                  );
                reopen(added ? explicit().length - 1 : at);
              },
              back: () => reopen(at),
            };
            if (target) providerPicker(entry, target, false, pick);
          } else if (key === 'd' && choice)
            run(
              () => workspace.removeFallback(entry, row.name, at),
              'Nothing to delete.',
              Math.max(0, Math.min(at, explicit().length - 2)),
            );
          else if ((key === '[' || key === ']') && choice) {
            const delta = key === '[' ? -1 : 1;
            run(
              () => workspace.moveFallback(entry, row.name, at, delta),
              'Already at the edge of the list.',
              Math.max(0, at + delta),
            );
          } else if (key === 'c')
            run(
              () => workspace.clearFallbacks(entry, row.name),
              'Own list is already empty.',
              0,
            );
          else return false;
          return true;
        },
      },
      index,
    );
  };
  const editFallbacks = (id: string | undefined) => {
    const entry = current();
    const row = rowOf(id);
    if (!row)
      return notify('The orchestrator has no fallback chain.', 'warning');
    fallbackEditor(entry, row);
  };

  const offerDraftFromDefault = (entry: ProfileEntry, purpose: string) =>
    choose(
      'default is read-only',
      [
        'Edits need a profile of their own.',
        `Create a new profile from default to ${purpose}?`,
      ],
      [
        { id: 'yes', label: 'Create a new profile from default' },
        { id: 'no', label: 'Cancel' },
      ],
      (id) => {
        if (id === 'yes') startDraft(entry, 'New');
      },
    );

  /** Copy the live session model/effort into the selected orchestrator. */
  const captureSession = () => {
    const entry = current();
    if (!entry.scope)
      return offerDraftFromDefault(entry, 'capture the session model');
    const model = liveModel();
    if (!model) throw new Error('No current session model to capture.');
    const effort = input.session?.effort?.();
    workspace.setOrchestrator(entry, { model, ...(effort ? { effort } : {}) });
    notify(
      `Orchestrator of ${entry.name} set to ${modelKey(model)}${effort ? ` ${effort}` : ''}; press s to save.`,
      'warning',
    );
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
    const message = activationMessage(
      pointer,
      entry,
      workspace.activate(entry, pointer),
    );
    notify(message);
    input.session?.applyOrchestrator?.().then(
      (outcome) => {
        const warn =
          outcome.status === 'unavailable' || outcome.status === 'clamped';
        notify(`${message} ${outcome.message}`, warn ? 'warning' : 'success');
        input.tui?.requestRender?.();
      },
      (error) => {
        notify(
          `${message} ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
        input.tui?.requestRender?.();
      },
    );
  };

  /** Footer sizing handshake with the render pass below. */
  let footerCap: number | undefined;
  let footerProbe = { base: 0, chain: [] as string[] };

  const MODEL_MIN = 18;
  const FALLBACK_MIN = 15;
  /** Narrowest content width that still fits the aligned table (see below). */
  const TABLE_MIN = 12 + 8 + 6 + MODEL_MIN + FALLBACK_MIN;
  const SHORT_MARKER: Record<string, string> = {
    profile: 'prof',
    agent: 'agt',
    default: 'def',
  };

  const cells = (text: string) => panelVisibleWidth(text);

  /** Splits by visible cells so an oversized id stays fully readable. */
  const chunkCells = (text: string, width: number): string[] => {
    const chunks: string[] = [];
    let chunk = '';
    let used = 0;
    for (const char of text) {
      const size = cells(char);
      if (chunk && used + size > Math.max(1, width)) {
        chunks.push(chunk);
        chunk = '';
        used = 0;
      }
      chunk += char;
      used += size;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  };

  /**
   * Word-wraps `label a → b → c` to `width`. A model that does not fit on its
   * own continuation line is split across lines by cells, never clipped.
   */
  const wrapChain = (
    prefix: string,
    models: readonly string[],
    width: number,
  ): string[] => {
    const arrow = chainSeparator().trimEnd();
    const indent = '  ';
    const lines: string[] = [];
    let line = prefix;
    models.forEach((model, i) => {
      const piece = i ? `${arrow} ${model}` : model;
      const joined = i ? `${line} ${piece}` : `${line}${piece}`;
      if (cells(joined) <= width) {
        line = joined;
        return;
      }
      lines.push(line.trimEnd());
      const chunks = chunkCells(piece, width - indent.length);
      for (const chunk of chunks.slice(0, -1)) lines.push(`${indent}${chunk}`);
      line = `${indent}${chunks[chunks.length - 1]}`;
    });
    lines.push(line);
    return lines;
  };

  /**
   * Agent rows with a chain use the aligned table only when it can afford
   * TABLE_MIN cells (model column >= 18, chain column >= 15: the `[source]`
   * marker plus >= 4 characters of the first fallback). Narrower rows,
   * including the 60-65 column "wide" band, use the compact row below.
   */
  const useTable = (context: ListEditorContext) =>
    context.layout === 'wide' && context.width >= TABLE_MIN;

  const tableColumns = (context: ListEditorContext) => {
    let name = Math.max(12, Math.min(22, Math.floor(context.width * 0.28)));
    let effort = 10;
    let rest = context.width - name - effort - 6;
    if (rest < MODEL_MIN + FALLBACK_MIN) {
      name = 12;
      effort = 8;
      rest = context.width - name - effort - 6;
    }
    const fallbacks =
      rest >= 56
        ? Math.floor(rest * 0.4)
        : Math.max(FALLBACK_MIN, rest - MODEL_MIN);
    return { name, effort, fallbacks, model: Math.max(8, rest - fallbacks) };
  };

  const rowSeparator = (width: number) => (width < 50 ? ' ' : separator());

  /**
   * `name · model · effort · [source] chain`, budgeted by cells. Each part
   * keeps a floor (name 5, model 8, effort 4, chain 5 = marker + >= 4
   * characters of the first fallback); spare cells go to name, effort, model,
   * then the chain. Below 41 cells the marker shortens (`[prof]`, `[agt]`,
   * `[def]`) and below 50 the separators shrink to one space; the choice
   * depends on width only. Rows without a chain keep  ·  (they have room).
   */
  const compactRow = (
    parts: { name: string; model: string; effort: string },
    fallbacks: { source: string; chain: string },
    width: number,
  ): string => {
    const short = width < 41;
    const sep = rowSeparator(width);
    const marker = `[${short ? (SHORT_MARKER[fallbacks.source] ?? fallbacks.source) : fallbacks.source}]`;
    const keys = ['name', 'effort', 'model'] as const;
    const size = { ...parts };
    const alloc = { name: 0, model: 0, effort: 0 };
    const floor = { name: 5, model: 8, effort: 4 };
    for (const key of keys) alloc[key] = Math.min(cells(size[key]), floor[key]);
    const chainFloor = Math.min(cells(fallbacks.chain), 5);
    let slack =
      width -
      cells(sep) * 3 -
      cells(marker) -
      1 -
      chainFloor -
      alloc.name -
      alloc.model -
      alloc.effort;
    for (const key of keys) {
      const add = Math.max(0, Math.min(cells(size[key]) - alloc[key], slack));
      alloc[key] += add;
      slack -= add;
    }
    const chain = truncateToVisibleWidth(
      fallbacks.chain,
      chainFloor + Math.max(0, slack),
    );
    return [
      truncateToVisibleWidth(parts.name, alloc.name),
      truncateToVisibleWidth(parts.model, alloc.model),
      truncateToVisibleWidth(parts.effort, alloc.effort),
      `${marker} ${chain}`,
    ].join(sep);
  };

  const tableLabel = (
    name: string,
    model: string,
    effort: string,
    context: ListEditorContext,
    fallbacks?: { source: string; chain: string },
  ): string => {
    if (!useTable(context))
      return fallbacks
        ? compactRow({ name, model, effort }, fallbacks, context.width)
        : [name, model, effort].join(separator());
    const columns = tableColumns(context);
    const chain = fallbacks ? `[${fallbacks.source}] ${fallbacks.chain}` : '';
    return `${padPanelText(name, columns.name)}  ${padPanelText(model, columns.model)}  ${padPanelText(effort, columns.effort)}  ${padPanelText(chain, columns.fallbacks)}`;
  };
  const agentLabel = (row: AgentRow, context: ListEditorContext): string => {
    const values = workspace.valuesFor(current(), row);
    return tableLabel(
      row.name,
      modelText(values.model),
      values.effort ?? 'unresolved',
      context,
      values.fallback_models.length
        ? {
            source: values.fallbackSource,
            chain: values.fallback_models.map(modelKey).join(', '),
          }
        : undefined,
    );
  };

  const orchestratorLabel = (context: ListEditorContext): string => {
    const text = orchestratorValueText(current().orchestrator, modelText);
    return tableLabel('orchestrator', text.model, text.effort, context);
  };

  const orchestratorDirty = (): boolean => {
    const entry = current();
    const a = entry.orchestrator;
    const b = entry.baseOrchestrator;
    return (
      !!entry.base &&
      (a?.model?.provider !== b?.model?.provider ||
        a?.model?.id !== b?.model?.id ||
        a?.effort !== b?.effort)
    );
  };

  const driftRows = (): PanelRowInput[] => {
    const text = orchestratorDrift(workspace.effectiveOrchestrator(), {
      model: liveModel(),
      effort: input.session?.effort?.(),
    });
    return text ? [{ text, tone: 'warning' }] : [];
  };

  const fallbackKeys = (models?: readonly ModelRef[]): string =>
    (models ?? []).map(modelKey).join('\n');

  const rowDirty = (row: AgentRow): boolean => {
    const entry = current();
    if (!entry.base) return false;
    const a = entry.agents[row.key];
    const b = entry.base[row.key];
    return (
      a?.model?.provider !== b?.model?.provider ||
      a?.model?.id !== b?.model?.id ||
      a?.effort !== b?.effort ||
      fallbackKeys(a?.fallback_models) !== fallbackKeys(b?.fallback_models)
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
      homeEndAliases: false,
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
              'f fallbacks',
              'n new',
              'c clone',
              's save',
              'r rename',
              'd delete',
            ].join(separator()),
          ),
          panelHintRow(
            ['u session', 'g global', 'p pin', 'o capture session model'].join(
              separator(),
            ),
          ),
          {
            text: `profile ${profileIndex + 1}/${total}${separator()}${describeEntry(entry, workspace.markers(entry), input.theme)}`,
          },
          ...driftRows(),
          ...(stacked ? stackedProfileRows() : []),
          panelHintRow(
            useTable(context)
              ? `    ${padPanelText('agent', tableColumns(context).name)}  ${padPanelText('model', tableColumns(context).model)}  ${padPanelText('effort', tableColumns(context).effort)}${tableColumns(context).fallbacks ? `  ${padPanelText('fallbacks', tableColumns(context).fallbacks)}` : ''}`
              : `agent ${separator().trim()} model ${separator().trim()} effort ${separator().trim()} fallbacks`,
          ),
        ];
      },
      rows: (): ListEditorRow[] => [
        {
          id: ORCHESTRATOR_ROW_ID,
          dirty: orchestratorDirty(),
          label: orchestratorLabel,
        },
        ...workspace.rows.map((row) => ({
          id: row.key,
          dirty: rowDirty(row),
          label: (context: ListEditorContext) => agentLabel(row, context),
        })),
      ],
      footer: ({ index, width }) => {
        const row = workspace.rows[index - 1];
        const values = row && workspace.valuesFor(current(), row);
        const detail =
          index === 0
            ? `selected: ${themeAccent(input.theme, 'orchestrator')}${separator()}applied on activation and new sessions; unset keeps the session model`
            : row && values
              ? `selected: ${themeAccent(input.theme, row.name)}${separator()}model: ${modelText(values.model)}${separator()}effort: ${values.effort ?? 'unresolved'}`
              : 'selected: (none)';
        const base: PanelRowInput[] = [
          ...(status ? [{ text: status.text, tone: status.tone }] : []),
          detail,
        ];
        const chain = values?.fallback_models.length
          ? wrapChain(
              `fallbacks [${values.fallbackSource}]: `,
              values.fallback_models.map(modelKey),
              width + 4, // the footer spans the frame's inner width
            )
          : [];
        footerProbe = { base: base.length, chain };
        const all = [...base, ...chain.map((text) => ({ text }))];
        if (footerCap === undefined || all.length <= footerCap) return all;
        // The shell drops rows that do not fit; say so instead of losing them.
        const keep = Math.max(0, footerCap - 1);
        return [
          ...all.slice(0, keep),
          {
            text: `${resolveIcon('ellipsis', '…')} +${all.length - keep} more${separator()}f to view`,
            tone: 'warning' as const,
          },
        ];
      },
      onAction: (key, choice) => {
        key = key.toLowerCase();
        if (key === 'left') profileIndex = Math.max(0, profileIndex - 1);
        else if (key === 'right')
          profileIndex = Math.min(entries().length - 1, profileIndex + 1);
        else if (key === 'enter') editAgent(choice?.id, 'both');
        else if (key === 'm') editAgent(choice?.id, 'model');
        else if (key === 'e') editAgent(choice?.id, 'effort');
        else if (key === 'f') editFallbacks(choice?.id);
        else if (key === 'o') attempt(captureSession);
        else if (key === 'n') startDraft(entries()[0], 'New');
        else if (key === 'c') attempt(() => startDraft(current(), 'Clone'));
        else if (key === 's') attempt(save);
        else if (key === 'r') attempt(rename);
        else if (key === 'd') attempt(remove);
        else if (key === 'u') attempt(() => use('session'));
        else if (key === 'g') attempt(() => use('global'));
        else if (key === 'p') attempt(() => use('project'));
        else return false;
        return true;
      },
    },
    // Profile saves belong to onAction; the shell must never complete on save.
    onSave: () => ({
      success: false,
      error: 'Use s to save the selected profile without closing.',
    }),
    onCancel: () =>
      input.done({ action: 'close', discarded: workspace.pendingCount() }),
  });

  const renderPrompt = (active: Prompt, width: number): string[] => {
    const rows: PanelRowInput[] = [
      panelHintRow('type a name · ctrl+u clear · enter confirm · esc cancel'),
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

  const plain = (lines: string[]) =>
    lines.join('\n').replace(/\u001b\[[0-9;]*m/g, '');

  /**
   * The shell slices the footer to the rows left after the body and does not
   * report it. Render once, find how many chain rows survived, and if any
   * were dropped re-render with a visible `… +N more · f to view` row.
   */
  const renderEditor = (width: number): string[] => {
    panelWidth = width;
    footerCap = undefined;
    const lines = editor.render(width);
    const { base, chain } = footerProbe;
    if (editor.getState().view !== 'overview' || !chain.length) return lines;
    const text = plain(lines);
    if (text.includes(chain[chain.length - 1])) return lines;
    let shown = 0;
    while (shown < chain.length && text.includes(chain[shown])) shown += 1;
    footerCap = base + shown;
    const capped = editor.render(width);
    footerCap = undefined;
    return capped;
  };

  return {
    render: (width) => {
      if (prompt) return renderPrompt(prompt, width);
      const side =
        editor.getState().view === 'overview' ? sidebarWidthFor(width) : 0;
      stacked = side === 0;
      if (!side) return renderEditor(width);
      const main = renderEditor(width - side);
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
      editor.handleInput(key);
    },
    invalidate: () => editor.invalidate(),
  };
}

function sessionAccessors(ctx: any): ModalSession {
  return {
    model: () => ctx.getSessionModel?.(),
    effort: () => ctx.getSessionThinkingLevel?.(),
    applyOrchestrator:
      typeof ctx.applyEffectiveProfileOrchestrator === 'function'
        ? () => ctx.applyEffectiveProfileOrchestrator()
        : undefined,
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
  const message = activationMessage(
    pointer,
    entry,
    workspace.activate(entry, pointer, false),
  );
  const outcome = await ctx.applyEffectiveProfileOrchestrator?.();
  return outcome ? `${message} ${outcome.message}` : message;
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
    // Reload can invalidate ctx before the overlay's continuation resumes.
    const ui = ctx.ui;
    const availableModels = await getAvailableModels(ctx);
    const result = await openPanelOverlay<SubagentModelProfilesModalResult>(
      ctx,
      (tui, theme, _keybindings, done, host) =>
        createSubagentModelProfilesModal({
          workspace,
          session: sessionAccessors(ctx),
          availableModels,
          modelContext: ctx,
          tui,
          theme,
          maxHeight: host.maxHeight,
          done,
        }),
    );
    if (result === undefined) return 'Closed model profiles.';
    const discarded = result.discarded ?? 0;
    const message = discarded
      ? `Closed model profiles; discarded ${discarded} unsaved draft${discarded === 1 ? '' : 's'}/edit${discarded === 1 ? '' : 's'}.`
      : 'Closed model profiles.';
    ui.notify?.(message, discarded ? 'warning' : 'info');
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
