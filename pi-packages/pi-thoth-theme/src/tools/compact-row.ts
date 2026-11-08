import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { RenderStatus } from '@thoth-agents/pi-core';
import { getToolElapsedMs } from '@thoth-agents/pi-core';
import { workingFrame } from '../render-kit/working.ts';
import type { IconMode, ToolDensity } from '../shared/config.ts';
import { formatDuration } from '../shared/duration.ts';
import { compactExpandHint, fitExpandHint } from '../shared/expand-hint.ts';
import { icon, statusIcon } from '../shared/icons.ts';
import { escapeControlCharacters } from './box.ts';
import { type ElapsedRenderContext, syncElapsedTicker } from './ticker.ts';

/** Theme and render-kit themes both satisfy this. */
export type CompactRowTheme = Pick<Theme, 'fg'> & {
  bold?: (text: string) => string;
};

/** Collapsed row contract (CRC) lifecycle: a running card ignores partial errors. */
export type CompactRowState = 'running' | 'success' | 'error';

export interface CompactRowInput {
  density: Exclude<ToolDensity, 'frame'>;
  state: CompactRowState;
  mode: IconMode;
  /** Tool name or title; plain text. */
  title?: string;
  /** Primary argument or summary; plain text, shortened first when space is short. */
  summary?: string;
  /** Dim tail parts (elapsed, exit, counts); empty parts are skipped. */
  tail?: readonly (string | undefined)[];
  /** `ElapsedRenderState.animationFrame`, for the running glyph. */
  frame?: unknown;
  /** First meaningful output line; shown by `compact` only, on a success card. */
  continuation?: string;
  /** First error line; shown on the second row of a terminal error. */
  errorLine?: string;
  /** Expansion instruction such as `ctrl+o to expand`; empty when unbound. */
  expandHint?: string;
}

const MIN_SUMMARY_WIDTH = 8;
const ASCII_TREE = '`';
const TREE = '└';

/** Elapsed text as in the standard footer; also keeps the elapsed ticker in sync. */
export function compactElapsed(
  context: ElapsedRenderContext | undefined,
  state: CompactRowState,
  owner?: object,
): string | undefined {
  const status: RenderStatus =
    state === 'running'
      ? 'running'
      : state === 'error'
        ? 'failed'
        : 'completed';
  if (!context) return undefined;
  syncElapsedTicker(context, owner, status);
  const elapsedMs = getToolElapsedMs({ status, context });
  return elapsedMs === undefined
    ? undefined
    : formatDuration(Math.floor(elapsedMs / 1000) * 1000);
}

function statusGlyph(
  theme: Pick<Theme, 'fg'>,
  state: CompactRowState,
  mode: IconMode,
  frame: unknown,
): string {
  if (state === 'running') return theme.fg('accent', workingFrame(frame, mode));
  return state === 'error'
    ? theme.fg('error', statusIcon('failed', mode))
    : theme.fg('success', statusIcon('completed', mode));
}

function clean(text: string | undefined): string {
  return escapeControlCharacters((text ?? '').replace(/\s+/g, ' ').trim());
}

/**
 * Build the collapsed rows of one tool card.
 * `line`: one row (running/success); `compact`: row 1 plus an optional dim
 * continuation; a terminal error always adds the error line as row 2.
 * Rows are fitted to `width`; the expand key survives narrow widths.
 */
