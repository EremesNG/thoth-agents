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
}

interface Summary {
  status: RenderStatus;
  rows: string[];
}

type Paint = (role: ThemeColor, text: string) => string;

const COLLAPSED_ROWS = 10;
const MAX_HEADER_COLUMN = 24;
const plain: Paint = (_role, text) => text;

function renderState(context: RenderContext | undefined): RenderState {
  const state = context?.state as Record<string, unknown> | undefined;
  const fresh: RenderState = {
    hasResult: false,
    isPartial: context?.isPartial ?? true,
    isError: context?.isError ?? false,
    isSuccess: false,
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

/**
 * Question → answer rows: an aligned header column, then the answer; notes hang
 * beneath it. Never reads plain content when details exist.
 */
export function summarizeResult(
  details: QuestionDetails | undefined,
  text: string,
  paint: Paint = plain,
  width = Number.POSITIVE_INFINITY,
): Summary {
  if (!details) return { status: 'failed', rows: text ? [text] : [] };
  const labels = resolveLabels(details.labels);
  const column = Math.min(
    MAX_HEADER_COLUMN,
    Math.max(0, ...details.questions.map((q) => visibleWidth(q.header))),
  );
  const rows: string[] = [];
  if (details.error) {
    rows.push(paint('error', `✗ ${labels.error}: ${details.error}`));
    for (const issue of details.issues ?? []) {
      rows.push(paint('muted', `  ${issue.path}: ${issue.message}`));
    }
  }
  for (const question of details.questions) {
    const answer = getOwn(details.answers, question.id);
    const header = truncateToWidth(question.header, column, '…', true);
    const lead = paint('accent', header);
    const gap = ' '.repeat(2);
    const indent = ' '.repeat(column + 2);
    if (!answer || answer.status !== 'answered') {
      rows.push(`${lead}${gap}${paint('dim', `○ ${labels.skipped}`)}`);
    } else {
      const picks = answer.labels.map((label) => paint('toolOutput', label));
      const custom = answer.customText
        ? [paint('accent', `“${answer.customText.replace(/\s+/g, ' ')}”`)]
        : [];
      rows.push(
        ...hang(
          [...picks, ...custom].join(paint('dim', ', ')),
          `${lead}${gap}${paint('success', '✓')} `,
          `${indent}  `,
          width,
        ),
      );
    }
    const notes = [
      ...(answer?.note ? [answer.note] : []),
      ...Object.entries(answer?.optionNotes ?? {}).map(
        ([value, note]) =>
          `${question.options?.find((o) => o.value === value)?.label ?? value}: ${note}`,
      ),
    ];
    for (const note of notes) {
      rows.push(
        ...hang(
          paint('muted', note.replace(/\s+/g, ' ')),
          `${indent}${paint('dim', '✎')} `,
          `${indent}  `,
          width,
        ),
      );
    }
  }
  if (details.cancelled) {
    rows.push(
      paint('warning', `⊘ ${labels.cancelled} — ${labels.cancelledKept}`),
    );
  }
  return {
    status: details.error
      ? 'failed'
      : details.cancelled
        ? 'cancelled'
        : 'completed',
    rows,
  };
}

function callRows(args: {
  title?: string;
  questions?: { header?: string }[];
}): string[] {
  const questions = args.questions ?? [];
  return [
    ...(args.title ? [args.title] : []),
    ...(questions.length
      ? [
          `${questions.length} question${questions.length === 1 ? '' : 's'}: ${questions
            .map((question) => question.header ?? '…')
            .join(', ')}`,
        ]
      : []),
  ];
}

/** Looks up the kit on every render; without it, draws the native padded box. */
function component(
  theme: Theme,
  state: RenderState,
  call: boolean,
  text: string,
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
        box.addChild(new Text(text, 0, 0));
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

export function createQuestionRenderers(): QuestionRenderers {
  return {
    renderShell: 'self',
    renderCall(args, theme, context) {
      const state = renderState(context);
      state.isPartial = context?.isPartial ?? true;
      state.isError = state.hasResult
        ? state.isError
        : (context?.isError ?? false);
      const rows = callRows(args);
      const text = [
        theme.fg('toolTitle', theme.bold('Ask user')),
        ...rows.map((row) => theme.fg('muted', row)),
      ].join('\n');
      return component(theme, state, true, text, (kit, width) => {
        const status: RenderStatus = state.hasResult
          ? 'completed'
          : context?.executionStarted
            ? 'running'
            : 'pending';
        return kit.card(
          theme,
          {
            title: 'Ask user',
            body: rows.map((row) => kit.fg(theme, 'muted', row)),
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
      });
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const state = renderState(context);
      state.hasResult = true;
      state.isPartial = isPartial;
      const first = result.content[0];
      const raw = first?.type === 'text' ? first.text : '';
      const paint: Paint = (role, text) => theme.fg(role, text);
      const outcome = summarizeResult(result.details, raw);
      state.isError = Boolean(context?.isError) || outcome.status === 'failed';
      const status: RenderStatus = isPartial ? 'running' : outcome.status;
      state.isSuccess = status === 'completed' && !state.isError;
      const heading = theme.fg(
        state.isError ? 'error' : 'success',
        state.isError ? '✗ Ask user' : '✓ Ask user',
      );
      const text = [
        heading,
        ...summarizeResult(result.details, raw, paint).rows,
      ].join('\n');
      return component(theme, state, false, text, (kit, width) =>
        kit.card(
          theme,
          {
            part: 'end',
            body: (bodyWidth) =>
              kit.collapse(
                theme,
                summarizeResult(result.details, raw, paint, bodyWidth).rows,
                { expanded, budget: COLLAPSED_ROWS },
              ),
            status,
            context,
            isError: state.isError,
            isSuccess: state.isSuccess,
            footer: renderToolFooter(kit, theme, { status, context }),
          },
          width,
        ),
      );
    },
  };
}
