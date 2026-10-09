import {
  getRenderKit,
  type RenderKitTheme,
  type RenderStatus,
  resolveFrames,
  resolveIcon,
  resolveStatusGlyph,
} from './render-kit.js';
import type {
  WorkPanelItemState,
  WorkPanelProvider,
  WorkPanelRow,
  WorkPanelRowContent,
  WorkPanelSegment,
  WorkPanelSegmentRole,
  WorkPanelSummary,
} from './work-panel.js';
import type { WorkPanelLifecycleState } from './work-panel-lifecycle.js';

export const WORK_PANEL_ANIMATION_INTERVAL_MS = 100;

const DONE_LINGER_MS = 10_000;
const FAILED_MIN_LINGER_MS = 30_000;

export interface PanelRow {
  provider: WorkPanelProvider;
  row: WorkPanelRow;
  key: string;
  parent?: boolean;
  /** Selectable heading rendered in-place, never counted as an item or extra body line. */
  sectionHeading?: boolean;
  /** Provider-level action (collapsed history, opted-in heading or summary). */
  sectionSummary?: boolean;
}
export interface PanelSection {
  provider: WorkPanelProvider;
  rows: PanelRow[];
  collapsed?: boolean;
  counts?: { done: number; failed: number };
}

/** Provider-level actions opt in; ordinary items and collapsed histories are selectable. */
export function isSelectablePanelRow(entry: PanelRow): boolean {
  return entry.sectionSummary === true || !entry.row.summary;
}

/** A failed provider cannot hide unrelated sections or break the editor. */
export function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

export function singleLine(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').trim();
}

/** Parents and no-op providers expose no close action in either panel or detail. */
export function panelCloseLabel(entry: PanelRow | undefined): string {
  if (!entry || entry.parent || entry.sectionSummary) return '';
  return safely(() => singleLine(entry.provider.armCloseLabel(entry.row)), '');
}

