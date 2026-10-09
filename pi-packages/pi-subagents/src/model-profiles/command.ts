import {
  type Api,
  getSupportedThinkingLevels,
  type Model,
} from '@earendil-works/pi-ai';
import { resolveIcon } from '@thoth-agents/pi-core';
import {
  createListEditor,
  type ListEditorContext,
  type ListEditorRow,
  openPanelOverlay,
  type PanelTheme,
  padPanelText,
} from '@thoth-agents/pi-core/panel';
import { loadSubagents, readSubagentsConfig } from '../config.js';
import type {
  ModelRef,
  SubagentDefinitionScope,
  SubagentModelProfile,
  SubagentModelProfiles,
  ThinkingEffort,
} from '../types.js';
import { themeAccent, themeDim } from '../ui/theme.js';
import type { ModelProfileRow } from './data.js';
import {
  buildModelProfileRows,
  globalSubagentsConfigPath,
  groupAvailableModelsByProvider,
} from './data.js';
import {
  applyDirtyProfileEdit,
  commitStagedModelProfiles,
  stageModelProfileEdit,
} from './editor.js';
import {
  buildNoChangesModelProfilesMessage,
  profileLabel,
} from './formatting.js';

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
  row: ModelProfileRow | undefined,
  profile: SubagentModelProfile | undefined,
  availableModels: Model<Api>[],
  ctx: ModelContext = {},
): EffortChoice[] {
  const modelRef =
    profile?.model ??
    (row?.explicitProfile.model ? row.inheritedModel : row?.effectiveModel);
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
  const currentEffort =
    profile?.effort ??
    (row?.explicitProfile.effort ? row.inheritedEffort : row?.effectiveEffort);
  if (currentEffort && !supported.includes(currentEffort))
    choices.push({
      value: currentEffort,
      label: `${currentEffort} (current; unsupported, clamped by Pi)`,
    });
  return choices;
}

export type SubagentModelProfilesModalResult =
  | { action: 'save'; dirtyProfiles: SubagentModelProfiles }
  | { action: 'cancel' };

type ModalComponent = {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
};

type ModalInput = {
  rows: ModelProfileRow[];
  availableModels?: any[];
  modelContext?: ModelContext;
  tui?: { requestRender?: () => void };
  theme?: PanelTheme;
  maxHeight?: () => number;
  done: (result: SubagentModelProfilesModalResult) => void;
};

function cloneProfile(
  profile: SubagentModelProfile = {},
): SubagentModelProfile {
  return {
    ...(profile.model ? { model: { ...profile.model } } : {}),
    ...(profile.effort ? { effort: profile.effort } : {}),
  };
}

function cloneProfiles(profiles: SubagentModelProfiles): SubagentModelProfiles {
  return Object.fromEntries(
    Object.entries(profiles).map(([name, profile]) => [
      name,
      cloneProfile(profile),
    ]),
  );
}

