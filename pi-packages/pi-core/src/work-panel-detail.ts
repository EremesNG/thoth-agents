import type { Component, Focusable } from '@earendil-works/pi-tui';
import {
  getRenderKit,
  type RenderKitTheme,
  resolveIcon,
} from './render-kit.js';
import type { WorkPanelDetail } from './work-panel.js';
import {
  type PanelRow,
  panelCloseLabel,
  safely,
  singleLine,
  workPanelRenderStatus,
} from './work-panel-render.js';

const hasValue = (value: string | undefined) =>
  value !== undefined && !['', '-', '–', '—'].includes(value.trim());

function statusRole(
  detail: WorkPanelDetail,
): Parameters<RenderKitTheme['fg']>[0] {
  if (detail.statusTone === 'muted') return 'muted';
  switch (workPanelRenderStatus(detail)) {
    case 'running':
    case 'in_progress':
      return 'accent';
    case 'failed':
      return 'error';
    case 'completed':
      return 'success';
    case 'cancelled':
    case 'interrupted':
    case 'deleted':
      return 'muted';
    case 'blocked':
    case 'stopping':
      return 'warning';
    default:
      return 'text';
  }
}

interface DetailOptions {
  rows(): PanelRow[];
  selected(): PanelRow | undefined;
  select(entry: PanelRow): void;
  closeItem(entry: PanelRow): void;
  clearCloseArm(): void;
  done(): void;
  onFocusLost(): void;
  requestRender(): void;
  theme: RenderKitTheme;
  height(): number;
  width(): number;
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
): Component &
  Focusable & { readonly width: number; dispose(): void; dismiss(): void } {
  let closed = false;
  let focused = false;
  let detailKey: string | undefined;
  let detail: WorkPanelDetail | null = null;
  let logTailLines = 25;
  const expanded = new Map<string, boolean>();
  let foldTarget: string | undefined;
  let foldExpanded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const EVIDENCE = '__evidence__';
  function readDetail(entry: PanelRow): WorkPanelDetail {
    const snapshot = safely(
      () => entry.provider.detail(entry.row.id, Date.now(), { logTailLines }),
      null,
    ) ?? {
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
    return {
      ...snapshot,
      status: hasValue(snapshot.status) ? snapshot.status : undefined,
      subtitle: hasValue(snapshot.subtitle) ? snapshot.subtitle : undefined,
      metadata: snapshot.metadata.filter((item) => hasValue(item.value)),
      foldedSections: snapshot.foldedSections?.filter((section) =>
        hasValue(section.text),
      ),
    };
  }
  function refreshDetail(): void {
    const entry = options.selected();
    if (!entry) {
      dismiss();
      return;
    }
    detail = readDetail(entry);
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
  // Measure every item once at opening; live detail refreshes never resize the card.
  const openingDetails = options
    .rows()
    .map((entry) => ({ entry, detail: readDetail(entry) }));
  function hintFor(entry: PanelRow | undefined, foldable: boolean): string {
    const close = panelCloseLabel(entry);
    return [
      `${resolveIcon('arrowUp', '↑')}${resolveIcon('arrowDown', '↓')} move`,
      foldable ? 'Enter expand/collapse' : '',
      close ? `x ${close}` : '',
      entry?.provider.supportsLogTail ? 'l 10/25' : '',
      'Esc back',
    ]
      .filter(Boolean)
      .join(` ${resolveIcon('separator', '·')} `);
  }
  const plain: RenderKitTheme['fg'] = (_role, text) => text;
  function fieldsFor(snapshot: WorkPanelDetail, fg = plain): string[] {
    const field = (
      label: string,
      value: string,
      role: Parameters<RenderKitTheme['fg']>[0] = 'text',
    ) =>
      fg('dim', `${singleLine(label)} ${resolveIcon('separator', '·')} `) +
      fg(role, singleLine(value));
    return [
      ...(snapshot.status
        ? [field('status', snapshot.status, statusRole(snapshot))]
        : []),
      ...(snapshot.subtitle ? [fg('text', singleLine(snapshot.subtitle))] : []),
      ...snapshot.metadata.map((item) => field(item.label, item.value)),
    ];
  }
  function blocksFor(
    snapshot: WorkPanelDetail,
    tail: boolean,
    width: number,
    fg = plain,
  ) {
    const empty = !snapshot.evidence.text.trim();
    const evidence = options.wrap(
      fg(
        empty ? 'dim' : 'text',
        empty
          ? (snapshot.evidence.emptyText ?? '(no output yet)')
          : snapshot.evidence.text,
      ),
      Math.max(1, width),
    );
    return [
      ...(snapshot.foldedSections ?? []).map((section) => ({
        id: section.id,
        label: singleLine(section.label),
        rows: options.wrap(fg('text', section.text), Math.max(1, width)),
        preview: singleLine(
          section.collapsedText ?? section.text.split(/\r?\n/)[0] ?? '',
        ),
        defaultExpanded: section.expandedByDefault ?? false,
      })),
      {
        id: EVIDENCE,
        label: singleLine(snapshot.evidence.label),
        rows: tail ? evidence.slice(-logTailLines) : evidence,
        preview: singleLine(snapshot.evidence.text.split(/\r?\n/)[0] ?? ''),
        defaultExpanded: tail,
      },
    ];
  }
  const expandedBody = (
    snapshot: WorkPanelDetail,
    entry: PanelRow,
    width: number,
  ): string[] => [
    ...fieldsFor(snapshot),
    ...blocksFor(
      snapshot,
      entry.provider.supportsLogTail === true,
      width,
    ).flatMap((block) => [block.label, ...block.rows]),
  ];
  const widthCap = Math.max(0, Math.floor(options.width()));
  const heightCap = Math.max(0, Math.floor(options.height()));
  const openingWidth = Math.min(
    widthCap,
    Math.max(
      4,
      ...openingDetails.flatMap(({ entry, detail }) => [
        options.measure(singleLine(detail.title)) + 5,
        options.measure(
          hintFor(
            entry,
            expandedBody(detail, entry, Math.max(1, widthCap - 4)).length >
              heightCap - 3,
          ),
        ) + 4,
        ...expandedBody(detail, entry, Number.MAX_SAFE_INTEGER).map(
          (row) => options.measure(row) + 4,
        ),
      ]),
    ),
  );
  const kitAtOpening = getRenderKit();
  const openingHeight = Math.min(
    heightCap,
    Math.max(
      2,
      ...openingDetails.map(({ entry, detail }) => {
        const body = (innerWidth: number) => [
          ...expandedBody(detail, entry, innerWidth),
          hintFor(entry, false),
        ];
        return kitAtOpening
          ? kitAtOpening.card(
              options.theme,
              { title: singleLine(detail.title), body },
              openingWidth,
            ).length
          : body(Math.max(1, openingWidth - 4)).length + 2;
      }),
    ),
  );
  tick();
  return {
    get width() {
      return Math.min(openingWidth, options.width());
    },
    get focused() {
      return focused;
    },
    set focused(value: boolean) {
      const lostFocus = focused && !value;
      focused = value;
      // Wait for TUI's focus update; refocusing this card also toggles false → true.
      if (lostFocus && !closed)
        void Promise.resolve().then(() => {
          if (!closed && !focused) options.onFocusLost();
        });
    },
    render(width) {
      if (closed) return [];
      refreshDetail();
      if (!detail || closed) return [];
      width = Math.max(0, Math.floor(width));
      if (!width) return [];
      const kit = getRenderKit();
      const fg: RenderKitTheme['fg'] = (role, text) =>
        kit ? kit.fg(options.theme, role, text) : options.theme.fg(role, text);
      const heading = (title: string) =>
        fg(
          'accent',
          options.theme.bold?.(singleLine(title)) ?? singleLine(title),
        );
      const snapshot = detail;
      const budget = Math.max(
        0,
        Math.min(openingHeight, Math.floor(options.height())),
      );
      const body = (innerWidth: number): string[] => {
        foldTarget = undefined;
        if (budget < 3) return [];
        const detail = snapshot;
        innerWidth = Math.max(1, innerWidth);
        const lines = fieldsFor(detail, fg);
        const entry = options.selected();
        const tail = entry?.provider.supportsLogTail === true;
        const blocks = blocksFor(detail, tail, innerWidth, fg);
        const evidenceRows = blocks.at(-1)?.rows ?? [];
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
          if (isExpanded) lines.push(heading(block.label), ...block.rows);
          else {
            const previewWidth = Math.max(
              0,
              innerWidth -
                options.measure(block.label) -
                options.measure(
                  ` ${resolveIcon('separator', '·')}  ${resolveIcon('separator', '·')} folded`,
                ),
            );
            lines.push(
              `${heading(block.label)}${fg('dim', ` ${resolveIcon('separator', '·')} `)}${fg('text', options.clip(block.preview, previewWidth))}${fg('dim', ` ${resolveIcon('separator', '·')} folded`)}`,
            );
            if (block.id === EVIDENCE) evidenceCollapsed = true;
          }
        }
        const headerRows =
          lines.length - (evidenceCollapsed ? 1 : evidenceRows.length + 1);
        const hint = hintFor(entry, foldTarget !== undefined);
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
            ...(tailCount > 1 ? [heading(detail.evidence.label)] : []),
            ...evidenceRows.slice(-(tailCount > 1 ? tailCount - 1 : tailCount)),
          ];
        }
        return [
          ...content,
          ...Array<string>(Math.max(0, available - content.length)).fill(''),
          fg('dim', hint),
        ];
      };
      const pad = (text: string, available: number) => {
        const clipped = options.clip(text, available);
        return (
          clipped +
          ' '.repeat(Math.max(0, available - options.measure(clipped)))
        );
      };
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
