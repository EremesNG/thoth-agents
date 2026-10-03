import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import { createComponent, getResultText } from './box.ts';
import { getFileIcon, getToolIcon } from './file-icons.ts';
import {
  formatDisplayPath,
  hasToolResult,
  renderFrameBottom,
  renderFrameRow,
  renderFrameTop,
} from './frame.ts';

const COLLAPSED_WRITE_LINES = 6;

interface WriteArgs {
  path?: string;
  file_path?: string;
  content?: string;
}

interface WriteContext {
  isError?: boolean;
  args?: unknown;
  cwd?: string;
  isPartial?: boolean;
  lastComponent?: { invalidate?: () => void };
  state?: {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
    [key: string]: unknown;
  };
}

export function createCustomWriteTool(cwd: string, config: ThemeConfig) {
  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: WriteContext) {
      const args = (rawArgs ?? {}) as WriteArgs;
      const rawPath = String(args.path ?? args.file_path ?? '');
      const filePath = formatDisplayPath(rawPath, context?.cwd ?? cwd);
      const icon = getFileIcon(filePath, config.icons);
      const writeIcon = getToolIcon('write', config.icons);
      const isErr = Boolean(context?.isError);

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const title = `${theme.fg('accent', writeIcon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Write')) : theme.fg('toolTitle', 'Write')} ${theme.fg('accent', icon)} ${theme.fg('text', filePath)}`;

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
      context: WriteContext,
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
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', textOutput || 'Write failed')}`;
          return [
            ...renderFrameRow(theme, errText, safeWidth, true),
            ...renderFrameBottom(theme, undefined, safeWidth, true),
          ];
        });
      }

      // Check content lines from context args or result
      const writeArgs = context?.args as WriteArgs | undefined;
      const content = String(writeArgs?.content ?? '');
      const contentLines = content ? content.split('\n') : [];
      const lineCount = contentLines.length || 1;

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const addedStr = theme.fg('toolDiffAdded', `+${lineCount} lines`);
        const footer = `${addedStr} · ${theme.fg('dim', '1 file')}`;

        if (contentLines.length === 0) {
          const defaultMsg = textOutput || 'File written';
          return [
            ...renderFrameRow(
              theme,
              theme.fg('toolOutput', defaultMsg),
              safeWidth,
              false,
            ),
            ...renderFrameBottom(theme, footer, safeWidth, false),
          ];
        }

        const visibleLines = options?.expanded
          ? contentLines
          : contentLines.slice(0, COLLAPSED_WRITE_LINES);
        const bodyLines: string[] = visibleLines.map((l) =>
          theme.fg('toolOutput', l),
        );

        if (!options?.expanded && contentLines.length > COLLAPSED_WRITE_LINES) {
          const remaining = contentLines.length - COLLAPSED_WRITE_LINES;
          bodyLines.push(
            theme.fg('dim', `… ${remaining} more lines · ctrl+o to expand`),
          );
        }

        return [
          ...bodyLines.flatMap((l) =>
            renderFrameRow(theme, l, safeWidth, false),
          ),
          ...renderFrameBottom(theme, footer, safeWidth, false),
        ];
      });
    },
  };
}
