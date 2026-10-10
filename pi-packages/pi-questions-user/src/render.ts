import type {
  Theme,
  ThemeColor,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  Box,
  type Component,
  Text,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import {
  createKitRenderMemo,
  type RenderStatus,
  renderToolFooter,
  resolveIcon,
  resolveStatusGlyph,
  type ThothRenderKit,
} from '@thoth-agents/pi-core';
import type { QuestionDetails } from './answers.js';
import { getOwn } from './records.js';
import { type questionParameters, resolveLabels } from './schema.js';

type QuestionRenderers = Pick<
  ToolDefinition<typeof questionParameters, QuestionDetails | undefined>,
  'renderShell' | 'renderCall' | 'renderResult'
>;
type RenderContext = Parameters<
  NonNullable<QuestionRenderers['renderCall']>
>[2];

interface RenderState {
  hasResult: boolean;
  isPartial: boolean;
  isError: boolean;
  /** Final affirmative outcome; shared so the call part matches the result part. */
  isSuccess: boolean;
  collapsed: boolean;
}

/** Execute and the SDK's shared row state meet by toolCallId, not partial results. */
export function createQuestionRenderBridge() {
  type Row = {
    collapsed: boolean;
    closed?: boolean;
    state?: RenderState;
    invalidate?: () => void;
  };
  const rows = new Map<string, Row>();
  return {
    bind(context: RenderContext | undefined, state: RenderState) {
      if (!context?.toolCallId || state.hasResult) return;
      const row: Row = rows.get(context.toolCallId) ?? { collapsed: false };
      if (row.closed) return;
      state.collapsed = row.collapsed;
      row.state = state;
      row.invalidate = context.invalidate;
      rows.set(context.toolCallId, row);
    },
    setCollapsed(toolCallId: string, collapsed: boolean) {
      const row: Row = rows.get(toolCallId) ?? { collapsed: false };
      rows.set(toolCallId, row);
      if (row.collapsed === collapsed) return;
      row.collapsed = collapsed;
      if (row.state) row.state.collapsed = collapsed;
      row.invalidate?.();
    },
    finish(toolCallId: string) {
      const row = rows.get(toolCallId) ?? { collapsed: false };
      rows.set(toolCallId, row);
      if (row.closed) return;
      // invalidate() synchronously renders again; do not rebind a completing row.
      // The closed row stays as a tombstone: a later call render (before the
      // result arrives) must not bind a fresh row, or the result render would
      // re-enter the SDK's updateDisplay and mount the answers twice.
      row.closed = true;
      const { invalidate } = row;
      if (row.state) row.state.collapsed = false;
      row.state = undefined;
      row.invalidate = undefined;
      invalidate?.();
    },
  };
}

interface Summary {
  status: RenderStatus;
  rows: string[];
  /** Localized cancelled label, shown in the footer (kit) or as a row (native). */
  cancelled?: string;
}

type Paint = (role: ThemeColor, text: string) => string;

interface SummaryOptions {
  paint?: Paint;
  width?: number;
  expanded?: boolean;
}

const COLLAPSED_ROWS = 10;
const MAX_HEADER_COLUMN = 16;
const plain: Paint = (_role, text) => text;

function renderState(context: RenderContext | undefined): RenderState {
  const state = context?.state as Record<string, unknown> | undefined;
  const fresh: RenderState = {
    hasResult: false,
    isPartial: context?.isPartial ?? true,
    isError: context?.isError ?? false,
    isSuccess: false,
    collapsed: false,
  };
  if (!state) return fresh;
  state.questionRendering ??= fresh;
  return state.questionRendering as RenderState;
}

function hang(text: string, first: string, rest: string, width: number) {
  const room = Math.max(1, width - visibleWidth(first));
  return wrapTextWithAnsi(text, room).map(
    (line, index) => (index ? rest : first) + line,
  );
}

function glyphs() {
  const ok = resolveStatusGlyph('completed');
  const ascii = /^[ -~]*$/u.test(ok);
  return {
    ok,
    fail: resolveStatusGlyph('failed'),
    pending: '?',
    skipped: ascii ? '-' : '–',
    note: ascii ? '~' : '✎',
    ellipsis: resolveIcon('ellipsis', '…'),
    separator: resolveIcon('separator', '·'),
  };
}

function titleOf(title: string | undefined): string {
  return title ? `Ask user · ${title}` : 'Ask user';
}

/** Pending call: one line of question headers. */
function pendingRows(headers: string[], paint: Paint, width: number): string[] {
  if (!headers.length) return [];
  const g = glyphs();
  const line = headers
    .map((header) => `${paint('accent', g.pending)} ${paint('dim', header)}`)
    .join(paint('dim', ` ${g.separator} `));
  return [truncateToWidth(line, width, g.ellipsis)];
}

/**
 * Header column, then the answer; notes hang beneath the answer. Expanded adds
 * each prompt above its row and wraps notes in full. Never reads plain content
 * when details exist.
 */
export function summarizeResult(
  details: QuestionDetails | undefined,
  text: string,
  options: SummaryOptions = {},
): Summary {
  if (!details) return { status: 'failed', rows: text ? [text] : [] };
  const { paint = plain, width = Number.POSITIVE_INFINITY } = options;
  const expanded = options.expanded === true;
  const g = glyphs();
  const labels = resolveLabels(details.labels);
  const column = Math.max(
    1,
    Math.min(
      MAX_HEADER_COLUMN,
      Math.max(0, ...details.questions.map((q) => visibleWidth(q.header))),
      Number.isFinite(width) ? Math.floor(width / 3) : MAX_HEADER_COLUMN,
    ),
  );
  const rows: string[] = [];
  if (details.error) {
    rows.push(paint('error', `${g.fail} ${labels.error}: ${details.error}`));
    if (expanded) {
      for (const issue of details.issues ?? []) {
        rows.push(paint('muted', `  ${issue.path}: ${issue.message}`));
      }
    }
  }
  const recorded = details.questions.some(
    (q) => getOwn(details.answers, q.id)?.status === 'answered',
  );
  // An error without recorded answers is only its error row (issues expanded).
  const questions = details.error && !recorded ? [] : details.questions;
  const gap = '  ';
  const indent = ' '.repeat(column + gap.length);
  for (const question of questions) {
    const answer = getOwn(details.answers, question.id);
    if (expanded && question.prompt) {
      rows.push(
        ...wrapTextWithAnsi(
          paint('dim', question.prompt.replace(/\s+/g, ' ')),
          Math.max(1, width),
        ),
      );
    }
    const lead = paint(
      'accent',
      truncateToWidth(question.header, column, g.ellipsis, true),
    );
    if (!answer || answer.status !== 'answered') {
      rows.push(
        `${lead}${gap}${paint('dim', `${g.skipped} ${labels.skipped}`)}`,
      );
    } else {
      const picks = [
        ...answer.labels,
        ...(answer.customText
          ? [`“${answer.customText.replace(/\s+/g, ' ')}”`]
          : []),
      ];
      const first = `${lead}${gap}${paint('success', g.ok)} `;
      const picked = paint('success', picks.join(', '));
      if (expanded) rows.push(...hang(picked, first, `${indent}  `, width));
      else rows.push(truncateToWidth(`${first}${picked}`, width, g.ellipsis));
    }
    const notes = [
      ...(answer?.note ? [answer.note] : []),
      ...Object.entries(answer?.optionNotes ?? {}).map(
        ([value, note]) =>
          `${question.options?.find((o) => o.value === value)?.label ?? value}: ${note}`,
      ),
    ];
    for (const note of notes) {
      const flat = note.replace(/\s+/g, ' ');
      const first = `${indent}${paint('dim', g.note)} `;
      if (expanded)
        rows.push(...hang(paint('dim', flat), first, `${indent}  `, width));
      else
        rows.push(
          truncateToWidth(`${first}${paint('dim', flat)}`, width, g.ellipsis),
        );
    }
  }
  return {
    status: details.error
      ? 'failed'
      : details.cancelled
        ? 'cancelled'
        : 'completed',
    rows: Number.isFinite(width)
      ? rows.map((row) => truncateToWidth(row, width, g.ellipsis))
      : rows,
    // An error-only outcome is just its error; cancellation adds nothing.
    ...(details.cancelled && !(details.error && !recorded)
      ? { cancelled: labels.cancelled }
      : {}),
  };
}

/** Looks up the kit on every render; without it, draws the native padded box. */
function component(
  theme: Theme,
  state: RenderState,
  call: boolean,
  text: (width: number) => string,
  renderCard: (kit: ThothRenderKit, width: number) => string[],
): Component {
  const memo = createKitRenderMemo();
  return {
    render(width) {
      return memo.render(width, (kit) => {
        if (width <= 0) return [];
        if (kit) return renderCard(kit, width);
        const role = state.isPartial
          ? 'toolPendingBg'
          : state.isError
            ? 'toolErrorBg'
            : 'toolSuccessBg';
        const bg = (line: string) => theme.bg(role, line);
        const box = new Box(1, 0, bg);
        box.addChild(new Text(text(Math.max(1, width - 2)), 0, 0));
        const padding = bg(' '.repeat(width));
        return [
          ...(call ? [padding] : []),
          ...box.render(width),
          ...(!call || !state.hasResult ? [padding] : []),
        ];
      });
    },
    invalidate() {
      memo.invalidate();
    },
  };
}

export function createQuestionRenderers(
  bridge = createQuestionRenderBridge(),
): QuestionRenderers {
  return {
    renderShell: 'self',
    renderCall(args, theme, context) {
      const state = renderState(context);
      bridge.bind(context, state);
      state.isPartial = context?.isPartial ?? true;
      state.isError = state.hasResult
        ? state.isError
        : (context?.isError ?? false);
      const title = titleOf(args.title);
      const headers = (args.questions ?? []).map(
        (question) => question.header ?? '…',
      );
      // Once answered, the result part owns every row; the call keeps only the title.
      const rows = (paint: Paint, width: number) =>
        state.hasResult
          ? []
          : [
              ...pendingRows(headers, paint, width),
              ...(state.collapsed ? ['collapsed · Ctrl+] expand'] : []),
            ];
      return component(
        theme,
        state,
        true,
        (width) =>
          [
            theme.fg('toolTitle', theme.bold(title)),
            ...rows((role, text) => theme.fg(role, text), width),
          ].join('\n'),
        (kit, width) => {
          const status: RenderStatus = state.hasResult
            ? 'completed'
            : context?.executionStarted
              ? 'running'
              : 'pending';
          return kit.card(
            theme,
            {
              title,
              body: (bodyWidth) =>
                rows((role, text) => kit.fg(theme, role, text), bodyWidth),
              part: state.hasResult ? 'start' : 'full',
              // The result part owns the final tone; the call part must match it.
              isError: state.isError,
              isSuccess: state.hasResult && state.isSuccess,
              status: state.hasResult ? undefined : status,
              context,
              footer: state.hasResult
                ? undefined
                : renderToolFooter(kit, theme, { status, context }),
            },
            width,
          );
        },
      );
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const state = renderState(context);
      state.hasResult = true;
      state.collapsed = false;
      state.isPartial = isPartial;
      const first = result.content[0];
      const raw = first?.type === 'text' ? first.text : '';
      const paint: Paint = (role, text) => theme.fg(role, text);
      const outcome = summarizeResult(result.details, raw);
      state.isError = Boolean(context?.isError) || outcome.status === 'failed';
      const status: RenderStatus = isPartial ? 'running' : outcome.status;
      state.isSuccess = status === 'completed' && !state.isError;
      const rows = (width: number) =>
        summarizeResult(result.details, raw, { paint, width, expanded });
      return component(
        theme,
        state,
        false,
        (width) => {
          const summary = rows(width);
          return [
            ...summary.rows,
            ...(summary.cancelled
              ? [paint('warning', `${glyphs().fail} ${summary.cancelled}`)]
              : []),
          ].join('\n');
        },
        (kit, width) =>
          kit.card(
            theme,
            {
              part: 'end',
              body: (bodyWidth) =>
                kit.collapse(theme, rows(bodyWidth).rows, {
                  expanded,
                  budget: COLLAPSED_ROWS,
                }),
              status,
              context,
              isError: state.isError,
              isSuccess: state.isSuccess,
              footer: renderToolFooter(kit, theme, {
                status,
                context,
                ...(outcome.cancelled ? { summary: outcome.cancelled } : {}),
              }),
            },
            width,
          ),
      );
    },
  };
}
