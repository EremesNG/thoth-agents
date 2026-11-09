import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { detachRenderContext } from '@thoth-agents/pi-core';
import { toolFooter } from '../render-kit/index.ts';
import { settingsComponent } from '../shared/cache.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { expandHintSuffix } from '../shared/expand-hint.ts';
import { icon as semanticIcon, statusIcon } from '../shared/icons.ts';
import { getToolBorderTone } from './border.ts';
import { createComponent, getResultText, hasImageContent } from './box.ts';
import {
  collapsedDensity,
  compactCall,
  compactResult,
  firstLine,
  plural,
} from './compact-tool.ts';
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
  args?: unknown;
  expanded?: boolean;
  cwd?: string;
  lastComponent?: { invalidate?: () => void };
  state?: {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
    [key: string]: unknown;
  };
}

function readRange(args: ReadArgs): string {
  const offset = args.offset ?? undefined;
  const limit = args.limit ?? undefined;
  if (limit === undefined && (offset === undefined || Number(offset) === 1)) {
    return '';
  }
  const start = offset ?? 1;
  const end = limit !== undefined ? Number(start) + Number(limit) - 1 : '';
  return `:${start}${end ? `-${end}` : ''}`;
}

export function createCustomReadTool(cwd: string, config: ThemeConfig) {
  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: ToolContext) {
      context = detachRenderContext(context);
      return settingsComponent(() => {
        syncElapsedTicker(context);
        const args = (rawArgs ?? {}) as ReadArgs;
        const rawPath = String(args.path ?? args.file_path ?? '');
        const filePath = formatDisplayPath(rawPath, context?.cwd ?? cwd);
        const range = readRange(args);
        const density = collapsedDensity(config, context?.expanded);
        if (density) {
          return compactCall(density, theme, context, config, {
            title: 'Read',
            summary: `${filePath}${range}`,
          });
        }
        const icon = getFileIcon(filePath, config.icons);
        const borderTone = getToolBorderTone(context);

        const comp = createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const footer =
            context?.executionStarted && context.isPartial
              ? toolFooter(theme, { status: 'running', context }, config.icons)
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
      });
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

      context = detachRenderContext(context);
      return settingsComponent(() => {
        const ellipsis = semanticIcon('ellipsis', config.icons);
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
        const resultDensity = collapsedDensity(config, options?.expanded);
        if (resultDensity) {
          const readArgs = (context?.args ?? {}) as ReadArgs;
          const path = String(readArgs.path ?? readArgs.file_path ?? '');
          const lineCount = textOutput ? textOutput.split('\n').length : 0;
          const isImage = hasImageContent(result);
          return compactResult(
            resultDensity,
            theme,
            context,
            config,
            Boolean(options?.isPartial),
            {
              title: 'Read',
              summary: `${formatDisplayPath(path, context?.cwd ?? cwd)}${readRange(readArgs)}`,
              counts: [isImage ? 'image' : plural(lineCount, 'line')],
              continuation: firstLine(textOutput) || '(empty file)',
              errorLine: firstLine(textOutput) || 'Failed to read file',
            },
          );
        }

        if (isErr) {
          return createComponent((width: number) => {
            const safeWidth = Math.max(0, width);
            const footer = toolFooter(theme, footerOptions, config.icons);
            const errText = `${theme.fg('error', `${statusIcon('warning', config.icons)} `)}${theme.fg('error', textOutput || 'Failed to read file')}`;
            return [
              ...renderFrameRow(
                theme,
                errText,
                safeWidth,
                borderTone,
                ellipsis,
              ),
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
            const footer = toolFooter(theme, footerOptions, config.icons);
            return [
              ...renderFrameRow(
                theme,
                theme.fg('dim', note),
                safeWidth,
                borderTone,
                ellipsis,
              ),
              ...renderFrameBottom(theme, footer, safeWidth, borderTone),
            ];
          });
        }

        const lines = textOutput ? textOutput.split('\n') : [];
        const lineCount = lines.length;

        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const footer = toolFooter(theme, footerOptions, config.icons);
          if (!options?.expanded) {
            const summary = `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}${expandHintSuffix(context, semanticIcon('separator', config.icons))}`;
            return [
              ...renderFrameRow(
                theme,
                theme.fg('dim', summary),
                safeWidth,
                borderTone,
                ellipsis,
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
                ellipsis,
              ),
              ...renderFrameBottom(theme, footer, safeWidth, borderTone),
            ];
          }

          return [
            ...lines.flatMap((line) =>
              renderFrameRow(theme, line, safeWidth, borderTone, ellipsis),
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        });
      });
    },
  };
}
