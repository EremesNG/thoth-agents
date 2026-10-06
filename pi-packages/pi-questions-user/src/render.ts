import type { Theme, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Box, type Component, Text } from '@earendil-works/pi-tui';
import {
  createKitRenderMemo,
  type RenderStatus,
  renderToolFooter,
  type ThothRenderKit,
} from '@thoth-agents/pi-core';
import type { QuestionDetails } from './answers.js';
import { getOwn } from './records.js';
import type { questionParameters } from './schema.js';

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
}

interface Summary {
  status: RenderStatus;
  rows: string[];
}

const COLLAPSED_ROWS = 8;

function renderState(context: RenderContext | undefined): RenderState {
  const state = context?.state as Record<string, unknown> | undefined;
  const fresh: RenderState = {
    hasResult: false,
    isPartial: context?.isPartial ?? true,
    isError: context?.isError ?? false,
  };
  if (!state) return fresh;
  state.questionRendering ??= fresh;
  return state.questionRendering as RenderState;
}

/** One row per question plus cancellation/error rows; never reads plain content when details exist. */
export function summarizeResult(
  details: QuestionDetails | undefined,
  text: string,
): Summary {
  if (!details) return { status: 'failed', rows: text ? [text] : [] };
  const rows = details.questions.map((question) => {
    const answer = getOwn(details.answers, question.id);
    if (!answer || answer.status !== 'answered') {
      return `${question.header}: skipped`;
    }
    const parts = [...answer.labels, answer.customText].filter(
      (part): part is string => Boolean(part),
    );
    const notes =
      (answer.note ? 1 : 0) + Object.keys(answer.optionNotes ?? {}).length;
    return `${question.header}: ${parts.join(', ')}${notes ? ` (+${notes} note${notes === 1 ? '' : 's'})` : ''}`;
  });
  if (details.error) {
    rows.unshift(`Error: ${details.error}`);
    for (const issue of details.issues ?? []) {
      rows.push(`${issue.path}: ${issue.message}`);
    }
  }
  if (details.cancelled) rows.push('Cancelled — recorded answers kept.');
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
      state.isError = context?.isError ?? false;
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
            isError: state.isError,
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
      const summary = summarizeResult(
        result.details,
        first?.type === 'text' ? first.text : '',
      );
      state.isError = Boolean(context?.isError) || summary.status === 'failed';
      const status: RenderStatus = isPartial ? 'running' : summary.status;
      const text = [
        theme.fg(
          state.isError ? 'error' : 'success',
          state.isError ? '✗ Ask user' : '✓ Ask user',
        ),
        ...summary.rows.map((row) => theme.fg('toolOutput', row)),
      ].join('\n');
      return component(theme, state, false, text, (kit, width) =>
        kit.card(
          theme,
          {
            part: 'end',
            body: kit.collapse(
              theme,
              summary.rows.map((row) => kit.fg(theme, 'toolOutput', row)),
              { expanded, budget: COLLAPSED_ROWS },
            ),
            status,
            context,
            isError: state.isError,
            isSuccess: status === 'completed' && !state.isError,
            footer: renderToolFooter(kit, theme, { status, context }),
          },
          width,
        ),
      );
    },
  };
}
