import type { ModelRoleInput } from '../cli/operations/types';
import type {
  PiModelSaveResult,
  PiModelSnapshot,
} from '../cli/pi-model-config';

export interface ModelsPanelCatalogModel {
  provider: string;
  id: string;
  name?: string;
  supportedEfforts: readonly string[];
}

export type ModelsPanelResult =
  | { kind: 'cancelled' }
  | { kind: 'saved'; changedRoles: string[] };

export interface ModelsPanelOptions {
  snapshot: PiModelSnapshot;
  catalog: readonly ModelsPanelCatalogModel[];
  save(
    snapshot: PiModelSnapshot,
    roles: readonly ModelRoleInput[],
  ): PiModelSaveResult;
  onDone(result: ModelsPanelResult): void;
  requestRender?(): void;
  /** Runtime adapter should delegate to Pi TUI's matchesKey(). */
  matchesKey?: (data: string, key: PanelKey) => boolean;
  /** Runtime adapter should delegate to Pi TUI's truncateToWidth(). */
  truncate?: (text: string, width: number) => string;
}

export type PanelKey = 'up' | 'down' | 'enter' | 'escape' | 'backspace';

type Screen = 'overview' | 'models' | 'effort' | 'discard';

export interface ModelsPanelState {
  screen: Screen;
  selectedRole: number;
  draft: ModelRoleInput[];
  query: string;
  error?: string;
  changedRoles: string[];
}

const FALLBACK_KEYS: Record<PanelKey, readonly string[]> = {
  up: ['\x1b[A'],
  down: ['\x1b[B'],
  enter: ['\r', '\n'],
  escape: ['\x1b'],
  backspace: ['\x7f', '\b'],
};

function sameSelection(left: ModelRoleInput, right: ModelRoleInput): boolean {
  return (
    left.model === right.model &&
    JSON.stringify(left.effort ?? { kind: 'inherit' }) ===
      JSON.stringify(right.effort ?? { kind: 'inherit' })
  );
}

function cloneRoles(roles: readonly ModelRoleInput[]): ModelRoleInput[] {
  return roles.map((role) => structuredClone(role));
}

function modelValue(model: ModelsPanelCatalogModel): string {
  return `${model.provider}/${model.id}`;
}

function defaultTruncate(text: string, width: number): string {
  if (width <= 0) return '';
  const chars = [...text];
  if (chars.length <= width) return text;
  if (width === 1) return '…';
  return `${chars.slice(0, width - 1).join('')}…`;
}

