import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import {
  createBashToolDefinition,
  createPowerShellToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
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

function formatElapsed(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function createCustomShellTool<
  TDef extends {
    name: string;
    renderShell?: unknown;
    renderCall?: unknown;
    renderResult?: unknown;
  },
>(
  shellConfig: ShellConfig,
  cwdOrConfig: string | ThemeConfig,
  configOrBase?: ThemeConfig | TDef,
  maybeBase?: TDef,
  defaultFactory?: (cwd: string) => TDef,
) {
  const config =
    typeof cwdOrConfig === 'string'
      ? (configOrBase as ThemeConfig)
      : cwdOrConfig;
  const cwd = typeof cwdOrConfig === 'string' ? cwdOrConfig : process.cwd();
  const baseDef = (maybeBase ??
    (configOrBase &&
    typeof configOrBase === 'object' &&
    'execute' in configOrBase
      ? (configOrBase as TDef)
      : defaultFactory?.(cwd))) as TDef;

  return {
    ...baseDef,
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: ShellContext) {
      syncElapsedTicker(context);

      const args = (rawArgs ?? {}) as ShellArgs;
      const command = String(args.command ?? '').trim();
      const icon = getToolIcon(shellConfig.toolName, config.icons);
      const isErr = Boolean(context?.isError);
      const elapsedStr = formatElapsed(getElapsedMs(context?.state));
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
            ...renderFrameTop(theme, title, safeWidth, isErr),
            ...preview.flatMap((l) =>
              renderFrameRow(theme, l, safeWidth, isErr),
            ),
            ...renderFrameDivider(theme, 'Output', safeWidth, isErr),
          ];
        }

        return [
          ...renderFrameTop(theme, title, safeWidth, isErr),
          ...preview.flatMap((l) => renderFrameRow(theme, l, safeWidth, isErr)),
          ...renderFrameBottom(theme, runningFooter, safeWidth, isErr),
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
      syncElapsedTicker({ ...context, isPartial });
      const textOutput = getResultText(result);
      const allLines = textOutput ? textOutput.split('\n') : [];
      const lineCount = allLines.length;

      const elapsedStr = formatElapsed(getElapsedMs(context?.state));

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
              renderFrameRow(theme, l, safeWidth, isErr),
            ),
            ...renderFrameBottom(theme, footer, safeWidth, isErr),
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
            renderFrameRow(theme, l, safeWidth, isErr),
          ),
          ...renderFrameBottom(theme, footer, safeWidth, isErr),
        ];
      });
    },
  };
}

export function createCustomBashTool(
  cwdOrConfig: string | ThemeConfig,
  configOrBase?: ThemeConfig | ReturnType<typeof createBashToolDefinition>,
  maybeBase?: ReturnType<typeof createBashToolDefinition>,
) {
  return createCustomShellTool(
    BASH_CONFIG,
    cwdOrConfig,
    configOrBase,
    maybeBase,
    createBashToolDefinition,
  );
}

export function createCustomPowerShellTool(
  cwdOrConfig: string | ThemeConfig,
  configOrBase?:
    | ThemeConfig
    | ReturnType<typeof createPowerShellToolDefinition>,
  maybeBase?: ReturnType<typeof createPowerShellToolDefinition>,
) {
  return createCustomShellTool(
    POWERSHELL_CONFIG,
    cwdOrConfig,
    configOrBase,
    maybeBase,
    createPowerShellToolDefinition,
  );
}
