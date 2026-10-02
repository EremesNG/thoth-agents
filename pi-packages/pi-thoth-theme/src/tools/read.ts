import type {
  AgentToolResult,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { createReadToolDefinition } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import type { ThemeConfig } from '../shared/config.ts';
import { createComponent, getResultText, hasImageContent } from './box.ts';
import { getFileIcon } from './file-icons.ts';

interface ReadArgs {
  path?: string;
  file_path?: string;
  offset?: number;
  limit?: number;
}

interface ToolContext {
  isError?: boolean;
}

export function createCustomReadTool(
  cwdOrConfig: string | ThemeConfig,
  configOrBase?: ThemeConfig | ReturnType<typeof createReadToolDefinition>,
  maybeBase?: ReturnType<typeof createReadToolDefinition>,
) {
  const config =
    typeof cwdOrConfig === 'string'
      ? (configOrBase as ThemeConfig)
      : cwdOrConfig;
  const cwd = typeof cwdOrConfig === 'string' ? cwdOrConfig : process.cwd();
  const baseDef = (maybeBase ??
    (configOrBase && 'execute' in configOrBase
      ? configOrBase
      : createReadToolDefinition(cwd))) as ReturnType<
    typeof createReadToolDefinition
  >;

  return {
    ...baseDef,
    renderCall(rawArgs: unknown, theme: Theme, _context: ToolContext) {
      const args = (rawArgs ?? {}) as ReadArgs;
      const filePath = String(args.path ?? args.file_path ?? '');
      const icon = getFileIcon(filePath, config.icons);
      let range = '';
      if (args.offset !== undefined || args.limit !== undefined) {
        const start = args.offset ?? 1;
        const end =
          args.limit !== undefined
            ? Number(start) + Number(args.limit) - 1
            : '';
        range = `:${start}${end ? `-${end}` : ''}`;
      }

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const callText = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Read')) : theme.fg('toolTitle', 'Read')} ${theme.fg('text', `${filePath}${range}`)}`;
        return [truncateToWidth(callText, safeWidth)];
      });
    },

    renderResult(
      result: AgentToolResult<unknown>,
      options: ToolRenderResultOptions,
      theme: Theme,
      context: ToolContext,
    ) {
      const isErr = Boolean(context?.isError);
      const textOutput = getResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', textOutput || 'Failed to read file')}`;
          return [truncateToWidth(errText, safeWidth)];
        });
      }

      if (hasImageContent(result)) {
        // Image content preserved untouched for Pi's native image pass
        const firstTextBlock = result.content?.find(
          (c) => c && typeof c === 'object' && c.type === 'text',
        ) as { text?: string } | undefined;
        const note = firstTextBlock?.text ?? 'Read image file';
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          return [truncateToWidth(theme.fg('dim', note), safeWidth)];
        });
      }

      const lines = textOutput ? textOutput.split('\n') : [];
      const lineCount = lines.length;

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        if (!options?.expanded) {
          const summary = `${lineCount} ${lineCount === 1 ? 'line' : 'lines'} · ctrl+o to expand`;
          return [truncateToWidth(theme.fg('dim', summary), safeWidth)];
        }

        return lines.map((line) => truncateToWidth(line, safeWidth));
      });
    },
  };
}
