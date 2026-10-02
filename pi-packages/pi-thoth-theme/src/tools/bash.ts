import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { createBashToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ThemeConfig } from '../shared/config.ts';
import { createComponent, getResultText, renderBox } from './box.ts';
import { getToolIcon } from './file-icons.ts';

const COLLAPSED_OUTPUT_LINES = 5;

interface BashArgs {
  command?: string;
}

interface BashContext {
  isError?: boolean;
  executionStarted?: boolean;
  state?: {
    startedAt?: number;
    [key: string]: unknown;
  };
}

interface BashResultDetails {
  exitCode?: number;
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

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const cmdLines = command ? command.split('\n') : [''];
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Bash')) : theme.fg('toolTitle', 'Bash')}`;
        const preview = cmdLines.map(
          (l) => `${theme.fg('dim', '$ ')}${theme.fg('text', l)}`,
        );

        return renderBox(theme, preview, safeWidth, {
          title,
          isError: Boolean(context?.isError),
        });
      });
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
      context: BashContext,
    ) {
      const isErr = Boolean(context?.isError);
      const textOutput = getResultText(result);
      const allLines = textOutput ? textOutput.split('\n') : [];
      const lineCount = allLines.length;

      const startedAt = context?.state?.startedAt;
      const elapsedMs =
        typeof startedAt === 'number' ? Date.now() - startedAt : undefined;
      const elapsedStr = formatElapsed(elapsedMs);

      const exitCode = (result.details as BashResultDetails | undefined)
        ?.exitCode;
      const exitStr = isErr
        ? 'exit 1'
        : exitCode !== undefined
          ? `exit ${exitCode}`
          : 'exit 0';

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);

        const footerParts = [
          isErr ? theme.fg('error', exitStr) : theme.fg('success', exitStr),
          elapsedStr ? theme.fg('dim', elapsedStr) : '',
          theme.fg('dim', `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`),
        ].filter(Boolean);

        const footer = footerParts.join(theme.fg('dim', ' · '));

        if (allLines.length === 0) {
          const emptyBody = [theme.fg('dim', '(no output)')];
          return renderBox(theme, emptyBody, safeWidth, {
            footer,
            isError: isErr,
          });
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

        return renderBox(theme, bodyLines, safeWidth, {
          footer,
          isError: isErr,
        });
      });
    },
  };
}