export function createSubagentModelProfilesModal(
  input: ModalInput,
): ModalComponent {
  const rows = input.rows;
  const availableByProvider = groupAvailableModelsByProvider(
    input.availableModels ?? [],
  );
  const providerNames = Object.keys(availableByProvider);
  const rowKey = (row: ModelProfileRow): string =>
    row.name.trim().toLowerCase();
  const baseProfiles: SubagentModelProfiles = Object.fromEntries(
    rows.map((row) => [rowKey(row), cloneProfile(row.explicitProfile)]),
  );
  let dirtyProfiles: SubagentModelProfiles = {};
  const hasDirtyProfileFor = (row: ModelProfileRow): boolean =>
    Object.hasOwn(dirtyProfiles, rowKey(row));
  const dirtyProfileFor = (
    row: ModelProfileRow,
  ): SubagentModelProfile | undefined => dirtyProfiles[rowKey(row)];

  const applyEdit = (
    row: ModelProfileRow,
    edit: {
      model?: ModelRef;
      effort?: ThinkingEffort;
      reset?: 'model' | 'effort' | 'row';
    },
  ) => {
    dirtyProfiles = applyDirtyProfileEdit({
      baseProfiles,
      dirtyProfiles,
      edit: { agentName: row.name, ...edit },
    });
  };

  const effortChoicesForRow = (row: ModelProfileRow) =>
    buildEffortChoices(
      row,
      dirtyProfileFor(row) ?? row.explicitProfile,
      input.availableModels ?? [],
      input.modelContext,
    );

  const scopedName = (row: ModelProfileRow): string =>
    `${row.name} ${themeDim(input.theme, row.scope === 'project' ? '(local)' : '(global)')}`;
  const rowProfileText = (
    row: ModelProfileRow,
    field: 'model' | 'effort',
  ): string => {
    const current = field === 'model' ? row.modelLabel : row.effortLabel;
    if (!hasDirtyProfileFor(row)) return current;
    const label = profileLabel(dirtyProfileFor(row), field);
    if (label) return `staged: ${label}`;
    return baseProfiles[rowKey(row)]?.[field]
      ? `staged: inherit/reset ${field} (was ${current})`
      : current;
  };

  const tableColumns = (context: ListEditorContext) => ({
    name: 28,
    model: Math.max(24, context.width - 28 - 24 - 4),
    effort: 24,
  });
  const moveHint = () =>
    `${resolveIcon('arrowUp', '↑')}/${resolveIcon('arrowDown', '↓')}/j/k move`;
  const separator = () => ` ${resolveIcon('separator', '·')} `;
  const modelPicker = (row: ModelProfileRow, provider: string) => {
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
          `Select ${provider} model for ${row.name}`,
          `provider: ${provider}${separator()}${filter ? `${count}/${models.length} match${count === 1 ? '' : 'es'}` : `${models.length} model${models.length === 1 ? '' : 's'}`}`,
        ];
      },
      onAction: (key, choice) => {
        if (key !== 'enter') return false;
        const model = choice && modelsById.get(choice.id);
        if (model)
          applyEdit(row, {
            model: { provider: model.provider, id: model.id },
          });
        editor.showOverview();
        return true;
      },
    });
  };
  const providerPicker = (row: ModelProfileRow) => {
    editor.openPicker({
      title: 'Choose model provider',
      maxVisibleRows: 10,
      hints: () =>
        ['choose provider', 'enter: select', 'esc/q: back'].join(separator()),
      header: () => [
        `Select model provider for ${row.name}`,
        ...(!providerNames.length
          ? ['No available models found; reset remains available.']
          : []),
      ],
      rows: () => [
        { id: 'reset', label: 'inherit/reset model' },
        ...providerNames.map((provider) => ({
          id: `provider:${provider}`,
          label: provider,
        })),
      ],
      onAction: (key, choice) => {
        if (key !== 'enter') return false;
        if (choice?.id === 'reset') {
          applyEdit(row, { reset: 'model' });
          editor.showOverview();
        } else if (choice)
          modelPicker(row, choice.id.slice('provider:'.length));
        return true;
      },
    });
  };
  const effortPicker = (row: ModelProfileRow) => {
    const choices = effortChoicesForRow(row);
    const current =
      (dirtyProfileFor(row) ?? row.explicitProfile).effort ?? 'inherit';
    editor.openPicker(
      {
        title: 'Choose effort',
        hints: () =>
          ['choose effort', 'enter: select', 'esc/q: back'].join(separator()),
        header: () => [`row: ${row.name}`],
        rows: () =>
          choices.map((choice) => ({
            id: choice.value,
            label:
              choice.value === 'inherit'
                ? 'inherit/reset effort'
                : choice.label,
          })),
        onAction: (key, choice) => {
          if (key !== 'enter') return false;
          const effort = choices.find(
            (item) => item.value === choice?.id,
          )?.value;
          if (effort === 'inherit') applyEdit(row, { reset: 'effort' });
          else if (effort) applyEdit(row, { effort });
          editor.showOverview();
          return true;
        },
      },
      Math.max(
        0,
        choices.findIndex((choice) => choice.value === current),
      ),
    );
  };

  const editor = createListEditor({
    wideBreakpoint: 102,
    maxHeight: input.maxHeight,
    theme: input.theme,
    pendingCount: () => Object.keys(dirtyProfiles).length,
    requestRender: () => input.tui?.requestRender?.(),
    overview: {
      title: 'Subagent model profiles',
      maxVisibleRows: 10,
      hints: () =>
        [
          moveHint(),
          'enter/m model',
          'e effort',
          'M/E/r reset',
          's save',
          'esc/q cancel',
        ].join(separator()),
      header: (context) => {
        const columns = tableColumns(context);
        return [
          'target: local/global by subagent scope',
          context.layout === 'wide'
            ? `    ${padPanelText('agent', columns.name)}  ${padPanelText('model', columns.model)}  ${padPanelText('effort', columns.effort)}`
            : `agent ${resolveIcon('separator', '·')} model ${resolveIcon('separator', '·')} effort`,
        ];
      },
      rows: (): ListEditorRow[] =>
        rows.map((row) => ({
          id: rowKey(row),
          dirty: hasDirtyProfileFor(row),
          label: (context) => {
            if (context.layout === 'compact')
              return `${scopedName(row)}${separator()}${rowProfileText(row, 'model')}${separator()}${rowProfileText(row, 'effort')}`;
            const columns = tableColumns(context);
            return `${padPanelText(scopedName(row), columns.name)}  ${padPanelText(rowProfileText(row, 'model'), columns.model)}  ${padPanelText(rowProfileText(row, 'effort'), columns.effort)}`;
          },
        })),
      footer: ({ index }) => {
        const row = rows[index];
        if (!row) return ['selected: (none)'];
        const availability = row.modelLabel.includes('(unavailable)')
          ? ` ${resolveIcon('separator', '·')} unavailable model`
          : '';
        return [
          `selected: ${themeAccent(input.theme, row.name)}${availability}${separator()}model: ${rowProfileText(row, 'model')}${separator()}effort: ${rowProfileText(row, 'effort')}`,
        ];
      },
      onAction: (key, choice) => {
        const row = rows.find((item) => rowKey(item) === choice?.id);
        if (!row) return false;
        if (key === 'enter' || key === 'm') providerPicker(row);
        else if (key === 'e') effortPicker(row);
        else if (key === 'M') applyEdit(row, { reset: 'model' });
        else if (key === 'E') applyEdit(row, { reset: 'effort' });
        else if (key === 'r') applyEdit(row, { reset: 'row' });
        else return false;
        return true;
      },
    },
    onSave: () => ({ success: true }),
    onSaved: () =>
      input.done({
        action: 'save',
        dirtyProfiles: cloneProfiles(dirtyProfiles),
      }),
    onCancel: () => input.done({ action: 'cancel' }),
  });

  return {
    render: (width) => editor.render(width),
    handleInput: (data) =>
      editor.handleInput(
        data === 'enter'
          ? '\r'
          : data === 'esc' || data === 'escape'
            ? '\u001b'
            : data,
      ),
    invalidate: () => editor.invalidate(),
  };
}

