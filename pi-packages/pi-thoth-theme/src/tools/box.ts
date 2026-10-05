import {
  type AgentToolResult,
  DEFAULT_MAX_BYTES,
  type FindToolDetails,
  formatSize,
  type GrepToolDetails,
  type LsToolDetails,
  type Theme,
} from '@earendil-works/pi-coding-agent';
import {
  type Component,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { cachedComponent } from '../shared/cache.ts';

export const BOX_HORIZONTAL = '─';
export const BOX_VERTICAL = '│';
export const BOX_ROUND_TOP_LEFT = '╭';
export const BOX_ROUND_TOP_RIGHT = '╮';
export const BOX_ROUND_BOTTOM_LEFT = '╰';
export const BOX_ROUND_BOTTOM_RIGHT = '╯';
export const BOX_DIVIDER_LEFT = '├';
export const BOX_DIVIDER_RIGHT = '┤';

export function getRawResultText(
  result: AgentToolResult<unknown> | undefined,
): string {
  if (!result || !result.content || !Array.isArray(result.content)) return '';
  return result.content
    .filter(
      (block) => block && typeof block === 'object' && block.type === 'text',
    )
    .map((block) => String(block.text ?? ''))
    .join('\n');
}

export function getResultText(
  result: AgentToolResult<unknown> | undefined,
): string {
  // Retain the existing CR/CRLF normalization for read/bash/edit/write.
  // Listing/search parsers use getRawResultText: CR can be filename data.
  return getRawResultText(result).replace(/\r/g, '');
}

export function escapeControlCharacters(text: string): string {
  // Display C0 data and DEL as Unicode control pictures (CR → ␍, ESC → ␛,
  // DEL → ␡), except tabs; C1 controls, which have no pictures, as `\xNN`.
  // Escape only at display boundaries, before styling: SDK row splitting on LF
  // and parsing retain the original data, without terminal injection.
  let escaped = '';
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 0x20 && character !== '\t') {
      escaped += String.fromCharCode(0x2400 + code);
    } else if (code === 0x7f) {
      escaped += '\u2421';
    } else if (code >= 0x80 && code <= 0x9f) {
      escaped += `\\x${code.toString(16)}`;
    } else {
      escaped += character;
    }
  }
  return escaped;
}

/**
 * Strip 7-bit and 8-bit ANSI SGR (Select Graphic Rendition) styling sequences.
 * Preserves non-SGR sequences and control characters.
 */
