import type { Component } from '@earendil-works/pi-tui';
import { getRenderKit, type RenderKitTheme } from './render-kit.js';
import type { WorkPanelDetail } from './work-panel.js';
import {
  type PanelRow,
  panelCloseLabel,
  safely,
  singleLine,
} from './work-panel-render.js';

interface DetailOptions {
  rows(): PanelRow[];
  selected(): PanelRow | undefined;
  select(entry: PanelRow): void;
  closeItem(entry: PanelRow): void;
  clearCloseArm(): void;
  done(): void;
  requestRender(): void;
  theme: RenderKitTheme;
  height(): number;
  clip(text: string, width: number): string;
  wrap(text: string, width: number): string[];
  measure(text: string): number;
  matches(
    data: string,
    key: 'up' | 'down' | 'left' | 'right' | 'enter' | 'escape',
  ): boolean;
}

/** The overlay owns its keys; the terminal listener is suspended for its entire lifetime. */
export function createWorkPanelDetail(
  options: DetailOptions,
): Component & { dispose(): void; dismiss(): void } {
  let closed = false;
  let detailKey: string | undefined;
  let detail: WorkPanelDetail | null = null;
  let logTailLines = 25;
  const expanded = new Map<string, boolean>();
  let foldTarget: string | undefined;
  let foldExpanded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const EVIDENCE = '__evidence__';
  function refreshDetail(): void {
    const entry = options.selected();
    if (!entry) {
      dismiss();
      return;
    }
    const next = safely(
      () => entry.provider.detail(entry.row.id, Date.now(), { logTailLines }),
      null,
    );
    detail = next ?? {
      id: entry.row.id,
      title: entry.row.name ?? entry.row.id,
      subtitle: entry.row.primary,
      status: entry.row.status,
      metadata: [],
      evidence: {
        label: 'details',
        text: entry.row.secondary ?? '(no details)',
      },
    };
    if (detailKey !== entry.key) {
      detailKey = entry.key;
      expanded.clear();
      foldTarget = undefined;
    }
  }
  function stopTimer(): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  function tick(): void {
    stopTimer();
    if (closed) return;
    refreshDetail();
    if (closed) return;
    options.requestRender();
    if (
      detail?.status === 'running' ||
      detail?.status === 'in_progress' ||
      detail?.status === 'orphaned'
    ) {
      timer = setTimeout(tick, 10_000);
      timer.unref?.();
    }
  }
  function dispose(): void {
    closed = true;
    stopTimer();
    options.clearCloseArm();
  }
  function dismiss(): void {
    if (closed) return;
    dispose();
    options.done();
  }
  tick();
  return {
    render(width) {
      if (closed) return [];
      refreshDetail();
      if (!detail || closed) return [];
      width = Math.max(0, Math.floor(width));
      if (!width) return [];
      const fg = options.theme.fg.bind(options.theme);
      const snapshot = detail;
      const budget = Math.max(0, Math.floor(options.height()));
      const body = (innerWidth: number): string[] => {
        foldTarget = undefined;
        if (budget < 3) return [];
        const detail = snapshot;
        innerWidth = Math.max(1, innerWidth);
        const lines: string[] = [];
        if (detail.status) lines.push(`status · ${singleLine(detail.status)}`);
        if (detail.subtitle) lines.push(singleLine(detail.subtitle));
        for (const item of detail.metadata)
          lines.push(`${singleLine(item.label)} · ${singleLine(item.value)}`);
        const entry = options.selected();
        const tail = entry?.provider.supportsLogTail === true;
        const evidenceText = detail.evidence.text.trim()
          ? detail.evidence.text
          : fg('dim', detail.evidence.emptyText ?? '(no output yet)');
        const evidence = options.wrap(evidenceText, innerWidth);
        const evidenceRows = tail ? evidence.slice(-logTailLines) : evidence;
        const blocks = [
          ...(detail.foldedSections ?? []).map((section) => ({
            id: section.id,
            label: singleLine(section.label),
            rows: options.wrap(section.text, innerWidth),
            preview: singleLine(
              section.collapsedText ?? section.text.split(/\r?\n/)[0] ?? '',
            ),
            defaultExpanded: section.expandedByDefault ?? false,
          })),
          {
            id: EVIDENCE,
            label: singleLine(detail.evidence.label),
            rows: evidenceRows,
            preview: singleLine(detail.evidence.text.split(/\r?\n/)[0] ?? ''),
            defaultExpanded: tail,
          },
        ];
        const available = Math.max(0, budget - 3);
        const metadataRows = lines.length;
        let evidenceCollapsed = false;
        // Reserve a label and one text row for each other section before deciding to fold.
        const reservedRows = blocks.reduce(
          (sum, block) => sum + Math.min(2, block.rows.length + 1),
          0,
        );
        for (const block of blocks) {
          const otherRows = reservedRows - Math.min(2, block.rows.length + 1);
          const foldable =
            block.rows.length + 1 >
            Math.max(1, available - metadataRows - otherRows);
          const isExpanded =
            !foldable || (expanded.get(block.id) ?? block.defaultExpanded);
          if (foldable && !foldTarget) {
            foldTarget = block.id;
            foldExpanded = isExpanded;
          }
          if (isExpanded) lines.push(block.label, ...block.rows);
          else {
            const previewWidth = Math.max(
              0,
              innerWidth -
                options.measure(block.label) -
                options.measure(' ·  · folded'),
            );
            lines.push(
              `${block.label} · ${options.clip(block.preview, previewWidth)}${fg('dim', ' · folded')}`,
            );
            if (block.id === EVIDENCE) evidenceCollapsed = true;
          }
        }
        const headerRows =
          lines.length - (evidenceCollapsed ? 1 : evidenceRows.length + 1);
        const label = panelCloseLabel(entry);
        const hint = [
          '↑↓ move',
          foldTarget ? 'Enter expand/collapse' : '',
          label ? `x ${label}` : '',
          tail ? 'l 10/25' : '',
          'Esc back',
        ]
          .filter(Boolean)
          .join(' · ');
        let content = lines.slice(0, available);
        if (
          tail &&
          !evidenceCollapsed &&
          lines.length > available &&
          available
        ) {
          // Retain the newest output while reserving the frame and hint.
          const headCount = Math.min(headerRows, Math.max(0, available - 2));
          const tailCount = available - headCount;
          content = [
            ...lines.slice(0, headCount),
            ...(tailCount > 1 ? [singleLine(detail.evidence.label)] : []),
            ...evidenceRows.slice(-(tailCount > 1 ? tailCount - 1 : tailCount)),
          ];
        }
        return [...content, fg('dim', hint)];
      };
      const pad = (text: string, available: number) => {
        const clipped = options.clip(text, available);
        return (
          clipped +
          ' '.repeat(Math.max(0, available - options.measure(clipped)))
        );
      };
      const kit = getRenderKit();
      if (kit)
        return kit
          .card(
            options.theme,
            {
              title: singleLine(detail.title),
              body,
            },
            width,
          )
          .slice(0, budget)
          .map((line) => pad(line, width));
      const nativeBody = body(Math.max(1, width - 4));
      const title = options.clip(
        ` ${singleLine(detail.title)} `,
        Math.max(0, width - 3),
      );
      return [
        fg(
          'accent',
          `╭─${title}${'─'.repeat(Math.max(0, width - 3 - options.measure(title)))}╮`,
        ),
        ...nativeBody.map(
          (line) =>
            `${fg('accent', '│')} ${pad(line, Math.max(0, width - 4))} ${fg('accent', '│')}`,
        ),
        fg('accent', `╰${'─'.repeat(Math.max(0, width - 2))}╯`),
      ]
        .slice(0, budget)
        .map((line) => pad(line, width));
    },
    handleInput(data) {
      if (closed) return;
      if (
        options.matches(data, 'escape') ||
        options.matches(data, 'left') ||
        options.matches(data, 'right')
      ) {
        dismiss();
        return;
      }
      if (options.matches(data, 'up') || options.matches(data, 'down')) {
        options.clearCloseArm();
        const rows = options.rows();
        const index = rows.findIndex(
          (entry) => entry.key === options.selected()?.key,
        );
        const next =
          rows[
            Math.max(
              0,
              Math.min(
                rows.length - 1,
                index + (options.matches(data, 'up') ? -1 : 1),
              ),
            )
          ];
        if (next) options.select(next);
        tick();
      } else if (data === 'x' || data === 'X') {
        const entry = options.selected();
        if (entry) options.closeItem(entry);
        refreshDetail();
      } else if (options.matches(data, 'enter') && foldTarget) {
        foldExpanded = !foldExpanded;
        expanded.set(foldTarget, foldExpanded);
      } else if (
        (data === 'l' || data === 'L') &&
        options.selected()?.provider.supportsLogTail
      ) {
        logTailLines = logTailLines === 25 ? 10 : 25;
        refreshDetail();
      } else return;
      options.requestRender();
    },
    invalidate() {},
    dispose,
    dismiss,
  };
}
