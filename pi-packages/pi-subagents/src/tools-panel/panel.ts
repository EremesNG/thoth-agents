import { Input, matchesKey } from '@earendil-works/pi-tui';
import {
  createListEditor,
  type ListEditor,
  normalizePanelKey,
  type PanelTheme,
  panelHintRow,
  renderPanelFrame,
} from '@thoth-agents/pi-core/panel';
import { matchesToolPattern } from '../tool-patterns.js';
import type {
  ToolsConfigSnapshot,
  ToolsRoleInput,
  ToolsRoleSnapshot,
  ToolsSaveResult,
} from './config.js';
import { validateTools } from './frontmatter.js';

export type ToolsPanelResult =
  | { kind: 'cancelled' }
  | { kind: 'saved'; changedRoles: string[] };
export interface ToolsPanelDiscoveredTool {
  name: string;
  description?: string;
  active: boolean;
}
export interface ToolsPanelOptions {
  snapshot: ToolsConfigSnapshot;
  discoveredTools: readonly ToolsPanelDiscoveredTool[];
  save(
    snapshot: ToolsConfigSnapshot,
    roles: readonly ToolsRoleInput[],
  ): ToolsSaveResult;
  onDone(result: ToolsPanelResult): void;
  requestRender?(): void;
  maxHeight?(): number;
  theme?: PanelTheme;
}
const ORCHESTRATOR_NOTES = [
  'ask_orchestrator: child-provided; subject to enable_ask_orchestrator and disallowed_tools.',
  'notify_orchestrator: child-provided; subject to enable_notify_orchestrator and disallowed_tools.',
];
const sameTools = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify(left) === JSON.stringify(right);
export function isEligibleTool(name: string): boolean {
  if (/[*?[\]{}]/.test(name)) return false;
  try {
    validateTools([name]);
    return true;
  } catch {
    return false;
  }
}

