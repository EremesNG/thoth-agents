import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { createWriteToolDefinition } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import type { ThemeConfig } from '../shared/config.ts';
import { createComponent, getResultText, renderBox } from './box.ts';
import { getFileIcon, getToolIcon } from './file-icons.ts';

const COLLAPSED_WRITE_LINES = 6;

interface WriteArgs {
  path?: string;
  file_path?: string;
  content?: string;
}

interface WriteContext {
  isError?: boolean;
  args?: unknown;
}

export function createCustomWriteTool(
  cwdOrConfig: string | ThemeConfig,
  configOrBase?: ThemeConfig | ReturnType<typeof createWriteToolDefinition>,
  maybeBase?: ReturnType<typeof createWriteToolDefinition>,
) {
  const config =
    typeof cwdOrConfig === 'string'
      ? (configOrBase as ThemeConfig)
      : cwdOrConfig;
  const cwd = typeof cwdOrConfig === 'string' ? cwdOrConfig : process.cwd();
  const baseDef = (maybeBase ??
    (configOrBase && 'execute' in configOrBase
      ? configOrBase
      : createWriteToolDefinition(cwd))) as ReturnType<
    typeof createWriteToolDefinition
  >;

  return {
    ...baseDef,
    renderCall(rawArgs: unknown, theme: Theme, _context: WriteContext) {
      const args = (rawArgs ?? {}) as WriteArgs;
      const filePath = String(args.path ?? args.file_path ?? '');
      const icon = getFileIcon(filePath, config.icons);
      const writeIcon = getToolIcon('write', config.icons);

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const title = `${theme.fg('accent', writeIcon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Write')) : theme.fg('toolTitle', 'Write')} ${theme.fg('accent', icon)} ${theme.fg('text', filePath)}`;
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
      context: WriteContext,
    ) {
      const isErr = Boolean(context?.isError);
      const textOutput = getResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', textOutput || 'Write failed')}`;
          return [truncateToWidth(errText, safeWidth)];
        });
      }

      // Check content lines from context args or result
      const writeArgs = context?.args as WriteArgs | undefined;
      const content = String(writeArgs?.content ?? '');
      const contentLines = content ? content.split('\n') : [];
      const lineCount = contentLines.length || 1;

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const addedStr = theme.fg('toolDiffAdded', `+${lineCount} lines`);
        const footer = `${addedStr} · ${theme.fg('dim', '1 file')}`;

        if (contentLines.length === 0) {
          const defaultMsg = textOutput || 'File written';
          return renderBox(
            theme,
            [theme.fg('toolOutput', defaultMsg)],
            safeWidth,
            { footer },
          );
        }

        const visibleLines = options?.expanded
          ? contentLines
          : contentLines.slice(0, COLLAPSED_WRITE_LINES);
        const bodyLines: string[] = visibleLines.map((l) =>
          theme.fg('toolOutput', l),
        );

        if (!options?.expanded && contentLines.length > COLLAPSED_WRITE_LINES) {
          const remaining = contentLines.length - COLLAPSED_WRITE_LINES;
          bodyLines.push(
            theme.fg('dim', `… ${remaining} more lines · ctrl+o to expand`),
          );
        }

        return renderBox(theme, bodyLines, safeWidth, { footer });
      });
    },
  };
}
