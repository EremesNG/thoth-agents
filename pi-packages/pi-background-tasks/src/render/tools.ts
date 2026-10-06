import {
  createKitRenderMemo,
  type RenderIndicatorContext,
  renderToolFooter,
} from '@thoth-agents/pi-core';
import {
  collapseNative,
  nativeToolRows,
  renderTheme,
  resolveExpandHint,
  themed,
} from './native.js';

interface LogDisplayDetails {
  kind: string;
  head: string;
  fullLineCount: number;
  compactLines: string[];
  foldedLineCount: number;
}

interface RenderContext extends RenderIndicatorContext {
  args?: Record<string, unknown>;
}

const SUMMARY_COMMAND_CELLS = 60;
const RESULT_PRESENT = 'backgroundTasksResultPresent';

/** Stable self shell: KIT parts or a single, split native SDK box. */
export function backgroundToolRenderers(toolName: string) {
  return {
    renderShell: 'self' as const,
    renderCall(args: unknown, theme: unknown, context?: RenderContext) {
      if (context?.state) context.state[RESULT_PRESENT] = false;
      const summary = summarizeArgs(args);
      const memo = createKitRenderMemo();
      return {
        invalidate() {
          memo.invalidate();
        },
        render(width: number) {
          return memo.render(width, (kit) => {
            const hasResult = context?.state?.[RESULT_PRESENT] === true;
            const pending = context?.isPartial ?? !hasResult;
            const isError = context?.isError === true;
            if (kit) {
              const t = renderTheme(theme);
              const status =
                !hasResult || pending
                  ? 'running'
                  : isError
                    ? 'failed'
                    : 'completed';
              return kit.card(
                t,
                {
                  title: [
                    kit.fg(t, 'toolTitle', toolName),
                    kit.fg(t, 'muted', summary),
                  ]
                    .filter(Boolean)
                    .join(' '),
                  status,
                  context,
                  footer: hasResult
                    ? undefined
                    : renderToolFooter(kit, t, { status, context }),
                  isSuccess:
                    status === 'completed' &&
                    hasResult &&
                    context?.executionStarted !== false,
                  isError,
                  part: hasResult ? 'start' : 'full',
                },
                width,
              );
            }
            return nativeToolRows(
              [`${toolName}${summary ? ` ${summary}` : ''}`],
              width,
              theme,
              {
                pending,
                isError,
                top: true,
                bottom: !hasResult,
              },
            );
          });
        },
      };
    },
    renderResult(
      result: unknown,
      options: unknown,
      theme: unknown,
      context?: RenderContext,
    ) {
      return renderBackgroundTaskLogDisplay(result, options, theme, context);
    },
  };
}

/** Call summary: action, id, name or command on one line. */
export function summarizeArgs(args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const command =
    typeof a.command === 'string' ? a.command.replace(/\s+/g, ' ').trim() : '';
  const parts = [
    a.action,
    a.id,
    a.name,
    command.length > SUMMARY_COMMAND_CELLS
      ? `${command.slice(0, SUMMARY_COMMAND_CELLS)}…`
      : command,
    a.all === true ? 'all' : '',
  ];
  return parts
    .filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    )
    .join(' · ');
}

/** The compact log preview stays display-only; expanded output uses the model's full text. */
export function renderBackgroundTaskLogDisplay(
  result: unknown,
  options: unknown = {},
  theme: unknown = {},
  context?: RenderContext,
) {
  if (context?.state) context.state[RESULT_PRESENT] = true;
  const opts = options as
    | { expanded?: boolean; isPartial?: boolean }
    | undefined;
  const expanded = opts?.expanded === true;
  const fullText = resultTextContent(result).split(/\r?\n/);
  const details = (result as { details?: LogDisplayDetails } | undefined)
    ?.details;
  const memo = createKitRenderMemo();
  return {
    invalidate() {
      memo.invalidate();
    },
    render(width: number) {
      return memo.render(width, (kit) => {
        const t = renderTheme(theme);
        const pending = context?.isPartial ?? opts?.isPartial === true;
        const isError = context?.isError === true;
        let rows: string[];
        if (details?.kind === 'background-task-log-display') {
          const meta = themed(theme, 'dim', `${details.fullLineCount} lines`);
          const hint = resolveExpandHint(context);
          const folded =
            details.foldedLineCount > 0
              ? themed(
                  theme,
                  'dim',
                  `Folded ${details.foldedLineCount} display lines (${hint}).`,
                )
              : themed(theme, 'dim', `Compact log (${hint} for full display).`);
          rows = expanded
            ? [
                meta,
                themed(theme, 'dim', 'Full displayed log.'),
                '',
                ...fullText,
              ]
            : [
                meta,
                details.head,
                '',
                themed(theme, 'dim', 'preview'),
                ...details.compactLines,
                folded,
              ];
        } else {
          const allRows = trimTrailingBlank(fullText);
          rows = kit
            ? kit.collapse(t, allRows, {
                expanded,
                expandHint: resolveExpandHint(context),
              })
            : collapseNative(allRows, expanded, theme, context);
        }
        if (kit) {
          const status = pending ? 'running' : isError ? 'failed' : 'completed';
          return kit.card(
            t,
            {
              body: rows,
              footer: renderToolFooter(kit, t, { status, context }),
              status,
              context,
              isSuccess:
                status === 'completed' && context?.executionStarted !== false,
              isError,
              wrap: expanded,
              part: 'end',
            },
            width,
          );
        }
        return nativeToolRows(rows, width, theme, {
          pending,
          isError,
          bottom: true,
          wrap: expanded,
        });
      });
    },
  };
}

function resultTextContent(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> })?.content;
  if (Array.isArray(content))
    return content.map((part) => part.text ?? '').join('\n');
  return String(result ?? '');
}

function trimTrailingBlank(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return lines.slice(0, end);
}
