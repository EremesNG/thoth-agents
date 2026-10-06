import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { toolFooter } from '../render-kit/index.ts';
import type { ThemeConfig } from '../shared/config.ts';
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

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const cmdLines = command ? command.split('\n') : [''];
        const footer =
          context?.executionStarted && context.isPartial
            ? toolFooter(theme, { status: 'running', context })
            : undefined;
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

      const exitNum = extractShellExitCode(result, textOutput, isErr);
      const exitStr = `Exit ${exitNum}`;

      const words = textOutput.trim()
        ? textOutput.trim().split(/\s+/).length
        : 0;
      const wordsStr = words > 0 ? `~${words} words` : '';

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);

        const footer = toolFooter(theme, {
          status: isPartial ? 'running' : isErr ? 'failed' : 'completed',
          context: { ...context, isPartial },
          summary: [
            exitStr,
            `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`,
            wordsStr,
          ],
        });

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