export function panelSections(
  providers: WorkPanelProvider[],
  now: number,
  lifecycle?: WorkPanelLifecycleState,
): PanelSection[] {
  const sections: PanelSection[] = [];
  for (const provider of [...providers].sort(
    (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
  )) {
    const rows = safely(() => provider.listRows(now), []);
    const parent = safely(() => provider.parentRow?.(now), undefined);
    if (provider.retention !== 'prompt' && !rows.length && !parent) continue;
    if (!safely(() => provider.showSection?.(rows, now) ?? true, false))
      continue;
    if (provider.retention === 'prompt') {
      const items = rows.filter((row) => !row.summary);
      const summary = safely(() => provider.summary?.(), undefined);
      const counts = {
        done:
          typeof summary === 'object' && summary.completed !== undefined
            ? summary.completed
            : items.filter((row) => itemState(row) === 'done').length,
        failed:
          typeof summary === 'object' && summary.failed !== undefined
            ? summary.failed
            : items.filter((row) => itemState(row) === 'failed').length,
      };
      const done = new Set(
        items
          .filter((row) => itemState(row) === 'done' && lingers(row, now))
          .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
          .slice(0, 3),
      );
      const eligible = items.filter(
        (row) =>
          itemState(row) === 'running' ||
          (itemState(row) === 'failed' &&
            (endedInEpoch(row, lifecycle?.epochStartedAt ?? now) ||
              lingers(row, now))) ||
          done.has(row),
      );
      if (!eligible.length) {
        if (!counts.done && !counts.failed) continue;
        sections.push({
          provider,
          collapsed: true,
          counts,
          rows: [
            {
              provider,
              row: { id: 'history', primary: provider.label, summary: true },
              key: JSON.stringify([provider.id, null]),
              sectionSummary: true,
            },
          ],
        });
        continue;
      }
      sections.push({
        provider,
        counts,
        rows: eligible.map((row) => ({
          provider,
          row,
          key: JSON.stringify([provider.id, row.id]),
        })),
      });
      continue;
    }
    sections.push({
      provider,
      rows: [
        ...(parent ? [{ row: parent, parent: true }] : []),
        ...rows
          .filter((row) => row.expiresAt === undefined || row.expiresAt > now)
          .map((row) => ({ row })),
      ].map((entry) => ({
        ...entry,
        provider,
        key: JSON.stringify([provider.id, entry.row.id]),
      })),
    });
  }
  return sections
    .filter((section) => section.rows.length)
    .map((section) => {
      if (section.collapsed) return section;
      const { provider } = section;
      return {
        ...section,
        rows: [
          ...(provider.selectableHeading
            ? [
                {
                  provider,
                  row: {
                    id: 'heading',
                    primary: provider.label,
                    summary: true,
                  },
                  key: JSON.stringify([provider.id, null, 'heading']),
                  sectionHeading: true,
                  sectionSummary: true,
                },
              ]
            : []),
          ...section.rows.map((entry) => ({
            ...entry,
            sectionSummary:
              entry.row.summary && provider.selectableSummary
                ? true
                : undefined,
          })),
        ],
      };
    });
}

/** Internal scheduling seam: only finite terminal timestamps have a linger boundary. */
export function panelLingerEndsAt(row: WorkPanelRow): number | undefined {
  if (row.endedAt === undefined || !Number.isFinite(row.endedAt))
    return undefined;
  const state = itemState(row);
  if (state === 'done') return row.endedAt + DONE_LINGER_MS;
  if (state === 'failed') return row.endedAt + FAILED_MIN_LINGER_MS;
  return undefined;
}

function lingers(row: WorkPanelRow, now: number): boolean {
  const endsAt = panelLingerEndsAt(row);
  return endsAt !== undefined && now < endsAt;
}

function endedInEpoch(row: WorkPanelRow, epochStartedAt: number): boolean {
  return (
    row.endedAt !== undefined &&
    Number.isFinite(row.endedAt) &&
    row.endedAt >= epochStartedAt
  );
}

/** Retention state is separate from presentation; queued/stopping stay live. */
function itemState(row: WorkPanelRow): WorkPanelItemState | undefined {
  if (['queued', 'stopping'].includes(row.status ?? '')) return 'running';
  if (row.state) return row.state;
  const status = workPanelRenderStatus(row);
  if (status === 'running' || status === 'in_progress') return 'running';
  if (status === 'failed' || row.status === 'timed_out') return 'failed';
  if (status === 'completed') return 'done';
  return undefined;
}

function summarySegments(
  summary: WorkPanelSummary | string | undefined,
  rows: PanelRow[],
): readonly WorkPanelSegment[] {
  if (typeof summary === 'string')
    return [{ text: singleLine(summary), role: 'meta' }];
  if (summary?.segments) return summary.segments;
  if (summary?.text !== undefined)
    return [{ text: singleLine(summary.text), role: 'meta' }];
  if (summary?.total !== undefined && summary.completed !== undefined)
    return [
      { text: `${summary.completed}/${summary.total} done`, role: 'meta' },
    ];
  const parts: WorkPanelSegment[] = [];
  if (summary?.running !== undefined)
    parts.push({ text: `${summary.running} running`, role: 'meta' });
  if (summary?.failed) {
    if (parts.length)
      parts.push({ text: ` ${resolveIcon('separator', '·')} `, role: 'meta' });
    parts.push({ text: `${summary.failed} failed`, role: 'error' });
  }
  return parts.length
    ? parts
    : [{ text: `${rows.length} items`, role: 'meta' }];
}

function overflowCounts(
  provider: WorkPanelProvider,
  items: PanelRow[],
  chosen: PanelRow[],
) {
  const hidden = items.filter((entry) => !chosen.includes(entry));
  const preferred = provider.droppedSummary
    ? hidden.filter(({ row }) => row.dropFirst).length
    : 0;
  const other = hidden.length - preferred;
  return { preferred, other, lines: Number(preferred > 0) + Number(other > 0) };
}

function overflowKey(provider: WorkPanelProvider, id: string): string {
  return JSON.stringify([provider.id, null, id]);
}

function overflowRows(
  provider: WorkPanelProvider,
  items: PanelRow[],
  chosen: PanelRow[],
  combine = false,
  selectedKey?: string,
): PanelRow[] {
  const { preferred, other } = overflowCounts(provider, items, chosen);
  let rows: WorkPanelRow[] = [
    ...(preferred
      ? [
          {
            id: 'overflow-drop-first',
            primary:
              safely(
                () => singleLine(provider.droppedSummary?.(preferred) ?? ''),
                '',
              ) || `+${preferred} more`,
            summary: true,
          },
        ]
      : []),
    ...(other
      ? [{ id: 'overflow-more', primary: `+${other} more`, summary: true }]
      : []),
  ];
  if (combine && rows.length > 1) {
    rows = [
      {
        id:
          selectedKey === overflowKey(provider, 'overflow-more')
            ? 'overflow-more'
            : 'overflow-drop-first',
        primary: rows
          .map((row) => row.primary)
          .join(` ${resolveIcon('separator', '·')} `),
        summary: true,
      },
    ];
  }
  return rows.map((row) => ({
    provider,
    row,
    key: overflowKey(provider, row.id),
    sectionSummary: provider.selectableSummary,
  }));
}

const segmentRoles = {
  primary: 'toolTitle',
  secondary: 'text',
  meta: 'dim',
  dim: 'dim',
  accent: 'accent',
  warning: 'warning',
  error: 'error',
  success: 'success',
  muted: 'muted',
  completed: 'dim',
} as const;

function glyphRole(
  row: WorkPanelRow,
  status: RenderStatus,
): WorkPanelSegmentRole {
  if (row.statusGlyphRole) return row.statusGlyphRole;
  if (row.statusTone === 'muted') return 'muted';
  if (status === 'running' || status === 'in_progress') return 'accent';
  if (status === 'failed') return 'error';
  if (status === 'completed') return 'success';
  if (['cancelled', 'interrupted', 'deleted'].includes(status)) return 'muted';
  if (status === 'blocked' || status === 'stopping') return 'warning';
  return 'secondary';
}

const nativeGlyphs = {
  running: '◐',
  in_progress: '◐',
  completed: '✓',
  failed: '✗',
  pending: '○',
  queued: '○',
  stopping: '■',
  cancelled: '■',
  interrupted: '■',
  deleted: '⊘',
  blocked: '⊘',
  unknown: '?',
};

const shrinkOrder: readonly WorkPanelSegmentRole[] = [
  'secondary',
  'primary',
  'dim',
  'completed',
  'muted',
  'meta',
  'accent',
  'success',
  'warning',
  'error',
];
const segmentText = (segments: readonly WorkPanelSegment[]) =>
  segments.map(({ text }) => text).join('');

type Measure = (text: string) => number;
const defaultMeasure: Measure = (text) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: optional-peer fallback measures ANSI-styled headings.
  [...text.replace(/\x1b\[[0-9;]*m/g, '')].length;

function truncateData(
  text: string,
  width: number,
  measure: Measure,
  ellipsis = resolveIcon('ellipsis', '…'),
): string {
  if (measure(text) <= width) return text;
  if (width <= 0) return '';
  let prefix = '';
  const suffix = measure(ellipsis) <= width ? ellipsis : '';
  for (const character of text) {
    if (measure(prefix + character + suffix) > width) break;
    prefix += character;
  }
  return prefix + suffix;
}

function fitIdentity(
  segments: readonly WorkPanelSegment[],
  width: number,
  measure: Measure,
): WorkPanelSegment[] {
  const parts = segments.map((segment) => ({ ...segment }));
  const attention = parts.filter(
    ({ role }) => role === 'warning' || role === 'error',
  );
  if (attention.length && width <= measure(segmentText(attention))) {
    const text = segmentText(attention);
    const separator = ` ${resolveIcon('separator', '·')} `;
    const label = text.startsWith(separator)
      ? text.slice(separator.length)
      : text.trimStart();
    return [
      {
        text: truncateData(label, width, measure, ''),
        role: attention[0].role,
      },
    ];
  }
  let excess = measure(segmentText(parts)) - width;
  for (const role of shrinkOrder) {
    for (const part of parts) {
      if (excess <= 0) break;
      if (part.role !== role) continue;
      const before = measure(part.text);
      part.text = truncateData(
        part.text,
        Math.max(0, before - excess),
        measure,
      );
      excess -= before - measure(part.text);
    }
  }
  return parts;
}

/** Wrap plain semantic segments at whitespace, retaining roles and cell boundaries. */
function wrapSegments(
  segments: readonly WorkPanelSegment[],
  width: number,
  measure: Measure,
): WorkPanelSegment[][] {
  if (width <= 0) return [];
  type Cell = { text: string; role: WorkPanelSegmentRole };
  const lines: Cell[][] = [];
  let current: Cell[] = [];
  for (const segment of segments) {
    for (const text of segment.text) {
      if (measure(current.map((cell) => cell.text).join('') + text) > width) {
        let space = current.length - 1;
        while (space >= 0 && !/\s/u.test(current[space].text)) space -= 1;
        if (space >= 0) {
          lines.push(current.slice(0, space));
          current = current.slice(space + 1);
        } else {
          lines.push(current);
          current = [];
        }
      }
      if (current.length || !/\s/u.test(text))
        current.push({ text, role: segment.role });
    }
  }
  if (current.length) lines.push(current);
  return lines
    .filter((line) => line.length)
    .map((line) => {
      while (line.length && /\s/u.test(line.at(-1)?.text ?? '')) line.pop();
      const parts: WorkPanelSegment[] = [];
      for (const cell of line) {
        const previous = parts.at(-1);
        if (previous?.role === cell.role) previous.text += cell.text;
        else parts.push({ ...cell });
      }
      return parts;
    });
}

function responsiveContent(
  row: WorkPanelRow,
  width: number,
  measure: Measure,
): WorkPanelRowContent {
  const identity: readonly WorkPanelSegment[] = row.identity ??
    row.segments ?? [{ text: row.primary, role: 'primary' }];
  const separator: WorkPanelSegment = {
    text: ` ${resolveIcon('separator', '·')} `,
    role: 'meta',
  };
  const joinGroups = (groups: readonly (readonly WorkPanelSegment[])[]) =>
    groups.flatMap((group, index) =>
      index ? [separator, ...group] : [...group],
    );
  const metrics = (row.metrics ?? []).map(({ segments }) => segments);
  const metricSegments = joinGroups(metrics);
  const inlineWidth =
    width - measure(segmentText(metricSegments)) - measure(separator.text);
  const minIdentity =
    identity
      .filter(({ role }) => role !== 'secondary')
      .reduce((sum, { text }) => sum + measure(text), 0) +
    (identity.some(({ role, text }) => role === 'secondary' && text)
      ? measure(separator.text) + 1
      : 0);
  const inline = metrics.length > 0 && inlineWidth >= minIdentity;
  const segments = fitIdentity(identity, inline ? inlineWidth : width, measure);
  if (inline) segments.push(separator, ...metricSegments);
  const continuations: WorkPanelSegment[][] = [];
  if (!inline) {
    for (const group of row.metrics ?? []) {
      const parts = group.continuation ?? group.segments;
      const previous = continuations.at(-1);
      const joined = previous ? [...previous, separator, ...parts] : [...parts];
      if (previous && measure(segmentText(joined)) <= width)
        continuations[continuations.length - 1] = joined;
      else continuations.push([...parts]);
    }
  }
  const extraSegments = continuations.flatMap((parts) =>
    wrapSegments(parts, width, measure),
  );
  return {
    text: segmentText(segments),
    segments,
    extraRows: extraSegments.map(segmentText),
    extraSegments,
  };
}

function panelContentReader(width: number, measure = defaultMeasure) {
  const kit = getRenderKit();
  const contents = new Map<Pick<PanelRow, 'row'>, WorkPanelRowContent>();
  function contentFor(entry: Pick<PanelRow, 'row'>) {
    let content = contents.get(entry);
    if (!content) {
      content =
        entry.row.identity || entry.row.metrics
          ? responsiveContent(
              entry.row,
              Math.max(0, width - (kit ? 7 : 4)),
              measure,
            )
          : {
              text: [entry.row.name, entry.row.primary, entry.row.elapsed]
                .filter(Boolean)
                .join(` ${resolveIcon('separator', '·')} `),
              segments: entry.row.segments ?? [
                ...(entry.row.name
                  ? [
                      { text: entry.row.name, role: 'primary' as const },
                      {
                        text: ` ${resolveIcon('separator', '·')} `,
                        role: 'meta' as const,
                      },
                    ]
                  : []),
                {
                  text: entry.row.primary,
                  role: entry.row.name ? 'secondary' : 'primary',
                },
                ...(entry.row.elapsed
                  ? [
                      {
                        text: ` ${resolveIcon('separator', '·')} ${entry.row.elapsed}`,
                        role: 'meta' as const,
                      },
                    ]
                  : []),
              ],
              extraRows: entry.row.extraRows,
              extraSegments: entry.row.extraSegments,
            };
      contents.set(entry, content);
    }
    return content;
  }
  return contentFor;
}

interface PanelPlan {
  section: PanelSection;
  items: PanelRow[];
  summaries: PanelRow[];
  chosen: PanelRow[];
  selectedIndex: number;
  combineOverflow: boolean;
  hideOverflow: boolean;
}

function overflowLineCount(plan: PanelPlan, chosen = plan.chosen): number {
  if (plan.hideOverflow) return 0;
  const { lines } = overflowCounts(plan.section.provider, plan.items, chosen);
  return plan.combineOverflow ? Math.min(1, lines) : lines;
}

function planOverflowRows(plan: PanelPlan, selectedKey?: string): PanelRow[] {
  return plan.hideOverflow
    ? []
    : overflowRows(
        plan.section.provider,
        plan.items,
        plan.chosen,
        plan.combineOverflow,
        selectedKey,
      );
}

function planPanelSections(
  sections: PanelSection[],
  remaining: number,
  blockCost: (entry: PanelRow) => number,
  selectedKey?: string,
): PanelPlan[] {
  const visible: PanelSection[] = [];
  let minimumCost = 0;
  for (const section of sections) {
    const cost = section.collapsed ? 1 : 2;
    if (minimumCost + cost > remaining) break;
    visible.push(section);
    minimumCost += cost;
  }
  const selectedSection = sections.find(
    (section) =>
      section.rows.some((entry) => entry.key === selectedKey) ||
      ['overflow-drop-first', 'overflow-more'].some(
        (id) => overflowKey(section.provider, id) === selectedKey,
      ),
  );
  if (selectedSection && visible.length && !visible.includes(selectedSection)) {
    visible[visible.length - 1] = selectedSection;
    visible.sort((a, b) => sections.indexOf(a) - sections.indexOf(b));
  }
  const plans = visible.map((section) => {
    const items = section.collapsed
      ? []
      : section.rows.filter(({ row }) => !row.summary);
    const summaries = section.rows.filter(
      (entry) => entry.row.summary && !entry.sectionHeading,
    );
    const selectedIndex = items.findIndex(({ key }) => key === selectedKey);
    const initial =
      selectedIndex >= 0
        ? items[selectedIndex]
        : (items.find(({ row }) => !row.dropFirst) ?? items[0]);
    return {
      section,
      items,
      summaries,
      chosen: initial ? [initial] : [],
      selectedIndex,
      combineOverflow: false,
      hideOverflow: false,
    };
  });
  const cost = (plan: (typeof plans)[number]) =>
    plan.section.collapsed
      ? 1
      : 1 +
        plan.chosen.reduce((sum, entry) => sum + blockCost(entry), 0) +
        plan.summaries.length +
        overflowLineCount(plan);
  const totalCost = () => plans.reduce((sum, plan) => sum + cost(plan), 0);
  // Whole metric blocks and the selected section take precedence over lower sections.
  while (plans.length > 1 && totalCost() > remaining) {
    let removable = plans.length - 1;
    if (plans[removable]?.section === selectedSection) removable -= 1;
    plans.splice(removable, 1);
  }
  const only = plans.length === 1 ? plans[0] : undefined;
  if (only && cost(only) > remaining) {
    // Preserve exact counts without allowing a second overflow line to hide the chosen item.
    only.combineOverflow = true;
    if (cost(only) > remaining) {
      const overflowSelected = ['overflow-drop-first', 'overflow-more'].some(
        (id) => overflowKey(only.section.provider, id) === selectedKey,
      );
      const { preferred } = overflowCounts(
        only.section.provider,
        only.items,
        only.chosen,
      );
      // Provider-labelled or selectable counts remain available even when the
      // body can only fit a summary; ordinary log panels retain their item.
      if (
        overflowSelected ||
        preferred > 0 ||
        only.section.provider.selectableSummary
      )
        only.chosen = [];
      else only.hideOverflow = true;
    }
  }
  // Share caps and spare height among ordinary items before allocating drop-first items.
  for (const dropFirst of [false, true]) {
    for (const capped of [true, false]) {
      let added: boolean;
      do {
        added = false;
        for (const plan of plans) {
          const cap = Math.max(
            1,
            Math.floor(plan.section.provider.rowCap ?? 3),
          );
          if (capped && plan.chosen.length >= cap) continue;
          const start = Math.max(0, plan.selectedIndex - cap + 1);
          const candidates = [
            ...plan.items.slice(start),
            ...plan.items.slice(0, start),
          ];
          const next = candidates.find(
            (entry) =>
              Boolean(entry.row.dropFirst) === dropFirst &&
              !plan.chosen.includes(entry),
          );
          if (!next) continue;
          const delta =
            blockCost(next) +
            overflowLineCount(plan, [...plan.chosen, next]) -
            overflowLineCount(plan);
          if (totalCost() + delta > remaining) continue;
          plan.chosen.push(next);
          added = true;
        }
      } while (added);
    }
  }
  return plans;
}

/** Host navigation uses the same height plan as rendering, including synthetic overflow actions. */
export function panelOverflowEntries(
  sections: PanelSection[],
  width: number,
  _now: number,
  budget: number,
  selectedKey?: string,
  measure = defaultMeasure,
): Map<string, PanelRow[]> {
  const contentFor = panelContentReader(width, measure);
  const blockCost = (entry: PanelRow) =>
    1 +
    (contentFor(entry).extraRows?.filter((extra) => extra.trim()).length ?? 0);
  const hasHint = sections.some((section) =>
    section.rows.some(isSelectablePanelRow),
  );
  const remaining = Math.max(0, budget - Number(hasHint));
  return new Map(
    planPanelSections(sections, remaining, blockCost, selectedKey).map(
      (plan) => [plan.section.provider.id, planOverflowRows(plan, selectedKey)],
    ),
  );
}

function segmentStyler(
  theme: RenderKitTheme,
  clip: (text: string, width: number) => string,
  measure: Measure,
) {
  const kit = getRenderKit();
  const fg = (role: Parameters<RenderKitTheme['fg']>[0], text: string) =>
    kit ? kit.fg(theme, role, text) : theme.fg(role, text);
  const styleSegments = (
    segments: readonly WorkPanelSegment[],
    available = Infinity,
  ) => {
    const parts = segments.map((segment) => {
      const text = segment.text.replace(/[\r\n\t]+/g, ' ');
      return { ...segment, text, width: measure(text) };
    });
    let excess = parts.reduce((sum, part) => sum + part.width, 0) - available;
    // Labels shrink first; metrics and attention stay visible until width is exhausted.
    for (const role of shrinkOrder) {
      for (const part of parts) {
        if (excess <= 0) break;
        if (part.role !== role) continue;
        const removed = Math.min(part.width, excess);
        part.width -= removed;
        excess -= removed;
      }
    }
    return parts
      .map(({ text, role, width: partWidth }) => {
        const clipped =
          partWidth < measure(text) ? clip(text, partWidth) : text;
        const styled = fg(segmentRoles[role], clipped);
        if (role === 'completed')
          return theme.strikethrough?.(styled) ?? styled;
        return role === 'primary' && theme.bold ? theme.bold(styled) : styled;
      })
      .join('');
  };
  return styleSegments;
}

export interface WorkPanelRowRenderOptions {
  width: number;
  now: number;
  theme: RenderKitTheme;
  clip(text: string, width: number): string;
  measure?: Measure;
  selected?: boolean;
  last?: boolean;
}

/** The same responsive data-row rendering used by the work-panel host. */
export function renderWorkPanelRow(
  row: WorkPanelRow,
  options: WorkPanelRowRenderOptions,
): string[] {
  const { width, now, theme, clip } = options;
  if (!(width > 0)) return [];
  const kit = getRenderKit();
  const measure = options.measure ?? defaultMeasure;
  const fg = (role: Parameters<RenderKitTheme['fg']>[0], text: string) =>
    kit ? kit.fg(theme, role, text) : theme.fg(role, text);
  const styleSegments = segmentStyler(theme, clip, measure);
  const contentFor = panelContentReader(width, measure);
  const entry = { row };
  const status = workPanelRenderStatus(row);
  const indicator = !row.summary
    ? kit?.indicator(theme, undefined, {
        status,
        frame: Math.floor(now / WORK_PANEL_ANIMATION_INTERVAL_MS),
      })
    : undefined;
  const semanticGlyph = workPanelStatusGlyph(row);
  const running = status === 'running' || status === 'in_progress';
  const frames = resolveFrames('spinnerFrames');
  const native =
    semanticGlyph && running
      ? frames[
          Math.floor(now / WORK_PANEL_ANIMATION_INTERVAL_MS) % frames.length
        ]
      : nativeGlyphs[status];
  const glyph =
    semanticGlyph === 'taskInProgress'
      ? resolveIcon('taskInProgress', '◇')
      : running
        ? (indicator?.glyph ?? native)
        : resolveStatusGlyph(status, native);
  const content = contentFor(entry);
  const body = content.segments
    ? styleSegments(content.segments, Math.max(0, width - (kit ? 7 : 4)))
    : singleLine(content.text);
  const styledGlyph = row.summary
    ? ''
    : `${fg(segmentRoles[glyphRole(row, status)], glyph)} `;
  return [
    kit
      ? kit.treeRow(
          theme,
          {
            text: `${styledGlyph}${body}`,
            selected: options.selected === true,
            depth: 0,
            last: options.last === true,
          },
          width,
        )
      : `${options.selected === true ? fg('accent', `${resolveIcon('selection', '›')} `) : '  '}${styledGlyph}${body}`,
    ...(content.extraRows ?? [])
      .filter((extra) => extra.trim())
      .map((extra, index) =>
        content.extraSegments?.[index]
          ? `${kit ? '       ' : '    '}${styleSegments(content.extraSegments[index])}`
          : fg('dim', `${kit ? '       ' : '    '}${singleLine(extra)}`),
      ),
  ].map((line) => clip(line, width));
}

export function renderPanel(
  sections: PanelSection[],
  width: number,
  now: number,
  theme: RenderKitTheme,
  clip: (text: string, width: number) => string,
  options: {
    selectedKey?: string;
    hint?: string;
    budget?: number;
    measure?: (text: string) => number;
  } = {},
): string[] {
  if (!(width > 0)) return [];
  width = Math.floor(width);
  const kit = getRenderKit();
  const fg = (role: Parameters<RenderKitTheme['fg']>[0], text: string) =>
    kit ? kit.fg(theme, role, text) : theme.fg(role, text);
  const measure = options.measure ?? defaultMeasure;
  const styleSegments = segmentStyler(theme, clip, measure);
  const hint = sections.some((section) =>
    section.rows.some(isSelectablePanelRow),
  )
    ? options.hint
    : undefined;
  const budget = Math.max(0, Math.floor(options.budget ?? 12));
  const remaining = Math.max(0, budget - (hint ? 1 : 0));
  const contentFor = panelContentReader(width, measure);
  const blockCost = (entry: PanelRow) =>
    1 +
    (contentFor(entry).extraRows?.filter((extra) => extra.trim()).length ?? 0);
  const plans = planPanelSections(
    sections,
    remaining,
    blockCost,
    options.selectedKey,
  );
  const lines: string[] = [];
  for (const plan of plans) {
    const { provider, rows } = plan.section;
    const chosen = [...plan.chosen].sort(
      (a, b) => rows.indexOf(a) - rows.indexOf(b),
    );
    const entries = [...chosen, ...plan.summaries];
    const blocks = entries.map((entry, index) => {
      return renderWorkPanelRow(entry.row, {
        width,
        now,
        theme,
        clip,
        measure,
        selected:
          isSelectablePanelRow(entry) && options.selectedKey === entry.key,
        last:
          index === entries.length - 1 && chosen.length === plan.items.length,
      });
    });
    const title = singleLine(provider.label).replace(/\b\p{L}/gu, (letter) =>
      letter.toUpperCase(),
    );
    const counter = styleSegments(
      plan.section.collapsed
        ? [
            { text: `${plan.section.counts?.done ?? 0} done`, role: 'meta' },
            { text: ` ${resolveIcon('separator', '·')} `, role: 'meta' },
            {
              text: `${plan.section.counts?.failed ?? 0} failed`,
              role: (plan.section.counts?.failed ?? 0) > 0 ? 'error' : 'meta',
            },
          ]
        : summarySegments(
            safely(() => provider.summary?.(), undefined),
            rows.filter((entry) => !entry.sectionHeading),
          ),
    );
    const selectedSummary = rows.some(
      (entry) =>
        (plan.section.collapsed || entry.sectionHeading) &&
        entry.key === options.selectedKey,
    );
    const heading = kit
      ? kit.widgetHeading(
          theme,
          { title, suffix: `${resolveIcon('separator', '·')} ${counter}` },
          Math.max(0, width - (selectedSummary ? 2 : 0)),
        )
      : `${fg('accent', '◆')} ${fg('toolTitle', title)} ${fg('dim', `${resolveIcon('separator', '·')} `)}${counter}`;
    const sectionLines = [
      selectedSummary
        ? `${fg('accent', `${resolveIcon('selection', '›')} `)}${heading}`
        : heading,
    ];
    if (plan.section.collapsed) {
      lines.push(...sectionLines);
      continue;
    }
    const overflow = planOverflowRows(plan, options.selectedKey);
    const more = overflow.length > 0 && remaining - lines.length >= 2;
    const bodyBudget = Math.max(
      0,
      remaining - lines.length - 1 - (more ? overflow.length : 0),
    );
    sectionLines.push(...blocks.flat().slice(0, bodyBudget));
    if (more)
      sectionLines.push(
        ...overflow.map(
          (entry) =>
            `${options.selectedKey === entry.key && isSelectablePanelRow(entry) ? fg('accent', `${resolveIcon('selection', '›')} `) : '  '}${fg('dim', entry.row.primary)}`,
        ),
      );
    lines.push(...sectionLines);
  }
  if (hint && budget) lines.push(fg('dim', hint));
  return lines.slice(0, budget).map((line) => clip(line, width));
}

/** Shared status mapping for providers whose runtime has additional terminal states. */
export function workPanelRenderStatus(
  row: Pick<WorkPanelRow, 'status' | 'statusTone' | 'statusGlyph'>,
): RenderStatus {
  const semanticGlyph = workPanelStatusGlyph(row);
  if (semanticGlyph && semanticGlyph !== 'taskInProgress') return semanticGlyph;
  if (row.statusTone === 'running') return 'running';
  if (row.statusTone === 'success') return 'completed';
  if (row.statusTone === 'failed') return 'failed';
  if (row.statusTone === 'warning') return 'blocked';
  return renderStatuses.includes(row.status ?? '')
    ? (row.status as RenderStatus)
    : 'unknown';
}

const renderStatuses: readonly string[] = [
  'pending',
  'queued',
  'in_progress',
  'running',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
  'stopping',
  'deleted',
  'blocked',
  'unknown',
];

/** Invalid semantic overrides fall back to the row's status without executing code. */
export function workPanelStatusGlyph(
  row: Pick<WorkPanelRow, 'statusGlyph'>,
): WorkPanelRow['statusGlyph'] {
  const glyph = row.statusGlyph;
  return glyph === 'taskInProgress' || renderStatuses.includes(glyph ?? '')
    ? glyph
    : undefined;
}
