import { getAnimationLevel } from './animation-clock.js';
import {
  getRenderKit,
  type RenderKitTheme,
  type RenderStatus,
  resolveFrames,
  resolveIcon,
  resolveStaticRunningGlyph,
  resolveStatusGlyph,
} from './render-kit.js';
import type {
  WorkPanelItemState,
  WorkPanelMetricGroup,
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
  // The semantic expectedExit role outranks a provider's muted tone.
  if (status === 'expectedExit') return 'dim';
  if (row.statusTone === 'muted') return 'muted';
  if (status === 'running' || status === 'in_progress') return 'accent';
  if (status === 'failed') return 'error';
  if (status === 'timedOut') return 'warning';
  if (status === 'resolved') return 'muted';
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
  timedOut: '◷',
  resolved: '↻',
  expectedExit: '✓',
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

const isFlexibleRole = (role: WorkPanelSegmentRole) =>
  role === 'secondary' || role === 'warning' || role === 'error';

/**
 * Fitting unit: a text segment plus the meta separator that introduces it. Both keep their own
 * role; the separator belongs to the unit's budget, so it is dropped or kept with its text.
 */
interface IdentityItem {
  lead?: WorkPanelSegment;
  body: WorkPanelSegment;
}

const itemWidth = (item: IdentityItem, measure: Measure) =>
  measure(item.lead?.text ?? '') + measure(item.body.text);

/** Copy a segment for fitting; `compact` only ever applies through `columnsIdentity`. */
function plainSegment(
  { compact: _compact, ...segment }: WorkPanelSegment,
  text = segment.text,
): WorkPanelSegment {
  return { ...segment, text };
}

/** Columns layout swaps a segment's text for its provider-supplied compact counterpart. */
const columnsIdentity = (
  identity: readonly WorkPanelSegment[],
): WorkPanelSegment[] =>
  identity.map((part) =>
    part.compact === undefined ? part : { ...part, text: part.compact },
  );

function identityItems(segments: readonly WorkPanelSegment[]): IdentityItem[] {
  const separator = ` ${resolveIcon('separator', '·')} `;
  const items: IdentityItem[] = [];
  for (let index = 0; index < segments.length; index++) {
    const part = segments[index];
    const next = segments[index + 1];
    if (
      part.role === 'meta' &&
      part.text === separator &&
      next &&
      isFlexibleRole(next.role)
    ) {
      // An empty summary leaves no separator behind.
      if (next.role === 'secondary' && next.text === '')
        items.push({ body: plainSegment(next) });
      else items.push({ lead: plainSegment(part), body: plainSegment(next) });
      index++;
    } else if (
      isFlexibleRole(part.role) &&
      part.text.length > separator.length &&
      part.text.startsWith(separator)
    ) {
      items.push({
        lead: { text: separator, role: 'meta' },
        body: plainSegment(part, part.text.slice(separator.length)),
      });
    } else if (part.role === 'secondary' && part.text === separator)
      items.push({ body: plainSegment(part, '') });
    else items.push({ body: plainSegment(part) });
  }
  return items;
}

/** Shrink one unit to `target` cells, truncating its text (and, last, its separator). */
function shrinkItem(item: IdentityItem, target: number, measure: Measure) {
  const { lead, body } = item;
  if (!lead) {
    body.text = truncateData(body.text, target, measure);
    return;
  }
  // Drop the whole summary when only its separator would fit.
  if (body.role === 'secondary' && target <= measure(lead.text)) {
    body.text = '';
    item.lead = undefined;
    return;
  }
  const fitted = truncateData(lead.text + body.text, target, measure);
  if (fitted.startsWith(lead.text)) body.text = fitted.slice(lead.text.length);
  else {
    lead.text = fitted;
    body.text = '';
  }
}

const flattenItems = (items: readonly IdentityItem[]): WorkPanelSegment[] =>
  items.flatMap(({ lead, body }) => (lead ? [lead, body] : [body]));

/**
 * Truncate role-tagged segments to `width` cells without merging them: each keeps its own
 * role, trailing separators are dropped, and `ellipsis` (if any) ends the last kept segment.
 */
function truncateSegments(
  segments: readonly WorkPanelSegment[],
  width: number,
  measure: Measure,
  ellipsis: string,
): WorkPanelSegment[] {
  if (width <= 0 || segmentText(segments) === '') return [];
  if (measure(segmentText(segments)) <= width)
    return segments.map((segment) => ({ ...segment }));
  const room = Math.max(0, width - measure(ellipsis));
  const kept: WorkPanelSegment[] = [];
  let used = 0;
  for (const segment of segments) {
    const left = room - used;
    if (left <= 0) break;
    const text = truncateData(segment.text, left, measure, '');
    kept.push({ ...segment, text });
    used += measure(text);
    if (text !== segment.text) break;
  }
  while (kept.length > 1 && kept.at(-1)?.role === 'meta') kept.pop();
  if (ellipsis && measure(ellipsis) <= width) {
    if (!kept.length) kept.push({ text: '', role: segments[0].role });
    (kept.at(-1) as WorkPanelSegment).text += ellipsis;
  }
  return kept.filter((segment) => segment.text !== '');
}

function fitIdentity(
  segments: readonly WorkPanelSegment[],
  width: number,
  measure: Measure,
): WorkPanelSegment[] {
  const items = identityItems(segments);
  const attention = items.filter(
    ({ body }) => body.role === 'warning' || body.role === 'error',
  );
  if (
    attention.length &&
    width <= attention.reduce((sum, item) => sum + itemWidth(item, measure), 0)
  ) {
    // Attention outranks everything: only it remains, led by no separator.
    const sequence = flattenItems(attention);
    if (sequence[0]?.role === 'meta') sequence.shift();
    return truncateSegments(sequence, width, measure, '');
  }
  const total = items.reduce((sum, item) => sum + itemWidth(item, measure), 0);
  let excess = total - width;
  for (const role of shrinkOrder) {
    for (const item of items) {
      if (excess <= 0) break;
      if (item.body.role !== role) continue;
      const before = itemWidth(item, measure);
      shrinkItem(item, Math.max(0, before - excess), measure);
      excess -= before - itemWidth(item, measure);
    }
  }
  return flattenItems(items);
}

/**
 * Columns layout: the name is reserved first. When warning/error text cannot fit beside it,
 * the summary is already gone and the warnings truncate, role by role, before the name does.
 */
function fitIdentityKeepName(
  segments: readonly WorkPanelSegment[],
  width: number,
  measure: Measure,
): WorkPanelSegment[] {
  const separator = ` ${resolveIcon('separator', '·')} `;
  const items = identityItems(segments);
  const attention = items.filter(
    ({ body }) => body.role === 'warning' || body.role === 'error',
  );
  const names = items.filter(({ body }) => body.role === 'primary');
  if (!attention.length || !names.length)
    return fitIdentity(segments, width, measure);
  const nameText = names.map(({ body }) => body.text).join('');
  const attentionWidth = attention.reduce(
    (sum, item) => sum + itemWidth(item, measure),
    0,
  );
  if (measure(nameText) + attentionWidth <= width)
    return fitIdentity(segments, width, measure);
  const nameWidth = Math.min(measure(nameText), width);
  const room = width - nameWidth - measure(separator);
  const result: WorkPanelSegment[] = [
    { text: truncateData(nameText, nameWidth, measure), role: 'primary' },
  ];
  if (room > 0) {
    const sequence = flattenItems(attention);
    if (sequence[0]?.role === 'meta') sequence.shift();
    result.push(
      { text: separator, role: 'meta' },
      ...truncateSegments(
        sequence,
        room,
        measure,
        resolveIcon('ellipsis', '…'),
      ),
    );
  }
  return result;
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

/** Number-field maxima in cells, excluding semantic icons, labels and separators. */
const metricNumberWidths = {
  tools: 3,
  tokens: 5,
  context: 6,
  speed: 3,
  cost: 6,
  elapsed: 7,
};
// Reservation cells exist only in the packing plan; never in rendered greedy text.
const reservationCell = '\0';
const visibleSegments = (parts: readonly WorkPanelSegment[]) =>
  parts.map((part) => ({
    ...part,
    text: part.text.replaceAll(reservationCell, ''),
  }));

function reservedMetricSegments(
  group: WorkPanelMetricGroup,
  continuation = false,
): WorkPanelSegment[] {
  const parts = continuation
    ? (group.continuation ?? group.segments)
    : group.segments;
  if (!group.key || group.key === 'model')
    return parts.map((part) => ({ ...part }));
  const reserved = metricNumberWidths[group.key];
  const valuePattern =
    group.key === 'elapsed'
      ? /\d+(?:\.\d+)?(?:ms|[smh])(?: \d+[smh])?|\?/g
      : /\d+(?:\.\d+)?[kKmM%]?|\?/g;
  return parts.map((part) => ({
    ...part,
    text: part.text.replace(
      valuePattern,
      (value) =>
        value + reservationCell.repeat(Math.max(0, reserved - value.length)),
    ),
  }));
}

/**
 * Columns-layout segments: elapsed is shown as the bare, right-aligned time so the clock
 * icon stays free for the timed-out status glyph.
 */
function columnMetricSegments(group: WorkPanelMetricGroup): WorkPanelSegment[] {
  const parts = reservedMetricSegments(group);
  if (group.key !== 'elapsed') return parts;
  const text = segmentText(parts).replace(/^[^\d?]+/, '');
  return [{ text, role: parts.at(-1)?.role ?? 'meta' }];
}

export type WorkPanelMetricGrid = readonly {
  key: NonNullable<WorkPanelMetricGroup['key']>;
  width: number;
}[] & {
  /** Column plans only: false when identity warnings are not admitted panel-wide. */
  readonly warnings?: boolean;
  /**
   * Column plans only. `2` opts into the two-line form (the sidebar Agents panel): line 1
   * is glyph, name, summary in the leftover width and the right-aligned elapsed; line 2,
   * indented under the name, holds the plan's other columns, aligned panel-wide, in the
   * priority context, cost, speed, tokens, tools, warnings, model (the highest-priority
   * prefix that fits). Rows with no metric besides elapsed stay one line. Absent or `1`
   * is the single-line columns layout.
   */
  readonly lines?: 1 | 2;
  /** Two-line plans only: reserved cells of the warnings slot on line 2. */
  readonly warningWidth?: number;
};

const gridOrder = [
  'tools',
  'tokens',
  'context',
  'speed',
  'cost',
  'elapsed',
  'model',
] as const;

/** Shared panel schema: numeric reservations may grow; model stays 16 cells. */
export function createWorkPanelMetricGrid(
  rows: readonly WorkPanelRow[],
  measure: Measure = defaultMeasure,
): WorkPanelMetricGrid {
  const widths = new Map<NonNullable<WorkPanelMetricGroup['key']>, number>();
  for (const row of rows)
    for (const group of row.metrics ?? []) {
      if (!group.key) continue;
      const width =
        group.key === 'model'
          ? 16
          : measure(
              segmentText(reservedMetricSegments(group)).replaceAll(
                reservationCell,
                ' ',
              ),
            );
      widths.set(group.key, Math.max(widths.get(group.key) ?? 0, width));
    }
  return gridOrder
    .filter((key) => widths.has(key))
    .map((key) => ({ key, width: widths.get(key) ?? 0 }));
}

function gridContent(
  row: WorkPanelRow,
  identity: readonly WorkPanelSegment[],
  width: number,
  measure: Measure,
  grid: WorkPanelMetricGrid,
): WorkPanelRowContent {
  if (width <= 0) return { text: '', segments: [] };
  const cells = grid.map((column) => {
    const group = row.metrics?.find(({ key }) => key === column.key);
    let parts = group
      ? reservedMetricSegments(group).map((part) => ({
          ...part,
          text: part.text.replaceAll(reservationCell, ' '),
        }))
      : [];
    if (column.key === 'model')
      parts = fitIdentity(parts, column.width, measure);
    const padding = Math.max(0, column.width - measure(segmentText(parts)));
    return {
      parts: [...parts, { text: ' '.repeat(padding), role: 'meta' as const }],
      width: column.width,
    };
  });
  const gutter: WorkPanelSegment = { text: ' ', role: 'meta' };
  const total =
    cells.reduce((sum, cell) => sum + cell.width, 0) +
    Math.max(0, cells.length - 1);
  // Shared width-only decision: every row reserves the same name/task budget.
  const minimum = 24;
  if (cells.length && total + 1 + minimum <= width) {
    const segments = fitIdentity(identity, width - total - 1, measure);
    segments.push({
      text: ' '.repeat(width - total - measure(segmentText(segments))),
      role: 'meta',
    });
    cells.forEach((cell, index) => {
      segments.push(...(index ? [gutter, ...cell.parts] : cell.parts));
    });
    return { text: segmentText(segments), segments };
  }
  const segments = fitIdentity(identity, width, measure);
  const lines: WorkPanelSegment[][] = [];
  let line: WorkPanelSegment[] = [];
  let used = 0;
  for (const cell of cells) {
    if (used && used + 1 + cell.width > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    if (cell.width > width) {
      // Split oversized columns at cell boundaries, preserving padding and all
      // numeric digits; fixed-width chunks keep missing fields aligned too.
      let chunk: WorkPanelSegment[] = [];
      let chunkWidth = 0;
      for (const part of cell.parts)
        for (const character of part.text) {
          const size = measure(character);
          if (chunkWidth + size > width) {
            lines.push(chunk);
            chunk = [];
            chunkWidth = 0;
          }
          const last = chunk.at(-1);
          if (last?.role === part.role) last.text += character;
          else chunk.push({ text: character, role: part.role });
          chunkWidth += size;
        }
      if (chunk.length) lines.push(chunk);
    } else {
      if (used) line.push(gutter);
      line.push(...cell.parts);
      used += (used ? 1 : 0) + cell.width;
    }
  }
  if (line.length) lines.push(line);
  return {
    text: segmentText(segments),
    segments,
    extraRows: lines.map(segmentText),
    extraSegments: lines,
  };
}

const contentGutter = () => (getRenderKit() ? 7 : 4);
const terminalStatuses = new Set<RenderStatus>([
  'completed',
  'failed',
  'timedOut',
  'cancelled',
  'interrupted',
  'deleted',
  'resolved',
  'expectedExit',
]);
const MODEL_COLUMN_WIDTH = 10;
/** The summary keeps this many cells (or all of a shorter one) before lower priorities show. */
const MIN_SUMMARY_CELLS = 12;
/**
 * Columns-layout priority after the always-visible glyph and name: an element shows only
 * while every higher one keeps its space. Elapsed never drops.
 */
const columnPriority = [
  'elapsed',
  'context',
  'cost',
  'summary',
  'speed',
  'tokens',
  'tools',
  'warnings',
  'model',
] as const;

interface IdentityDemand {
  /** Glyph-adjacent name text and any other always-shown identity. */
  base: number;
  /** Separator plus the reserved summary cells, or all of a shorter summary. */
  summary: number;
  /** Full warning/error text with its separators. */
  warnings: number;
}

function identityDemand(
  identity: readonly WorkPanelSegment[],
  measure: Measure,
): IdentityDemand {
  const items = identityItems(identity);
  const separator = measure(` ${resolveIcon('separator', '·')} `);
  const widthOf = (role: (r: WorkPanelSegmentRole) => boolean) =>
    items
      .filter(({ body }) => role(body.role))
      .reduce((sum, item) => sum + itemWidth(item, measure), 0);
  const summary = widthOf((role) => role === 'secondary');
  return {
    base: widthOf((role) => role !== 'secondary' && !isFlexibleRole(role)),
    summary: summary ? Math.min(summary, separator + MIN_SUMMARY_CELLS) : 0,
    warnings: widthOf((role) => role === 'warning' || role === 'error'),
  };
}

/** Single-line display order of the admitted columns: the provider's metric order. */
const columnDisplayOrder = [
  'model',
  'tools',
  'tokens',
  'context',
  'speed',
  'cost',
  'elapsed',
] as const;
/** Two-line form: the line-2 elements in priority order (elapsed lives on line 1). */
const secondLinePriority = [
  'context',
  'cost',
  'speed',
  'tokens',
  'tools',
  'warnings',
  'model',
] as const;

/** Warning/error text of an identity, without its leading separator. */
function attentionSegments(
  identity: readonly WorkPanelSegment[],
): WorkPanelSegment[] {
  const sequence = flattenItems(
    identityItems(identity).filter(
      ({ body }) => body.role === 'warning' || body.role === 'error',
    ),
  );
  if (sequence[0]?.role === 'meta') sequence.shift();
  return sequence;
}

/**
 * Panel-wide column plan: decided from reserved number widths (model fixed at 10 cells),
 * never live digits, so every row shares the same visible, aligned columns. `lines: 2`
 * plans the two-line form (see `WorkPanelMetricGrid.lines`).
 */
export function createWorkPanelColumnPlan(
  rows: readonly WorkPanelRow[],
  width: number,
  measure: Measure = defaultMeasure,
  options: { lines?: 1 | 2 } = {},
): WorkPanelMetricGrid {
  const available = Math.max(0, width - contentGutter());
  const separator = measure(` ${resolveIcon('separator', '·')} `);
  const widths = new Map<NonNullable<WorkPanelMetricGroup['key']>, number>();
  const demands: IdentityDemand[] = [];
  let warningWidth = 0;
  for (const row of rows) {
    const identity = columnsIdentity(
      row.identity ?? row.segments ?? [{ text: row.primary, role: 'primary' }],
    );
    demands.push(identityDemand(identity, measure));
    warningWidth = Math.max(
      warningWidth,
      measure(segmentText(attentionSegments(identity))),
    );
    for (const group of row.metrics ?? []) {
      if (!group.key) continue;
      const size =
        group.key === 'model'
          ? MODEL_COLUMN_WIDTH
          : measure(
              segmentText(columnMetricSegments(group)).replaceAll(
                reservationCell,
                ' ',
              ),
            );
      widths.set(group.key, Math.max(widths.get(group.key) ?? 0, size));
    }
  }
  if (options.lines === 2) {
    const kept: (typeof secondLinePriority)[number][] = [];
    let used = 0;
    for (const element of secondLinePriority) {
      const size =
        element === 'warnings' ? warningWidth : (widths.get(element) ?? 0);
      if (!size) continue;
      if (used + (kept.length ? separator : 0) + size > available) break;
      used += (kept.length ? separator : 0) + size;
      kept.push(element);
    }
    const columns = [
      ...(widths.has('elapsed')
        ? [{ key: 'elapsed' as const, width: widths.get('elapsed') ?? 0 }]
        : []),
      ...kept.flatMap((element) =>
        element === 'warnings'
          ? []
          : [{ key: element, width: widths.get(element) ?? 0 }],
      ),
    ];
    return Object.assign(columns, {
      warnings: kept.includes('warnings'),
      lines: 2 as const,
      warningWidth,
    });
  }
  const kept = new Set<(typeof columnPriority)[number]>();
  const fits = () => {
    const columns = [...widths]
      .filter(([key]) => kept.has(key))
      .reduce((sum, [, size]) => sum + size + separator, 0);
    return demands.every(
      (demand) =>
        demand.base +
          (kept.has('summary') ? demand.summary : 0) +
          (kept.has('warnings') ? demand.warnings : 0) +
          columns <=
        available,
    );
  };
  for (const element of columnPriority) {
    const present =
      element === 'summary' || element === 'warnings' || widths.has(element);
    if (!present) continue;
    kept.add(element);
    // Elapsed never drops; every other element needs all higher ones plus its own space.
    if (element !== 'elapsed' && !fits()) {
      kept.delete(element);
      break;
    }
  }
  return Object.assign(
    columnDisplayOrder
      .filter((key) => kept.has(key) && widths.has(key))
      .map((key) => ({ key, width: widths.get(key) ?? 0 })),
    { warnings: kept.has('warnings') },
  );
}

/** Columns layout: non-admitted warning/error units leave with their separators. */
function withoutAttention(
  identity: readonly WorkPanelSegment[],
): WorkPanelSegment[] {
  return flattenItems(
    identityItems(identity).filter(
      ({ body }) => body.role !== 'warning' && body.role !== 'error',
    ),
  );
}

/** A truncated summary under this many cells is hidden with its separator. */
const MIN_VISIBLE_SUMMARY_CELLS = 4;

function dropTinySummary(
  fitted: readonly WorkPanelSegment[],
  identity: readonly WorkPanelSegment[],
  measure: Measure,
): WorkPanelSegment[] {
  // Units normalise the separator, so one combined segment and a split pair compare equal.
  const summaryOf = (items: readonly IdentityItem[]) =>
    items.findIndex(({ body }) => body.role === 'secondary');
  const original = identityItems(identity);
  const originalSummary = original[summaryOf(original)]?.body.text;
  const items = identityItems(fitted);
  const index = summaryOf(items);
  const body = items[index]?.body;
  if (
    !body ||
    body.text === '' ||
    body.text === originalSummary ||
    measure(body.text) >= MIN_VISIBLE_SUMMARY_CELLS
  )
    return [...fitted];
  return flattenItems(items.filter((_, position) => position !== index));
}

/** Context pressure by the displayed percentage: >= 70 warning, >= 90 error. */
function contextRole(text: string): WorkPanelSegmentRole {
  const percent = Number(text.match(/(\d+(?:\.\d+)?)%/)?.[1]);
  if (percent >= 90) return 'error';
  return percent >= 70 ? 'warning' : 'dim';
}

/** Per-element theme roles for one metric column; values keep their reserved text. */
function columnSegments(
  key: NonNullable<WorkPanelMetricGroup['key']>,
  parts: readonly WorkPanelSegment[],
  row: WorkPanelRow,
  status: RenderStatus,
  width: number,
  measure: Measure,
  /** Two-line layout line 2 only; `finished` rows render every metric dim. */
  lineTwo?: { finished: boolean },
): WorkPanelSegment[] {
  const text = segmentText(parts);
  // Finished rows go quiet: every line-2 metric reads as dim, whatever its running color.
  if (lineTwo?.finished)
    return [
      {
        text: key === 'model' ? truncateData(text, width, measure) : text,
        role: 'dim',
      },
    ];
  switch (key) {
    case 'model':
      return [
        { text: truncateData(text, width, measure), role: 'muted' as const },
      ];
    case 'tokens':
      // Direction markers colour each segment; an unmarked column reads as one input run.
      return parts.some(({ direction }) => direction)
        ? parts.map(({ text: part, direction }) => ({
            text: part,
            role:
              direction === 'in'
                ? 'accent'
                : direction === 'out'
                  ? 'success'
                  : 'meta',
          }))
        : [{ text, role: 'accent' }];
    case 'cost':
      return [{ text, role: 'warning' }];
    case 'context':
      return [{ text, role: lineTwo ? contextRole(text) : 'dim' }];
    case 'elapsed': {
      const role = glyphRole(row, status);
      return [
        {
          text,
          role: role === 'success' || role === 'secondary' ? 'dim' : role,
        },
      ];
    }
    default:
      return [{ text, role: 'dim' }];
  }
}

function responsiveContent(
  row: WorkPanelRow,
  width: number,
  measure: Measure,
  metricLayout: 'greedy' | 'columns' | 'grid' = 'greedy',
  metricGrid?: WorkPanelMetricGrid,
): WorkPanelRowContent {
  const identity = row.identity ??
    row.segments ?? [{ text: row.primary, role: 'primary' }];
  const identityUnits = identityItems(identity);
  const columnsIdentityText = columnsIdentity(identity);
  if (
    metricLayout === 'grid' &&
    (row.metrics ?? []).every((group) => group.key)
  )
    return gridContent(
      row,
      identity,
      width,
      measure,
      metricGrid ?? createWorkPanelMetricGrid([row], measure),
    );
  const separator: WorkPanelSegment = {
    text: ` ${resolveIcon('separator', '·')} `,
    role: 'meta',
  };
  const joinGroups = (groups: readonly (readonly WorkPanelSegment[])[]) =>
    groups.flatMap((group, index) =>
      index ? [separator, ...group] : [...group],
    );
  const planningMeasure: Measure = (text) =>
    measure(text.replaceAll(reservationCell, ' '));
  const groups = (row.metrics ?? []).filter(
    (group) => metricLayout === 'columns' || !group.columnsOnly,
  );
  const metrics = groups.map((group) => reservedMetricSegments(group));
  const metricSegments = joinGroups(metrics);
  const inlineWidth =
    width -
    planningMeasure(segmentText(metricSegments)) -
    measure(separator.text);
  const minIdentity =
    identityUnits
      .filter(({ body }) => body.role !== 'secondary')
      .reduce((sum, item) => sum + itemWidth(item, measure), 0) +
    (identityUnits.some(
      ({ lead, body }) => body.role === 'secondary' && (lead || body.text),
    )
      ? measure(separator.text) + 1
      : 0);
  if (metricLayout === 'columns' && groups.every((group) => group.key)) {
    const status = workPanelRenderStatus(row);
    const plan =
      metricGrid ??
      createWorkPanelColumnPlan([row], width + contentGutter(), measure);
    const columnFor = (
      column: WorkPanelMetricGrid[number],
      align: 'right' | 'left' = 'right',
      lineTwo = false,
    ) => {
      const group = groups.find(({ key }) => key === column.key);
      // Line 2 only: pending data stays blank; padding keeps the reserved width.
      const parts =
        group && !(lineTwo && group.pending)
          ? columnSegments(
              column.key,
              visibleSegments(columnMetricSegments(group)),
              row,
              status,
              column.width,
              measure,
              lineTwo ? { finished: terminalStatuses.has(status) } : undefined,
            )
          : [];
      const padding = Math.max(0, column.width - measure(segmentText(parts)));
      return {
        present: Boolean(group),
        blank: Boolean(lineTwo && group?.pending),
        parts:
          align === 'left'
            ? [...parts, { text: ' '.repeat(padding), role: 'meta' as const }]
            : [{ text: ' '.repeat(padding), role: 'meta' as const }, ...parts],
      };
    };
    if (plan.lines === 2) {
      const terminal = terminalStatuses.has(status);
      const elapsed = plan.find(({ key }) => key === 'elapsed');
      const elapsedParts = elapsed ? columnFor(elapsed).parts : [];
      const identityWidth = Math.max(
        0,
        width - (elapsed ? elapsed.width + measure(separator.text) : 0),
      );
      const admitted = withoutAttention(columnsIdentityText);
      const segments = dropTinySummary(
        fitIdentity(admitted, identityWidth, measure),
        admitted,
        measure,
      ).map((part) =>
        terminal && part.role === 'secondary'
          ? { ...part, role: 'muted' as const }
          : part,
      );
      const gap = Math.max(0, identityWidth - measure(segmentText(segments)));
      if (gap) segments.push({ text: ' '.repeat(gap), role: 'meta' });
      if (elapsed) segments.push(separator, ...elapsedParts);
      // Line 2: panel-aligned slots in plan (priority) order, warnings before model.
      const slots: {
        present: boolean;
        blank?: boolean;
        parts: WorkPanelSegment[];
      }[] = [];
      const warningSlot = () => {
        const text = attentionSegments(columnsIdentityText);
        const padding = Math.max(
          0,
          (plan.warningWidth ?? 0) - measure(segmentText(text)),
        );
        return {
          present: text.length > 0,
          parts: [
            ...text,
            { text: ' '.repeat(padding), role: 'meta' as const },
          ],
        };
      };
      let warningsPlaced = plan.warnings !== true;
      for (const column of plan) {
        if (column.key === 'elapsed') continue;
        if (!warningsPlaced && column.key === 'model') {
          slots.push(warningSlot());
          warningsPlaced = true;
        }
        slots.push(columnFor(column, 'left', true));
      }
      if (!warningsPlaced) slots.push(warningSlot());
      if (!slots.some((slot) => slot.present))
        return { text: segmentText(segments), segments };
      // A pending slot blanks with its separator; a separator needs a visible value on
      // both sides, so one before the first visible value is blank too.
      const blankSeparator: WorkPanelSegment = {
        text: ' '.repeat(measure(separator.text)),
        role: 'meta',
      };
      const second = slots.flatMap((slot, index) =>
        index
          ? [
              slot.blank || slots.slice(0, index).every(({ blank }) => blank)
                ? blankSeparator
                : separator,
              ...slot.parts,
            ]
          : [...slot.parts],
      );
      return {
        text: segmentText(segments),
        segments,
        extraRows: [segmentText(second)],
        extraSegments: [second],
        keepBlankRows: true,
      };
    }
    const columns = plan.map((column) => columnFor(column).parts);
    const columnWidth = columns.length
      ? plan.reduce((sum, { width: w }) => sum + w, 0) +
        measure(separator.text) * (columns.length - 1)
      : 0;
    const identityWidth = Math.max(
      0,
      width - columnWidth - (columns.length ? measure(separator.text) : 0),
    );
    const terminal = terminalStatuses.has(status);
    // Recolor after fitting: shrink priority follows the original roles, so the
    // summary still truncates before the name when it turns muted.
    const admitted = withoutAttention(columnsIdentityText);
    const columnsFit = plan.warnings === false ? admitted : columnsIdentityText;
    const segments = dropTinySummary(
      fitIdentityKeepName(columnsFit, identityWidth, measure),
      columnsFit,
      measure,
    ).map((part) =>
      terminal && part.role === 'secondary'
        ? { ...part, role: 'muted' as const }
        : part,
    );
    const gap = Math.max(0, identityWidth - measure(segmentText(segments)));
    if (gap) segments.push({ text: ' '.repeat(gap), role: 'meta' });
    if (columns.length) segments.push(separator, ...joinGroups(columns));
    return { text: segmentText(segments), segments };
  }
  const inline = metrics.length > 0 && inlineWidth >= minIdentity;
  const visibleMetrics = visibleSegments(metricSegments);
  const actualInlineWidth =
    width - measure(segmentText(visibleMetrics)) - measure(separator.text);
  const segments = fitIdentity(
    identity,
    inline ? actualInlineWidth : width,
    measure,
  );
  if (inline) segments.push(separator, ...visibleMetrics);
  const continuations: WorkPanelSegment[][] = [];
  if (!inline) {
    for (const group of groups) {
      const parts = reservedMetricSegments(group, true);
      const previous = continuations.at(-1);
      const joined = previous ? [...previous, separator, ...parts] : [...parts];
      if (previous && planningMeasure(segmentText(joined)) <= width)
        continuations[continuations.length - 1] = joined;
      else continuations.push([...parts]);
    }
  }
  const extraSegments = continuations.flatMap((parts) =>
    wrapSegments(parts, width, planningMeasure).map(visibleSegments),
  );
  return {
    text: segmentText(segments),
    segments,
    extraRows: extraSegments.map(segmentText),
    extraSegments,
  };
}

function panelContentReader(
  width: number,
  measure = defaultMeasure,
  metricLayout: 'greedy' | 'columns' | 'grid' = 'greedy',
  metricGrid?: WorkPanelMetricGrid,
) {
  const kit = getRenderKit();
  const contents = new Map<Pick<PanelRow, 'row'>, WorkPanelRowContent>();
  function contentFor(entry: Pick<PanelRow, 'row'>) {
    let content = contents.get(entry);
    if (!content) {
      content =
        (entry.row.identity || entry.row.metrics) &&
        // Flat `segments` rows keep their legacy host presentation outside the columns layout.
        !(metricLayout !== 'columns' && entry.row.segments)
          ? responsiveContent(
              entry.row,
              Math.max(0, width - (kit ? 7 : 4)),
              measure,
              metricLayout,
              metricGrid,
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
    1 + (keptExtraRows(contentFor(entry)).length ?? 0);
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
  /** Caller-owned tick-stepped frame; rendering alone never advances it. */
  animationFrame?: number;
  theme: RenderKitTheme;
  clip(text: string, width: number): string;
  measure?: Measure;
  selected?: boolean;
  last?: boolean;
  /** Host defaults to greedy; grid preserves all metrics in shared wrapped columns. */
  metricLayout?: 'greedy' | 'columns' | 'grid';
  metricGrid?: WorkPanelMetricGrid;
}

/** The same responsive data-row rendering used by the work-panel host. */
export function workPanelRowLineCount(
  row: WorkPanelRow,
  width: number,
  measure: Measure = defaultMeasure,
  options: Pick<WorkPanelRowRenderOptions, 'metricLayout' | 'metricGrid'> = {},
): number {
  if (!(width > 0)) return 0;
  const content = panelContentReader(
    width,
    measure,
    options.metricLayout,
    options.metricGrid,
  )({ row });
  return 1 + keptExtraRows(content, options.metricLayout === 'grid').length;
}

/** Extra rows that take height: blank ones only in grid or all-pending two-line rows. */
function keptExtraRows(content: WorkPanelRowContent, grid = false) {
  return (content.extraRows ?? []).filter(
    (extra) => grid || content.keepBlankRows || extra.trim(),
  );
}

export function renderWorkPanelRow(
  row: WorkPanelRow,
  options: WorkPanelRowRenderOptions,
): string[] {
  const { width, theme, clip } = options;
  if (!(width > 0)) return [];
  const kit = getRenderKit();
  const measure = options.measure ?? defaultMeasure;
  const fg = (role: Parameters<RenderKitTheme['fg']>[0], text: string) =>
    kit ? kit.fg(theme, role, text) : theme.fg(role, text);
  const styleSegments = segmentStyler(theme, clip, measure);
  const contentFor = panelContentReader(
    width,
    measure,
    options.metricLayout,
    options.metricGrid,
  );
  const entry = { row };
  const status = workPanelRenderStatus(row);
  const staticAnimation = getAnimationLevel() === 'off';
  const frame = options.animationFrame ?? 0;
  const indicator =
    !row.summary && !staticAnimation
      ? kit?.indicator(theme, undefined, { status, frame })
      : undefined;
  const semanticGlyph = workPanelStatusGlyph(row);
  const running = status === 'running' || status === 'in_progress';
  const frames = resolveFrames('spinnerFrames');
  const native =
    semanticGlyph && running
      ? frames[frame % frames.length]
      : nativeGlyphs[status];
  const glyph =
    semanticGlyph === 'taskInProgress'
      ? resolveIcon('taskInProgress', '◇')
      : running
        ? staticAnimation
          ? resolveStaticRunningGlyph()
          : (indicator?.glyph ?? native)
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
    ...keptExtraRows(content, options.metricLayout === 'grid').map(
      (extra, index) =>
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
    animationFrame?: number;
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
    1 + (keptExtraRows(contentFor(entry)).length ?? 0);
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
        animationFrame: options.animationFrame,
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
  'timedOut',
  'resolved',
  'expectedExit',
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
