import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { createFindToolDefinition } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import type { ThemeConfig } from '../shared/config.ts';
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

const COLLAPSED_ENTRY_LIMIT = 8;

interface FindArgs {
  pattern?: string;
  path?: string;
}

interface FindContext {
  isError?: boolean;
  cwd?: string;
  isPartial?: boolean;
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

export function createCustomFindTool(
  cwdOrConfig: string | ThemeConfig,
  configOrBase?: ThemeConfig | ReturnType<typeof createFindToolDefinition>,
  maybeBase?: ReturnType<typeof createFindToolDefinition>,
) {
  const config =
    typeof cwdOrConfig === 'string'
      ? (configOrBase as ThemeConfig)
      : cwdOrConfig;
  const cwd = typeof cwdOrConfig === 'string' ? cwdOrConfig : process.cwd();
  const baseDef = (maybeBase ??
    (configOrBase && 'execute' in configOrBase
      ? configOrBase
      : createFindToolDefinition(cwd))) as ReturnType<
    typeof createFindToolDefinition
  >;

  return {
    ...baseDef,
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: FindContext) {
      const args = (rawArgs ?? {}) as FindArgs;
      const pattern = escapeControlCharacters(String(args.pattern ?? '*'));
      const rawPath = String(args.path ?? '.');
      const searchPath = escapeControlCharacters(
        formatDisplayPath(rawPath, context?.cwd ?? cwd),
      );
      const icon = getToolIcon('search', config.icons);
      const isErr = Boolean(context?.isError);

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Find')) : theme.fg('toolTitle', 'Find')} ${theme.fg('syntaxString', `"${pattern}"`)} ${theme.fg('dim', 'in')} ${theme.fg('text', searchPath)}`;

        if (!isFramedContext(context)) {
          return renderBox(theme, [], safeWidth, {
            title,
            isError: isErr,
          });
        }

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
      const textOutput = getRawResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', escapeControlCharacters(textOutput || 'Find failed'))}`;
          if (!isFramedContext(context)) {
            return [truncateToWidth(errText, safeWidth)];
          }
          return [
            ...renderFrameRow(theme, errText, safeWidth, true),
            ...renderFrameBottom(theme, undefined, safeWidth, true),
          ];
        });
      }

      const { entries, notices } = parseFindOutput(textOutput, result.details);
      const total = entries.length;

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        if (safeWidth === 0) return [];
        if (total === 0 && notices.length === 0) {
          if (!isFramedContext(context)) {
            return [
              truncateToWidth(theme.fg('dim', 'no matches found'), safeWidth),
            ];
          }
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', 'no matches found'),
              safeWidth,
              false,
            ),
            ...renderFrameBottom(theme, undefined, safeWidth, false),
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
          const more = `${theme.fg('dim', '└─')} ${theme.fg('dim', `… ${remaining} more matches · ctrl+o to expand`)}`;
          rawLines.push(more);
        }

        for (const notice of notices) {
          rawLines.push(theme.fg('warning', notice));
        }

        if (!isFramedContext(context)) {
          return rawLines.map((line) =>
            truncateToWidth(`  ${line}`, safeWidth),
          );
        }

        return [
          ...rawLines.flatMap((line) =>
            renderFrameRow(theme, line, safeWidth, false),
          ),
          ...renderFrameBottom(theme, undefined, safeWidth, false),
        ];
      });
    },
  };
}
