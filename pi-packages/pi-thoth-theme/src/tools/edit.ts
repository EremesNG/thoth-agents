import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { toolFooter } from '../render-kit/index.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { getToolBorderTone } from './border.ts';
import { createComponent, getResultText } from './box.ts';
import { getFileIcon, getToolIcon } from './file-icons.ts';
import {
  formatDisplayPath,
  hasToolResult,
  renderFrameBottom,
  renderFrameRow,
  renderFrameTop,
} from './frame.ts';
import { type ElapsedRenderContext, syncElapsedTicker } from './ticker.ts';

const COLLAPSED_DIFF_LINES = 6;

interface EditArgs {
  path?: string;
  file_path?: string;
}

interface EditContext extends ElapsedRenderContext {
  cwd?: string;
  lastComponent?: { invalidate?: () => void };
  state?: {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
    [key: string]: unknown;
  };
}

interface EditDetails {
  diff?: string;
}

function parseDiffStats(diffText: string): {
  additions: number;
  removals: number;
} {
  let additions = 0;
  let removals = 0;
  const lines = diffText.split('\n');

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions++;
    else if (line.startsWith('-')) removals++;
  }

  return { additions, removals };
}

function colorDiffLine(line: string, theme: Theme): string {
  if (
    line.startsWith('+++') ||
    line.startsWith('---') ||
    line.startsWith('@@')
  ) {
    return theme.fg('dim', line);
  }
  if (line.startsWith('+')) {
    return theme.fg('toolDiffAdded', line);
  }
  if (line.startsWith('-')) {
    return theme.fg('toolDiffRemoved', line);
  }
  return theme.fg('toolDiffContext', line);
}

export function createCustomEditTool(cwd: string, config: ThemeConfig) {
  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: EditContext) {
      syncElapsedTicker(context);
      const args = (rawArgs ?? {}) as EditArgs;
      const rawPath = String(args.path ?? args.file_path ?? '');
      const filePath = formatDisplayPath(rawPath, context?.cwd ?? cwd);
      const icon = getFileIcon(filePath, config.icons);
      const editIcon = getToolIcon('edit', config.icons);
      const borderTone = getToolBorderTone(context);

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const footer =
          context?.executionStarted && context.isPartial
            ? toolFooter(theme, { status: 'running', context })
            : undefined;
        const title = `${theme.fg('accent', editIcon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Edit')) : theme.fg('toolTitle', 'Edit')} ${theme.fg('accent', icon)} ${theme.fg('text', filePath)}`;

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
      context: EditContext,
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
      const details = result.details as EditDetails | undefined;
      const diffText = details?.diff ?? getResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', diffText || 'Edit failed')}`;
          return [
            ...renderFrameRow(theme, errText, safeWidth, borderTone),
            ...renderFrameBottom(
              theme,
              toolFooter(theme, footerOptions),
              safeWidth,
              borderTone,
            ),
          ];
        });
      }

      const { additions, removals } = parseDiffStats(diffText);
      const diffLines = diffText ? diffText.split('\n') : [];

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const addedStr =
          additions > 0
            ? theme.fg('toolDiffAdded', `+${additions}`)
            : theme.fg('dim', '+0');
        const removedStr =
          removals > 0
            ? theme.fg('toolDiffRemoved', `-${removals}`)
            : theme.fg('dim', '-0');
        const footer = toolFooter(theme, {
          ...footerOptions,
          summary: [`${addedStr} ${removedStr}`, '1 file'],
        });

        if (diffLines.length === 0) {
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', '(no changes)'),
              safeWidth,
              borderTone,
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        }

        const visibleLines = options?.expanded
          ? diffLines
          : diffLines.slice(0, COLLAPSED_DIFF_LINES);
        const bodyLines: string[] = visibleLines.map((l) =>
          colorDiffLine(l, theme),
        );

        if (!options?.expanded && diffLines.length > COLLAPSED_DIFF_LINES) {
          const remaining = diffLines.length - COLLAPSED_DIFF_LINES;
          bodyLines.push(
            theme.fg('dim', `… ${remaining} more lines · ctrl+o to expand`),
          );
        }

        return [
          ...bodyLines.flatMap((l) =>
            renderFrameRow(theme, l, safeWidth, borderTone),
          ),
          ...renderFrameBottom(theme, footer, safeWidth, borderTone),
        ];
      });
    },
  };
}