export function createModelsPanel(options: ModelsPanelOptions) {
  let baseline = options.snapshot;
  const state: ModelsPanelState = {
    screen: 'overview',
    selectedRole: 0,
    draft: cloneRoles(options.snapshot.roles),
    query: '',
    changedRoles: [],
  };
  let selectedItem = 0;
  let pendingModel: ModelsPanelCatalogModel | undefined;
  let failedSave = false;

  const isKey = (data: string, key: PanelKey): boolean =>
    (key === 'escape' && data === '\x03') ||
    (options.matchesKey?.(data, key) ?? FALLBACK_KEYS[key].includes(data));
  const requestRender = (): void => options.requestRender?.();
  const dirty = (): boolean =>
    state.draft.some((role) => {
      const original = baseline.roles.find((item) => item.role === role.role);
      return !original || !sameSelection(role, original);
    });

  const matchingModels = (): ModelsPanelCatalogModel[] => {
    const query = state.query.trim().toLowerCase();
    if (!query) return [...options.catalog];
    return options.catalog.filter((model) =>
      `${model.provider} ${model.id} ${model.name ?? ''}`
        .toLowerCase()
        .includes(query),
    );
  };

  const effortValues = (): string[] => [
    'inherit',
    ...(pendingModel?.supportedEfforts ?? []),
  ];

  const move = (count: number, delta: number): void => {
    if (count <= 0) return;
    selectedItem = (selectedItem + delta + count) % count;
  };

  const save = (): void => {
    if (!dirty() && !failedSave) return;
    state.error = undefined;
    const result = options.save(baseline, cloneRoles(state.draft));
    baseline = result.snapshot;
    state.changedRoles = [
      ...new Set([...state.changedRoles, ...result.changedRoles]),
    ];
    failedSave = !result.success;
    if (result.success) {
      options.onDone({ kind: 'saved', changedRoles: [...state.changedRoles] });
      return;
    }
    state.error = result.error ?? 'Saving global specialist models failed.';
    requestRender();
  };

  const openSelectedRole = (): void => {
    state.screen = 'models';
    state.query = '';
    selectedItem = 0;
    pendingModel = undefined;
    const current = state.draft[state.selectedRole]?.model;
    const index = options.catalog.findIndex(
      (model) => modelValue(model) === current,
    );
    if (index >= 0) selectedItem = index + 1;
  };

  const handleOverview = (data: string): void => {
    if (isKey(data, 'up'))
      state.selectedRole = Math.max(0, state.selectedRole - 1);
    else if (isKey(data, 'down'))
      state.selectedRole = Math.min(
        state.draft.length - 1,
        state.selectedRole + 1,
      );
    else if (isKey(data, 'enter')) openSelectedRole();
    else if (isKey(data, 'escape')) {
      if (dirty() || failedSave) state.screen = 'discard';
      else options.onDone({ kind: 'cancelled' });
    } else if (data.toLowerCase() === 's') save();
  };

  const handleModels = (data: string): void => {
    const models = matchingModels();
    if (isKey(data, 'up')) move(models.length + 1, -1);
    else if (isKey(data, 'down')) move(models.length + 1, 1);
    else if (isKey(data, 'escape')) {
      state.screen = 'overview';
      state.query = '';
    } else if (isKey(data, 'backspace')) {
      state.query = state.query.slice(0, -1);
      selectedItem = 0;
    } else if (isKey(data, 'enter')) {
      if (selectedItem === 0) {
        const role = state.draft[state.selectedRole];
        if (role) {
          state.draft[state.selectedRole] = {
            role: role.role,
            model: 'inherit',
            effort: { kind: 'inherit' },
          };
        }
        state.screen = 'overview';
      } else {
        pendingModel = models[selectedItem - 1];
        if (pendingModel) {
          state.screen = 'effort';
          selectedItem = 0;
        }
      }
    } else if (/^[\x20-\x7e]$/.test(data)) {
      state.query += data;
      selectedItem = 0;
    }
  };

  const handleEffort = (data: string): void => {
    const efforts = effortValues();
    if (isKey(data, 'up')) move(efforts.length, -1);
    else if (isKey(data, 'down')) move(efforts.length, 1);
    else if (isKey(data, 'escape')) {
      state.screen = 'models';
      selectedItem = 0;
    } else if (isKey(data, 'enter') && pendingModel) {
      const value = efforts[selectedItem] ?? 'inherit';
      const role = state.draft[state.selectedRole];
      if (role) {
        state.draft[state.selectedRole] = {
          role: role.role,
          model: modelValue(pendingModel),
          provider: pendingModel.provider,
          catalogId: pendingModel.id,
          availableEfforts: [...pendingModel.supportedEfforts],
          effort:
            value === 'inherit'
              ? { kind: 'inherit' }
              : { kind: 'effort', value },
        };
      }
      state.screen = 'overview';
      state.query = '';
      pendingModel = undefined;
    }
  };

  const handleDiscard = (data: string): void => {
    if (data.toLowerCase() === 'd') options.onDone({ kind: 'cancelled' });
    else if (isKey(data, 'escape') || data.toLowerCase() === 'k')
      state.screen = 'overview';
  };

  const handleInput = (data: string): void => {
    if (state.screen === 'overview') handleOverview(data);
    else if (state.screen === 'models') handleModels(data);
    else if (state.screen === 'effort') handleEffort(data);
    else handleDiscard(data);
    requestRender();
  };

  const overviewLines = (width: number): string[] => {
    const lines = [
      'Global specialist models',
      `Global directory: ${baseline.piRoot}`,
      'Ambient root model is unchanged.',
      'Native settings or project definitions may override these global definitions.',
      'Thinking “inherit” unpins native thinking; it may use a native default, not the parent effort.',
      '',
    ];
    for (const [index, role] of state.draft.entries()) {
      const marker = index === state.selectedRole ? '›' : ' ';
      const changed = (() => {
        const original = baseline.roles.find((item) => item.role === role.role);
        return original && sameSelection(role, original) ? '' : ' *';
      })();
      const effort =
        role.effort?.kind === 'effort' ? role.effort.value : 'inherit';
      if (width < 70) {
        lines.push(
          `${marker} ${role.role}${changed} · thinking ${effort}`,
          `  ${role.model}`,
        );
      } else {
        lines.push(
          `${marker} ${role.role}: ${role.model} · thinking ${effort}${changed}`,
        );
      }
    }
    lines.push('');
    if (state.error) lines.push(`Save failed: ${state.error}`);
    if (state.changedRoles.length > 0)
      lines.push(`Already changed: ${state.changedRoles.join(', ')}`);
    lines.push('↑↓ role · enter edit · s save · esc cancel');
    return lines;
  };

  const modelLines = (): string[] => {
    const models = matchingModels();
    const choices = [
      `${selectedItem === 0 ? '›' : ' '} inherit`,
      ...models.map((model, index) => {
        const label = `${modelValue(model)}${model.name ? ` · ${model.name}` : ''}`;
        return `${selectedItem === index + 1 ? '›' : ' '} ${label}`;
      }),
    ];
    const pageSize = 10;
    const start = Math.max(
      0,
      Math.min(
        selectedItem - Math.floor(pageSize / 2),
        choices.length - pageSize,
      ),
    );
    const lines = [
      `Choose model · ${state.draft[state.selectedRole]?.role ?? ''}`,
      `Search: ${state.query || 'type provider or model name'}`,
      '',
      ...choices.slice(start, start + pageSize),
    ];
    if (models.length === 0) lines.push('  No matching models');
    else if (choices.length > pageSize)
      lines.push(
        `  Showing ${start + 1}–${Math.min(start + pageSize, choices.length)} of ${choices.length}`,
      );
    lines.push('', 'type to search · ↑↓ navigate · enter choose · esc back');
    return lines;
  };

  const effortLines = (): string[] => {
    const lines = [
      `Choose thinking · ${pendingModel ? modelValue(pendingModel) : ''}`,
      'Inherit is native default/unpinned; it does not guarantee the parent effort.',
      '',
    ];
    for (const [index, effort] of effortValues().entries())
      lines.push(`${selectedItem === index ? '›' : ' '} ${effort}`);
    lines.push('', '↑↓ navigate · enter choose · esc back');
    return lines;
  };

  const render = (width: number): string[] => {
    let lines: string[];
    if (state.screen === 'overview') lines = overviewLines(width);
    else if (state.screen === 'models') lines = modelLines();
    else if (state.screen === 'effort') lines = effortLines();
    else
      lines = [
        'Discard unsaved draft?',
        'd discard and close · k or esc keep editing',
      ];
    const truncate = options.truncate ?? defaultTruncate;
    return lines.map((line) => truncate(line, Math.max(1, width)));
  };

  return {
    render,
    handleInput,
    invalidate() {},
    getState: (): ModelsPanelState => structuredClone(state),
  };
}
