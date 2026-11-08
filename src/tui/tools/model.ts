/** Pure view-model for the `/subagents-tools` panel: no dialogs, no RPC. */
import type { ToolState } from '../../opencode/tool-rpc';

export type ToolRole = ToolState['specialists'][number];
export type RoleState = ToolState['roles'][number];
export type Scope = 'global' | 'project';
export type Effect = 'allow' | 'ask' | 'deny';
export interface Override {
  action: string;
  effect: Effect;
}

export const LOCKED_ACTION = 'subagent';
export const LOCKED_MESSAGE =
  'subagent is locked: specialists can never delegate, so it cannot be changed.';

/** Mirrors OpenCode wildcard semantics (`src/opencode/tool-overrides/wildcard.ts`) without pulling in fs code. */
export function matchAction(
  input: string,
  pattern: string,
  platform: string = typeof process === 'undefined' ? '' : process.platform,
): boolean {
  const normalized = input.replaceAll('\\', '/');
  let escaped = pattern
    .replaceAll('\\', '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  if (escaped.endsWith(' .*')) escaped = `${escaped.slice(0, -3)}( .*)?`;
  return new RegExp(`^${escaped}$`, platform === 'win32' ? 'si' : 's').test(
    normalized,
  );
}

/** Inherit removes every exact entry, leaving broader patterns intact. */
export const removeOverride = (
  overrides: readonly Override[],
  action: string,
): Override[] =>
  overrides.filter((entry) => entry.action !== action).map((e) => ({ ...e }));

/** Explicit choices go last so broader patterns cannot supersede the edit. */
export const setOverride = (
  overrides: readonly Override[],
  value: Override,
): Override[] => [...removeOverride(overrides, value.action), { ...value }];

export const hasWildcard = (pattern: string): boolean => /[*?]/.test(pattern);

export const roleOf = (state: ToolState, role: ToolRole): RoleState => {
  const found = state.roles.find((item) => item.role === role);
  if (!found) throw new Error(`Unknown role ${role}`);
  return found;
};

const stripCounts = (
  entries: readonly (Override & { matchCount?: number })[],
): Override[] => entries.map(({ action, effect }) => ({ action, effect }));

export interface ToolDraft {
  role: ToolRole;
  scope: Scope;
  /** Overrides as last saved/loaded, for dirty detection. */
  base: Override[];
  overrides: Override[];
  /** Whether the scope has an entry for the role (absent differs from an explicit empty list). */
  present: boolean;
  basePresent: boolean;
  revision: string;
}

/** Overrides of the given scope; used when opening a draft. */
export function openDraft(
  state: ToolState,
  role: ToolRole,
  scope: Scope,
): ToolDraft {
  const view = roleOf(state, role)[scope];
  const overrides = stripCounts(view.overrides);
  return {
    role,
    scope,
    base: structuredClone(overrides),
    overrides: structuredClone(overrides),
    present: view.present,
    basePresent: view.present,
    revision: view.revision,
  };
}

export const isDirty = (draft: ToolDraft): boolean =>
  draft.present !== draft.basePresent ||
  JSON.stringify(draft.base) !== JSON.stringify(draft.overrides);

/** Replaces the draft overrides; a changed project list makes the project entry present. */
export function applyOverrides(draft: ToolDraft, next: Override[]): void {
  if (JSON.stringify(next) !== JSON.stringify(draft.overrides)) {
    draft.overrides = next;
    if (draft.scope === 'project') draft.present = true;
  }
}

/** Makes an absent project entry an explicit empty list that masks global overrides. */
export function maskGlobal(draft: ToolDraft): void {
  if (draft.scope === 'project') draft.present = true;
}

export interface EffectiveLayer {
  /** Scope whose overrides apply after saving the draft. */
  scope: 'default' | Scope;
  overrides: Override[];
  /** False when the edited scope would be shadowed by a project entry. */
  controls: boolean;
}

/** Layering: a present project entry (even empty) replaces global entirely. */
export function effectiveLayer(
  state: ToolState,
  draft: ToolDraft,
): EffectiveLayer {
  const role = roleOf(state, draft.role);
  if (draft.scope === 'project') {
    if (draft.present)
      return { scope: 'project', overrides: draft.overrides, controls: true };
    return {
      scope: role.global.present ? 'global' : 'default',
      overrides: stripCounts(role.global.overrides),
      controls: false,
    };
  }
  if (role.project.present)
    return {
      scope: 'project',
      overrides: stripCounts(role.project.overrides),
      controls: false,
    };
  return { scope: 'global', overrides: draft.overrides, controls: true };
}

/** True when the edited scope is shadowed by a present project entry. */
export const isInactiveScope = (state: ToolState, draft: ToolDraft): boolean =>
  draft.scope === 'global' && roleOf(state, draft.role).project.present;

/** Status line for the role view title. */
export function scopeStatus(state: ToolState, draft: ToolDraft): string {
  if (isInactiveScope(state, draft))
    return 'INACTIVE PREVIEW: project controls this role, global edits do not apply here';
  if (draft.scope === 'project' && !draft.present)
    return 'project entry absent: global applies';
  if (draft.scope === 'project' && !draft.overrides.length)
    return 'project masks global overrides';
  return 'effective after save';
}

/** Scope to preselect: the role's effective scope, else global. */
export const defaultScope = (role: RoleState): Scope =>
  role.effectiveScope === 'default' ? 'global' : role.effectiveScope;

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/** `2 denied, 1 ask` over the overrides in force for a role. */
export function roleSummary(role: RoleState): string {
  if (role.effectiveScope === 'default') return 'defaults';
  const entries = role[role.effectiveScope].overrides;
  if (!entries.length) return 'no overrides';
  const parts: string[] = [];
  const count = (effect: Effect) =>
    entries.filter((entry) => entry.effect === effect).length;
  if (count('deny')) parts.push(`${count('deny')} denied`);
  if (count('ask')) parts.push(`${count('ask')} ask`);
  if (count('allow')) parts.push(`${count('allow')} allowed`);
  return parts.join(', ');
}

export const scopeMarker = (role: RoleState): string =>
  role.effectiveScope === 'global'
    ? 'G'
    : role.effectiveScope === 'project'
      ? 'P'
      : ' ';

export function overviewTitle(role: RoleState): string {
  const count =
    role.effectiveScope === 'default'
      ? 0
      : role[role.effectiveScope].overrides.length;
  return `${scopeMarker(role).padEnd(1)} ${role.role.padEnd(10)} ${plural(count, 'override')}`;
}

export const OVERVIEW_LEGEND = 'G global · P project · project replaces global';

export interface ActionRow {
  action: string;
  tools: string[];
  locked: boolean;
  effect: Effect;
  /** `default` for untouched values, `entry` for exact entries, `pattern` for wildcard matches. */
  source: 'default' | 'entry' | 'pattern';
  via?: string;
  /** Scope that supplies the shown effect after save. */
  origin: 'default' | Scope;
  /** Scope being edited. */
  editScope: Scope;
  /** True when a project entry shadows the edited global scope. */
  inactive: boolean;
  /** Effect the edited scope would give on its own while it is inactive. */
  scopeEffect?: Effect;
  /** True when the value differs from what state reports as saved. */
  changed: boolean;
}

/** Last matching entry, or undefined. */
const lastMatch = (
  overrides: readonly Override[],
  action: string,
  platform: string,
): Override | undefined => {
  let match: Override | undefined;
  for (const entry of overrides)
    if (matchAction(action, entry.action, platform)) match = entry;
  return match;
};

/** Preview the effective layer after save, over shipped effects, last-match-wins. */
export function previewRows(state: ToolState, draft: ToolDraft): ActionRow[] {
  const role = roleOf(state, draft.role);
  const platform = typeof process === 'undefined' ? '' : process.platform;
  const layer = effectiveLayer(state, draft);
  const dirty = isDirty(draft);
  return state.inventory.map((item) => {
    const current = role.actions.find((a) => a.action === item.action);
    const locked = item.locked || current?.locked === true;
    if (locked)
      return {
        action: item.action,
        tools: item.tools,
        locked: true,
        effect: current?.effect ?? 'deny',
        source: 'default',
        origin: 'default',
        editScope: draft.scope,
        inactive: false,
        changed: false,
      };
    const match = lastMatch(layer.overrides, item.action, platform);
    const base = current?.baseEffect ?? 'ask';
    const effect = match?.effect ?? base;
    const source: ActionRow['source'] = !match
      ? 'default'
      : match.action === item.action
        ? 'entry'
        : 'pattern';
    const own = layer.controls
      ? undefined
      : (lastMatch(draft.overrides, item.action, platform)?.effect ?? base);
    return {
      action: item.action,
      tools: item.tools,
      locked: false,
      effect,
      source,
      via: source === 'pattern' ? match?.action : undefined,
      origin: match
        ? layer.scope === 'default'
          ? 'default'
          : layer.scope
        : 'default',
      editScope: draft.scope,
      inactive: draft.scope === 'global' && !layer.controls,
      scopeEffect: draft.scope === 'global' ? own : undefined,
      changed: dirty && effect !== current?.effect,
    };
  });
}

export function rowTitle(row: ActionRow): string {
  const mark = row.locked
    ? '🔒'
    : row.source === 'default'
      ? '·'
      : row.source === 'entry'
        ? '●'
        : '○';
  return `${mark} ${row.effect.padEnd(5)} ${row.action}${row.changed ? ' *' : ''}`;
}

export function rowDescription(row: ActionRow): string {
  const origin = row.locked
    ? 'locked'
    : row.source === 'default'
      ? 'default (inherited)'
      : row.source === 'entry'
        ? 'override'
        : `via ${row.via}`;
  const tools = row.tools.length ? row.tools.join(', ') : 'no tools';
  const from =
    row.origin !== 'default' && row.origin !== row.editScope
      ? `${row.origin} `
      : '';
  const alone = row.inactive ? ` · global alone would ${row.scopeEffect}` : '';
  return `${from}${origin}${alone} · ${tools}`;
}

export const ROLE_LEGEND = '● override · ○ via pattern · · default · 🔒 locked';

export interface ManualEntry extends Override {
  matchCount: number;
}

/** Number of inventory actions an entry matches. */
export const countMatches = (state: ToolState, pattern: string): number => {
  const platform = typeof process === 'undefined' ? '' : process.platform;
  return state.inventory.filter((item) =>
    matchAction(item.action, pattern, platform),
  ).length;
};

/** Entries that are wildcards or name no registered action (e.g. disconnected MCP servers). */
export function manualEntries(
  state: ToolState,
  draft: ToolDraft,
): ManualEntry[] {
  const known = new Set(state.inventory.map((item) => item.action));
  const saved = roleOf(state, draft.role)[draft.scope].overrides;
  return draft.overrides
    .filter((entry) => hasWildcard(entry.action) || !known.has(entry.action))
    .map((entry) => ({
      ...entry,
      // Saved patterns use host matching semantics; only new patterns need a local estimate.
      matchCount:
        saved.find((item) => item.action === entry.action)?.matchCount ??
        countMatches(state, entry.action),
    }));
}

export const entryDescription = (entry: ManualEntry): string =>
  `matches ${plural(entry.matchCount, 'action')}${
    entry.matchCount === 0 ? ' (no registered tool)' : ''
  }`;

export function validatePattern(raw: string): string | undefined {
  const pattern = raw.trim();
  if (!pattern) return 'Enter a tool action or a wildcard pattern.';
  if (pattern === LOCKED_ACTION) return LOCKED_MESSAGE;
  return undefined;
}

/** Case-insensitive search over title and description. */
export function searchOptions<
  T extends { title: string; description?: string; value: unknown },
>(query: string, options: readonly T[]): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return options.filter((option) => {
    const text = `${option.title} ${option.description ?? ''}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
