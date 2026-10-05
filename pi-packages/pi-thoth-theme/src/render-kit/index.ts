import { truncateToWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import type {
  RenderCardOptions,
  RenderIndicatorContext,
  RenderKitTheme,
  RenderRows,
  RenderStatus,
  ThothRenderKit,
} from '@thoth-agents/pi-core';
import { cachedComponent } from '../shared/cache.ts';
import { formatDuration } from '../shared/duration.ts';
import { renderBox } from '../tools/box.ts';
import {
  renderFrameBottom,
  renderFrameDivider,
  renderFrameRow,
  renderFrameTop,
} from '../tools/frame.ts';
import { getElapsedMs, syncElapsedTicker } from '../tools/ticker.ts';

const WORKING_FRAMES = ['△', '◭', '▲', '◮'];
const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const STATUS_STYLE = {
  pending: ['dim', '○'],
  queued: ['dim', '○'],
  in_progress: ['accent', '◭'],
  running: ['accent', '◭'],
  completed: ['success', '✓'],
  failed: ['error', '✗'],
  cancelled: ['muted', '⊘'],
  interrupted: ['warning', '⊘'],
  stopping: ['warning', '!'],
  deleted: ['muted', '⊘'],
  blocked: ['warning', '!'],
  unknown: ['dim', '?'],
} as const;

function statusGlyph(theme: RenderKitTheme, status: RenderStatus): string {
  const [role, glyph] = STATUS_STYLE[status];
  return theme.fg(role, glyph);
}

function indicatorStatus(context: RenderIndicatorContext): RenderStatus {
  if (context.isError) return 'failed';
  if (!context.executionStarted) return 'pending';
  return context.isPartial ? 'running' : 'completed';
}

function indicatorLabel(status: RenderStatus): string {
  if (status === 'running' || status === 'in_progress') return 'running…';
  if (status === 'completed') return 'Done';
  if (status === 'failed') return 'Error';
  return status;
}

function card(
  theme: RenderKitTheme,
  options: RenderCardOptions,
  width: number,
): string[] {
  const safeWidth = Math.max(0, Math.floor(width));
  if (safeWidth <= 0) return [];
  const bodyWidth = safeWidth <= 4 ? safeWidth : Math.max(1, safeWidth - 4);
  const rows = (source?: RenderRows): string[] => {
    const resolved = typeof source === 'function' ? source(bodyWidth) : source;
    return (resolved ?? []).flatMap((row) =>
      options.wrap ? wrapTextWithAnsi(row, bodyWidth) : [row],
    );
  };
  const footer = [
    options.status ? statusGlyph(theme, options.status) : '',
    options.footer,
  ]
    .filter(Boolean)
    .join(' ');
  const body = rows(options.body);
  if (!options.sections?.length && (!options.part || options.part === 'full')) {
    return renderBox(theme, body, safeWidth, { ...options, footer });
  }
  const isError = options.isError;
  return [
    ...(options.part === 'end'
      ? []
      : options.title
        ? renderFrameTop(theme, options.title, safeWidth, isError)
        : renderBox(theme, [], safeWidth, { isError }).slice(0, 1)),
    ...body.flatMap((row) => renderFrameRow(theme, row, safeWidth, isError)),
    ...(options.sections ?? []).flatMap((section) => [
      ...renderFrameDivider(theme, section.title ?? '', safeWidth, isError),
      ...rows(section.rows).flatMap((row) =>
        renderFrameRow(theme, row, safeWidth, isError),
      ),
    ]),
    ...(options.part === 'start'
      ? []
      : renderFrameBottom(theme, footer, safeWidth, isError)),
  ];
}

/** Theme primitives exposed structurally; producers never import this package. */
export function createRenderKit(
  owner: object,
  resolveToolRenderers?: ThothRenderKit['resolveToolRenderers'],
): ThothRenderKit {
  return {
    version: 1,
    ...(resolveToolRenderers ? { resolveToolRenderers } : {}),
    card,
    collapse(theme, rows, options = {}) {
      const budget = Math.max(0, Math.floor(options.budget ?? 8));
      if (options.expanded || rows.length <= budget) return [...rows];
      return [
        ...rows.slice(0, budget),
        theme.fg(
          'dim',
          `… ${rows.length - budget} more lines · ${options.expandHint ?? 'ctrl+o to expand'}`,
        ),
      ];
    },
    cachedComponent,
    indicator(theme, context = {}, options = {}) {
      syncElapsedTicker(context, owner);
      const status = options.status ?? indicatorStatus(context);
      const running = status === 'running' || status === 'in_progress';
      const elapsedMs = options.elapsedMs ?? getElapsedMs(context.state);
      const elapsed =
        elapsedMs === undefined
          ? ''
          : formatDuration(
              running ? Math.floor(elapsedMs / 1000) * 1000 : elapsedMs,
            );
      const frame = options.frame;
      const workingGlyph =
        frame !== undefined && Number.isFinite(frame)
          ? BRAILLE_FRAMES[
              ((Math.floor(frame) % BRAILLE_FRAMES.length) +
                BRAILLE_FRAMES.length) %
                BRAILLE_FRAMES.length
            ]
          : WORKING_FRAMES[
              Math.floor((elapsedMs ?? 0) / 1000) % WORKING_FRAMES.length
            ];
      const glyph = running
        ? theme.fg('accent', workingGlyph)
        : statusGlyph(theme, status);
      const label = options.label ?? indicatorLabel(status);
      const role = STATUS_STYLE[status][0];
      return {
        glyph,
        elapsedMs,
        elapsed,
        text: [theme.fg(role, label), elapsed ? theme.fg('dim', elapsed) : '']
          .filter(Boolean)
          .join(theme.fg('dim', ' · ')),
      };
    },
    statusGlyph,
    widgetHeading(theme, options, width) {
      const title = theme.fg('toolTitle', options.title);
      return truncateToWidth(
        [
          options.status
            ? statusGlyph(theme, options.status)
            : theme.fg('accent', '▲'),
          theme.bold ? theme.bold(title) : title,
          options.counts
            ? theme.fg(
                'dim',
                `${options.counts.completed}/${options.counts.total}`,
              )
            : '',
          options.suffix ? theme.fg('dim', options.suffix) : '',
        ]
          .filter(Boolean)
          .join(' '),
        Math.max(0, Math.floor(width)),
      );
    },
    treeRow(theme, options, width) {
      const rail = `${'  '.repeat(Math.max(0, Math.floor(options.depth ?? 0)))}${options.last ? '└─' : '├─'} `;
      return truncateToWidth(
        [
          theme.fg(
            options.selected ? 'accent' : 'dim',
            `${options.selected ? '› ' : '  '}${rail}`,
          ),
          options.status ? `${statusGlyph(theme, options.status)} ` : '',
          options.text,
        ].join(''),
        Math.max(0, Math.floor(width)),
      );
    },
    fg: (theme, role, text) => theme.fg(role, text),
  };
}
