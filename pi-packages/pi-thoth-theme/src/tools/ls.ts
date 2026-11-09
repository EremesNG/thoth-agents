import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import { detachRenderContext } from '@thoth-agents/pi-core';
import { toolFooter } from '../render-kit/index.ts';
import { settingsComponent } from '../shared/cache.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { expandHintSuffix, fitExpandHint } from '../shared/expand-hint.ts';
import { icon as semanticIcon, statusIcon } from '../shared/icons.ts';
import { getToolBorderTone } from './border.ts';
import {
  createComponent,
  escapeControlCharacters,
  getRawResultText,
  renderBox,
  splitResultNotice,
} from './box.ts';
import {
  collapsedDensity,
  compactCall,
  compactResult,
  firstLine,
  plural,
} from './compact-tool.ts';
import { getDirIcon, getFileIcon } from './file-icons.ts';
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

interface LsArgs {
  path?: string;
}

interface LsContext extends ElapsedRenderContext {
  expanded?: boolean;
  args?: unknown;
  cwd?: string;
  lastComponent?: { invalidate?: () => void };
  state?: {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
    [key: string]: unknown;
  };
  toolCallId?: string;
}

function listedPath(context: LsContext | undefined, cwd: string): string {
  const args = (context?.args ?? {}) as LsArgs;
  return formatDisplayPath(String(args.path ?? '.'), context?.cwd ?? cwd);
}

function parseLsOutput(
  text: string,
  details: unknown,
): { entries: string[]; notices: string[] } {
  // The SDK uses this exact message only for an entirely empty result.
  if (text === '(empty directory)') return { entries: [], notices: [] };

  const output = splitResultNotice(text, details, 'ls');
  return {
    entries: output.text.split('\n').filter((line) => line.length > 0),
    notices: output.notices,
  };
}

export function createCustomLsTool(cwd: string, config: ThemeConfig) {
  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: LsContext) {
      context = detachRenderContext(context);
      return settingsComponent(() => {
        const ellipsis = semanticIcon('ellipsis', config.icons);
        syncElapsedTicker(context);
        const args = (rawArgs ?? {}) as LsArgs;
        const rawPath = String(args.path ?? '.');
        const dirPath = escapeControlCharacters(
          formatDisplayPath(rawPath, context?.cwd ?? cwd),
        );
        const density = collapsedDensity(config, context?.expanded);
        if (density) {
          return compactCall(density, theme, context, config, {
            title: 'List',
            summary: dirPath,
          });
        }
        const icon = getDirIcon(config.icons);
        const borderTone = getToolBorderTone(context);

        const comp = createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const footer =
            context?.executionStarted && context.isPartial
              ? toolFooter(theme, { status: 'running', context }, config.icons)
              : undefined;
          const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'List')) : theme.fg('toolTitle', 'List')} ${theme.fg('text', dirPath)}`;

          if (!isFramedContext(context)) {
            return renderBox(theme, [], safeWidth, {
              ellipsis,
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
      });
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
      context: LsContext,
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
        const textOutput = getRawResultText(result);
        const resultDensity = collapsedDensity(config, options?.expanded);
        if (resultDensity) {
          const { entries } = isErr
            ? { entries: [] }
            : parseLsOutput(textOutput, result.details);
          return compactResult(
            resultDensity,
            theme,
            context,
            config,
            Boolean(options?.isPartial),
            {
              title: 'List',
              summary: listedPath(context, cwd),
              counts: [plural(entries.length, 'entry', 'entries')],
              continuation: entries[0] ?? 'empty directory',
              errorLine: firstLine(textOutput) || 'Failed to list directory',
            },
          );
        }

        if (isErr) {
          return createComponent((width: number) => {
            const safeWidth = Math.max(0, width);
            const footer = toolFooter(theme, footerOptions, config.icons);
            const errText = `${theme.fg('error', `${statusIcon('warning', config.icons)} `)}${theme.fg('error', escapeControlCharacters(textOutput || 'Failed to list directory'))}`;
            if (!isFramedContext(context)) {
              return [
                truncateToWidth(errText, safeWidth),
                ...renderFrameBottom(theme, footer, safeWidth, borderTone),
              ];
            }
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

        const { entries, notices } = parseLsOutput(textOutput, result.details);
        const total = entries.length;

        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const footer = toolFooter(theme, footerOptions, config.icons);
          if (safeWidth === 0) return [];
          if (total === 0 && notices.length === 0) {
            if (!isFramedContext(context)) {
              return [
                truncateToWidth(theme.fg('dim', 'empty directory'), safeWidth),
                ...renderFrameBottom(theme, footer, safeWidth, borderTone),
              ];
            }
            return [
              ...renderFrameRow(
                theme,
                theme.fg('dim', 'empty directory'),
                safeWidth,
                borderTone,
                ellipsis,
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
            const isDir = entry.endsWith('/') || entry.endsWith('\\');
            const icon = isDir
              ? getDirIcon(config.icons)
              : getFileIcon(entry, config.icons);
            const line = `${theme.fg('dim', branch)} ${theme.fg('accent', icon)} ${theme.fg('toolOutput', escapeControlCharacters(entry))}`;
            rawLines.push(line);
          }

          if (remaining > 0) {
            const more = `${theme.fg('dim', '└─')} ${theme.fg('dim', `${semanticIcon('ellipsis', config.icons)} ${remaining} more files${expandHintSuffix(context, semanticIcon('separator', config.icons))}`)}`;
            rawLines.push(more);
          }

          for (const notice of notices) {
            rawLines.push(theme.fg('warning', notice));
          }

          if (!isFramedContext(context)) {
            return [
              ...rawLines.map((line) =>
                truncateToWidth(
                  fitExpandHint(`  ${line}`, safeWidth, ellipsis),
                  safeWidth,
                ),
              ),
              ...renderFrameBottom(theme, footer, safeWidth, borderTone),
            ];
          }

          return [
            ...rawLines.flatMap((line) =>
              renderFrameRow(theme, line, safeWidth, borderTone, ellipsis),
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        });
      });
    },
  };
}
