import {
  stripTerminalSequences,
  truncateToWidth,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import type {
  RenderCardOptions,
  RenderIndicatorContext,
  RenderKitTheme,
  RenderRows,
  RenderStatus,
  RenderToolFooterOptions,
  ThothRenderKit,
} from '@thoth-agents/pi-core';
import { getToolElapsedMs } from '@thoth-agents/pi-core';
import { cachedComponent } from '../shared/cache.ts';
import { formatDuration } from '../shared/duration.ts';
import { getBorderTone } from '../tools/border.ts';
import { renderBox } from '../tools/box.ts';
import {
  renderFrameBottom,
  renderFrameDivider,
  renderFrameRow,
  renderFrameTop,
} from '../tools/frame.ts';
import { syncElapsedTicker } from '../tools/ticker.ts';
import { runningFooter, workingFrame } from './working.ts';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const STATUS_STYLE = {
  pending: ['dim', '○'],
  queued: ['dim', '○'],
  in_progress: ['accent', '◇'],
  running: ['accent', '◇'],
  completed: ['success', '✓'],
  failed: ['error', '✗'],
  cancelled: ['muted', '⊘'],
  interrupted: ['warning', '⊘'],
  stopping: ['warning', '!'],
  deleted: ['muted', '⊘'],
  blocked: ['warning', '!'],
  unknown: ['dim', '?'],
} as const;

const TOOL_FOOTER_GLYPHS: Partial<Record<RenderStatus, '✓' | '✗'>> = {
  completed: '✓',
  deleted: '✓',
  failed: '✗',
  cancelled: '✗',
  interrupted: '✗',
  blocked: '✗',
};

function isRunning(status: RenderStatus): boolean {
  return status === 'running' || status === 'in_progress';
}

function statusGlyph(theme: RenderKitTheme, status: RenderStatus): string {
  const [role, glyph] = STATUS_STYLE[status];
  return theme.fg(role, glyph);
}

function indicatorStatus(context: RenderIndicatorContext): RenderStatus {
  if (context.executionStarted && context.isPartial) return 'running';
  if (context.isError) return 'failed';
  return context.executionStarted ? 'completed' : 'pending';
}

function indicatorLabel(status: RenderStatus): string {
  if (status === 'completed') return 'Done';
  if (status === 'failed') return 'Error';
  return status;
}

function card(
  theme: RenderKitTheme,
  options: RenderCardOptions,
  width: number,
  toolFooter: NonNullable<ThothRenderKit['toolFooter']>,
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
  let footer = options.footer ?? '';
  if (options.footer === undefined && options.status) {
    footer = options.context
      ? toolFooter(theme, {
          status: options.status,
          context: options.context,
          summary: options.summary,
        })
      : statusGlyph(theme, options.status);
  } else if (
    options.status &&
    !isRunning(options.status) &&
    !(
      TOOL_FOOTER_GLYPHS[options.status] &&
      /^[✓✗](?:\s|$)/u.test(stripTerminalSequences(footer))
    )
  ) {
    footer = [statusGlyph(theme, options.status), footer]
      .filter(Boolean)
      .join(' ');
  }
  const body = rows(options.body);
  const borderState = {
    isError: options.isError,
    isSuccess: options.isSuccess === true,
  };
  if (!options.sections?.length && (!options.part || options.part === 'full')) {
    return renderBox(theme, body, safeWidth, {
      ...options,
      ...borderState,
      footer,
    });
  }
  const borderTone = getBorderTone(borderState);
  return [
    ...(options.part === 'end'
      ? []
      : options.title
        ? renderFrameTop(theme, options.title, safeWidth, borderTone)
        : renderBox(theme, [], safeWidth, borderState).slice(0, 1)),
    ...body.flatMap((row) => renderFrameRow(theme, row, safeWidth, borderTone)),
    ...(options.sections ?? []).flatMap((section) => [
      ...renderFrameDivider(theme, section.title ?? '', safeWidth, borderTone),
      ...rows(section.rows).flatMap((row) =>
        renderFrameRow(theme, row, safeWidth, borderTone),
      ),
    ]),
    ...(options.part === 'start'
      ? []
      : renderFrameBottom(theme, footer, safeWidth, borderTone)),
  ];
}

/** Shared standard footer for kit producers and theme built-ins. */
export function toolFooter(
  theme: RenderKitTheme,
  options: RenderToolFooterOptions,
  owner?: object,
): string {
  syncElapsedTicker(options.context ?? {}, owner, options.status);
  const elapsedMs = getToolElapsedMs(options);
  if (isRunning(options.status)) return runningFooter(theme, elapsedMs);
  const glyph = TOOL_FOOTER_GLYPHS[options.status];
  const summary =
    typeof options.summary === 'string'
      ? [options.summary]
      : (options.summary ?? []);
  const parts = [
    theme.fg(STATUS_STYLE[options.status][0], glyph ?? options.status),
  ];
  if (elapsedMs !== undefined) {
    parts.push(
      theme.fg('dim', formatDuration(Math.floor(elapsedMs / 1000) * 1000)),
    );
  }
  if (glyph) {
    parts.push(...summary.filter(Boolean).map((part) => theme.fg('dim', part)));
  }
  return parts.join(theme.fg('dim', ' · '));
}

/** Theme primitives exposed structurally; producers never import this package. */
export function createRenderKit(
  owner: object,
  resolveToolRenderers?: ThothRenderKit['resolveToolRenderers'],
): ThothRenderKit {
  const ownedToolFooter: NonNullable<ThothRenderKit['toolFooter']> = (
    theme,
    options,
  ) => toolFooter(theme, options, owner);

  return {
    version: 1,
    ...(resolveToolRenderers ? { resolveToolRenderers } : {}),
    toolFooter: ownedToolFooter,
    card(theme, options, width) {
      if (options.footer !== undefined && options.context && options.status) {
        syncElapsedTicker(options.context, owner, options.status);
      }
      return card(theme, options, width, ownedToolFooter);
    },
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
      const status = options.status ?? indicatorStatus(context);
      syncElapsedTicker(context, owner, status);
      const running = isRunning(status);
      const elapsedMs = getToolElapsedMs({ ...options, status, context });
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
          : workingFrame(elapsedMs);
      const glyph = running
        ? theme.fg('accent', workingGlyph)
        : statusGlyph(theme, status);
      const label = options.label ?? indicatorLabel(status);
      const role = STATUS_STYLE[status][0];
      return {
        glyph,
        elapsedMs,
        elapsed,
        text: running
          ? ownedToolFooter(theme, { status, elapsedMs })
          : [theme.fg(role, label), elapsed ? theme.fg('dim', elapsed) : '']
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
