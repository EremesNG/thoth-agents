import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { createBashToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import { createComponent, getResultText } from './box.ts';
import { getToolIcon } from './file-icons.ts';
import {
  hasToolResult,
  renderFrameBottom,
  renderFrameDivider,
  renderFrameRow,
  renderFrameTop,
} from './frame.ts';

const COLLAPSED_OUTPUT_LINES = 5;

interface BashArgs {
  command?: string;
}

interface BashContext {
  isError?: boolean;
  executionStarted?: boolean;
  isPartial?: boolean;
  lastComponent?: { invalidate?: () => void };
  state?: {
    startedAt?: number;
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
    [key: string]: unknown;
  };
}

interface BashResultStructuredContent {
  exit_code?: number;
  wall_time_seconds?: number;
}

function extractBashExitCode(
  result: AgentToolResult<unknown>,
  textOutput: string,
  isErr: boolean,
): number {
  const structured = (
    result as { structuredContent?: BashResultStructuredContent }
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

export function createCustomBashTool(
  cwdOrConfig: string | ThemeConfig,
  configOrBase?: ThemeConfig | ReturnType<typeof createBashToolDefinition>,
  maybeBase?: ReturnType<typeof createBashToolDefinition>,
) {
  const config =
    typeof cwdOrConfig === 'string'
      ? (configOrBase as ThemeConfig)
      : cwdOrConfig;
  const cwd = typeof cwdOrConfig === 'string' ? cwdOrConfig : process.cwd();
  const baseDef = (maybeBase ??
    (configOrBase && 'execute' in configOrBase
      ? configOrBase
      : createBashToolDefinition(cwd))) as ReturnType<
    typeof createBashToolDefinition
  >;

  return {
    ...baseDef,
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: BashContext) {
      if (
        context?.state &&
        context.executionStarted &&
        context.state.startedAt === undefined
      ) {
        context.state.startedAt = Date.now();
      }

      const args = (rawArgs ?? {}) as BashArgs;
      const command = String(args.command ?? '').trim();
      const icon = getToolIcon('bash', config.icons);
      const isErr = Boolean(context?.isError);

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const cmdLines = command ? command.split('\n') : [''];
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Bash')) : theme.fg('toolTitle', 'Bash')}`;
        const preview = cmdLines.map(
          (l) => `${theme.fg('dim', '$ ')}${theme.fg('text', l)}`,
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
      context: BashContext,
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
      const textOutput = getResultText(result);
      const allLines = textOutput ? textOutput.split('\n') : [];
      const lineCount = allLines.length;

      if (!isPartial || isErr) {
        if (
          context?.state &&
          context.state.completedElapsedMs === undefined &&
          typeof context.state.startedAt === 'number'
        ) {
          context.state.completedElapsedMs =
            Date.now() - context.state.startedAt;
        }
      }

      const startedAt = context?.state?.startedAt;
      const elapsedMs =
        typeof context?.state?.completedElapsedMs === 'number'
          ? (context.state.completedElapsedMs as number)
          : typeof startedAt === 'number'
            ? Date.now() - startedAt
            : undefined;
      const elapsedStr = formatElapsed(elapsedMs);

      const exitNum = extractBashExitCode(result, textOutput, isErr);
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
        const bodyLines: string[] = visibleLines.map((l) =>
          isErr ? theme.fg('error', l) : theme.fg('toolOutput', l),
        );

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
