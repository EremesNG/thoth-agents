import type {
  AgentToolResult,
  Theme,
  ToolRenderers,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { toolFooter } from '../render-kit/index.ts';
import type { IconMode, ThemeConfig } from '../shared/config.ts';
import { icon as semanticIcon } from '../shared/icons.ts';
import { getToolBorderTone } from './border.ts';
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
  syncElapsedTicker,
} from './ticker.ts';

const COLLAPSED_OUTPUT_LINES = 8;
const MAX_ARGS_SUMMARY_LENGTH = 500;
const NESTED_KEYS_SHOWN = 4;

interface GenericContext extends ElapsedRenderContext {
  lastComponent?: { invalidate?: () => void };
  state?: ElapsedRenderState & {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
  };
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value) ?? '""';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function summarizeValue(value: unknown, mode: IconMode): string {
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    const shown = keys.slice(0, NESTED_KEYS_SHOWN).join(', ');
    return `{${keys.length > NESTED_KEYS_SHOWN ? `${shown}, ${semanticIcon('ellipsis', mode)}` : shown}}`;
  }
  return formatValue(value);
}

/** Pretty-print JSON object/array text; anything else is returned unchanged. */
function prettifyJson(text: string): string {
  const trimmed = text.trim();
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

/** One-line `key=value` summary; escaping happens at the display boundary. */
export function summarizeArgs(args: unknown, mode: IconMode = 'nerd'): string {
  if (args === undefined || args === null) return '';
  let summary: string;
  if (typeof args === 'object' && !Array.isArray(args)) {
    summary = Object.entries(args as Record<string, unknown>)
      .map(([key, value]) => `${key}=${summarizeValue(value, mode)}`)
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
  const toolIcon = semanticIcon('tool', config.icons);
  const name = escapeControlCharacters(toolName);

  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: GenericContext) {
      syncElapsedTicker(context);
      const borderTone = context?.isPartial
        ? 'accent'
        : getToolBorderTone(context);
      const argsSummary = summarizeArgs(rawArgs, config.icons);

      const comp = createComponent((width: number) => {
        const footer =
          context?.executionStarted && context.isPartial
            ? toolFooter(theme, { status: 'running', context }, config.icons)
            : undefined;
        const title = `${theme.fg('accent', toolIcon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', name)) : theme.fg('toolTitle', name)}`;
        const lines = [
          ...renderFrameTop(theme, title, width, borderTone),
          ...(argsSummary
            ? renderFrameRow(
                theme,
                theme.fg('dim', argsSummary),
                width,
                borderTone,
              )
            : []),
        ];
        if (hasToolResult(context)) return lines;
        return [
          ...lines,
          ...renderFrameBottom(theme, footer, width, borderTone),
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
      const borderTone = isPartial
        ? 'accent'
        : getToolBorderTone({ isError: isErr, isPartial });
      syncElapsedTicker({ ...context, isPartial });
      const text = prettifyJson(getResultText(result));
      const allLines = text ? text.split('\n') : [];
      const lineCount = allLines.length;
      const hasImage = hasImageContent(result);

      return createComponent((width: number) => {
        const footer = toolFooter(
          theme,
          {
            status: isPartial ? 'running' : isErr ? 'failed' : 'completed',
            context: { ...context, isPartial },
            summary: `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`,
          },
          config.icons,
        );

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
              `${semanticIcon('ellipsis', config.icons)} ${allLines.length - COLLAPSED_OUTPUT_LINES} more lines ${semanticIcon('separator', config.icons)} ctrl+o to expand`,
            ),
          );
        }
        if (body.length === 0 && !hasImage) {
          body.push(theme.fg('dim', '(no output)'));
        }

        return [
          ...body.flatMap((line) =>
            renderFrameRow(theme, line, width, borderTone),
          ),
          ...renderFrameBottom(theme, footer, width, borderTone),
        ];
      });
    },
  };
}
