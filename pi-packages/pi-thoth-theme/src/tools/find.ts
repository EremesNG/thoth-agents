import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import { toolFooter } from '../render-kit/index.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { icon as semanticIcon, statusIcon } from '../shared/icons.ts';
import { getToolBorderTone } from './border.ts';
import {
  createComponent,
  escapeControlCharacters,
  getRawResultText,
  renderBox,
  splitResultNotice,
} from './box.ts';
import { getFileIcon, getToolIcon } from './file-icons.ts';
import {
  formatDisplayPath,
  hasToolResult,
  isFramedContext,
  renderFrameBottom,
  renderFrameRow,
  renderFrameTop,
} from './frame.ts';
import { type ElapsedRenderContext, syncElapsedTicker } from './ticker.ts';

const COLLAPSED_ENTRY_LIMIT = 8;

interface FindArgs {
  pattern?: string;
  path?: string;
}

interface FindContext extends ElapsedRenderContext {
  cwd?: string;
  lastComponent?: { invalidate?: () => void };
  state?: {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
    [key: string]: unknown;
  };
  toolCallId?: string;
}

function parseFindOutput(
  text: string,
  details: unknown,
): { entries: string[]; notices: string[] } {
  const output = splitResultNotice(text, details, 'find');
  return {
    entries: output.text.split('\n').filter((line) => line.length > 0),
    notices: output.notices,
  };
}

export function createCustomFindTool(cwd: string, config: ThemeConfig) {
  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: FindContext) {
      syncElapsedTicker(context);
      const args = (rawArgs ?? {}) as FindArgs;
      const pattern = escapeControlCharacters(String(args.pattern ?? '*'));
      const rawPath = String(args.path ?? '.');
      const searchPath = escapeControlCharacters(
        formatDisplayPath(rawPath, context?.cwd ?? cwd),
      );
      const icon = getToolIcon('search', config.icons);
      const borderTone = getToolBorderTone(context);

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const footer =
          context?.executionStarted && context.isPartial
            ? toolFooter(theme, { status: 'running', context }, config.icons)
            : undefined;
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Find')) : theme.fg('toolTitle', 'Find')} ${theme.fg('syntaxString', `"${pattern}"`)} ${theme.fg('dim', 'in')} ${theme.fg('text', searchPath)}`;

        if (!isFramedContext(context)) {
          return renderBox(theme, [], safeWidth, {
            title,
            footer,
            isError: borderTone === 'error',
            isSuccess: borderTone === 'success',
          });
        }

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
      context: FindContext,
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
      const textOutput = getRawResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const footer = toolFooter(theme, footerOptions, config.icons);
          const errText = `${theme.fg('error', `${statusIcon('warning', config.icons)} `)}${theme.fg('error', escapeControlCharacters(textOutput || 'Find failed'))}`;
          if (!isFramedContext(context)) {
            return [
              truncateToWidth(errText, safeWidth),
              ...renderFrameBottom(theme, footer, safeWidth, borderTone),
            ];
          }
          return [
            ...renderFrameRow(theme, errText, safeWidth, borderTone),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        });
      }

      const { entries, notices } = parseFindOutput(textOutput, result.details);
      const total = entries.length;

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const footer = toolFooter(theme, footerOptions, config.icons);
        if (safeWidth === 0) return [];
        if (total === 0 && notices.length === 0) {
          if (!isFramedContext(context)) {
            return [
              truncateToWidth(theme.fg('dim', 'no matches found'), safeWidth),
              ...renderFrameBottom(theme, footer, safeWidth, borderTone),
            ];
          }
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', 'no matches found'),
              safeWidth,
              borderTone,
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        }

        const rawLines: string[] = [];
        const visible = options?.expanded
          ? entries
          : entries.slice(0, COLLAPSED_ENTRY_LIMIT);
        const remaining = total - visible.length;

        for (let i = 0; i < visible.length; i++) {
          const entry = visible[i];
          const isLast = i === visible.length - 1 && remaining === 0;
          const branch = isLast ? '└─' : '├─';
          const icon = getFileIcon(entry, config.icons);
          const line = `${theme.fg('dim', branch)} ${theme.fg('accent', icon)} ${theme.fg('toolOutput', escapeControlCharacters(entry))}`;
          rawLines.push(line);
        }

        if (remaining > 0) {
          const more = `${theme.fg('dim', '└─')} ${theme.fg('dim', `${semanticIcon('ellipsis', config.icons)} ${remaining} more matches ${semanticIcon('separator', config.icons)} ctrl+o to expand`)}`;
          rawLines.push(more);
        }

        for (const notice of notices) {
          rawLines.push(theme.fg('warning', notice));
        }

        if (!isFramedContext(context)) {
          return [
            ...rawLines.map((line) => truncateToWidth(`  ${line}`, safeWidth)),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        }

        return [
          ...rawLines.flatMap((line) =>
            renderFrameRow(theme, line, safeWidth, borderTone),
          ),
          ...renderFrameBottom(theme, footer, safeWidth, borderTone),
        ];
      });
    },
  };
}
