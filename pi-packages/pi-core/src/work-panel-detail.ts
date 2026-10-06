import type { Component } from '@earendil-works/pi-tui';
import type { RenderKitTheme } from './render-kit.js';
import type { WorkPanelDetail } from './work-panel.js';
import { type PanelRow, safely, singleLine } from './work-panel-render.js';

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
  const expanded = new Set<string>();
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
      for (const section of detail.foldedSections ?? [])
        if (section.expandedByDefault) expanded.add(section.id);
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
      const fg = options.theme.fg.bind(options.theme);
      const lines = [fg('accent', singleLine(detail.title))];
      if (detail.status) lines.push(`status · ${singleLine(detail.status)}`);
      if (detail.subtitle) lines.push(singleLine(detail.subtitle));
      for (const item of detail.metadata)
        lines.push(`${singleLine(item.label)} · ${singleLine(item.value)}`);
      for (const section of detail.foldedSections ?? []) {
        if (expanded.has(section.id))
          lines.push(section.label, ...options.wrap(section.text, width));
        else
          lines.push(
            `${section.label} · ${singleLine(section.collapsedText ?? section.text)} · folded`,
          );
      }
      const tail = /log|transcript/i.test(detail.evidence.label);
      if (tail || expanded.has(EVIDENCE)) {
        const evidence = options.wrap(
          detail.evidence.text || '(no output yet)',
          width,
        );
        lines.push(
          detail.evidence.label,
          ...(tail ? evidence.slice(-logTailLines) : evidence),
        );
      } else
        lines.push(
          `${detail.evidence.label} · ${singleLine(detail.evidence.text)} · folded`,
        );
      const entry = options.selected();
      const label =
        (entry
          ? safely(() => entry.provider.armCloseLabel(entry.row), '')
          : '') || 'unavailable';
      const hint = `↑↓ move · Enter expand/collapse · x ${label} · l 10/25 · Esc back`;
      const budget = Math.max(2, options.height());
      const head = lines.slice(0, Math.min(lines.length, budget - 1));
      // A log tail retains newest evidence rather than oldest output at short heights.
      if (tail && lines.length > budget - 1) {
        const metadataRows = Math.min(2 + detail.metadata.length, budget - 2);
        head.splice(
          metadataRows,
          head.length - metadataRows,
          ...lines.slice(-(budget - 1 - metadataRows)),
        );
      }
      return [...head, fg('dim', hint)].map((line) =>
        options.clip(line, width),
      );
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
      } else if (options.matches(data, 'enter')) {
        const id = detail?.foldedSections?.[0]?.id ?? EVIDENCE;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
      } else if (data === 'l' || data === 'L') {
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
