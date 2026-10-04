import {
  type PiToolConfigSnapshot,
  type PiToolRoleInput,
  type PiToolRoleSnapshot,
  type PiToolSaveResult,
  validatePiSpecialistTools,
} from '../cli/pi-tool-config';

export type ToolsPanelResult =
  | { kind: 'cancelled' }
  | { kind: 'saved'; changedRoles: string[] };

export interface ToolsPanelTheme {
  fg(
    color: 'accent' | 'border' | 'muted' | 'dim' | 'text' | 'error' | 'warning',
    text: string,
  ): string;
  bg(color: 'selectedBg', text: string): string;
}

export interface ToolsPanelDiscoveredTool {
  name: string;
  description?: string;
  active: boolean;
}

export type ToolsPanelKey =
  | 'up'
  | 'down'
  | 'enter'
  | 'escape'
  | 'backspace'
  | 'space';

export interface ToolsPanelOptions {
  snapshot: PiToolConfigSnapshot;
  discoveredTools: readonly ToolsPanelDiscoveredTool[];
  save(
    snapshot: PiToolConfigSnapshot,
    roles: readonly PiToolRoleInput[],
  ): PiToolSaveResult;
  onDone(result: ToolsPanelResult): void;
  requestRender?(): void;
  maxHeight?(): number;
  matchesKey?: (data: string, key: ToolsPanelKey) => boolean;
  truncate?: (text: string, width: number) => string;
  visibleWidth?: (text: string) => number;
  theme?: ToolsPanelTheme;
}

export type RoleToolsDraft = PiToolRoleSnapshot;

export type ToolsPanelScreen = 'overview' | 'tools' | 'discard';

export interface ToolsPanelState {
  screen: ToolsPanelScreen;
  selectedRole: number;
  draft: RoleToolsDraft[];
  error?: string;
  changedRoles: string[];
}

export type ToolItemStatus = 'active' | 'inactive';

export interface ToolListItem {
  name: string;
  description?: string;
  status: ToolItemStatus;
}

const FALLBACK_KEYS: Record<ToolsPanelKey, readonly string[]> = {
  up: ['\x1b[A'],
  down: ['\x1b[B'],
  enter: ['\r', '\n'],
  escape: ['\x1b'],
  backspace: ['\x7f', '\b'],
  space: [' '],
};

const ORCHESTRATOR_NOTE =
  'ask_orchestrator: child-provided; subject to enable_ask_orchestrator and disallowed_tools.';

export function isEligibleTool(name: string): boolean {
  if (/[*?[\]{}]/.test(name)) return false;
  try {
    validatePiSpecialistTools([name]);
    return true;
  } catch {
    return false;
  }
}

function sameTools(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((tool, index) => tool === right[index]);
}

function cloneRoles(roles: readonly RoleToolsDraft[]): RoleToolsDraft[] {
  return roles.map((role) => structuredClone(role));
}

function defaultTruncate(text: string, width: number): string {
  if (width <= 0) return '';
  const chars = [...text];
  if (chars.length <= width) return text;
  if (width === 1) return '…';
  return `${chars.slice(0, width - 1).join('')}…`;
}

function defaultVisibleWidth(text: string): number {
  return [...text].length;
}