export function buildNonTuiModelProfilesMessage(agentDir?: string): string {
  return `subagent model profiles require Pi TUI. Edit global profiles manually in ${globalSubagentsConfigPath(agentDir)} under the model_profiles key.`;
}

function rowChoice(row: ModelProfileRow): string {
  const scope = row.scope === 'project' ? 'local' : 'global';
  return `${row.name} (${scope}) — model ${row.modelLabel}; effort ${row.effortLabel}`;
}

async function getAvailableModels(ctx: any): Promise<any[]> {
  try {
    const available = await ctx?.modelRegistry?.getAvailable?.();
    return Array.isArray(available) ? available : [];
  } catch {
    return [];
  }
}

async function chooseSave(
  ctx: any,
  stagedProfiles: SubagentModelProfiles,
  input: {
    agentDir?: string;
    cwd?: string;
    profileScopes?: Record<string, SubagentDefinitionScope>;
  } = {},
): Promise<string> {
  const decision = await ctx.ui.select('Save subagent model profile changes?', [
    'Save',
    'Cancel',
  ]);
  const message = commitStagedModelProfiles({
    stagedProfiles,
    save: decision === 'Save',
    agentDir: input.agentDir,
    cwd: input.cwd,
    profileScopes: input.profileScopes,
  });
  ctx.ui.notify?.(message, decision === 'Save' ? 'info' : 'warning');
  return message;
}