export function stripSgr(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional SGR escape matching
  return text.replace(/(?:\x1b\[|\x9b)[0-9;:]*m/g, '');
}

/**
 * Escape an output row for shell tools (bash/powershell):
 * strips SGR sequences so color codes do not bleed or display as ␛[...m,
 * while escaping other control characters to prevent terminal injection.
 */
export function escapeOutputRow(text: string): string {
  return escapeControlCharacters(stripSgr(text));
}

export function hasImageContent(
  result: AgentToolResult<unknown> | undefined,
): boolean {
  if (!result || !result.content || !Array.isArray(result.content))
    return false;
  return result.content.some(
    (block) => block && typeof block === 'object' && block.type === 'image',
  );
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').length;
}

export interface BoxOptions {
  title?: string;
  footer?: string;
  isError?: boolean;
}

// The SDK appends one exact, metadata-backed notice after a blank line.
// Never inspect individual data lines for notice-like words or brackets.
export function splitResultNotice(
  text: string,
  details: unknown,
  tool: 'ls' | 'find' | 'grep',
): { text: string; notices: string[] } {
  if (!details || typeof details !== 'object') return { text, notices: [] };
  const metadata = details as LsToolDetails & FindToolDetails & GrepToolDetails;
  let limitNotices = [''];
  if (tool === 'ls' && typeof metadata.entryLimitReached === 'number') {
    const limit = metadata.entryLimitReached;
    limitNotices = [
      `${limit} entries limit reached. Use limit=${limit * 2} for more`,
    ];
  } else if (
    tool === 'find' &&
    typeof metadata.resultLimitReached === 'number'
  ) {
    const limit = metadata.resultLimitReached;
    limitNotices = [
      `${limit} results limit reached. Use limit=${limit * 2} for more, or refine pattern`,
      // SDK custom glob operations use the shorter variant.
      `${limit} results limit reached`,
    ];
  } else if (
    tool === 'grep' &&
    typeof metadata.matchLimitReached === 'number'
  ) {
    const limit = metadata.matchLimitReached;
    limitNotices = [
      `${limit} matches limit reached. Use limit=${limit * 2} for more, or refine pattern`,
    ];
  }
  const commonNotices: string[] = [];
  if (metadata.truncation?.truncated === true) {
    commonNotices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
  }
  if (tool === 'grep' && metadata.linesTruncated === true) {
    // The installed SDK's GREP_MAX_LINE_LENGTH is 500 (not publicly exported).
    commonNotices.push(
      'Some lines truncated to 500 chars. Use read tool to see full lines',
    );
  }
  for (const limitNotice of limitNotices) {
    const notice = [limitNotice, ...commonNotices].filter(Boolean).join('. ');
    if (!notice) continue;
    const appendix = `[${notice}]`;
    const suffix = `\n\n${appendix}`;
    if (text.endsWith(suffix)) {
      return { text: text.slice(0, -suffix.length), notices: [appendix] };
    }
  }
  return { text, notices: [] };
}

function truncateBoxLine(line: string, limit: number): string {
  // Only fitting printable ASCII is guaranteed byte-preserving. ANSI and
  // graphemes must retain every SDK truncation pass, even if they appear to fit.
  return line.length <= limit && !/[^\x20-\x7e]/.test(line)
    ? line
    : truncateToWidth(line, limit);
}

export function renderBox(
  theme: Pick<Theme, 'fg'>,
  bodyLines: string[],
  width: number,
  options: BoxOptions = {},
): string[] {
  const safeWidth = Math.max(0, Math.floor(width));
  const borderColor = options.isError ? 'error' : 'accent';

  if (safeWidth <= 0) {
    return [];
  }

  if (safeWidth <= 4) {
    const raw = [options.title, ...bodyLines, options.footer].filter(
      (l): l is string => typeof l === 'string' && l.length > 0,
    );
    const lines = raw.length > 0 ? raw : bodyLines;
    return lines.map((l) => truncateBoxLine(l, safeWidth));
  }

  const result: string[] = [];
  const innerWidth = Math.max(1, safeWidth - 2);

  // Header / Top border
  if (options.title) {
    const rawTitle = ` ${options.title} `;
    const maxTitleWidth = Math.max(1, innerWidth - 4);
    const fitTitle =
      visibleWidth(rawTitle) > maxTitleWidth
        ? ` ${truncateToWidth(options.title, Math.max(1, maxTitleWidth - 2))} `
        : rawTitle;
    const titleWidth = visibleWidth(fitTitle);
    const remainingDashes = Math.max(1, innerWidth - 2 - titleWidth);
    const top = `${theme.fg(borderColor, `${BOX_ROUND_TOP_LEFT}${BOX_HORIZONTAL}${BOX_HORIZONTAL}`)}${fitTitle}${theme.fg(
      borderColor,
      `${BOX_HORIZONTAL.repeat(remainingDashes)}${BOX_ROUND_TOP_RIGHT}`,
    )}`;
    result.push(truncateToWidth(top, safeWidth));
  } else {
    const top = `${theme.fg(borderColor, `${BOX_ROUND_TOP_LEFT}${BOX_HORIZONTAL.repeat(innerWidth)}${BOX_ROUND_TOP_RIGHT}`)}`;
    result.push(truncateToWidth(top, safeWidth));
  }

  // Body lines
  const contentWidth = Math.max(1, innerWidth - 2);
  for (const line of bodyLines) {
    const truncated = truncateBoxLine(line, contentWidth);
    const pad = Math.max(0, contentWidth - visibleWidth(truncated));
    const framed = `${theme.fg(borderColor, `${BOX_VERTICAL} `)}${truncated}${' '.repeat(pad)}${theme.fg(borderColor, ` ${BOX_VERTICAL}`)}`;
    result.push(truncateBoxLine(framed, safeWidth));
  }

  // Footer / Bottom border
  if (options.footer) {
    const rawFooter = ` ${options.footer} `;
    const maxFooterWidth = Math.max(1, innerWidth - 4);
    const fitFooter =
      visibleWidth(rawFooter) > maxFooterWidth
        ? ` ${truncateToWidth(options.footer, Math.max(1, maxFooterWidth - 2))} `
        : rawFooter;
    const footerWidth = visibleWidth(fitFooter);
    const remainingDashes = Math.max(1, innerWidth - 2 - footerWidth);
    const bottom = `${theme.fg(borderColor, `${BOX_ROUND_BOTTOM_LEFT}${BOX_HORIZONTAL}${BOX_HORIZONTAL}`)}${fitFooter}${theme.fg(
      borderColor,
      `${BOX_HORIZONTAL.repeat(remainingDashes)}${BOX_ROUND_BOTTOM_RIGHT}`,
    )}`;
    result.push(truncateToWidth(bottom, safeWidth));
  } else {
    const bottom = `${theme.fg(
      borderColor,
      `${BOX_ROUND_BOTTOM_LEFT}${BOX_HORIZONTAL.repeat(innerWidth)}${BOX_ROUND_BOTTOM_RIGHT}`,
    )}`;
    result.push(truncateToWidth(bottom, safeWidth));
  }

  return result.map((l) => truncateBoxLine(l, safeWidth));
}

export function createComponent(
  renderFn: (width: number) => string[],
): Component {
  return cachedComponent((width) => {
    const safeWidth = Math.max(0, Math.floor(width));
    if (safeWidth <= 0) return [];
    const lines = renderFn(safeWidth);
    return lines.map((line) => truncateToWidth(line, safeWidth));
  });
}