export function createToolsPanel(options: ToolsPanelOptions) {
  let baseline = options.snapshot;
  const draft = structuredClone(baseline.roles);
  let changedRoles: string[] = [];
  let failedSave = false;
  let selectedRole = 0;
  let entryInput: { input: Input; error?: string } | undefined;
  const editableNames = new Set<string>();
  const tools = options.discoveredTools.filter((tool) => {
    if (
      tool.name === 'ask_orchestrator' ||
      tool.name === 'notify_orchestrator' ||
      !isEligibleTool(tool.name) ||
      editableNames.has(tool.name)
    )
      return false;
    editableNames.add(tool.name);
    return true;
  });
  const changed = (role: ToolsRoleSnapshot) =>
    !sameTools(
      role.tools,
      baseline.roles.find((original) => original.role === role.role)?.tools ??
        [],
    );
  const registeredNames = [
    ...new Set(options.discoveredTools.map((tool) => tool.name)),
  ];
  const manualEntries = (role: ToolsRoleSnapshot) =>
    role.tools.filter((name) => !editableNames.has(name));
  const manualLabel = (entry: string) => {
    const count = registeredNames.filter((name) =>
      matchesToolPattern(name, entry),
    ).length;
    const caseMatches = count
      ? []
      : registeredNames.filter((name) =>
          matchesToolPattern(name.toLowerCase(), entry.toLowerCase()),
        );
    const countHint = count
      ? `${count} ${count === 1 ? 'match' : 'matches'}`
      : '0 matches (expected if tool/server is not registered)';
    const caseHint = caseMatches.length
      ? ` · Case-sensitive; check: ${caseMatches.join(', ')}`
      : '';
    return `Manual entries · ${entry} · ${countHint}${caseHint}`;
  };
  const summary = (role: ToolsRoleSnapshot) =>
    role.tools.join(', ') || '(none)';
  const reset = (role: ToolsRoleSnapshot) => {
    if (role.defaultTools) role.tools = [...role.defaultTools];
  };
  const defaultsHint = (role?: ToolsRoleSnapshot) =>
    role?.defaultTools ? ' · r defaults' : '';

  const openRole = (editor: ListEditor) => {
    selectedRole = editor.getState().selectedIndex;
    const role = draft[selectedRole];
    if (!role) return;
    editor.openPicker({
      title: `Choose tools · ${role.role}`,
      hints: () =>
        `↑/↓/j/k move · space toggle · a add · d/delete remove${defaultsHint(role)} · enter/esc/q back`,
      navigation: 'wrap',
      maxVisibleRows: 10,
      header: () => [
        {
          text: `row: ${role.role} · ${role.tools.length} selected`,
          tone: 'accent',
        },
        ...ORCHESTRATOR_NOTES.map((note) => panelHintRow(note)),
      ],
      rows: () => [
        ...tools.map((tool) => ({
          id: tool.name,
          label: `${role.tools.includes(tool.name) ? '[x]' : '[ ]'} ${tool.name}${tool.active ? '' : ' (inactive)'}${tool.description ? ` · ${tool.description}` : ''}`,
        })),
        ...manualEntries(role).map((entry) => ({
          id: entry,
          label: manualLabel(entry),
        })),
      ],
      footer: () => [
        {
          text: `selected: ${tools[editor.getState().selectedIndex]?.name ?? manualEntries(role)[editor.getState().selectedIndex - tools.length] ?? '(none)'}`,
          tone: 'accent',
        },
      ],
      onAction: (key, row) => {
        if (key === 'a') {
          entryInput = { input: new Input({ prompt: 'tool: ' }) };
          return true;
        }
        if (
          (key === 'd' || matchesKey(key, 'delete')) &&
          row &&
          !editableNames.has(row.id)
        ) {
          role.tools = role.tools.filter((name) => name !== row.id);
          return true;
        }
        if (key === 'space' && row && editableNames.has(row.id)) {
          role.tools = role.tools.includes(row.id)
            ? role.tools.filter((name) => name !== row.id)
            : [...role.tools, row.id];
          return true;
        }
        if (key.toLowerCase() === 'r') {
          reset(role);
          return true;
        }
        return false;
      },
    });
  };
  const editor = createListEditor({
    wideBreakpoint: 84,
    maxHeight: options.maxHeight,
    theme: options.theme,
    requestRender: options.requestRender,
    pendingCount: () => draft.filter(changed).length,
    onCancel: () => options.onDone({ kind: 'cancelled' }),
    onSaved: () => options.onDone({ kind: 'saved', changedRoles }),
    onSave: () => {
      if (!draft.some(changed) && !failedSave) return { success: true };
      const result = options.save(baseline, structuredClone(draft));
      baseline = result.snapshot;
      changedRoles = [...new Set([...changedRoles, ...result.changedRoles])];
      failedSave = !result.success;
      return {
        success: result.success,
        error: result.error,
        warning: changedRoles.length
          ? `Already changed: ${changedRoles.join(', ')}`
          : undefined,
      };
    },
    overview: {
      title: 'Subagent tools',
      hints: () =>
        `↑/↓/j/k move · enter/e edit${defaultsHint(draft[editor.getState().selectedIndex])} · s save · esc/q cancel`,
      header: ({ layout }) => [
        panelHintRow('target: resolved subagent definition tools'),
        layout === 'wide'
          ? `${'agent'.padEnd(18)}  ${'selected tools'.padEnd(18)}  tools`
          : 'agent · selected tools',
      ],
      rows: () =>
        draft.map((role) => ({
          id: role.role,
          dirty: changed(role),
          label: ({ layout }) =>
            layout === 'wide'
              ? `${role.role.padEnd(16)}  ${`${role.tools.length} selected`.padEnd(18)}  ${summary(role)}`
              : `${role.role} · ${role.tools.length} selected · ${summary(role)}`,
        })),
      footer: () => {
        const role = draft[editor.getState().selectedIndex];
        return [
          {
            text: `selected: ${role?.role ?? '(none)'} · tools: ${role ? summary(role) : '(none)'}`,
            tone: 'accent',
          },
          panelHintRow(`Global directory: ${baseline.piRoot}`),
          panelHintRow('Ambient root tools are unchanged.'),
          panelHintRow(
            'Native settings or project definitions may override these global definitions.',
          ),
          panelHintRow(
            'Child specialists do not inherit root tools automatically.',
          ),
          ...ORCHESTRATOR_NOTES.map((note) => panelHintRow(note)),
          ...(role
            ? [
                panelHintRow(`Definition: ${role.scope} · ${role.filePath}`),
                ...(manualEntries(role).length
                  ? [
                      panelHintRow(
                        `Manual entries: ${manualEntries(role).join(', ')} (edit in picker)`,
                      ),
                    ]
                  : []),
              ]
            : []),
        ];
      },
      onAction: (key, _row, editor) => {
        if (key === 'enter' || key === 'e') {
          openRole(editor);
          return true;
        }
        if (key.toLowerCase() === 'r') {
          const role = draft[editor.getState().selectedIndex];
          if (role) reset(role);
          return true;
        }
        return false;
      },
    },
  });
  return {
    render: (width: number) =>
      entryInput
        ? renderPanelFrame({
            title: `Add tool entry · ${draft[selectedRole]?.role}`,
            rows: [
              panelHintRow(
                'type a name or glob · ctrl+u clear · enter confirm · esc cancel',
              ),
              ...entryInput.input.render(Math.max(0, width - 4)),
              ...(entryInput.error
                ? [{ text: entryInput.error, tone: 'error' as const }]
                : []),
            ],
            width,
            maxHeight: options.maxHeight?.(),
            theme: options.theme,
          })
        : editor.render(width),
    handleInput: (data: string) => {
      const active = entryInput;
      if (!active) return editor.handleInput(data);
      const key = normalizePanelKey(data);
      if (key === 'escape') entryInput = undefined;
      else if (key === 'enter') {
        const candidate = active.input.getValue().trim();
        const role = draft[selectedRole];
        if (!candidate || !role) entryInput = undefined;
        else {
          try {
            const next = [...role.tools, candidate];
            validateTools(next);
            role.tools = next;
            entryInput = undefined;
          } catch (error) {
            active.error =
              error instanceof Error ? error.message : String(error);
          }
        }
      } else if (key === 'ctrl+u') active.input.setValue('');
      else active.input.handleInput(data);
      options.requestRender?.();
    },
    invalidate: () => editor.invalidate(),
    getState: () => {
      const state = editor.getState();
      return {
        screen: state.view === 'picker' ? 'tools' : state.view,
        selectedRole:
          state.view === 'picker' ? selectedRole : state.selectedIndex,
        draft: structuredClone(draft),
        error: state.error,
        changedRoles: [...changedRoles],
      };
    },
  };
}
