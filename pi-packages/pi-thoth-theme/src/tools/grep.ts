import type {
  AgentToolResult,
  GrepToolDetails,
  Theme,
  ToolRenderResultOptions,
} from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import { toolFooter } from '../render-kit/index.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { getToolBorderTone } from './border.ts';
import {
  createComponent,
  escapeControlCharacters,
  getRawResultText,
  renderBox,
  splitResultNotice,
} from './box.ts';
import { getFileIcon, getToolIcon } from './file-icons.ts';
import {
  formatDisplayPath,
  hasToolResult,
  isFramedContext,
  renderFrameBottom,
  renderFrameRow,
  renderFrameTop,
} from './frame.ts';
import { type ElapsedRenderContext, syncElapsedTicker } from './ticker.ts';

interface GrepArgs {
  pattern?: string;
  path?: string;
}

interface GrepContext extends ElapsedRenderContext {
  cwd?: string;
  lastComponent?: { invalidate?: () => void };
  state?: {
    hasResult?: boolean;
    callComponent?: { invalidate?: () => void };
    [key: string]: unknown;
  };
  toolCallId?: string;
}

interface GrepMatchItem {
  file: string;
  line: string;
  content: string;
  isContext?: boolean;
}

type GrepParseResult =
  | { raw: true; rawLines: string[]; notices: string[] }
  | { raw: false; matches: GrepMatchItem[] };

function getGrepCandidates(
  rawLine: string,
  isContext: boolean,
): GrepMatchItem[] {
  const candidates: GrepMatchItem[] = [];
  // Lookahead includes overlapping delimiters such as :1:2: or -1-2-.
  const delimiterPattern = isContext ? /(?=-(\d+)-)/g : /(?=:(\d+):)/g;
  for (const delimiter of rawLine.matchAll(delimiterPattern)) {
    const file = rawLine.slice(0, delimiter.index);
    if (!file) continue;
    candidates.push({
      file,
      line: delimiter[1],
      content: rawLine.slice(delimiter.index + delimiter[1].length + 2),
      isContext,
    });
  }
  return candidates;
}

function parseGrepOutput(text: string, details: unknown): GrepParseResult {
  const output = splitResultNotice(text, details, 'grep');
  const lines =
    output.text || output.notices.length > 0 ? output.text.split('\n') : [];
  const metadata =
    details && typeof details === 'object'
      ? (details as GrepToolDetails)
      : undefined;
  const rawResult: GrepParseResult = {
    raw: true,
    rawLines: lines,
    notices: output.notices,
  };
  // Limits can remove the match while retaining preceding context. Do not
  // interpret any rows from an incomplete SDK result, even if they look unique.
  if (
    typeof metadata?.matchLimitReached === 'number' ||
    metadata?.truncation?.truncated === true ||
    metadata?.linesTruncated === true
  ) {
    return rawResult;
  }
  const matches: GrepMatchItem[] = [];
  for (const rawLine of lines) {
    // An orphan context reading is still a possible interpretation: absence of
    // a visible match for that filename is not evidence that it is invalid.
    const candidates = [
      ...getGrepCandidates(rawLine, false),
      ...getGrepCandidates(rawLine, true),
    ];
    if (candidates.length !== 1) return rawResult;
    matches.push(candidates[0]);
  }

  return { raw: false, matches };
}

function groupMatches(matches: GrepMatchItem[]): [string, GrepMatchItem[]][] {
  const groups: [string, GrepMatchItem[]][] = [];
  // Group only contiguous runs. A later occurrence of a file must not move its
  // rows ahead of intervening SDK output.
  for (const m of matches) {
    const previous = groups.at(-1);
    if (previous?.[0] === m.file) {
      previous[1].push(m);
    } else {
      groups.push([m.file, [m]]);
    }
  }
  return groups;
}

