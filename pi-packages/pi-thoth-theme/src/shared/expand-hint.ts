import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { icon } from './icons.ts';

const SEPARATORS = new Set([
  '·',
  ...(['nerd', 'unicode', 'ascii'] as const).map((mode) =>
    icon('separator', mode),
  ),
]);
const separatorPattern = [...SEPARATORS]
  .join('')
  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SGR = '(?:\\x1b\\[|\\x9b)[0-9;:]*m';
const SGR_TAIL = new RegExp(`${SGR}$`);
const SGR_ALL = new RegExp(SGR, 'g');
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional SGR escape matching
const FULL_RESET = /^(?:\x1b\[|\x9b)0?m$/;
const TRAILING_HINT = new RegExp(
  `((?:${SGR}|[^\\s\\x1b\\x9b${separatorPattern}])+) to expand((?:${SGR}|\\s)*)$`,
  'u',
);

/** Start of the separator run (including styling) immediately before the key. */
function separatorStart(text: string): number {
  let index = text.length;
  while (index > 0) {
    const sgr = SGR_TAIL.exec(text.slice(0, index));
    if (sgr) {
      index -= sgr[0].length;
    } else if (SEPARATORS.has(text[index - 1]) || /\s/u.test(text[index - 1])) {
      index--;
    } else {
      break;
    }
  }
  return index;
}

/** Replay SGR in order since the last full reset, as in the upstream helper. */
function activeSgr(text: string): string {
  const codes = text.match(SGR_ALL) ?? [];
  let reset = codes.length - 1;
  while (reset >= 0 && !FULL_RESET.test(codes[reset])) reset--;
  return codes.slice(reset + 1).join('');
}

function trailingHint(row: string): RegExpExecArray | null {
  const hint = TRAILING_HINT.exec(row);
  return hint && stripTerminalSequences(hint[1]).trim() !== '' ? hint : null;
}

/** Replace only a trailing expansion instruction with its bare key. */
export function compactExpandHint(row: string): string {
  const hint = trailingHint(row);
  return hint ? `${row.slice(0, hint.index)}${hint[1]}${hint[2]}` : row;
}

/**
 * Keep a trailing expansion key visible: compact first, then give up prefix
 * columns. Fitting rows, non-hints and rows without one prefix column remain
 * unchanged for the caller's final truncation. Matching is a text heuristic:
 * literal data ending in `<token> to expand` is treated as a hint too.
 */
export function fitExpandHint(
  row: string,
  width: number,
  ellipsis = '…',
): string {
  const max = Math.floor(width);
  if (max <= 0 || visibleWidth(row) <= max) return row;
  const hint = trailingHint(row);
  if (!hint) return row;
  const [, key, after] = hint;
  const before = row.slice(0, hint.index);
  const compact = `${before}${key}${after}`;
  if (visibleWidth(compact) <= max) return compact;
  const cut = separatorStart(before);
  const head = before.slice(0, cut);
  if (stripTerminalSequences(head).trim() === '') return row;
  const separator = before.slice(cut);
  const room = max - visibleWidth(separator + key + after);
  if (room < 1) return row;
  return `${truncateToWidth(head, room, ellipsis)}${activeSgr(head)}${separator}${key}${after}`;
}