export function createToolsPanel(options: ToolsPanelOptions) {
  let baseline = options.snapshot;
  const state: ToolsPanelState = {
    screen: 'overview',
    selectedRole: 0,
    draft: cloneRoles(options.snapshot.roles),
    changedRoles: [],
  };

  let selectedToolIndex = 0;
  let failedSave = false;

  const toolItems: ToolListItem[] = [];
  const editableNames = new Set<string>();
  for (const tool of options.discoveredTools) {
    if (
      tool.name === 'ask_orchestrator' ||
      !isEligibleTool(tool.name) ||
      editableNames.has(tool.name)
    )
      continue;
    editableNames.add(tool.name);
    toolItems.push({
      name: tool.name,
      description: tool.description,
      status: tool.active ? 'active' : 'inactive',
    });
  }
  const readOnlyTools = (role: RoleToolsDraft): string[] =>
    role.tools.filter((name) => !editableNames.has(name));
  const readOnlyLine = (role: RoleToolsDraft): string[] => {
    const names = readOnlyTools(role);
    return names.length
      ? [`Read-only: ${names.join(', ')} (edit manually in the definition)`]
      : [];
  };

  const isKey = (data: string, key: ToolsPanelKey): boolean =>
    (key === 'escape' && data === '\x03') ||
    (options.matchesKey?.(data, key) ?? FALLBACK_KEYS[key].includes(data));

  const requestRender = (): void => options.requestRender?.();

  const dirty = (): boolean =>
    state.draft.some((role) => {
      const original = baseline.roles.find((item) => item.role === role.role);
      return !original || !sameTools(role.tools, original.tools);
    });

  const selectionLabel = (role: RoleToolsDraft): string =>
    `${role.tools.length} selected`;

  const selectionSummary = (role: RoleToolsDraft): string =>
    role.tools.join(', ') || '(none)';

  const save = (): void => {
    if (!dirty() && !failedSave) {
      options.onDone({ kind: 'saved', changedRoles: [...state.changedRoles] });
      return;
    }
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
    state.error = result.error ?? 'Saving global specialist tools failed.';
    requestRender();
  };

  const openSelectedRole = (): void => {
    state.screen = 'tools';
    selectedToolIndex = 0;
  };

  const restoreDefaultsForRole = (role: RoleToolsDraft): void => {
    role.tools = [...new Set([...role.defaultTools, ...readOnlyTools(role)])];
  };

  const toggleCurrentTool = (): void => {
    const role = state.draft[state.selectedRole];
    if (!role) return;
    const item = toolItems[selectedToolIndex];
    if (!item) return;

    const currentTools = role.tools;
    if (currentTools.includes(item.name)) {
      role.tools = currentTools.filter((t) => t !== item.name);
    } else {
      role.tools = [...currentTools, item.name];
    }
  };

  const handleOverview = (data: string): void => {
    if (isKey(data, 'up') || data === 'k') {
      state.selectedRole = Math.max(0, state.selectedRole - 1);
    } else if (isKey(data, 'down') || data === 'j') {
      state.selectedRole = Math.min(
        state.draft.length - 1,
        state.selectedRole + 1,
      );
    } else if (data === 'g') {
      state.selectedRole = 0;
    } else if (data === 'G') {
      state.selectedRole = Math.max(0, state.draft.length - 1);
    } else if (isKey(data, 'enter') || data === 'e') {
      openSelectedRole();
    } else if (isKey(data, 'escape') || data === 'q') {
      if (dirty() || failedSave) state.screen = 'discard';
      else options.onDone({ kind: 'cancelled' });
    } else if (data.toLowerCase() === 's') {
      save();
    } else if (data.toLowerCase() === 'r') {
      const role = state.draft[state.selectedRole];
      if (role) restoreDefaultsForRole(role);
    }
  };

  const handleTools = (data: string): void => {
    const role = state.draft[state.selectedRole];
    if (!role) return;
    const items = toolItems;

    if (isKey(data, 'up') || data === 'k') {
      if (items.length > 0) {
        selectedToolIndex =
          (selectedToolIndex - 1 + items.length) % items.length;
      }
    } else if (isKey(data, 'down') || data === 'j') {
      if (items.length > 0) {
        selectedToolIndex = (selectedToolIndex + 1) % items.length;
      }
    } else if (data === 'g') {
      selectedToolIndex = 0;
    } else if (data === 'G') {
      selectedToolIndex = Math.max(0, items.length - 1);
    } else if (isKey(data, 'space') || data === ' ') {
      toggleCurrentTool();
    } else if (data.toLowerCase() === 'r') {
      restoreDefaultsForRole(role);
    } else if (isKey(data, 'enter') || isKey(data, 'escape') || data === 'q') {
      state.screen = 'overview';
    }
  };

  const handleDiscard = (data: string): void => {
    if (data.toLowerCase() === 'd') options.onDone({ kind: 'cancelled' });
    else if (isKey(data, 'escape') || data.toLowerCase() === 'k')
      state.screen = 'overview';
  };

  const handleInput = (data: string): void => {
    if (state.screen === 'overview') handleOverview(data);
    else if (state.screen === 'tools') handleTools(data);
    else handleDiscard(data);
    requestRender();
  };

  // Overlay maxHeight clips rather than scrolls. Keep controls, save errors and
  // a cursor-centered choice window visible when the full presentation won't fit.
  const fitChoiceViewport = (
    lines: string[],
    choices: string[],
    cursor: number,
    height: number,
  ): string[] => {
    if (lines.length <= height) return lines;
    if (height <= 0) return [];
    const messages = lines
      .filter(
        (line) =>
          line.startsWith('Save failed:') ||
          line.startsWith('Already changed:'),
      )
      .slice(0, Math.max(0, height - 1));
    const headerSpace = height - messages.length - 1;
    const header =
      headerSpace >= 2
        ? lines.slice(0, 2)
        : headerSpace === 1
          ? lines.slice(1, 2)
          : [];
    const available = height - header.length - messages.length;
    const showRange = choices.length > available && available > 1;
    const pageSize = available - Number(showRange);
    const start = Math.max(
      0,
      Math.min(cursor - Math.floor(pageSize / 2), choices.length - pageSize),
    );
    return [
      ...header,
      ...messages,
      ...choices.slice(start, start + pageSize),
      ...(showRange
        ? [`  Showing ${start + 1}–${start + pageSize} of ${choices.length}`]
        : []),
    ];
  };

  const overviewLines = (width: number, height: number): string[] => {
    const dirtyCount = state.draft.filter((role) => {
      const original = baseline.roles.find((item) => item.role === role.role);
      return !original || !sameTools(role.tools, original.tools);
    }).length;
    const lines = [
      `target: global specialist definitions · ${dirtyCount ? `pending: ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'pending: none'}`,
      '↑/↓/j/k move · enter/e edit · r defaults · s save · esc/q cancel',
      '',
    ];

    const innerWidth = Math.max(1, width - 4);
    const table = innerWidth >= 80;
    if (table)
      lines.push(
        `${'agent'.padEnd(18)}  ${'selected tools'.padEnd(18)}  tools`,
      );
    else lines.push('agent · selected tools');

    const choices: string[] = [];
    for (const [index, role] of state.draft.entries()) {
      const marker = index === state.selectedRole ? '›' : ' ';
      const changed = (() => {
        const original = baseline.roles.find((item) => item.role === role.role);
        return original && sameTools(role.tools, original.tools) ? '' : ' *';
      })();
      const toolSummary = selectionSummary(role);
      const countLabel = selectionLabel(role);
      const name = `${role.role}${changed}`;
      choices.push(
        table
          ? `${marker} ${name.padEnd(16)}  ${countLabel.padEnd(18)}  ${toolSummary}`
          : `${marker} ${name} · ${countLabel} · ${toolSummary}`,
      );
    }

    lines.push(...choices, '');
    const selected = state.draft[state.selectedRole];
    lines.push(
      `selected: ${selected?.role ?? '(none)'} · tools: ${selected ? selectionSummary(selected) : '(none)'}`,
    );
    lines.push(`Global directory: ${baseline.piRoot}`);
    lines.push('Ambient root tools are unchanged.');
    lines.push(
      'Native settings or project definitions may override these global definitions.',
    );
    lines.push('Child specialists do not inherit root tools automatically.');
    lines.push(ORCHESTRATOR_NOTE);
    if (selected) lines.push(...readOnlyLine(selected));
    if (state.error) lines.push(`Save failed: ${state.error}`);
    if (state.changedRoles.length > 0)
      lines.push(`Already changed: ${state.changedRoles.join(', ')}`);
    return fitChoiceViewport(lines, choices, state.selectedRole, height);
  };

  const toolLines = (height: number): string[] => {
    const role = state.draft[state.selectedRole];
    if (!role) return [];
    const items = toolItems;
    const selectedSet = new Set(role.tools);

    const choices = items.map((item, index) => {
      const isCursor = index === selectedToolIndex;
      const marker = isCursor ? '›' : ' ';
      const checked = selectedSet.has(item.name) ? '[x]' : '[ ]';
      const badge = item.status === 'inactive' ? ' (inactive)' : '';
      const desc = item.description ? ` · ${item.description}` : '';
      return `${marker} ${checked} ${item.name}${badge}${desc}`;
    });

    const pageSize = 10;
    const start = Math.max(
      0,
      Math.min(
        selectedToolIndex - Math.floor(pageSize / 2),
        choices.length - pageSize,
      ),
    );
    const lines = [
      `row: ${role.role} · ${selectionLabel(role)}`,
      '↑/↓/j/k move · space toggle · r defaults · enter/esc/q back',
      ORCHESTRATOR_NOTE,
      ...readOnlyLine(role),
      '',
      ...choices.slice(start, start + pageSize),
    ];
    if (items.length === 0) lines.push('  No tools available');
    else if (choices.length > pageSize)
      lines.push(
        `  Showing ${start + 1}–${Math.min(start + pageSize, choices.length)} of ${choices.length}`,
      );
    lines.push('', `selected: ${items[selectedToolIndex]?.name ?? '(none)'}`);
    return fitChoiceViewport(
      lines,
      choices.length ? choices : ['  No tools available'],
      selectedToolIndex,
      height,
    );
  };

  const render = (width: number): string[] => {
    const maxHeight = Math.max(
      1,
      Math.floor(options.maxHeight?.() ?? Infinity),
    );
    const bodyHeight = Math.max(0, maxHeight - 2);
    let title: string;
    let lines: string[];
    if (state.screen === 'overview') {
      title = 'Global specialist tools';
      lines = overviewLines(width, bodyHeight);
    } else if (state.screen === 'tools') {
      const role = state.draft[state.selectedRole];
      title = `Choose tools · ${role?.role ?? ''}`;
      lines = toolLines(bodyHeight);
    } else {
      title = 'Discard unsaved draft?';
      lines = ['d discard and close · k or esc keep editing'];
    }

    const truncate = options.truncate ?? defaultTruncate;
    const measure = options.visibleWidth ?? defaultVisibleWidth;
    const fg = (
      color: Parameters<ToolsPanelTheme['fg']>[0],
      text: string,
    ): string => options.theme?.fg(color, text) ?? text;
    const panelWidth = Math.max(1, width);
    if (maxHeight < 3) return [truncate(title, panelWidth)];
    if (panelWidth < 4) {
      return [title, ...lines].map((line) => truncate(line, panelWidth));
    }

    const innerWidth = panelWidth - 4;
    const titleText = truncate(` ${title} `, panelWidth - 2);
    const top = fg(
      'accent',
      `╭${titleText}${'─'.repeat(Math.max(0, panelWidth - 2 - measure(titleText)))}╮`,
    );
    const bottom = fg('border', `╰${'─'.repeat(panelWidth - 2)}╯`);
    const body = lines.map((line) => {
      const selected = line.startsWith('› ');
      let content = truncate(line, innerWidth);
      if (selected) content = fg('accent', content);
      else if (
        line === '' ||
        line.includes('↑/↓/j/k') ||
        line.startsWith('target:') ||
        line.startsWith('Global directory:') ||
        line.startsWith('Ambient root') ||
        line.startsWith('Native settings') ||
        line.startsWith('Child specialists') ||
        line.startsWith('ask_orchestrator:') ||
        line.startsWith('Read-only:') ||
        line.startsWith('  Showing')
      )
        content = fg('muted', content);
      else if (line.startsWith('Save failed:')) content = fg('error', content);
      else if (line.startsWith('Already changed:'))
        content = fg('warning', content);
      else if (line.startsWith('selected:') || line.startsWith('row:'))
        content = fg('accent', content);

      const padding = ' '.repeat(Math.max(0, innerWidth - measure(content)));
      const row = `${content}${padding}`;
      const filled = selected
        ? (options.theme?.bg('selectedBg', row) ?? row)
        : row;
      return `${fg('border', '│')} ${filled} ${fg('border', '│')}`;
    });
    return [truncate(top, panelWidth), ...body, truncate(bottom, panelWidth)];
  };

  return {
    render,
    handleInput,
    invalidate() {},
    getState: (): ToolsPanelState => structuredClone(state),
  };
}
