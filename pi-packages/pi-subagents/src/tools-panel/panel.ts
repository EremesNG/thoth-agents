import { Input, matchesKey, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import {
  createListEditor,
  type ListEditor,
  type ListEditorRow,
  normalizePanelKey,
  PanelDiscardConfirmation,
  type PanelTheme,
  panelFg,
  panelHintRow,
  renderPanelFrame,
} from '@thoth-agents/pi-core/panel';
import {
  composeToolSelection,
  hasToolGlob,
  matchesToolPattern,
} from '../tool-patterns.js';
import type {
  ToolsConfigSnapshot,
  ToolsRoleInput,
  ToolsRoleSnapshot,
  ToolsSaveResult,
} from './config.js';
import {
  convertToolsDefinition,
  prepareToolsConversion,
  type ToolsConversionPlan,
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
  /** Re-read registration at confirmation; the displayed inventory is only a snapshot. */
  getRegisteredToolNames?(): readonly string[];
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
  let scope = baseline.initialScope ?? 'global';
  const drafts = {
    global: structuredClone(baseline.globalRoles ?? baseline.roles),
    project: structuredClone(baseline.roles).map((role) => ({
      ...role,
      overlay: role.overlay ?? { add: [], remove: [] },
    })),
  };
  let draft: ToolsRoleSnapshot[] = drafts[scope];
  // Navigation changes only the viewport. Rebuild domain-derived rows on edits,
  // never on cursor movement (the list editor also requests rows for input).
  let overviewRows: ListEditorRow[] | undefined;
  let pickerRows: ListEditorRow[] | undefined;
  let pendingChanges: number | undefined;
  let globalRoleNames = new Set(baseline.globalRoles?.map((role) => role.role));
  const selections = new Map<
    ToolsRoleSnapshot,
    {
      names: Set<string>;
      count: number;
      summary: string;
      base: string;
      manual: string;
    }
  >();
  const invalidateDerived = () => {
    overviewRows = undefined;
    pickerRows = undefined;
    pendingChanges = undefined;
    globalRoleNames = new Set(baseline.globalRoles?.map((role) => role.role));
    selections.clear();
  };
  let blocked: string | undefined;
  let changedRoles: string[] = [];
  let failedSave = false;
  let selectedRole = 0;
  let entryInput:
    | { input: Input; lane?: 'add' | 'remove'; error?: string }
    | undefined;
  const confirmation = new PanelDiscardConfirmation();
  let conversion:
    | { role: string; plan: Extract<ToolsConversionPlan, { eligible: true }> }
    | undefined;
  let conversionMessage: string | undefined;
  let confirmationOffset = 0;
  let confirmationLineCount = 0;
  const renderConversion = (width: number) => {
    const plan = conversion?.plan;
    const theme = options.theme;
    const inner = Math.max(1, width - 4);
    const globCount = (entry: string) => {
      const count = registeredNames.filter((name) =>
        matchesToolPattern(name, entry),
      ).length;
      return ` ${panelFg(theme, 'muted', `· ${count} ${count === 1 ? 'match' : 'matches'}`)}`;
    };
    const section = (
      title: string,
      tone: 'success' | 'error' | 'warning',
      marker: string,
      entries: readonly string[],
      suffix: (entry: string) => string = () => '',
    ): string[] =>
      entries.length
        ? [
            panelFg(theme, tone, theme?.bold?.(title) ?? title),
            ...entries.flatMap((entry) =>
              wrapTextWithAnsi(entry, Math.max(1, inner - 4)).map(
                (text, index, parts) =>
                  `  ${index ? ' ' : panelFg(theme, tone, marker)} ${text}${
                    index === parts.length - 1 ? suffix(entry) : ''
                  }`,
              ),
            ),
          ]
        : [];
    const add = plan?.overlay.add ?? [];
    const remove = plan?.overlay.remove ?? [];
    const withGlobCount = (entry: string) =>
      hasToolGlob(entry) ? globCount(entry) : '';
    const lines = [
      ...section('Will add to overlay', 'success', '+', add, withGlobCount),
      ...section('Will remove from tools', 'error', '−', remove),
      ...section(
        'Lost from project copy (kept in .bak)',
        'warning',
        '!',
        plan?.differences ?? [],
      ),
      ...(add.length || remove.length
        ? []
        : [panelFg(theme, 'muted', 'No tool changes.')]),
      panelFg(
        theme,
        'dim',
        'Future tools matched by global globs will now apply.',
      ),
    ];
    confirmationLineCount = lines.length;
    const height = options.maxHeight?.();
    const budget =
      height === undefined ? lines.length : Math.max(1, height - 3);
    const footer = `${panelFg(theme, 'warning', 'd convert (discards project copy)')}${panelFg(theme, 'muted', ' · k/esc cancel · ↑/↓ scroll')}`;
    return renderPanelFrame({
      title: `Convert project copy · ${conversion?.role}`,
      rows: [
        ...lines.slice(confirmationOffset, confirmationOffset + budget),
        footer,
      ],
      width,
      maxHeight: height,
      theme,
    });
  };
  const convertible = (role?: ToolsRoleSnapshot) =>
    scope === 'project' &&
    role?.scope === 'project' &&
    globalRoleNames.has(role.role);
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
  const changed = (role: ToolsRoleSnapshot, editScope = scope) => {
    const original = (
      editScope === 'global'
        ? (baseline.globalRoles ?? baseline.roles)
        : baseline.roles
    ).find((entry) => entry.role === role.role);
    return editScope === 'project'
      ? JSON.stringify(role.overlay ?? { add: [], remove: [] }) !==
          JSON.stringify(original?.overlay ?? { add: [], remove: [] })
      : !sameTools(role.tools, original?.tools ?? []);
  };
  const registeredNames = [
    ...new Set(options.discoveredTools.map((tool) => tool.name)),
  ];
  const manualEntries = (role: ToolsRoleSnapshot) =>
    role.tools.filter((name) => !editableNames.has(name));
  const matchDetail = (entry: string) => {
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
    return `${countHint}${caseHint}`;
  };
  const manualLabel = (entry: string) =>
    `Manual entries · ${entry} · ${matchDetail(entry)}`;
  const baseTools = (role: ToolsRoleSnapshot) =>
    role.scope === 'global'
      ? (drafts.global.find((entry) => entry.role === role.role)?.tools ??
        role.tools)
      : role.tools;
  const effective = (role: ToolsRoleSnapshot) =>
    scope === 'project'
      ? composeToolSelection(
          baseTools(role),
          registeredNames,
          role.overlay,
        ).filter((name) => !role.disallowedTools.includes(name))
      : role.tools;
  const selection = (role: ToolsRoleSnapshot) => {
    let cached = selections.get(role);
    if (!cached) {
      const names = effective(role);
      cached = {
        names: new Set(names),
        count: names.length,
        summary: names.join(', ') || '(none)',
        base: baseTools(role).join(', '),
        manual: manualEntries(role).join(', '),
      };
      selections.set(role, cached);
    }
    return cached;
  };
  const summary = (role: ToolsRoleSnapshot) => selection(role).summary;
  const reset = (role: ToolsRoleSnapshot) => {
    if (scope === 'project') role.overlay = { add: [], remove: [] };
    else if (role.defaultTools) role.tools = [...role.defaultTools];
    invalidateDerived();
  };
  const defaultsHint = (role?: ToolsRoleSnapshot) =>
    scope === 'project'
      ? ' · r clear overlay'
      : role?.defaultTools
        ? ' · r defaults'
        : '';
  const overlayRows = (role: ToolsRoleSnapshot) =>
    (['add', 'remove'] as const).flatMap((lane) =>
      (role.overlay?.[lane] ?? []).map((entry, index) => ({
        id: `${lane}:${index}`,
        label: `${lane} · ${entry}${hasToolGlob(entry) ? ` · ${matchDetail(entry)}` : ''}`,
      })),
    );
  const toolRows = (role: ToolsRoleSnapshot): ListEditorRow[] =>
    (pickerRows ??= [
      ...tools.map((tool) => ({
        id: tool.name,
        label: `${selection(role).names.has(tool.name) ? '[x]' : '[ ]'} ${tool.name}${tool.active ? '' : ' (inactive)'}${tool.description ? ` · ${tool.description}` : ''}`,
      })),
      ...(scope === 'project'
        ? overlayRows(role)
        : manualEntries(role).map((entry) => ({
            id: entry,
            label: manualLabel(entry),
          }))),
    ]);
  const toggleProject = (role: ToolsRoleSnapshot, name: string) => {
    role.overlay ??= { add: [], remove: [] };
    const overlay = role.overlay;
    blocked = undefined;
    if (effective(role).includes(name)) {
      overlay.add = overlay.add.filter((entry) => entry !== name);
      if (effective(role).includes(name)) overlay.remove.push(name);
    } else {
      const blocking = overlay.remove.find(
        (pattern) => pattern !== name && matchesToolPattern(name, pattern),
      );
      if (blocking) {
        blocked = `Blocked by remove pattern: ${blocking}`;
        return;
      }
      overlay.remove = overlay.remove.filter((entry) => entry !== name);
      if (!effective(role).includes(name)) overlay.add.push(name);
    }
  };

  const openRole = (editor: ListEditor) => {
    selectedRole = editor.getState().selectedIndex;
    const role = draft[selectedRole];
    if (!role) return;
    blocked = undefined;
    pickerRows = undefined;
    editor.openPicker({
      title: `Choose tools · ${role.role} · ${scope === 'project' ? 'Project' : 'Global'}`,
      hints: () =>
        `↑/↓/j/k move · space toggle · a add · d/delete remove${defaultsHint(role)} · enter/esc/q back`,
      navigation: 'wrap',
      maxVisibleRows: 10,
      header: () => [
        {
          text: `row: ${role.role} · ${selection(role).count} selected`,
          tone: 'accent',
        },
        ...(scope === 'project'
          ? [panelHintRow(`Base (read-only): ${selection(role).base}`)]
          : []),
        ...(blocked ? [panelHintRow(blocked)] : []),
        ...ORCHESTRATOR_NOTES.map((note) => panelHintRow(note)),
      ],
      rows: () => toolRows(role),
      footer: () => {
        const index = editor.getState().selectedIndex;
        const row = toolRows(role)[index];
        const selected =
          tools[index]?.name ?? (scope === 'project' ? row?.label : row?.id);
        return [{ text: `selected: ${selected ?? '(none)'}`, tone: 'accent' }];
      },
      onAction: (key, row) => {
        if (key === 'a' || (scope === 'project' && key === 'x')) {
          entryInput = {
            input: new Input({ prompt: key === 'x' ? 'remove: ' : 'add: ' }),
            lane: key === 'x' ? 'remove' : 'add',
          };
          return true;
        }
        if (
          (key === 'd' || matchesKey(key, 'delete')) &&
          row &&
          !editableNames.has(row.id)
        ) {
          if (scope === 'project') {
            const [lane, index] = row.id.split(':');
            if (lane === 'add' || lane === 'remove')
              role.overlay?.[lane].splice(Number(index), 1);
          } else role.tools = role.tools.filter((name) => name !== row.id);
          invalidateDerived();
          return true;
        }
        if (key === 'space' && row && editableNames.has(row.id)) {
          if (scope === 'project') toggleProject(role, row.id);
          else
            role.tools = role.tools.includes(row.id)
              ? role.tools.filter((name) => name !== row.id)
              : [...role.tools, row.id];
          invalidateDerived();
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
    pendingCount: () =>
      (pendingChanges ??=
        drafts.global.filter((role) => changed(role, 'global')).length +
        drafts.project.filter((role) => changed(role, 'project')).length),
    onCancel: () => options.onDone({ kind: 'cancelled' }),
    onSaved: () => options.onDone({ kind: 'saved', changedRoles }),
    onSave: () => {
      for (const editScope of ['global', 'project'] as const) {
        if (
          !drafts[editScope].some((role) => changed(role, editScope)) &&
          !failedSave
        )
          continue;
        const result = options.save(
          { ...baseline, editScope },
          structuredClone(drafts[editScope]),
        );
        baseline = result.snapshot;
        invalidateDerived();
        changedRoles = [...new Set([...changedRoles, ...result.changedRoles])];
        failedSave = !result.success;
        if (!result.success)
          return {
            success: false,
            error: result.error,
            warning: changedRoles.length
              ? `Already changed: ${changedRoles.join(', ')}`
              : undefined,
          };
      }
      return { success: true };
    },
    overview: {
      title: 'Subagent tools',
      hints: () =>
        `↑/↓/j/k move · enter/e edit · tab scope${defaultsHint(draft[editor.getState().selectedIndex])}${convertible(draft[editor.getState().selectedIndex]) ? ' · c convert' : ''} · s save · esc/q cancel`,
      header: ({ layout }) => [
        ...(conversionMessage ? [panelHintRow(conversionMessage)] : []),
        panelHintRow(
          `Scope: ${scope === 'project' ? 'Project' : 'Global'} · tab switch · target: ${scope === 'project' ? 'project tools overlay' : 'global definition tools'}`,
        ),
        layout === 'wide'
          ? `${'agent'.padEnd(18)}  ${'selected tools'.padEnd(18)}  tools`
          : 'agent · selected tools',
      ],
      rows: () =>
        (overviewRows ??= draft.map((role) => {
          const selected = selection(role);
          return {
            id: role.role,
            dirty: changed(role),
            label: ({ layout }) =>
              layout === 'wide'
                ? `${role.role.padEnd(16)}  ${`${selected.count} selected`.padEnd(18)}  ${selected.summary}`
                : `${role.role} · ${selected.count} selected · ${selected.summary}`,
          };
        })),
      footer: () => {
        const role = draft[editor.getState().selectedIndex];
        return [
          {
            text: `selected: ${role?.role ?? '(none)'} · tools: ${role ? summary(role) : '(none)'}`,
            tone: 'accent',
          },
          ...(scope === 'global' && role?.shadowedBy
            ? [
                panelHintRow(
                  `Warning: project copy hides this global change: ${role.shadowedBy}`,
                ),
              ]
            : []),
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
                ...(selection(role).manual.length
                  ? [
                      panelHintRow(
                        `Manual entries: ${selection(role).manual} (edit in picker)`,
                      ),
                    ]
                  : []),
              ]
            : []),
        ];
      },
      onAction: (key, _row, editor) => {
        if (key === 'c') {
          const role = draft[editor.getState().selectedIndex];
          if (!convertible(role) || !role) return true;
          if (
            drafts.global.some((role) => changed(role, 'global')) ||
            drafts.project.some((role) => changed(role, 'project'))
          ) {
            conversionMessage =
              'Save or discard unsaved tool edits before conversion.';
            return true;
          }
          try {
            const plan = prepareToolsConversion(
              baseline,
              role.role,
              registeredNames,
            );
            if (plan.eligible) {
              conversion = { role: role.role, plan };
              confirmationOffset = 0;
              confirmation.request(true);
            } else conversionMessage = plan.error;
          } catch (error) {
            conversionMessage =
              error instanceof Error ? error.message : String(error);
          }
          return true;
        }
        if (key === 'tab') {
          scope = scope === 'global' ? 'project' : 'global';
          draft = drafts[scope];
          invalidateDerived();
          blocked = undefined;
          return true;
        }
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
      conversion
        ? renderConversion(width)
        : entryInput
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
      if (conversion) {
        const key = normalizePanelKey(data);
        if (key === 'down' || key === 'j')
          confirmationOffset = Math.min(
            Math.max(0, confirmationLineCount - 1),
            confirmationOffset + 1,
          );
        else if (key === 'up')
          confirmationOffset = Math.max(0, confirmationOffset - 1);
        else {
          const action = confirmation.handleInput(data);
          if (action === 'discard') {
            const result = convertToolsDefinition(
              baseline,
              conversion.role,
              options.getRegisteredToolNames?.() ?? registeredNames,
              { plan: conversion.plan },
            );
            baseline = result.snapshot;
            drafts.global = structuredClone(
              baseline.globalRoles ?? baseline.roles,
            );
            drafts.project = structuredClone(baseline.roles).map((role) => ({
              ...role,
              overlay: role.overlay ?? { add: [], remove: [] },
            }));
            draft = drafts[scope];
            invalidateDerived();
            changedRoles = [
              ...new Set([...changedRoles, ...result.changedRoles]),
            ];
            conversionMessage = result.success
              ? 'Converted project copy to tools overlay. Backup retained beside the definition.'
              : result.error;
            conversion = undefined;
          } else if (action === 'resume') conversion = undefined;
        }
        options.requestRender?.();
        return;
      }
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
            const entries =
              scope === 'project'
                ? (role.overlay?.[active.lane ?? 'add'] ?? [])
                : role.tools;
            validateTools([candidate]);
            if (entries.includes(candidate))
              throw new Error(`Duplicate Subagent tool name: ${candidate}.`);
            const next = [...entries, candidate];
            if (scope === 'project')
              role.overlay?.[active.lane ?? 'add'].push(candidate);
            else role.tools = next;
            invalidateDerived();
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
        scope,
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
