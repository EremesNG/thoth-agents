import type {
  AgentToolResult,
  Theme,
  ToolRenderers,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import {
  createComponent,
  escapeControlCharacters,
  getResultText,
  hasImageContent,
} from './box.ts';
import {
  hasToolResult,
  renderFrameBottom,
  renderFrameRow,
  renderFrameTop,
} from './frame.ts';
import {
  type ElapsedRenderContext,
  type ElapsedRenderState,
  getElapsedMs,
  syncElapsedTicker,
} from './ticker.ts';

const COLLAPSED_OUTPUT_LINES = 8;
const MAX_ARGS_SUMMARY_LENGTH = 500;

interface GenericContext extends ElapsedRenderContext {
  lastComponent?: { invalidate?: () => void };
  state?: ElapsedRenderState & {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
  };
}

function formatElapsed(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value) ?? '""';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** One-line `key=value` summary; escaping happens at the display boundary. */
export function summarizeArgs(args: unknown): string {
  if (args === undefined || args === null) return '';
  let summary: string;
  if (typeof args === 'object' && !Array.isArray(args)) {
    summary = Object.entries(args as Record<string, unknown>)
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(' ');
  } else {
    summary = formatValue(args);
  }
  return escapeControlCharacters(summary.slice(0, MAX_ARGS_SUMMARY_LENGTH));
}

/** Generic frame for tools that provide no renderer of their own. */
export function createGenericTool(
  toolName: string,
  config: ThemeConfig,
): ToolRenderers {
  const icon = config.icons === 'nerd' ? '\uf0ad' : '*';
  const name = escapeControlCharacters(toolName);

  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: GenericContext) {
      syncElapsedTicker(context);
      const isErr = Boolean(context?.isError);
      const argsSummary = summarizeArgs(rawArgs);
      const elapsed = formatElapsed(getElapsedMs(context?.state));
      const runningFooter =
        context?.executionStarted && context.isPartial
          ? [
              theme.fg('dim', 'running…'),
              elapsed ? theme.fg('dim', elapsed) : '',
            ]
              .filter(Boolean)
              .join(theme.fg('dim', ' · '))
          : undefined;

      const comp = createComponent((width: number) => {
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', name)) : theme.fg('toolTitle', name)}`;
        const lines = [
          ...renderFrameTop(theme, title, width, isErr),
          ...(argsSummary
            ? renderFrameRow(theme, theme.fg('dim', argsSummary), width, isErr)
            : []),
        ];
        if (hasToolResult(context)) return lines;
        return [
          ...lines,
          ...renderFrameBottom(theme, runningFooter, width, isErr),
        ];
      });

      if (context?.state) context.state.callComponent = comp;
      return comp;
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
      context: GenericContext,
    ) {
      if (context?.state) {
        context.state.hasResult = true;
        context.state.callComponent?.invalidate?.();
      }
      context?.lastComponent?.invalidate?.();

      const isErr = Boolean(context?.isError);
      const isPartial = Boolean(options?.isPartial);
      syncElapsedTicker({ ...context, isPartial });
      const elapsed = formatElapsed(getElapsedMs(context?.state));
      const text = getResultText(result);
      const allLines = text ? text.split('\n') : [];
      const lineCount = allLines.length;
      const hasImage = hasImageContent(result);

      return createComponent((width: number) => {
        const status = isPartial
          ? theme.fg('dim', 'running…')
          : isErr
            ? theme.fg('error', 'Error')
            : theme.fg('success', 'Done');
        const footer = [
          status,
          elapsed ? theme.fg('dim', elapsed) : '',
          theme.fg('dim', `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`),
        ]
          .filter(Boolean)
          .join(theme.fg('dim', ' · '));

        const visible = options?.expanded
          ? allLines
          : allLines.slice(0, COLLAPSED_OUTPUT_LINES);
        const body = visible.map((line) => {
          const sanitized = escapeControlCharacters(line);
          return isErr
            ? theme.fg('error', sanitized)
            : theme.fg('toolOutput', sanitized);
        });
        if (!options?.expanded && allLines.length > COLLAPSED_OUTPUT_LINES) {
          body.push(
            theme.fg(
              'dim',
              `… ${allLines.length - COLLAPSED_OUTPUT_LINES} more lines · ctrl+o to expand`,
            ),
          );
        }
        if (body.length === 0 && !hasImage) {
          body.push(theme.fg('dim', '(no output)'));
        }

        return [
          ...body.flatMap((line) => renderFrameRow(theme, line, width, isErr)),
          ...renderFrameBottom(theme, footer, width, isErr),
        ];
      });
    },
  };
}
