import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  HarnessId,
  ProviderCapabilityEvidence,
} from '../../harness/types';
import type {
  ModelRoleInput,
  OperationApplyResult,
  OperationPlan,
} from '../operations';
import { listOperationHarnesses } from '../operations';
import { Header } from './components/Header';
import { Menu, type MenuItem } from './components/Menu';
import {
  EffortChoiceScreen,
  ModelChoiceScreen,
} from './components/ModelChoiceScreen';
import { type ModelRoleView, ModelScreen } from './components/ModelScreen';
import { PlanPreview } from './components/PlanPreview';
import { StatusView } from './components/StatusView';
import { effortChoicesForModel, type ModelOption } from './model-catalog';
import {
  defaultTuiOperations,
  type TuiAction,
  type TuiOperations,
} from './operations';
import { stateColor, theme } from './theme';

type View =
  | 'root'
  | 'harness'
  | 'manageHarness'
  | 'action'
  | 'status'
  | 'preview'
  | 'modelRoles'
  | 'modelChoice'
  | 'effortChoice'
  | 'modelEdit';
type RootAction = 'status' | 'manage' | 'sync' | 'exit';
type HarnessPurpose = 'status' | 'list' | 'action';
type PreviewBackView = 'harness' | 'manageHarness' | 'modelRoles';
type ModelChoiceSelection = { kind: 'model'; id: string } | { kind: 'manual' };

interface AppProps {
  operations?: TuiOperations;
  exitOnQuit?: boolean;
}

interface RootMenuItem extends MenuItem {
  action: RootAction;
}

interface HarnessMenuItem extends MenuItem {
  harness?: HarnessId;
  action?: 'back';
}

interface ActionMenuItem extends MenuItem {
  action: Exclude<TuiAction, 'status' | 'list' | 'model'> | 'back';
}

interface ManageMenuItem extends MenuItem {
  action: 'install' | 'status' | 'update' | 'sync' | 'models' | 'back';
}

const rootItems: RootMenuItem[] = [
  {
    id: 'status',
    action: 'status',
    label: 'Status',
    detail: 'Inspect a harness',
  },
  {
    id: 'manage',
    action: 'manage',
    label: 'Manage Harnesses',
    detail: 'List managed surfaces and actions',
  },
  {
    id: 'sync',
    action: 'sync',
    label: 'Sync / Update',
    detail: 'Preview managed setup changes',
  },
  {
    id: 'exit',
    action: 'exit',
    label: 'Exit',
    detail: 'Close the interactive setup',
  },
];

const actionItems: ActionMenuItem[] = [
  {
    id: 'update',
    action: 'update',
    label: 'Update',
    detail: 'Refresh managed plugin/setup entries',
  },
  {
    id: 'sync',
    action: 'sync',
    label: 'Sync',
    detail: 'Reconcile managed configuration',
  },
  { id: 'back', action: 'back', label: 'Back', detail: 'Return to root' },
];

const installManageItems: ManageMenuItem[] = [
  {
    id: 'install',
    action: 'install',
    label: 'Install',
    detail: 'Preview managed setup install',
  },
  { id: 'back', action: 'back', label: 'Back', detail: 'Choose harness' },
];

const manageItems: ManageMenuItem[] = [
  {
    id: 'status',
    action: 'status',
    label: 'View status',
    detail: 'Open compact categorized health',
  },
  {
    id: 'update',
    action: 'update',
    label: 'Update preview',
    detail: 'Preview managed plugin/setup refresh',
  },
  {
    id: 'sync',
    action: 'sync',
    label: 'Sync preview',
    detail: 'Preview configuration reconciliation',
  },
  {
    id: 'models',
    action: 'models',
    label: 'Configure models',
    detail: 'Edit role model assignments',
  },
  { id: 'back', action: 'back', label: 'Back', detail: 'Choose harness' },
];

function buildHarnessItems(): HarnessMenuItem[] {
  return [
    ...listOperationHarnesses().map((harness) => ({
      id: harness.id,
      harness: harness.id,
      label: harness.displayName,
      detail: harness.description,
      disabled: !harness.available,
    })),
    { id: 'back', action: 'back' as const, label: 'Back', detail: 'Return' },
  ];
}

