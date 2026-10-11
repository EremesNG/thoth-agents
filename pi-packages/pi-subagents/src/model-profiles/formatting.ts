import { resolveIcon } from '@thoth-agents/pi-core';
import {
  type PanelRowInput,
  type PanelTheme,
  padPanelText,
  panelHintRow,
  panelViewport,
  renderPanelFrame,
  truncatePanelText,
} from '@thoth-agents/pi-core/panel';
import { themeDim } from '../ui/theme.js';
import { globalSubagentsConfigPath } from './data.js';
import {
  isDraft,
  isEntryDirty,
  type ModelProfileWorkspace,
  type ProfileEntry,
  type ProfileMarkers,
} from './editor.js';

export function truncateToVisibleWidth(text: string, width: number): string {
  const clipped = truncatePanelText(text, width);
  // Keep plain-text callers plain while preserving the cell-aware truncation.
  const styled =
    text.includes('\u001b') || resolveIcon('ellipsis', '…').includes('\u001b');
  return styled ? clipped : clipped.replace(/\u001b\[0m/g, '');
}

/** Sidebar layout shared with `/subagents`: 25% of the width, 18–30 columns. */
export const SIDEBAR_MIN_WIDTH = 90;
export function sidebarWidthFor(width: number): number {
  return width >= SIDEBAR_MIN_WIDTH
    ? Math.max(18, Math.min(30, Math.floor(width * 0.25)))
    : 0;
}

export function scopeTag(entry: ProfileEntry): string {
  if (!entry.scope) return '';
  return entry.scope === 'project' ? '(local)' : '(global)';
}

export function markerLetters(markers: ProfileMarkers): string {
  return [
    markers.session ? 'S' : '',
    markers.project ? 'P' : '',
    markers.global ? 'G' : '',
  ]
    .filter(Boolean)
    .join('');
}

/** `● SPG name (scope) [state]`; ● marks the profile runs currently use. */
export function profileEntryLabel(
  entry: ProfileEntry,
  markers: ProfileMarkers,
  verbose = false,
): string {
  // The sidebar is narrow: `~` stands for shadowed (see PROFILE_LEGEND).
  const shadow = entry.shadowed ? (verbose ? ' [shadowed]' : '~') : '';
  return [
    `${markers.effective ? '●' : ' '} ${markerLetters(markers).padEnd(3)}`,
    `${entry.name}${isEntryDirty(entry) && !isDraft(entry) ? '*' : ''}`,
    scopeTag(entry) + shadow,
    isDraft(entry) ? '[draft]' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export const PROFILE_LEGEND = [
  '● effective',
  'S session  ~ shadow',
  'P pin  G global',
];

export function renderProfileSidebar(input: {
  rows: readonly PanelRowInput[];
  selected: number;
  width: number;
  height: number;
  theme?: PanelTheme;
}): string[] {
  const budget = Math.max(0, input.height - 2);
  const legend =
    budget >= input.rows.length + PROFILE_LEGEND.length + 1
      ? PROFILE_LEGEND.map((text) => panelHintRow(text))
      : [];
  const listBudget = Math.max(0, budget - legend.length);
  const viewport = panelViewport(input.rows.length, input.selected, listBudget);
  const visible = input.rows
    .slice(viewport.start, viewport.end)
    .map((row, offset) =>
      typeof row === 'string'
        ? { text: row, selected: viewport.start + offset === input.selected }
        : { ...row, selected: viewport.start + offset === input.selected },
    );
  const body: PanelRowInput[] = [
    ...visible,
    ...(viewport.notice ? [panelHintRow(viewport.notice)] : []),
  ];
  while (legend.length && body.length < budget - legend.length) body.push('');
  body.push(...legend);
  return renderPanelFrame({
    title: 'Profiles',
    rows: body,
    width: input.width,
    maxHeight: input.height,
    theme: input.theme,
  });
}

/** Join two framed columns row by row; the shorter side is padded. */
export function joinColumns(
  left: readonly string[],
  right: readonly string[],
  leftWidth: number,
  rightWidth: number,
): string[] {
  const height = Math.max(left.length, right.length);
  return Array.from(
    { length: height },
    (_, index) =>
      padPanelText(left[index] ?? '', leftWidth) +
      padPanelText(right[index] ?? '', rightWidth),
  );
}

export function describeEntry(
  entry: ProfileEntry,
  markers: ProfileMarkers,
  theme?: PanelTheme,
): string {
  if (!entry.scope)
    return `default ${themeDim(theme, '(read-only: definitions / config / session model)')}`;
  const parts = [
    `${entry.name} ${scopeTag(entry)}`,
    entry.shadowed ? 'shadowed by local profile' : '',
    isDraft(entry)
      ? 'draft: unsaved'
      : isEntryDirty(entry)
        ? 'unsaved edits'
        : '',
    markers.session ? 'session' : '',
    markers.project ? 'project pin' : '',
    markers.global ? 'global active' : '',
    markers.effective ? 'effective' : '',
  ].filter(Boolean);
  return parts.join(` ${resolveIcon('separator', '·')} `);
}

export function buildNonTuiModelProfilesMessage(
  workspace?: ModelProfileWorkspace,
  agentDir?: string,
): string {
  const lines = [
    `Subagent model profiles are edited in the Pi TUI (/subagents-model). Profiles live in ${globalSubagentsConfigPath(agentDir)} and <project>/.pi/thoth/profiles.json.`,
  ];
  if (workspace)
    for (const entry of workspace.entries()) {
      const markers = workspace.markers(entry);
      lines.push(`  ${profileEntryLabel(entry, markers, true)}`.trimEnd());
    }
  return lines.join('\n');
}
