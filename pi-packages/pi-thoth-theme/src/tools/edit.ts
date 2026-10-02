import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { createEditToolDefinition } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import type { ThemeConfig } from '../shared/config.ts';
import { createComponent, getResultText, renderBox } from './box.ts';
import { getFileIcon, getToolIcon } from './file-icons.ts';

const COLLAPSED_DIFF_LINES = 6;

interface EditArgs {
  path?: string;
  file_path?: string;
}

interface EditContext {
  isError?: boolean;
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

export function createCustomEditTool(
  cwdOrConfig: string | ThemeConfig,
  configOrBase?: ThemeConfig | ReturnType<typeof createEditToolDefinition>,
  maybeBase?: ReturnType<typeof createEditToolDefinition>,
) {
  const config =
    typeof cwdOrConfig === 'string'
      ? (configOrBase as ThemeConfig)
      : cwdOrConfig;
  const cwd = typeof cwdOrConfig === 'string' ? cwdOrConfig : process.cwd();
  const baseDef = (maybeBase ??
    (configOrBase && 'execute' in configOrBase
      ? configOrBase
      : createEditToolDefinition(cwd))) as ReturnType<
    typeof createEditToolDefinition
  >;

  return {
    ...baseDef,
    renderCall(rawArgs: unknown, theme: Theme, _context: EditContext) {
      const args = (rawArgs ?? {}) as EditArgs;
      const filePath = String(args.path ?? args.file_path ?? '');
      const icon = getFileIcon(filePath, config.icons);
      const editIcon = getToolIcon('edit', config.icons);

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const title = `${theme.fg('accent', editIcon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Edit')) : theme.fg('toolTitle', 'Edit')} ${theme.fg('accent', icon)} ${theme.fg('text', filePath)}`;
        return renderBox(theme, [], safeWidth, {
          title,
          isError: Boolean(_context?.isError),
        });
      });
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
      context: EditContext,
    ) {
      const isErr = Boolean(context?.isError);
      const details = result.details as EditDetails | undefined;
      const diffText = details?.diff ?? getResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', diffText || 'Edit failed')}`;
          return [truncateToWidth(errText, safeWidth)];
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
        const footer = `${addedStr} ${removedStr} · ${theme.fg('dim', '1 file')}`;

        if (diffLines.length === 0) {
          return renderBox(
            theme,
            [theme.fg('dim', '(no changes)')],
            safeWidth,
            { footer },
          );
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

        return renderBox(theme, bodyLines, safeWidth, { footer });
      });
    },
  };
}
