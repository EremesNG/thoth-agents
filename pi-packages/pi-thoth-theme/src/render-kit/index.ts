import type { KeybindingHints } from '@earendil-works/pi-coding-agent';
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
import {
  getToolElapsedMs,
  isAnimationEffectEnabled,
} from '@thoth-agents/pi-core';
import { cachedComponent } from '../shared/cache.ts';
import type { IconMode, ThemeConfig, ToolDensity } from '../shared/config.ts';
import { formatDuration } from '../shared/duration.ts';
import { resolveExpandHint } from '../shared/expand-hint.ts';
import { frames, icon, statusIcon } from '../shared/icons.ts';
import { getBorderTone } from '../tools/border.ts';
import { renderBox } from '../tools/box.ts';
import {
  buildCompactRows,
  type CompactRowState,
  compactElapsed,
} from '../tools/compact-row.ts';
import {
  renderFrameBottom,
  renderFrameDivider,
  renderFrameRow,
  renderFrameTop,
} from '../tools/frame.ts';
import {
  type ElapsedRenderContext,
  syncElapsedTicker,
} from '../tools/ticker.ts';
import { runningFooter, workingFrame } from './working.ts';

const STATUS_ROLE = {
  pending: 'dim',
  queued: 'dim',
  in_progress: 'accent',
  running: 'accent',
  completed: 'success',
  failed: 'error',
  timedOut: 'warning',
  resolved: 'muted',
  expectedExit: 'dim',
  cancelled: 'muted',
  interrupted: 'warning',
  stopping: 'warning',
  deleted: 'muted',
  blocked: 'warning',
  unknown: 'dim',
} as const satisfies Record<RenderStatus, string>;

/** Terminal statuses whose footer shows an icon and summary. */
const TOOL_FOOTER_STATUS: Partial<Record<RenderStatus, RenderStatus>> = {
  completed: 'completed',
  deleted: 'completed',
  failed: 'failed',
  timedOut: 'timedOut',
  resolved: 'resolved',
  expectedExit: 'expectedExit',
  cancelled: 'failed',
  interrupted: 'failed',
  blocked: 'failed',
};

function startsWithFooterGlyph(footer: string, mode: IconMode): boolean {
  const plain = stripTerminalSequences(footer);
  return (
    ['completed', 'failed', 'timedOut', 'resolved', 'expectedExit'] as const
  ).some((status) => {
    const glyph = statusIcon(status, mode);
    return (
      plain.startsWith(glyph) &&
      (plain.length === glyph.length || /^\s/u.test(plain.slice(glyph.length)))
    );
  });
}

function isRunning(status: RenderStatus): boolean {
  return status === 'running' || status === 'in_progress';
}