function moveSelection(
  current: number,
  direction: 1 | -1,
  items: readonly MenuItem[],
): number {
  let next = current;
  for (let index = 0; index < items.length; index += 1) {
    next = (next + direction + items.length) % items.length;
    if (!items[next]?.disabled) return next;
  }
  return current;
}

function normalizeSelection(
  current: number,
  items: readonly MenuItem[],
): number {
  if (items.length === 0) return 0;
  return Math.min(current, items.length - 1);
}

function changedRoles(rows: readonly ModelRoleView[]): ModelRoleInput[] {
  return rows
    .filter((role) => role.dirty)
    .map((role) => {
      const effortChanged =
        role.effort?.kind !== role.currentEffort.kind ||
        (role.effort?.kind === 'effort' &&
          role.currentEffort.kind === 'effort' &&
          role.effort.value !== role.currentEffort.value);
      const includeEffort = effortChanged || role.effort?.kind === 'effort';
      return {
        role: role.role,
        model: role.model,
        ...(includeEffort ? { effort: role.effort } : {}),
        ...(includeEffort && role.provider ? { provider: role.provider } : {}),
        ...(includeEffort && role.catalogId
          ? { catalogId: role.catalogId }
          : {}),
        ...(includeEffort && role.availableEfforts
          ? { availableEfforts: role.availableEfforts }
          : {}),
      };
    });
}

function metadataForModel(
  role: ModelRoleInput,
  model: string,
  option: ModelOption | undefined,
): Partial<
  Pick<ModelRoleInput, 'provider' | 'catalogId' | 'availableEfforts'>
> {
  if (option) {
    return {
      provider: option.provider,
      ...(option.catalogId ? { catalogId: option.catalogId } : {}),
      availableEfforts: option.efforts,
    };
  }
  if (model !== role.model) return {};
  return {
    ...(role.provider ? { provider: role.provider } : {}),
    ...(role.catalogId ? { catalogId: role.catalogId } : {}),
    ...(role.availableEfforts
      ? { availableEfforts: role.availableEfforts }
      : {}),
  };
}

function choicesForRole(
  role: ModelRoleView,
  options: readonly ModelOption[],
  draftModel: string,
): ModelOption[] {
  const exact = options.find((option) => option.id === draftModel);
  const sameModel = draftModel === role.model;
  const current: ModelOption = exact ?? {
    id: draftModel,
    ...(sameModel && role.catalogId ? { catalogId: role.catalogId } : {}),
    label: draftModel,
    provider: sameModel ? (role.provider ?? 'current') : 'manual',
    efforts: sameModel ? (role.availableEfforts ?? []) : [],
    source: 'manual',
  };
  return [current, ...options.filter((option) => option.id !== draftModel)];
}

