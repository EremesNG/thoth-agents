import {
  getRenderKit,
  type RenderKitTheme,
  type RenderStatus,
} from './render-kit.js';
import type {
  WorkPanelProvider,
  WorkPanelRow,
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

function summaryText(
  summary: WorkPanelSummary | string | undefined,
  rows: PanelRow[],
): string {
  if (typeof summary === 'string') return singleLine(summary);
  if (summary?.text !== undefined) return singleLine(summary.text);
  if (summary?.total !== undefined && summary.completed !== undefined)
    return `${summary.completed}/${summary.total} done`;
  const parts: string[] = [];
  if (summary?.running !== undefined) parts.push(`${summary.running} running`);
  if (summary?.failed) parts.push(`${summary.failed} failed`);
  return parts.join(' · ') || `${rows.length} items`;
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
  options: { selectedKey?: string; hint?: string; budget?: number } = {},
): string[] {
  if (!(width > 0)) return [];
  width = Math.floor(width);
  const kit = getRenderKit();
  const fg = (role: Parameters<RenderKitTheme['fg']>[0], text: string) =>
    kit ? kit.fg(theme, role, text) : theme.fg(role, text);
  const budget = Math.max(0, Math.floor(options.budget ?? 12));
  let remaining = Math.max(0, budget - (options.hint ? 1 : 0));
  const visible = sections.slice(0, Math.floor(remaining / 2));
  const selectedSection = sections.find((section) =>
    section.rows.some((entry) => entry.key === options.selectedKey),
  );
  if (selectedSection && visible.length && !visible.includes(selectedSection)) {
    visible[visible.length - 1] = selectedSection;
    visible.sort((a, b) => sections.indexOf(a) - sections.indexOf(b));
  }
  const contents = new Map<
    PanelRow,
    { text: string; extraRows?: readonly string[] }
  >();
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
        extraRows: entry.row.extraRows,
      };
      contents.set(entry, content);
    }
    return content;
  }
  const minimumCost = (section: PanelSection) => {
    const entry =
      section.rows.find((row) => row.key === options.selectedKey) ??
      section.rows[0];
    if (!entry) return 0;
    return (
      2 +
      (contentFor(entry).extraRows?.filter((extra) => extra.trim()).length ??
        0) +
      (section.rows.length > 1 ? 1 : 0)
    );
  };
  // Preserve whole item/metrics blocks; at tiny heights drop a low-priority section,
  // never the selected section, before stripping a selected item's continuation.
  while (
    visible.length > 1 &&
    visible.reduce((sum, section) => sum + minimumCost(section), 0) > remaining
  ) {
    let removable = visible.length - 1;
    if (visible[removable] === selectedSection) removable -= 1;
    visible.splice(removable, 1);
  }
  const lines: string[] = [];
  for (const [sectionIndex, section] of visible.entries()) {
    const { provider, rows } = section;
    const reserved = visible
      .slice(sectionIndex + 1)
      .reduce((sum, next) => sum + minimumCost(next), 0);
    const quota = Math.min(
      remaining,
      Math.max(
        minimumCost(section),
        Math.min(
          Math.floor(remaining / (visible.length - sectionIndex)),
          remaining - reserved,
        ),
      ),
    );
    const cap = Math.max(1, Math.floor(provider.rowCap ?? 3));
    const selectedIndex = rows.findIndex(
      (entry) => entry.key === options.selectedKey,
    );
    const start = Math.max(0, selectedIndex - cap + 1);
    const window = rows.slice(start, start + cap);
    const blocks = window.map((entry, index) => {
      const { row, key } = entry;
      const status = workPanelRenderStatus(row);
      const indicator = kit?.indicator(theme, undefined, { status });
      const glyph = safely(
        () =>
          typeof row.statusGlyph === 'function'
            ? row.statusGlyph(now)
            : (row.statusGlyph ?? indicator?.glyph ?? nativeGlyphs[status]),
        nativeGlyphs[status],
      );
      const content = contentFor(entry);
      return {
        key,
        lines: [
          kit
            ? kit.treeRow(
                theme,
                {
                  text: `${glyph} ${singleLine(content.text)}`,
                  selected: options.selectedKey === key,
                  depth: 0,
                  last: index === window.length - 1,
                },
                width,
              )
            : `${options.selectedKey === key ? fg('accent', '› ') : '  '}${glyph} ${singleLine(content.text)}`,
          ...(content.extraRows ?? [])
            .filter((extra) => extra.trim())
            .map((extra) =>
              fg('dim', `${kit ? '       ' : '    '}${singleLine(extra)}`),
            ),
        ],
      };
    });
    const size = () =>
      1 +
      blocks.reduce((sum, block) => sum + block.lines.length, 0) +
      (rows.length > blocks.length ? 1 : 0);
    while (blocks.length > 1 && size() > quota) {
      if (selectedIndex >= 0 && blocks[0]?.key !== options.selectedKey)
        blocks.shift();
      else blocks.pop();
    }
    const title = singleLine(provider.label).replace(/\b\p{L}/gu, (letter) =>
      letter.toUpperCase(),
    );
    const counter = summaryText(
      safely(() => provider.summary?.(), undefined),
      rows,
    );
    const sectionLines = [
      kit
        ? kit.widgetHeading(
            theme,
            { title: `◆ ${title}`, suffix: `· ${counter}` },
            width,
          )
        : fg('accent', `◆ ${title} · ${counter}`),
    ];
    const hidden = rows.length - blocks.length;
    const more = hidden > 0 && quota >= 3;
    const bodyBudget = quota - 1 - (more ? 1 : 0);
    sectionLines.push(
      ...blocks.flatMap((block) => block.lines).slice(0, bodyBudget),
    );
    if (more) sectionLines.push(fg('dim', `  +${hidden} more`));
    lines.push(...sectionLines);
    remaining -= sectionLines.length;
  }
  if (options.hint && budget) lines.push(fg('dim', options.hint));
  return lines.map((line) => clip(line, width));
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
