import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { detachRenderContext } from '@thoth-agents/pi-core';
import { toolFooter } from '../render-kit/index.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { expandHintSuffix } from '../shared/expand-hint.ts';
import { icon as semanticIcon, statusIcon } from '../shared/icons.ts';
import { getToolBorderTone } from './border.ts';
import { createComponent, getResultText } from './box.ts';
import {
  collapsedDensity,
  compactCall,
  compactResult,
  firstLine,
} from './compact-tool.ts';
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

function firstChangedLine(diffText: string): string {
  return (
    diffText
      .split('\n')
      .find(
        (line) =>
          (line.startsWith('+') || line.startsWith('-')) &&
          !line.startsWith('+++') &&
          !line.startsWith('---'),
      )
      ?.trim() ?? ''
  );
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
  const ellipsis = semanticIcon('ellipsis', config.icons);
  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: EditContext) {
      context = detachRenderContext(context);
      syncElapsedTicker(context);
      const args = (rawArgs ?? {}) as EditArgs;
      const rawPath = String(args.path ?? args.file_path ?? '');
      const filePath = formatDisplayPath(rawPath, context?.cwd ?? cwd);
      const density = collapsedDensity(config, context?.expanded);
      if (density) {
        return compactCall(density, theme, context, config, {
          title: 'Edit',
          summary: filePath,
        });
      }
      const icon = getFileIcon(filePath, config.icons);
      const editIcon = getToolIcon('edit', config.icons);
      const borderTone = getToolBorderTone(context);

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const footer =
          context?.executionStarted && context.isPartial
            ? toolFooter(theme, { status: 'running', context }, config.icons)
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

      context = detachRenderContext(context);
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
      const resultDensity = collapsedDensity(config, options?.expanded);
      if (resultDensity) {
        const editArgs = (context?.args ?? {}) as EditArgs;
        const path = String(editArgs.path ?? editArgs.file_path ?? '');
        const stats = parseDiffStats(diffText);
        const minus = config.icons === 'ascii' ? '-' : '−';
        return compactResult(
          resultDensity,
          theme,
          context,
          config,
          Boolean(options?.isPartial),
          {
            title: 'Edit',
            summary: formatDisplayPath(path, context?.cwd ?? cwd),
            counts: [`+${stats.additions} ${minus}${stats.removals}`],
            continuation: firstChangedLine(diffText) || '(no changes)',
            errorLine: firstLine(diffText) || 'Edit failed',
          },
        );
      }

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const errText = `${theme.fg('error', `${statusIcon('warning', config.icons)} `)}${theme.fg('error', diffText || 'Edit failed')}`;
          return [
            ...renderFrameRow(theme, errText, safeWidth, borderTone, ellipsis),
            ...renderFrameBottom(
              theme,
              toolFooter(theme, footerOptions, config.icons),
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
        const footer = toolFooter(
          theme,
          {
            ...footerOptions,
            summary: [`${addedStr} ${removedStr}`, '1 file'],
          },
          config.icons,
        );

        if (diffLines.length === 0) {
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', '(no changes)'),
              safeWidth,
              borderTone,
              ellipsis,
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
            theme.fg(
              'dim',
              `${semanticIcon('ellipsis', config.icons)} ${remaining} more lines${expandHintSuffix(context, semanticIcon('separator', config.icons))}`,
            ),
          );
        }

        return [
          ...bodyLines.flatMap((l) =>
            renderFrameRow(theme, l, safeWidth, borderTone, ellipsis),
          ),
          ...renderFrameBottom(theme, footer, safeWidth, borderTone),
        ];
      });
    },
  };
}