export function App({
  operations = defaultTuiOperations,
  exitOnQuit = true,
}: AppProps) {
  const { exit } = useApp();
  const harnessItems = useMemo(buildHarnessItems, []);
  const [view, setView] = useState<View>('root');
  const [rootSelected, setRootSelected] = useState(0);
  const [harnessSelected, setHarnessSelected] = useState(0);
  const [actionSelected, setActionSelected] = useState(0);
  const [manageSelected, setManageSelected] = useState(0);
  const [harnessPurpose, setHarnessPurpose] =
    useState<HarnessPurpose>('status');
  const [activeHarness, setActiveHarness] = useState<HarnessId>('opencode');
  const [activeAction, setActiveAction] =
    useState<Exclude<TuiAction, 'status' | 'list' | 'model'>>('update');
  const [reportVersion, setReportVersion] = useState(0);
  const [providerEvidence, setProviderEvidence] =
    useState<ProviderCapabilityEvidence>();
  const [providerEvidenceLoading, setProviderEvidenceLoading] = useState(false);
  const [providerEvidenceError, setProviderEvidenceError] = useState<string>();
  const providerEvidenceRequest = useRef(0);
  const [plan, setPlan] = useState<OperationPlan | undefined>();
  const [result, setResult] = useState<OperationApplyResult | undefined>();
  const [previewAction, setPreviewAction] = useState<'apply' | 'cancel'>(
    'cancel',
  );
  const [previewBackView, setPreviewBackView] =
    useState<PreviewBackView>('harness');
  const [modelHarness, setModelHarness] = useState<HarnessId>('codex');
  const [modelRoles, setModelRoles] = useState<ModelRoleInput[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [modelCatalogLoading, setModelCatalogLoading] = useState(false);
  const [modelCatalogError, setModelCatalogError] = useState<string>();
  const modelCatalogRequest = useRef(0);
  const [modelChoiceSelection, setModelChoiceSelection] =
    useState<ModelChoiceSelection>({ kind: 'manual' });
  const [editedModels, setEditedModels] = useState<Record<string, string>>({});
  const [editedEfforts, setEditedEfforts] = useState<
    Record<string, ModelRoleInput['effort']>
  >({});
  const [draftModelOption, setDraftModelOption] = useState<ModelOption>();
  const [effortSelected, setEffortSelected] = useState(0);
  const [modelSelected, setModelSelected] = useState(0);
  const [editingRole, setEditingRole] = useState<ModelRoleView | undefined>();
  const [editDraft, setEditDraft] = useState('');
  const [modelResult, setModelResult] = useState<
    OperationApplyResult | undefined
  >();

  const report =
    view === 'status' || view === 'manageHarness'
      ? operations.status(activeHarness)
      : undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reportVersion is the explicit keyboard retry trigger.
  useEffect(() => {
    if (view !== 'status' || !operations.providerCapability) return;

    const request = providerEvidenceRequest.current + 1;
    providerEvidenceRequest.current = request;
    setProviderEvidence(undefined);
    setProviderEvidenceLoading(true);
    setProviderEvidenceError(undefined);
    void operations
      .providerCapability(activeHarness)
      .then((evidence) => {
        if (providerEvidenceRequest.current !== request) return;
        setProviderEvidence(evidence);
        setProviderEvidenceLoading(false);
      })
      .catch((error: unknown) => {
        if (providerEvidenceRequest.current !== request) return;
        setProviderEvidenceError(
          error instanceof Error ? error.message : String(error),
        );
        setProviderEvidenceLoading(false);
      });

    return () => {
      if (providerEvidenceRequest.current === request) {
        providerEvidenceRequest.current += 1;
      }
    };
  }, [activeHarness, operations, reportVersion, view]);
  const currentManageItems =
    report?.state === 'missing' ? installManageItems : manageItems;
  const modelRows: ModelRoleView[] = modelRoles.map((role) => {
    const model = editedModels[role.role] ?? role.model;
    const option = modelOptions.find((candidate) => candidate.id === model);
    const metadata = metadataForModel(role, model, option);
    const effort = editedEfforts[role.role] ??
      role.effort ?? { kind: 'inherit' as const };
    const currentEffort = role.effort ?? { kind: 'inherit' as const };
    const effortDirty =
      effort.kind !== currentEffort.kind ||
      (effort.kind === 'effort' &&
        currentEffort.kind === 'effort' &&
        effort.value !== currentEffort.value);
    return {
      role: role.role,
      model,
      effort,
      ...metadata,
      currentModel: role.model,
      currentEffort,
      dirty: model !== role.model || effortDirty,
    };
  });
  const modelChoiceOptions = editingRole
    ? choicesForRole(
        editingRole,
        modelOptions,
        editedModels[editingRole.role] ?? editingRole.model,
      )
    : modelOptions;
  const selectedModelIndex =
    modelChoiceSelection.kind === 'manual'
      ? modelChoiceOptions.length
      : modelChoiceOptions.findIndex(
          (option) => option.id === modelChoiceSelection.id,
        );
  const choiceSelected = selectedModelIndex < 0 ? 0 : selectedModelIndex;
  const dirtyRoles = changedRoles(modelRows);
  const modelActions =
    dirtyRoles.length > 0
      ? ['Preview changes', 'Apply changes', 'Back']
      : ['Back'];
  const modelMenuItems: MenuItem[] = [
    ...modelRows.map((role) => ({
      id: role.role,
      label: `${role.dirty ? '* ' : ''}${role.role}`,
      detail: `${role.model} · ${role.effort?.kind === 'effort' ? role.effort.value : 'inherit'}`,
    })),
    ...modelActions.map((action) => ({
      id: action,
      label: action,
      detail:
        action === 'Back'
          ? 'Return to harness selection'
          : `${dirtyRoles.length} changed role(s)`,
    })),
  ];

  function goBack(): void {
    setResult(undefined);
    if (view === 'status') {
      setView('harness');
    } else if (view === 'harness') {
      setView(harnessPurpose === 'action' ? 'action' : 'root');
    } else if (view === 'manageHarness') {
      setView('harness');
    } else if (view === 'action') {
      setView('root');
    } else if (view === 'preview') {
      setView(previewBackView);
    } else if (view === 'modelRoles') {
      setView('manageHarness');
    } else if (view === 'modelChoice') {
      setView('modelRoles');
    } else if (view === 'effortChoice') {
      setView('modelChoice');
    } else if (view === 'modelEdit') {
      setView('modelChoice');
    }
  }

  function openHarnessPicker(purpose: HarnessPurpose): void {
    setHarnessPurpose(purpose);
    setHarnessSelected(0);
    setView('harness');
  }

  function openPlan(
    harness: HarnessId,
    action: Exclude<TuiAction, 'status' | 'list' | 'model'>,
    backView: PreviewBackView = 'harness',
  ): void {
    setActiveHarness(harness);
    setPlan(operations.plan(harness, action));
    setResult(undefined);
    setPreviewAction('cancel');
    setPreviewBackView(backView);
    setView('preview');
  }

  function openModelRoles(harness: HarnessId): void {
    const request = modelCatalogRequest.current + 1;
    modelCatalogRequest.current = request;
    setModelHarness(harness);
    setModelRoles(operations.modelRoles(harness));
    setModelOptions([]);
    setModelCatalogLoading(true);
    setModelCatalogError(undefined);
    setEditedModels({});
    setEditedEfforts({});
    setModelResult(undefined);
    setModelSelected(0);
    setView('modelRoles');
    void operations
      .modelOptions(harness)
      .then((options) => {
        if (modelCatalogRequest.current !== request) return;
        setModelOptions(options);
        setModelCatalogLoading(false);
      })
      .catch((error: unknown) => {
        if (modelCatalogRequest.current !== request) return;
        setModelCatalogError(
          error instanceof Error ? error.message : String(error),
        );
        setModelCatalogLoading(false);
      });
  }

  function beginEffortSelection(
    role: ModelRoleView,
    model: string,
    option: ModelOption | undefined,
  ): void {
    const choices = effortChoicesForModel(option);
    const pending = editedEfforts[role.role] ??
      role.effort ?? { kind: 'inherit' as const };
    const nextEffort =
      pending.kind === 'effort' && !option?.efforts.includes(pending.value)
        ? { kind: 'inherit' as const }
        : pending;
    setEditedModels((models) => ({ ...models, [role.role]: model }));
    setModelChoiceSelection({ kind: 'model', id: model });
    setEditedEfforts((efforts) => ({
      ...efforts,
      [role.role]: nextEffort,
    }));
    setDraftModelOption(option);
    const nextIndex =
      nextEffort.kind === 'effort' ? choices.indexOf(nextEffort.value) : 0;
    setEffortSelected(nextIndex < 0 ? 0 : nextIndex);
    setView('effortChoice');
  }

  function previewModelChanges(applyImmediately: boolean): void {
    const nextPlan = operations.modelPlan(modelHarness, dirtyRoles);
    setPlan(nextPlan);
    setPreviewAction(applyImmediately ? 'apply' : 'cancel');
    setPreviewBackView('modelRoles');
    if (applyImmediately) {
      const applyResult = operations.apply(nextPlan);
      setModelResult(applyResult);
      if (applyResult.applied) {
        setModelRoles((roles) =>
          roles.map((role) => {
            const model = editedModels[role.role] ?? role.model;
            const option = modelOptions.find(
              (candidate) => candidate.id === model,
            );
            return {
              role: role.role,
              model,
              effort:
                editedEfforts[role.role] ??
                role.effort ??
                ({ kind: 'inherit' } as const),
              ...metadataForModel(role, model, option),
            };
          }),
        );
        setEditedModels({});
        setEditedEfforts({});
      }
      return;
    }
    setResult(undefined);
    setView('preview');
  }

  useInput((input, key) => {
    if (view === 'modelEdit') {
      if (key.escape) {
        goBack();
        return;
      }
      if (key.return && editingRole) {
        beginEffortSelection(editingRole, editDraft, undefined);
        return;
      }
      if (key.tab) {
        const firstOption = modelOptions[0]?.id;
        if (firstOption) setEditDraft(firstOption);
        return;
      }
      if (key.backspace || key.delete) {
        setEditDraft((current) => current.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setEditDraft((current) => `${current}${input}`);
      }
      return;
    }

    if (view === 'effortChoice') {
      if (key.escape) {
        goBack();
        return;
      }
      const choices = effortChoicesForModel(draftModelOption);
      const choiceItems = choices.map((effort) => ({
        id: effort,
        label: effort,
        detail:
          effort === 'inherit'
            ? 'Use the harness default'
            : 'Set an explicit reasoning effort',
      }));
      if (key.upArrow || input === 'k') {
        setEffortSelected((current) => moveSelection(current, -1, choiceItems));
      }
      if (key.downArrow || input === 'j') {
        setEffortSelected((current) => moveSelection(current, 1, choiceItems));
      }
      if (key.return && editingRole) {
        const selectedEffort = choices[effortSelected] ?? 'inherit';
        setEditedEfforts((efforts) => ({
          ...efforts,
          [editingRole.role]:
            selectedEffort === 'inherit'
              ? { kind: 'inherit' }
              : { kind: 'effort', value: selectedEffort },
        }));
        setView('modelRoles');
      }
      return;
    }

    if (view === 'modelChoice') {
      if (key.escape) {
        goBack();
        return;
      }
      const choiceItems: MenuItem[] = [
        ...modelChoiceOptions.map((option) => ({
          id: option.id,
          label: option.id,
          detail: option.provider,
        })),
        { id: 'manual', label: 'Manual entry', detail: 'Type a model ID' },
      ];
      const selectChoiceAt = (index: number): void => {
        const option = modelChoiceOptions[index];
        setModelChoiceSelection(
          option ? { kind: 'model', id: option.id } : { kind: 'manual' },
        );
      };
      if (key.upArrow || input === 'k') {
        selectChoiceAt(moveSelection(choiceSelected, -1, choiceItems));
      }
      if (key.downArrow || input === 'j') {
        selectChoiceAt(moveSelection(choiceSelected, 1, choiceItems));
      }
      if (key.return && editingRole) {
        if (modelChoiceSelection.kind === 'model') {
          const option = modelChoiceOptions.find(
            (candidate) => candidate.id === modelChoiceSelection.id,
          );
          if (option) {
            beginEffortSelection(editingRole, option.id, option);
            return;
          }
        }
        setEditDraft(editingRole.model);
        setView('modelEdit');
      }
      return;
    }

    if (input === 'q' || key.escape) {
      if (view === 'root' && exitOnQuit) exit();
      if (view !== 'root') goBack();
      return;
    }

    if (view === 'root') {
      if (key.upArrow || input === 'k') {
        setRootSelected((current) => moveSelection(current, -1, rootItems));
      }
      if (key.downArrow || input === 'j') {
        setRootSelected((current) => moveSelection(current, 1, rootItems));
      }
      if (key.return) {
        const item = rootItems[rootSelected];
        if (item?.action === 'status') openHarnessPicker('status');
        if (item?.action === 'manage') openHarnessPicker('list');
        if (item?.action === 'sync') setView('action');
        if (item?.action === 'exit' && exitOnQuit) exit();
      }
      return;
    }

    if (view === 'action') {
      if (key.upArrow || input === 'k') {
        setActionSelected((current) => moveSelection(current, -1, actionItems));
      }
      if (key.downArrow || input === 'j') {
        setActionSelected((current) => moveSelection(current, 1, actionItems));
      }
      if (key.return) {
        const item = actionItems[actionSelected];
        if (item?.action === 'back') {
          setView('root');
        } else if (item) {
          setActiveAction(item.action);
          openHarnessPicker('action');
        }
      }
      return;
    }

    if (view === 'harness') {
      const selected = normalizeSelection(harnessSelected, harnessItems);
      if (key.upArrow || input === 'k') {
        setHarnessSelected((current) =>
          moveSelection(current, -1, harnessItems),
        );
      }
      if (key.downArrow || input === 'j') {
        setHarnessSelected((current) =>
          moveSelection(current, 1, harnessItems),
        );
      }
      if (key.return) {
        const item = harnessItems[selected];
        if (item?.action === 'back') {
          goBack();
        } else if (item?.harness) {
          setActiveHarness(item.harness);
          setReportVersion((current) => current + 1);
          if (harnessPurpose === 'status') setView('status');
          if (harnessPurpose === 'list') {
            setManageSelected(0);
            setView('manageHarness');
          }
          if (harnessPurpose === 'action') {
            openPlan(item.harness, activeAction);
          }
        }
      }
      return;
    }

    if (view === 'manageHarness') {
      if (key.upArrow || input === 'k') {
        setManageSelected((current) =>
          moveSelection(current, -1, currentManageItems),
        );
      }
      if (key.downArrow || input === 'j') {
        setManageSelected((current) =>
          moveSelection(current, 1, currentManageItems),
        );
      }
      if (key.return) {
        const item = currentManageItems[manageSelected];
        if (item?.action === 'back') setView('harness');
        if (item?.action === 'install') {
          openPlan(activeHarness, 'install', 'manageHarness');
        }
        if (item?.action === 'status') {
          setView('status');
        }
        if (item?.action === 'update') {
          openPlan(activeHarness, 'update', 'manageHarness');
        }
        if (item?.action === 'sync') {
          openPlan(activeHarness, 'sync', 'manageHarness');
        }
        if (item?.action === 'models') openModelRoles(activeHarness);
      }
      return;
    }

    if (view === 'modelRoles') {
      if (key.upArrow || input === 'k') {
        setModelSelected((current) =>
          moveSelection(current, -1, modelMenuItems),
        );
      }
      if (key.downArrow || input === 'j') {
        setModelSelected((current) =>
          moveSelection(current, 1, modelMenuItems),
        );
      }
      if (key.return) {
        if (modelSelected < modelRows.length) {
          const role = modelRows[modelSelected];
          setEditingRole(role);
          setEditDraft(role?.model ?? '');
          setDraftModelOption(undefined);
          setModelChoiceSelection({
            kind: 'model',
            id: role?.model ?? '',
          });
          setView('modelChoice');
          return;
        }
        const action = modelActions[modelSelected - modelRows.length];
        if (action === 'Back') setView('manageHarness');
        if (action === 'Preview changes') previewModelChanges(false);
        if (action === 'Apply changes') previewModelChanges(true);
      }
      return;
    }

    if (view === 'status') {
      if (input === 'r') setReportVersion((current) => current + 1);
      return;
    }

    if (view === 'preview') {
      if (key.leftArrow || key.rightArrow || key.tab) {
        setPreviewAction((current) =>
          current === 'apply' ? 'cancel' : 'apply',
        );
      }
      if (input === 'a' && plan?.canApply) {
        setPreviewAction('apply');
        setResult(operations.apply(plan));
      }
      if (input === 'c') goBack();
      if (key.return && plan) {
        if (previewAction === 'cancel' || !plan.canApply) {
          goBack();
        } else {
          setResult(operations.apply(plan));
        }
      }
    }
  });

  if (view === 'root') {
    return (
      <Box flexDirection="column">
        <Header
          title="Interactive setup"
          subtitle="Use arrows and Enter. Escape goes back. q exits."
        />
        <Menu items={rootItems} selected={rootSelected} />
      </Box>
    );
  }

  if (view === 'action') {
    return (
      <Box flexDirection="column">
        <Header
          title="Sync / Update"
          subtitle="Choose an operation before selecting a harness."
        />
        <Menu items={actionItems} selected={actionSelected} />
      </Box>
    );
  }

  if (view === 'harness') {
    const title =
      harnessPurpose === 'status'
        ? 'Status'
        : harnessPurpose === 'list'
          ? 'Manage Harnesses'
          : activeAction === 'update'
            ? 'Update'
            : 'Sync';
    return (
      <Box flexDirection="column">
        <Header title={title} subtitle="Choose a harness." />
        <Menu items={harnessItems} selected={harnessSelected} />
      </Box>
    );
  }

  if (view === 'manageHarness' && report) {
    return (
      <Box flexDirection="column">
        <Header
          title={`Manage ${report.displayName ?? activeHarness}`}
          subtitle="Choose an action. Escape returns to harness selection."
        />
        <Text>
          Health: <Text color={stateColor(report.state)}>{report.state}</Text>
          <Text color={theme.dim}> - {report.summary}</Text>
        </Text>
        <Menu items={currentManageItems} selected={manageSelected} />
      </Box>
    );
  }

  if (view === 'modelRoles') {
    return (
      <Box flexDirection="column">
        <Header
          title={`${modelHarness === 'codex' ? 'Codex' : modelHarness === 'claude' ? 'Claude Code' : 'OpenCode'} Models`}
          subtitle="Enter edits a role. Dirty rows are marked with *."
        />
        <ModelScreen
          harness={modelHarness}
          roles={modelRows}
          selected={normalizeSelection(modelSelected, modelMenuItems)}
          actions={modelActions}
        />
        {modelCatalogLoading ? (
          <Text color={theme.dim}>Loading model catalog…</Text>
        ) : null}
        {modelCatalogError ? (
          <Text color={theme.warning}>
            Could not load model catalog: {modelCatalogError}. Manual entry is
            still available.
          </Text>
        ) : null}
        {modelResult ? (
          <Text color={modelResult.applied ? theme.ok : theme.warning}>
            {modelResult.summary}
          </Text>
        ) : null}
      </Box>
    );
  }

  if (view === 'modelEdit' && editingRole) {
    return (
      <Box flexDirection="column">
        <Header
          title={`Edit ${editingRole.role}`}
          subtitle="Type a model ID. Tab inserts the first catalog option. Enter saves."
        />
        <Text>
          Current: <Text color={theme.accent}>{editingRole.model}</Text>
        </Text>
        <Text>
          New: <Text color={theme.warning}>{editDraft}</Text>
        </Text>
      </Box>
    );
  }

  if (view === 'modelChoice' && editingRole) {
    return (
      <Box flexDirection="column">
        <Header
          title={`Choose ${editingRole.role} model`}
          subtitle="Current model is selected first. Press Enter to continue to effort, or choose Manual entry."
        />
        <ModelChoiceScreen
          currentModel={editingRole.currentModel}
          draftModel={editedModels[editingRole.role] ?? editingRole.model}
          options={modelChoiceOptions}
          selected={choiceSelected}
        />
        {modelCatalogLoading ? (
          <Text color={theme.dim}>Loading model catalog…</Text>
        ) : null}
        {modelCatalogError ? (
          <Text color={theme.warning}>
            Could not load model catalog: {modelCatalogError}
          </Text>
        ) : null}
      </Box>
    );
  }

  if (view === 'effortChoice' && editingRole) {
    const draftModel = editedModels[editingRole.role] ?? editingRole.model;
    const effort = editedEfforts[editingRole.role] ?? {
      kind: 'inherit' as const,
    };
    return (
      <Box flexDirection="column">
        <Header
          title={`Choose ${editingRole.role} effort`}
          subtitle="Select inherit or an effort supported by this model."
        />
        <EffortChoiceScreen
          model={draftModel}
          currentEffort={
            editingRole.currentEffort.kind === 'effort'
              ? editingRole.currentEffort.value
              : 'inherit'
          }
          draftEffort={effort.kind === 'effort' ? effort.value : 'inherit'}
          choices={effortChoicesForModel(draftModelOption)}
          selected={effortSelected}
        />
      </Box>
    );
  }

  if (view === 'preview' && plan) {
    return (
      <Box flexDirection="column">
        <Header
          title={plan.title}
          subtitle="Enter selects. Escape or c returns one level."
        />
        <PlanPreview
          plan={plan}
          selectedAction={previewAction}
          result={result}
        />
      </Box>
    );
  }

  if (!report) return null;

  return (
    <Box flexDirection="column" key={reportVersion}>
      <Header
        title={`${report.displayName ?? activeHarness} Status`}
        subtitle="Consumer-managed state and external provider evidence. Escape returns. r refreshes."
      />
      <StatusView
        report={report}
        providerEvidence={
          operations.providerCapability
            ? providerEvidence
            : report.providerCapability
        }
        providerEvidenceLoading={providerEvidenceLoading}
        providerEvidenceError={providerEvidenceError}
      />
    </Box>
  );
}
