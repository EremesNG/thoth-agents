import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import { createComponent, getResultText, hasImageContent } from './box.ts';
import { getFileIcon } from './file-icons.ts';
import {
  formatDisplayPath,
  hasToolResult,
  renderFrameBottom,
  renderFrameRow,
  renderFrameTop,
} from './frame.ts';

interface ReadArgs {
  path?: string;
  file_path?: string;
  offset?: number;
  limit?: number;
}

interface ToolContext {
  isError?: boolean;
  cwd?: string;
  isPartial?: boolean;
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
      const isErr = Boolean(context?.isError);

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Read')) : theme.fg('toolTitle', 'Read')} ${theme.fg('text', `${filePath}${range}`)}`;

        if (hasToolResult(context)) {
          return renderFrameTop(theme, title, safeWidth, isErr);
        }

        return [
          ...renderFrameTop(theme, title, safeWidth, isErr),
          ...renderFrameBottom(theme, undefined, safeWidth, isErr),
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
      const textOutput = getResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', textOutput || 'Failed to read file')}`;
          return [
            ...renderFrameRow(theme, errText, safeWidth, true),
            ...renderFrameBottom(theme, undefined, safeWidth, true),
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
          return [
            ...renderFrameRow(theme, theme.fg('dim', note), safeWidth, false),
            ...renderFrameBottom(theme, undefined, safeWidth, false),
          ];
        });
      }

      const lines = textOutput ? textOutput.split('\n') : [];
      const lineCount = lines.length;

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        if (!options?.expanded) {
          const summary = `${lineCount} ${lineCount === 1 ? 'line' : 'lines'} · ctrl+o to expand`;
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', summary),
              safeWidth,
              false,
            ),
            ...renderFrameBottom(theme, undefined, safeWidth, false),
          ];
        }

        if (lines.length === 0) {
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', '(empty file)'),
              safeWidth,
              false,
            ),
            ...renderFrameBottom(theme, undefined, safeWidth, false),
          ];
        }

        return [
          ...lines.flatMap((line) =>
            renderFrameRow(theme, line, safeWidth, false),
          ),
          ...renderFrameBottom(theme, undefined, safeWidth, false),
        ];
      });
    },
  };
}
