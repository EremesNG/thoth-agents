import {
  getRenderKit,
  type RenderKitTheme,
  type RenderStatus,
} from './render-kit.js';
import type {
  WorkPanelProvider,
  WorkPanelRow,
  WorkPanelRowContent,
  WorkPanelSegment,
  WorkPanelSegmentRole,
  WorkPanelSummary,
} from './work-panel.js';

export interface PanelRow {
  provider: WorkPanelProvider;
  row: WorkPanelRow;
  key: string;
  parent?: boolean;
}
export interface PanelSection {
  provider: WorkPanelProvider;
  rows: PanelRow[];
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

export function panelSections(
  providers: WorkPanelProvider[],
  now: number,
): PanelSection[] {
  const sections: PanelSection[] = [];
  for (const provider of [...providers].sort(
    (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
  )) {
    const rows = safely(() => provider.listRows(now), []);
    const parent = safely(() => provider.parentRow?.(now), undefined);
    if (!rows.length && !parent) continue;
    if (!safely(() => provider.showSection?.(rows, now) ?? true, false))
      continue;
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
  return sections.filter((section) => section.rows.length);
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
    if (parts.length) parts.push({ text: ' · ', role: 'meta' });
    parts.push({ text: `${summary.failed} failed`, role: 'error' });
  }
  return parts.length
    ? parts
    : [{ text: `${rows.length} items`, role: 'meta' }];
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

export function renderPanel(
  sections: PanelSection[],
  width: number,
  now: number,
  theme: RenderKitTheme,
  clip: (text: string, width: number) => string,
  options: {
    selectedKey?: string;
    hint?: string;
    cue?: string;
    budget?: number;
    measure?: (text: string) => number;
  } = {},
): string[] {
  if (!(width > 0)) return [];
  width = Math.floor(width);
  const kit = getRenderKit();
  const fg = (role: Parameters<RenderKitTheme['fg']>[0], text: string) =>
    kit ? kit.fg(theme, role, text) : theme.fg(role, text);
  const measure =
    options.measure ??
    // biome-ignore lint/suspicious/noControlCharactersInRegex: optional-peer fallback measures ANSI-styled headings.
    ((text: string) => [...text.replace(/\x1b\[[0-9;]*m/g, '')].length);
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
    const shrinkOrder: WorkPanelSegmentRole[] = [
      'secondary',
      'primary',
      'dim',
      'muted',
      'meta',
      'accent',
      'success',
      'warning',
      'error',
    ];
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
        return role === 'primary' && theme.bold ? theme.bold(styled) : styled;
      })
      .join('');
  };
  const budget = Math.max(0, Math.floor(options.budget ?? 12));
  const remaining = Math.max(0, budget - (options.hint ? 1 : 0));
  const visible = sections.slice(0, Math.floor(remaining / 2));
  const selectedSection = sections.find((section) =>
    section.rows.some((entry) => entry.key === options.selectedKey),
  );
  if (selectedSection && visible.length && !visible.includes(selectedSection)) {
    visible[visible.length - 1] = selectedSection;
    visible.sort((a, b) => sections.indexOf(a) - sections.indexOf(b));
  }
  const contents = new Map<PanelRow, WorkPanelRowContent>();
  function contentFor(entry: PanelRow) {
    let content = contents.get(entry);
    if (!content) {
      content = safely(
        () => entry.row.render?.(Math.max(0, width - (kit ? 7 : 4)), now),
        undefined,
      ) ?? {
        text: [entry.row.name, entry.row.primary, entry.row.elapsed]
          .filter(Boolean)
          .join(' · '),
        segments: entry.row.segments ?? [
          ...(entry.row.name
            ? [
                { text: entry.row.name, role: 'primary' as const },
                { text: ' · ', role: 'meta' as const },
              ]
            : []),
          {
            text: entry.row.primary,
            role: entry.row.name ? 'secondary' : 'primary',
          },
          ...(entry.row.elapsed
            ? [{ text: ` · ${entry.row.elapsed}`, role: 'meta' as const }]
            : []),
        ],
        extraRows: entry.row.extraRows,
      };
      contents.set(entry, content);
    }
    return content;
  }
  const blockCost = (entry: PanelRow) =>
    1 +
    (contentFor(entry).extraRows?.filter((extra) => extra.trim()).length ?? 0);
  const plans = visible.map((section) => {
    const items = section.rows.filter(({ row }) => !row.summary);
    const summaries = section.rows.filter(({ row }) => row.summary);
    const selectedIndex = items.findIndex(
      ({ key }) => key === options.selectedKey,
    );
    const initial = items[selectedIndex >= 0 ? selectedIndex : 0];
    return {
      section,
      items,
      summaries,
      chosen: initial ? [initial] : [],
      selectedIndex,
    };
  });
  const cost = (plan: (typeof plans)[number]) =>
    1 +
    plan.chosen.reduce((sum, entry) => sum + blockCost(entry), 0) +
    plan.summaries.length +
    (plan.items.length > plan.chosen.length ? 1 : 0);
  const totalCost = () => plans.reduce((sum, plan) => sum + cost(plan), 0);
  // Whole metric blocks and the selected section take precedence over lower sections.
  while (plans.length > 1 && totalCost() > remaining) {
    let removable = plans.length - 1;
    if (plans[removable]?.section === selectedSection) removable -= 1;
    plans.splice(removable, 1);
  }
  // First share the budget within preferred caps, then use spare space for open items.
  for (const capped of [true, false]) {
    let added: boolean;
    do {
      added = false;
      for (const plan of plans) {
        const cap = Math.max(1, Math.floor(plan.section.provider.rowCap ?? 3));
        if (capped && plan.chosen.length >= cap) continue;
        const start = Math.max(0, plan.selectedIndex - cap + 1);
        const candidates = [
          ...plan.items.slice(start),
          ...plan.items.slice(0, start),
        ];
        const next = candidates.find((entry) => !plan.chosen.includes(entry));
        if (!next) continue;
        const delta =
          blockCost(next) -
          (plan.chosen.length + 1 === plan.items.length ? 1 : 0);
        if (totalCost() + delta > remaining) continue;
        plan.chosen.push(next);
        added = true;
      }
    } while (added);
  }
  const lines: string[] = [];
  for (const plan of plans) {
    const { provider, rows } = plan.section;
    const chosen = [...plan.chosen].sort(
      (a, b) => rows.indexOf(a) - rows.indexOf(b),
    );
    const entries = [...chosen, ...plan.summaries];
    const blocks = entries.map((entry, index) => {
      const { row, key } = entry;
      const status = workPanelRenderStatus(row);
      const indicator = !row.summary
        ? kit?.indicator(theme, undefined, { status })
        : undefined;
      const glyph = safely(
        () =>
          typeof row.statusGlyph === 'function'
            ? row.statusGlyph(now)
            : (row.statusGlyph ?? indicator?.glyph ?? nativeGlyphs[status]),
        nativeGlyphs[status],
      );
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
                selected: !row.summary && options.selectedKey === key,
                depth: 0,
                last:
                  index === entries.length - 1 &&
                  chosen.length === plan.items.length,
              },
              width,
            )
          : `${options.selectedKey === key && !row.summary ? fg('accent', '› ') : '  '}${styledGlyph}${body}`,
        ...(content.extraRows ?? [])
          .filter((extra) => extra.trim())
          .map((extra, index) =>
            content.extraSegments?.[index]
              ? `${kit ? '       ' : '    '}${styleSegments(content.extraSegments[index])}`
              : fg('dim', `${kit ? '       ' : '    '}${singleLine(extra)}`),
          ),
      ];
    });
    const title = singleLine(provider.label).replace(/\b\p{L}/gu, (letter) =>
      letter.toUpperCase(),
    );
    const counter = styleSegments(
      summarySegments(
        safely(() => provider.summary?.(), undefined),
        rows,
      ),
    );
    const sectionLines = [
      kit
        ? kit.widgetHeading(theme, { title, suffix: `· ${counter}` }, width)
        : `${fg('accent', '◆')} ${fg('toolTitle', title)} ${fg('dim', '· ')}${counter}`,
    ];
    if (!lines.length && options.cue) {
      const cue = fg('dim', options.cue);
      const heading = sectionLines[0] ?? '';
      const gap = width - measure(heading) - measure(cue);
      if (gap > 0) sectionLines[0] = `${heading}${' '.repeat(gap)}${cue}`;
      else if (width <= measure(cue) + 3) sectionLines[0] = clip(cue, width);
      else
        sectionLines[0] = `${clip(heading, width - measure(cue) - 3)} · ${cue}`;
    }
    const hidden = plan.items.length - chosen.length;
    const more = hidden > 0 && remaining - lines.length >= 3;
    const bodyBudget = Math.max(
      0,
      remaining - lines.length - 1 - (more ? 1 : 0),
    );
    sectionLines.push(...blocks.flat().slice(0, bodyBudget));
    if (more) sectionLines.push(fg('dim', `  +${hidden} more`));
    lines.push(...sectionLines);
  }
  if (options.hint && budget) lines.push(fg('dim', options.hint));
  return lines.slice(0, budget).map((line) => clip(line, width));
}

/** Shared status mapping for providers whose runtime has additional terminal states. */
export function workPanelRenderStatus(
  row: Pick<WorkPanelRow, 'status' | 'statusTone'>,
): RenderStatus {
  if (row.statusTone === 'running') return 'running';
  if (row.statusTone === 'success') return 'completed';
  if (row.statusTone === 'failed') return 'failed';
  if (row.statusTone === 'warning') return 'blocked';
  const statuses: readonly string[] = [
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
  return statuses.includes(row.status ?? '')
    ? (row.status as RenderStatus)
    : 'unknown';
}
