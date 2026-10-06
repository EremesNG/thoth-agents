import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import { formatDuration } from '../shared/duration.ts';
import { getToolBorderTone } from './border.ts';
import { createComponent, escapeOutputRow, getResultText } from './box.ts';
import { getToolIcon } from './file-icons.ts';
import {
  hasToolResult,
  renderFrameBottom,
  renderFrameDivider,
  renderFrameRow,
  renderFrameTop,
} from './frame.ts';
import {
  type ElapsedRenderContext,
  type ElapsedRenderState,
  getElapsedMs,
  syncElapsedTicker,
} from './ticker.ts';

const COLLAPSED_OUTPUT_LINES = 5;

interface ShellArgs {
  command?: string;
}

interface ShellContext extends ElapsedRenderContext {
  lastComponent?: { invalidate?: () => void };
  state?: ElapsedRenderState & {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
  };
}

interface ShellResultStructuredContent {
  exit_code?: number;
  wall_time_seconds?: number;
}

interface ShellConfig {
  toolName: 'bash' | 'powershell';
  title: string;
  prompt: string;
}

const BASH_CONFIG: ShellConfig = {
  toolName: 'bash',
  title: 'Bash',
  prompt: '$ ',
};

const POWERSHELL_CONFIG: ShellConfig = {
  toolName: 'powershell',
  title: 'PowerShell',
  prompt: 'PS> ',
};

function extractShellExitCode(
  result: AgentToolResult<unknown>,
  textOutput: string,
  isErr: boolean,
): number {
  const structured = (
    result as { structuredContent?: ShellResultStructuredContent }
  ).structuredContent;
  if (typeof structured?.exit_code === 'number') {
    return structured.exit_code;
  }
  // Pi drops structuredContent before rendering, so the SDK status appendix is
  // the source: on error results only, the last line reads
  // `Command exited with code N` (bash.js appendStatus). Earlier stdout lines
  // that look like a status are command output, not the exit status.
  if (!isErr) return 0;
  const lastLine = textOutput.trimEnd().split('\n').at(-1) ?? '';
  const match = /^Command exited with code (\d+)$/.exec(lastLine);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function createCustomShellTool(shellConfig: ShellConfig, config: ThemeConfig) {
  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: ShellContext) {
      syncElapsedTicker(context);

      const args = (rawArgs ?? {}) as ShellArgs;
      const command = String(args.command ?? '').trim();
      const icon = getToolIcon(shellConfig.toolName, config.icons);
      const borderTone = context?.isPartial
        ? 'accent'
        : getToolBorderTone(context);
      const elapsedMs = getElapsedMs(context?.state);
      const elapsedStr =
        elapsedMs === undefined
          ? ''
          : formatDuration(Math.floor(elapsedMs / 1000) * 1000);
      const runningFooter =
        context?.executionStarted && context.isPartial
          ? [
              theme.fg('dim', 'running…'),
              elapsedStr ? theme.fg('dim', elapsedStr) : '',
            ]
              .filter(Boolean)
              .join(theme.fg('dim', ' · '))
          : undefined;

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const cmdLines = command ? command.split('\n') : [''];
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', shellConfig.title)) : theme.fg('toolTitle', shellConfig.title)}`;
        const preview = cmdLines.map(
          (l) => `${theme.fg('dim', shellConfig.prompt)}${theme.fg('text', l)}`,
        );

        if (hasToolResult(context)) {
          return [
            ...renderFrameTop(theme, title, safeWidth, borderTone),
            ...preview.flatMap((l) =>
              renderFrameRow(theme, l, safeWidth, borderTone),
            ),
            ...renderFrameDivider(theme, 'Output', safeWidth, borderTone),
          ];
        }

        return [
          ...renderFrameTop(theme, title, safeWidth, borderTone),
          ...preview.flatMap((l) =>
            renderFrameRow(theme, l, safeWidth, borderTone),
          ),
          ...renderFrameBottom(theme, runningFooter, safeWidth, borderTone),
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
      context: ShellContext,
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
      const isPartial = Boolean(options?.isPartial);
      const borderTone = isPartial
        ? 'accent'
        : getToolBorderTone({ isError: isErr, isPartial });
      syncElapsedTicker({ ...context, isPartial });
      const textOutput = getResultText(result);
      const allLines = textOutput ? textOutput.split('\n') : [];
      const lineCount = allLines.length;

      const elapsedMs = getElapsedMs(context?.state);
      const elapsedStr =
        elapsedMs === undefined
          ? ''
          : formatDuration(
              isPartial ? Math.floor(elapsedMs / 1000) * 1000 : elapsedMs,
            );

      const exitNum = extractShellExitCode(result, textOutput, isErr);
      const exitStr = `Exit ${exitNum}`;

      const words = textOutput.trim()
        ? textOutput.trim().split(/\s+/).length
        : 0;
      const wordsStr = words > 0 ? `~${words} words` : '';

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);

        const statusStr = isPartial
          ? theme.fg('dim', 'running…')
          : isErr
            ? theme.fg('error', exitStr)
            : theme.fg('success', exitStr);

        const footerParts = [
          statusStr,
          elapsedStr ? theme.fg('dim', elapsedStr) : '',
          theme.fg('dim', `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`),
          wordsStr ? theme.fg('dim', wordsStr) : '',
        ].filter(Boolean);

        const footer = footerParts.join(theme.fg('dim', ' · '));

        if (allLines.length === 0) {
          const emptyBody = [theme.fg('dim', '(no output)')];
          return [
            ...emptyBody.flatMap((l) =>
              renderFrameRow(theme, l, safeWidth, borderTone),
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        }

        const visibleLines = options?.expanded
          ? allLines
          : allLines.slice(0, COLLAPSED_OUTPUT_LINES);
        const bodyLines: string[] = visibleLines.map((l) => {
          const sanitized = escapeOutputRow(l);
          return isErr
            ? theme.fg('error', sanitized)
            : theme.fg('toolOutput', sanitized);
        });

        if (!options?.expanded && allLines.length > COLLAPSED_OUTPUT_LINES) {
          const remaining = allLines.length - COLLAPSED_OUTPUT_LINES;
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

export function createCustomBashTool(_cwd: string, config: ThemeConfig) {
  return createCustomShellTool(BASH_CONFIG, config);
}

export function createCustomPowerShellTool(_cwd: string, config: ThemeConfig) {
  return createCustomShellTool(POWERSHELL_CONFIG, config);
}