export async function runSubagentModelsCommand(ctx: any = {}): Promise<string> {
  const agentDir = ctx?.agentDir;
  const hasCustomUi = typeof ctx?.ui?.custom === 'function';
  const hasSelectUi = typeof ctx?.ui?.select === 'function';
  if (!hasCustomUi && !hasSelectUi)
    return buildNonTuiModelProfilesMessage(agentDir);

  const cwd = ctx.cwd ?? process.cwd();
  const definitions = loadSubagents(cwd);
  const config = readSubagentsConfig(cwd);
  const availableModels = await getAvailableModels(ctx);
  const rows = buildModelProfileRows({
    definitions,
    config,
    ctx,
    availableModels,
  });
  const profileScopes: Record<string, SubagentDefinitionScope> =
    Object.fromEntries(
      rows.map((row) => [row.name.trim().toLowerCase(), row.scope ?? 'global']),
    );

  if (hasCustomUi) {
    const result = await openPanelOverlay<SubagentModelProfilesModalResult>(
      ctx,
      (tui, theme, _keybindings, done, host) =>
        createSubagentModelProfilesModal({
          rows,
          availableModels,
          modelContext: ctx,
          tui,
          theme,
          maxHeight: host.maxHeight,
          done,
        }),
    );

    if (result?.action === 'save') {
      const hasDirtyRows = Object.keys(result.dirtyProfiles).length > 0;
      const message = hasDirtyRows
        ? commitStagedModelProfiles({
            stagedProfiles: result.dirtyProfiles,
            save: true,
            agentDir,
            cwd,
            profileScopes,
          })
        : buildNoChangesModelProfilesMessage(agentDir);
      ctx.ui.notify?.(message, 'info');
      return message;
    }

    const message = commitStagedModelProfiles({
      stagedProfiles: {},
      save: false,
      agentDir,
    });
    ctx.ui.notify?.(message, 'warning');
    return message;
  }

  const rowChoices = rows.map(rowChoice);
  const selectedRowChoice = await ctx.ui.select(
    'Select subagent to configure:',
    [...rowChoices, 'Cancel'],
  );
  if (!selectedRowChoice || selectedRowChoice === 'Cancel')
    return commitStagedModelProfiles({
      stagedProfiles: {},
      save: false,
      agentDir,
    });
  const row = rows[rowChoices.indexOf(selectedRowChoice)];
  if (!row)
    return commitStagedModelProfiles({
      stagedProfiles: {},
      save: false,
      agentDir,
    });

  const action = await ctx.ui.select(`Configure ${row.name}:`, [
    'Set provider/model/effort',
    'Reset model',
    'Reset effort',
    'Reset row',
    'Cancel',
  ]);
  let staged: SubagentModelProfiles = {
    [row.name]: { ...row.explicitProfile },
  };
  if (action === 'Cancel')
    return commitStagedModelProfiles({
      stagedProfiles: staged,
      save: false,
      agentDir,
    });
  if (action === 'Reset model')
    staged = stageModelProfileEdit(staged, {
      agentName: row.name,
      reset: 'model',
    });
  else if (action === 'Reset effort')
    staged = stageModelProfileEdit(staged, {
      agentName: row.name,
      reset: 'effort',
    });
  else if (action === 'Reset row')
    staged = stageModelProfileEdit(staged, {
      agentName: row.name,
      reset: 'row',
    });
  else {
    const grouped = groupAvailableModelsByProvider(availableModels);
    const providers = Object.keys(grouped);
    const provider = await ctx.ui.select(`Select provider for ${row.name}:`, [
      ...providers,
      'inherit/reset model',
      'Cancel',
    ]);
    if (provider === 'Cancel')
      return commitStagedModelProfiles({
        stagedProfiles: staged,
        save: false,
        agentDir,
      });
    if (provider === 'inherit/reset model')
      staged = stageModelProfileEdit(staged, {
        agentName: row.name,
        reset: 'model',
      });
    else {
      const models = grouped[provider] ?? [];
      const modelLabels = models.map((model) => model.label);
      const modelLabel = await ctx.ui.select(`Select model for ${row.name}:`, [
        ...modelLabels,
        'Cancel',
      ]);
      if (modelLabel === 'Cancel')
        return commitStagedModelProfiles({
          stagedProfiles: staged,
          save: false,
          agentDir,
        });
      const selectedModel = models[modelLabels.indexOf(modelLabel)];
      if (selectedModel)
        staged = stageModelProfileEdit(staged, {
          agentName: row.name,
          model: { provider: selectedModel.provider, id: selectedModel.id },
        });
    }
    const effortChoices = buildEffortChoices(
      row,
      staged[row.name],
      availableModels,
      ctx,
    );
    const effortLabel = await ctx.ui.select(
      `Select effort for ${row.name}:`,
      effortChoices.map((choice) => choice.label),
    );
    const effort = effortChoices.find(
      (choice) => choice.label === effortLabel,
    )?.value;
    if (effort === 'inherit')
      staged = stageModelProfileEdit(staged, {
        agentName: row.name,
        reset: 'effort',
      });
    else
      staged = stageModelProfileEdit(staged, { agentName: row.name, effort });
  }

  return chooseSave(ctx, staged, { agentDir, cwd, profileScopes });
}