function statusGlyph(
  theme: RenderKitTheme,
  status: RenderStatus,
  mode: IconMode,
): string {
  return theme.fg(STATUS_ROLE[status], statusIcon(status, mode));
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

const FAILED_STATUSES: ReadonlySet<RenderStatus> = new Set([
  'failed',
  'timedOut',
  'cancelled',
  'interrupted',
  'blocked',
]);

function compactCardState(options: RenderCardOptions): CompactRowState {
  if (options.status && isRunning(options.status)) return 'running';
  return options.isError ||
    (options.status && FAILED_STATUSES.has(options.status))
    ? 'error'
    : 'success';
}

/** Collapsed-row rendering of an opted-in tool card (`surface: 'tool'`). */
function compactCard(
  theme: RenderKitTheme,
  options: RenderCardOptions,
  width: number,
  mode: IconMode,
  density: Exclude<ToolDensity, 'frame'>,
  owner: object,
): string[] {
  if (options.part === 'start') return [];
  const state = compactCardState(options);
  const plain = (text: string | undefined) =>
    stripTerminalSequences(text ?? '');
  const { row } = options;
  const body =
    row?.body ??
    (typeof options.body === 'function'
      ? options.body(Math.max(1, width))
      : options.body);
  const firstLine = (body ?? [])
    .map((line) => plain(line).trim())
    .find(Boolean);
  // Row data keeps `summary` as the primary argument in every state; legacy
  // `options.summary` stays a terminal-only tail.
  const tailSource = row ? row.tail : options.summary;
  const terminalTail =
    typeof tailSource === 'string' ? [tailSource] : (tailSource ?? []);
  return buildCompactRows(
    theme,
    {
      density,
      state,
      mode,
      title: plain(row?.title ?? options.title),
      summary: row?.summary === undefined ? undefined : plain(row.summary),
      tail: [
        options.context
          ? compactElapsed(
              options.context as ElapsedRenderContext,
              state,
              owner,
            )
          : undefined,
        ...(state === 'running' ? [] : terminalTail.map(plain)),
      ],
      frame: options.context?.state?.animationFrame,
      continuation: firstLine,
      errorLine: firstLine,
      expandHint:
        state === 'running'
          ? ''
          : resolveExpandHint(options.context as Partial<KeybindingHints>),
    },
    width,
  );
}

function card(
  theme: RenderKitTheme,
  options: RenderCardOptions,
  width: number,
  toolFooter: NonNullable<ThothRenderKit['toolFooter']>,
  mode: IconMode,
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
      : statusGlyph(theme, options.status, mode);
  } else if (
    options.status &&
    !isRunning(options.status) &&
    !(TOOL_FOOTER_STATUS[options.status] && startsWithFooterGlyph(footer, mode))
  ) {
    footer = [statusGlyph(theme, options.status, mode), footer]
      .filter(Boolean)
      .join(' ');
  }
  const body = rows(options.body);
  const ellipsis = icon('ellipsis', mode);
  const borderState = {
    isError: options.isError,
    isSuccess: options.isSuccess === true,
  };
  if (!options.sections?.length && (!options.part || options.part === 'full')) {
    return renderBox(theme, body, safeWidth, {
      ...options,
      ...borderState,
      footer,
      ellipsis,
    });
  }
  const borderTone = getBorderTone(borderState);
  return [
    ...(options.part === 'end'
      ? []
      : options.title
        ? renderFrameTop(theme, options.title, safeWidth, borderTone)
        : renderBox(theme, [], safeWidth, { ...borderState, ellipsis }).slice(
            0,
            1,
          )),
    ...body.flatMap((row) =>
      renderFrameRow(theme, row, safeWidth, borderTone, ellipsis),
    ),
    ...(options.sections ?? []).flatMap((section) => [
      ...renderFrameDivider(theme, section.title ?? '', safeWidth, borderTone),
      ...rows(section.rows).flatMap((row) =>
        renderFrameRow(theme, row, safeWidth, borderTone, ellipsis),
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
  mode: IconMode,
  owner?: object,
): string {
  syncElapsedTicker(options.context ?? {}, owner, options.status);
  const elapsedMs = getToolElapsedMs(options);
  if (isRunning(options.status))
    return runningFooter(
      theme,
      elapsedMs,
      mode,
      options.context?.state?.animationFrame,
    );
  const footerStatus = TOOL_FOOTER_STATUS[options.status];
  const glyph = footerStatus ? statusIcon(footerStatus, mode) : undefined;
  const summary =
    typeof options.summary === 'string'
      ? [options.summary]
      : (options.summary ?? []);
  const parts = [
    theme.fg(STATUS_ROLE[options.status], glyph ?? options.status),
  ];
  if (elapsedMs !== undefined) {
    parts.push(
      theme.fg('dim', formatDuration(Math.floor(elapsedMs / 1000) * 1000)),
    );
  }
  if (glyph) {
    parts.push(...summary.filter(Boolean).map((part) => theme.fg('dim', part)));
  }
  return parts.join(theme.fg('dim', ` ${icon('separator', mode)} `));
}

/** Theme primitives exposed structurally; producers never import this package. */
export function createRenderKit(
  owner: object,
  resolveToolRenderers?: ThothRenderKit['resolveToolRenderers'],
  settings: IconMode | ThemeConfig = 'nerd',
  density: ToolDensity = 'frame',
): ThothRenderKit {
  const getMode = () =>
    typeof settings === 'string' ? settings : settings.icons;
  const getDensity = () =>
    typeof settings === 'string'
      ? density
      : (settings.tools.collapsed ?? 'frame');
  const ownedToolFooter: NonNullable<ThothRenderKit['toolFooter']> = (
    theme,
    options,
  ) => toolFooter(theme, options, getMode(), owner);

  return {
    version: 1,
    ...(resolveToolRenderers ? { resolveToolRenderers } : {}),
    toolFooter: ownedToolFooter,
    card(theme, options, width) {
      const mode = getMode();
      const currentDensity = getDensity();
      if (
        currentDensity !== 'frame' &&
        options.surface === 'tool' &&
        options.expanded === false
      ) {
        return compactCard(
          theme,
          options,
          Math.max(0, Math.floor(width)),
          mode,
          currentDensity,
          owner,
        );
      }
      if (options.footer !== undefined && options.context && options.status) {
        syncElapsedTicker(options.context, owner, options.status);
      }
      return card(theme, options, width, ownedToolFooter, mode);
    },
    collapse(theme, rows, options = {}) {
      const mode = getMode();
      const budget = Math.max(0, Math.floor(options.budget ?? 8));
      if (options.expanded || rows.length <= budget) return [...rows];
      return [
        ...rows.slice(0, budget),
        theme.fg(
          'dim',
          `${icon('ellipsis', mode)} ${rows.length - budget} more lines${options.expandHint ? ` ${icon('separator', mode)} ${options.expandHint}` : ''}`,
        ),
      ];
    },
    cachedComponent,
    indicator(theme, context = {}, options = {}) {
      const mode = getMode();
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
      const spinner = frames('spinnerFrames', mode);
      const workingGlyph = !isAnimationEffectEnabled('secondary')
        ? statusIcon('running', mode)
        : frame !== undefined && Number.isFinite(frame)
          ? spinner[
              ((Math.floor(frame) % spinner.length) + spinner.length) %
                spinner.length
            ]
          : workingFrame(context.state?.animationFrame, mode);
      const glyph = running
        ? theme.fg('accent', workingGlyph)
        : statusGlyph(theme, status, mode);
      const label = options.label ?? indicatorLabel(status);
      const role = STATUS_ROLE[status];
      return {
        glyph,
        elapsedMs,
        elapsed,
        text: running
          ? ownedToolFooter(theme, { status, elapsedMs, context })
          : [theme.fg(role, label), elapsed ? theme.fg('dim', elapsed) : '']
              .filter(Boolean)
              .join(theme.fg('dim', ` ${icon('separator', mode)} `)),
      };
    },
    icon(name) {
      const mode = getMode();
      return name === 'spinnerFrames' || name === 'workingFrames'
        ? frames(name, mode)
        : icon(name, mode);
    },
    statusGlyph: (theme, status) => statusGlyph(theme, status, getMode()),
    widgetHeading(theme, options, width) {
      const mode = getMode();
      const title = theme.fg('toolTitle', options.title);
      return truncateToWidth(
        [
          options.status
            ? statusGlyph(theme, options.status, mode)
            : theme.fg('accent', icon('ready', mode)),
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
        icon('ellipsis', mode),
      );
    },
    treeRow(theme, options, width) {
      const mode = getMode();
      const rail = `${'  '.repeat(Math.max(0, Math.floor(options.depth ?? 0)))}${options.last ? '└─' : '├─'} `;
      return truncateToWidth(
        [
          theme.fg(
            options.selected ? 'accent' : 'dim',
            `${options.selected ? `${icon('selection', mode)} ` : '  '}${rail}`,
          ),
          options.status ? `${statusGlyph(theme, options.status, mode)} ` : '',
          options.text,
        ].join(''),
        Math.max(0, Math.floor(width)),
        icon('ellipsis', mode),
      );
    },
    fg: (theme, role, text) => theme.fg(role, text),
  };
}
