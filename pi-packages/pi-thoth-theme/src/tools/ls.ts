import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { createLsToolDefinition } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import type { ThemeConfig } from '../shared/config.ts';
import {
  createComponent,
  escapeControlCharacters,
  getRawResultText,
  renderBox,
  splitResultNotice,
} from './box.ts';
import { getDirIcon, getFileIcon } from './file-icons.ts';

const COLLAPSED_ENTRY_LIMIT = 8;

interface LsArgs {
  path?: string;
}

interface LsContext {
  isError?: boolean;
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

export function createCustomLsTool(
  cwdOrConfig: string | ThemeConfig,
  configOrBase?: ThemeConfig | ReturnType<typeof createLsToolDefinition>,
  maybeBase?: ReturnType<typeof createLsToolDefinition>,
) {
  const config =
    typeof cwdOrConfig === 'string'
      ? (configOrBase as ThemeConfig)
      : cwdOrConfig;
  const cwd = typeof cwdOrConfig === 'string' ? cwdOrConfig : process.cwd();
  const baseDef = (maybeBase ??
    (configOrBase && 'execute' in configOrBase
      ? configOrBase
      : createLsToolDefinition(cwd))) as ReturnType<
    typeof createLsToolDefinition
  >;

  return {
    ...baseDef,
    renderCall(rawArgs: unknown, theme: Theme, _context: LsContext) {
      const args = (rawArgs ?? {}) as LsArgs;
      const dirPath = escapeControlCharacters(String(args.path ?? '.'));
      const icon = getDirIcon(config.icons);

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'List')) : theme.fg('toolTitle', 'List')} ${theme.fg('text', dirPath)}`;
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
      context: LsContext,
    ) {
      const isErr = Boolean(context?.isError);
      const textOutput = getRawResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', escapeControlCharacters(textOutput || 'Failed to list directory'))}`;
          return [truncateToWidth(errText, safeWidth)];
        });
      }

      const { entries, notices } = parseLsOutput(textOutput, result.details);
      const total = entries.length;

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        if (safeWidth === 0) return [];
        if (total === 0 && notices.length === 0) {
          return [
            truncateToWidth(theme.fg('dim', 'empty directory'), safeWidth),
          ];
        }

        const lines: string[] = [];
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
          const line = `  ${theme.fg('dim', branch)} ${theme.fg('accent', icon)} ${theme.fg('toolOutput', escapeControlCharacters(entry))}`;
          lines.push(truncateToWidth(line, safeWidth));
        }

        if (remaining > 0) {
          const more = `  ${theme.fg('dim', '└─')} ${theme.fg('dim', `… ${remaining} more files · ctrl+o to expand`)}`;
          lines.push(truncateToWidth(more, safeWidth));
        }

        for (const notice of notices) {
          lines.push(
            truncateToWidth(`  ${theme.fg('warning', notice)}`, safeWidth),
          );
        }

        return lines;
      });
    },
  };
}