export function buildCompactRows(
  theme: CompactRowTheme,
  input: CompactRowInput,
  width: number,
): string[] {
  const max = Math.max(0, Math.floor(width));
  if (max <= 0) return [];
  const { state, mode } = input;
  const separator = icon('separator', mode);
  const ellipsis = icon('ellipsis', mode);
  const dimSeparator = theme.fg('dim', ` ${separator} `);
  const hint = clean(input.expandHint);
  const hintText = hint ? theme.fg('dim', `${separator} ${hint}`) : '';
  const errorLine =
    state === 'error' ? clean(input.errorLine) || '(no error output)' : '';
  const continuation =
    state === 'success' && input.density === 'compact'
      ? clean(input.continuation)
      : '';
  const hasSecondRow = state === 'error' || continuation !== '';

  const title = clean(input.title);
  const styledTitle = title
    ? theme.bold
      ? theme.bold(theme.fg('toolTitle', title))
      : theme.fg('toolTitle', title)
    : '';
  const glyph = statusGlyph(theme, state, mode, input.frame);
  const tailParts = (input.tail ?? [])
    .map(clean)
    .filter(Boolean)
    .map((part) => theme.fg('dim', part));
  const summaryText = clean(input.summary);
  const rowHint = hasSecondRow || state === 'running' ? '' : hintText;
  const fits = (row: string) => visibleWidth(row) <= max;
  const fitRow = (row: string) =>
    truncateToWidth(fitExpandHint(row, max, ellipsis), max);
  const shorten = (text: string, room: number) =>
    room > visibleWidth(ellipsis) ? truncateToWidth(text, room, ellipsis) : '';

  // Narrow widths drop, in order: summary, tail parts, title, then the
  // glyph and key remain; row 2 shortens its text first.
  const row1 = (
    titleText: string,
    summary: string,
    parts: readonly string[],
    hintPart: string,
  ) => {
    const prefix = [glyph, titleText].filter(Boolean).join(' ');
    const suffix = [parts.join(dimSeparator), hintPart]
      .filter(Boolean)
      .join(' ');
    return [prefix, summary ? theme.fg('text', summary) : '', suffix]
      .filter(Boolean)
      .join(suffix && summary ? '  ' : ' ');
  };
  const fitFirstRow = (): string => {
    const full = row1(styledTitle, summaryText, tailParts, rowHint);
    if (fits(full)) return full;
    const room = (hintPart: string) =>
      max -
      visibleWidth(row1(styledTitle, '', tailParts, hintPart)) -
      (summaryText ? 3 : 0);
    const longRoom = room(rowHint);
    if (summaryText && longRoom >= MIN_SUMMARY_WIDTH) {
      return row1(
        styledTitle,
        truncateToWidth(summaryText, longRoom, ellipsis),
        tailParts,
        rowHint,
      );
    }
    const key = compactExpandHint(rowHint);
    const summary = shorten(summaryText, room(key));
    const withKey = row1(styledTitle, summary, tailParts, key);
    if (fits(withKey)) return withKey;
    for (let count = tailParts.length - 1; count >= 0; count--) {
      const dropped = row1(styledTitle, '', tailParts.slice(0, count), key);
      if (fits(dropped)) return dropped;
    }
    const titleRoom =
      max - visibleWidth(row1('', '', [], key)) - (title ? 1 : 0);
    const short = shorten(title, titleRoom);
    if (short) {
      const styledShort = theme.bold
        ? theme.bold(theme.fg('toolTitle', short))
        : theme.fg('toolTitle', short);
      return row1(styledShort, '', [], key);
    }
    return row1('', '', [], key);
  };
  const rows = [fitRow(fitFirstRow())];

  if (hasSecondRow) {
    const tree = theme.fg('dim', `  ${mode === 'ascii' ? ASCII_TREE : TREE} `);
    const raw = errorLine || continuation;
    const style = (text: string) =>
      errorLine ? theme.fg('error', text) : theme.fg('dim', text);
    const second = (text: string, hintPart: string) =>
      `${tree}${text ? style(text) : ''}${hintPart ? `${text ? ' ' : ''}${hintPart}` : ''}`;
    const fullSecond = second(raw, hintText);
    if (fits(fullSecond)) {
      rows.push(fullSecond);
    } else {
      const key = compactExpandHint(hintText);
      const room = max - visibleWidth(second('', key)) - 1;
      const short = shorten(raw, room);
      rows.push(fitRow(second(short, key)));
    }
  }
  return rows;
}