export function createCustomGrepTool(cwd: string, config: ThemeConfig) {
  return {
    renderShell: 'self' as const,
    renderCall(rawArgs: unknown, theme: Theme, context: GrepContext) {
      syncElapsedTicker(context);
      const args = (rawArgs ?? {}) as GrepArgs;
      const pattern = escapeControlCharacters(String(args.pattern ?? ''));
      const rawPath = args.path ? String(args.path) : '';
      const searchPath = rawPath
        ? ` in ${escapeControlCharacters(formatDisplayPath(rawPath, context?.cwd ?? cwd))}`
        : '';
      const icon = getToolIcon('search', config.icons);
      const borderTone = getToolBorderTone(context);

      const comp = createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const footer =
          context?.executionStarted && context.isPartial
            ? toolFooter(theme, { status: 'running', context })
            : undefined;
        const title = `${theme.fg('accent', icon)} ${theme.bold ? theme.bold(theme.fg('toolTitle', 'Grep')) : theme.fg('toolTitle', 'Grep')} ${theme.fg('syntaxString', `"${pattern}"`)}${theme.fg('dim', searchPath)}`;

        if (!isFramedContext(context)) {
          return renderBox(theme, [], safeWidth, {
            title,
            footer,
            isError: borderTone === 'error',
            isSuccess: borderTone === 'success',
          });
        }

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
      context: GrepContext,
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
      const textOutput = getRawResultText(result);

      if (isErr) {
        return createComponent((width: number) => {
          const safeWidth = Math.max(0, width);
          const footer = toolFooter(theme, footerOptions);
          const errText = `${theme.fg('error', '! ')}${theme.fg('error', escapeControlCharacters(textOutput || 'Grep failed'))}`;
          if (!isFramedContext(context)) {
            return [
              truncateToWidth(errText, safeWidth),
              ...renderFrameBottom(theme, footer, safeWidth, borderTone),
            ];
          }
          return [
            ...renderFrameRow(theme, errText, safeWidth, borderTone),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        });
      }

      const output = parseGrepOutput(textOutput, result.details);

      return createComponent((width: number) => {
        const safeWidth = Math.max(0, width);
        const footer = toolFooter(theme, footerOptions);
        if (safeWidth === 0) return [];
        if (output.raw) {
          const { rawLines, notices } = output;
          const visibleRawLines = options?.expanded
            ? rawLines
            : rawLines.slice(0, 8);
          const lines = visibleRawLines.map((rawLine) =>
            theme.fg('toolOutput', escapeControlCharacters(rawLine)),
          );
          if (visibleRawLines.length < rawLines.length) {
            lines.push(
              theme.fg(
                'dim',
                `… ${rawLines.length - visibleRawLines.length} more lines · ctrl+o to expand`,
              ),
            );
          }
          if (notices.length > 0) lines.push('');
          for (const notice of notices) {
            lines.push(theme.fg('warning', notice));
          }
          if (!isFramedContext(context)) {
            const rawWithPrefix = lines.map((l) => (l ? `  ${l}` : '  '));
            return renderBox(theme, rawWithPrefix, safeWidth, {
              footer,
              isSuccess: borderTone === 'success',
            });
          }
          return [
            ...lines.flatMap((l) =>
              renderFrameRow(theme, l ? `  ${l}` : '  ', safeWidth, borderTone),
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        }

        const { matches } = output;
        const totalItems = matches.length;
        if (totalItems === 0) {
          if (!isFramedContext(context)) {
            return [
              truncateToWidth(theme.fg('dim', 'no matches found'), safeWidth),
              ...renderFrameBottom(theme, footer, safeWidth, borderTone),
            ];
          }
          return [
            ...renderFrameRow(
              theme,
              theme.fg('dim', 'no matches found'),
              safeWidth,
              borderTone,
            ),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        }

        const groupEntries = groupMatches(matches);
        const rawLines: string[] = [];

        const maxGroups = options?.expanded ? groupEntries.length : 3;
        const visibleGroups = groupEntries.slice(0, maxGroups);
        let renderedItemCount = 0;

        for (let gi = 0; gi < visibleGroups.length; gi++) {
          const [file, fileMatches] = visibleGroups[gi];
          const isLastGroup =
            gi === visibleGroups.length - 1 &&
            visibleGroups.length === groupEntries.length;
          const groupBranch = isLastGroup ? '└─' : '├─';
          const fileIcon = getFileIcon(file, config.icons);
          const actualMatches = fileMatches.filter((m) => !m.isContext).length;
          const matchCountLabel = `(${actualMatches} ${actualMatches === 1 ? 'match' : 'matches'})`;

          const fileHeader = `${theme.fg('dim', groupBranch)} ${theme.fg('accent', fileIcon)} ${theme.fg('toolTitle', escapeControlCharacters(file))} ${theme.fg('dim', matchCountLabel)}`;
          rawLines.push(fileHeader);

          const maxMatches = options?.expanded ? fileMatches.length : 2;
          const visibleMatches = fileMatches.slice(0, maxMatches);
          renderedItemCount += visibleMatches.length;

          const matchBranchPrefix = isLastGroup
            ? '     '
            : `  ${theme.fg('dim', '│')}  `;
          for (const m of visibleMatches) {
            const separator = m.isContext ? '- ' : ': ';
            const lineNum = theme.fg(
              'dim',
              `${m.line.padStart(4, ' ')}${separator}`,
            );
            const content = theme.fg(
              m.isContext ? 'dim' : 'toolOutput',
              escapeControlCharacters(m.content),
            );
            rawLines.push(`${matchBranchPrefix}${lineNum}${content}`);
          }

          if (
            fileMatches.length > visibleMatches.length &&
            !options?.expanded
          ) {
            const moreFileMatches = fileMatches.length - visibleMatches.length;
            rawLines.push(
              `${matchBranchPrefix}${theme.fg('dim', `… ${moreFileMatches} more`)}`,
            );
          }
        }

        const remainingItems = totalItems - renderedItemCount;
        if (
          !options?.expanded &&
          (groupEntries.length > maxGroups || remainingItems > 0)
        ) {
          const hiddenFiles = groupEntries.length - visibleGroups.length;
          const summary = `${theme.fg('dim', '└─')} ${theme.fg('dim', `… ${remainingItems} more matches across ${hiddenFiles} files · ctrl+o to expand`)}`;
          rawLines.push(summary);
        }

        if (!isFramedContext(context)) {
          return [
            ...rawLines.map((line) => truncateToWidth(`  ${line}`, safeWidth)),
            ...renderFrameBottom(theme, footer, safeWidth, borderTone),
          ];
        }

        return [
          ...rawLines.flatMap((line) =>
            renderFrameRow(theme, line, safeWidth, borderTone),
          ),
          ...renderFrameBottom(theme, footer, safeWidth, borderTone),
        ];
      });
    },
  };
}
