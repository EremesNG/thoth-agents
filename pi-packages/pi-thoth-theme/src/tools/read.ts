import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { toolFooter } from '../render-kit/index.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { getToolBorderTone } from './border.ts';
import { createComponent, getResultText, hasImageContent } from './box.ts';
import { getFileIcon } from './file-icons.ts';
import {
  formatDisplayPath,
  hasToolResult,
  renderFrameBottom,
  renderFrameRow,
  renderFrameTop,
} from './frame.ts';
import { type ElapsedRenderContext, syncElapsedTicker } from './ticker.ts';

interface ReadArgs {
  path?: string;
  file_path?: string;
  offset?: number;
  limit?: number;
}

interface ToolContext extends ElapsedRenderContext {
  cwd?: string;
  lastComponent?: { invalidate?: () => void };
  state?: {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
    [key: string]: unknown;
  };
}

export function createCustomReadTool(cwd: string, config: ThemeConfig) {
  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: ToolContext) {
      syncElapsedTicker(context);
      const args = (rawArgs ?? {}) as ReadArgs;
      const rawPath = String(args.path ?? args.file_path ?? '');
      const filePath = formatDisplayPath(rawPath, context?.cwd ?? cwd);
      const icon = getFileIcon(filePath, config.icons);
      let range = '';
      if (args.offset !== undefined || args.limit !== undefined) {
        const start = args.offset ?? 1;
        const end =
          args.limit !== undefined
            ? Number(start) + Number(args.limit) - 1
            : '';
        range = `:${start}${end ? `-${end}` : ''}`;
      }
      const borderTone = getToolBorderTone(context);

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const footer =
          context?.executionStarted && context.isPartial
            ? toolFooter(theme, { status: 'running', context })
            : undefined;
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Read')) : theme.fg('toolTitle', 'Read')} ${theme.fg('text', `${filePath}${range}`)}`;

        if (hasToolResult(context)) {
          return renderFrameTop(theme, title, safeWidth, borderTone);
        }

        return [
          ...renderFrameTop(theme, title, safeWidth, borderTone),
          ...renderFrameBottom(theme, footer, safeWidth, borderTone),
        ];
      });

      if (context?.state) {
        context.state.callComponent = comp;
      }
      return comp;
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
      context: ToolContext,
    ) {
      if (context?.state) {
        context.state.hasResult = true;
        if (
          context.state.callComponent &&
          typeof context.state.callComponent.invalidate === 'function'
        ) {
          context.state.callComponent.invalidate();
        }
      }
      if (
        context?.lastComponent &&
        typeof context.lastComponent.invalidate === 'function'
      ) {
        context.lastComponent.invalidate();
      }

      const isErr = Boolean(context?.isError);
      const status = options?.isPartial
        ? 'running'
        : isErr
          ? 'failed'
          : 'completed';
      const footerOptions = {
        status,
        context: { ...context, isPartial: options?.isPartial },
      } as const;
      syncElapsedTicker(footerOptions.context);
      const borderTone = getToolBorderTone({
        isError: isErr,
        isPartial: options?.isPartial,
      });
      const textOutput = getResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const footer = toolFooter(theme, footerOptions);
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', textOutput || 'Failed to read file')}`;
          return [
            ...renderFrameRow(theme, errText, safeWidth, borderTone),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        });
      }

      if (hasImageContent(result)) {
        // Image content preserved untouched for Pi's native image pass
        const firstTextBlock = result.content?.find(
          (c) => c && typeof c === 'object' && c.type === 'text',
        ) as { text?: string } | undefined;
        const note = firstTextBlock?.text ?? 'Read image file';
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const footer = toolFooter(theme, footerOptions);
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', note),
              safeWidth,
              borderTone,
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        });
      }

      const lines = textOutput ? textOutput.split('\n') : [];
      const lineCount = lines.length;

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const footer = toolFooter(theme, footerOptions);
        if (!options?.expanded) {
          const summary = `${lineCount} ${lineCount === 1 ? 'line' : 'lines'} · ctrl+o to expand`;
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', summary),
              safeWidth,
              borderTone,
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        }

        if (lines.length === 0) {
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', '(empty file)'),
              safeWidth,
              borderTone,
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        }

        return [
          ...lines.flatMap((line) =>
            renderFrameRow(theme, line, safeWidth, borderTone),
          ),
          ...renderFrameBottom(theme, footer, safeWidth, borderTone),
        ];
      });
    },
  };
}
