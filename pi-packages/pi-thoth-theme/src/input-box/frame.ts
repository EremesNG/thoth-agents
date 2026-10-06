import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { IconMode } from '../shared/config.ts';
import { icon } from '../shared/icons.ts';
import type { ActiveThemeLike } from '../status-line/layout.ts';
import { type BreathingFrame, colorBreathingBorder } from './gradient.ts';

function muted(theme: ActiveThemeLike, text: string): string {
  return theme.fg?.('muted', text) ?? text;
}

function colorBorder(
  theme: ActiveThemeLike,
  text: string,
  frame?: BreathingFrame,
): string {
  return frame ? colorBreathingBorder(text, frame) : muted(theme, text);
}

/** Editor scroll indicator, `↑/↓ N more` or `^/v N more` by icon mode. */
export function scrollLabel(
  direction: 'up' | 'down',
  hiddenLineCount: number,
  mode: IconMode = 'nerd',
): string {
  const arrow = icon(direction === 'up' ? 'scrollUp' : 'scrollDown', mode);
  return `${arrow} ${hiddenLineCount} more`;
}

export function inputLabelWidth(
  width: number,
  hiddenLineCount = 0,
  mode: IconMode = 'nerd',
): number {
  const overflowWidth =
    hiddenLineCount > 0
      ? visibleWidth(scrollLabel('up', hiddenLineCount, mode)) + 3
      : 0;
  return Math.max(0, Math.floor(width) - 6 - overflowWidth);
}

/** Left pieces keep priority first; right variants run richest to most compact. */
export interface BorderRegions {
  left?: readonly string[];
  right?: readonly string[];
}

// `╭─ ` + left + ` ─…─ ` + right + ` ─╮`: the rule keeps at least one cell.
const LEFT_ONLY_OVERHEAD = 6;
const LEFT_RIGHT_OVERHEAD = 9;
const RIGHT_ONLY_OVERHEAD = 6;

function renderBorder(
  width: number,
  theme: ActiveThemeLike,
  regions: BorderRegions,
  overflow: string,
  capLeft: string,
  capRight: string,
  frame?: BreathingFrame,
): string {
  width = Math.max(0, Math.floor(width));
  const border = (text: string) => colorBorder(theme, text, frame);
  const pieces = (regions.left ?? []).filter((piece) => visibleWidth(piece));
  const rights = (regions.right ?? []).filter((piece) => visibleWidth(piece));
  const plain = () =>
    truncateToWidth(
      border(`${capLeft}${'─'.repeat(Math.max(0, width - 2))}${capRight}`),
      width,
      '',
    );
  if (width <= 5 || (!pieces.length && !overflow && !rights.length))
    return plain();

  const withOverflow = (text: string) =>
    !overflow
      ? text
      : !text
        ? muted(theme, overflow)
        : frame
          ? `${text}${border(' ─ ')}${muted(theme, overflow)}`
          : `${text}${muted(theme, ` ─ ${overflow}`)}`;
  const leftWith = (count: number) =>
    withOverflow(pieces.slice(0, count).join(' '));

  // Degrade right first (compact, then drop), then left secondaries.
  const full = leftWith(pieces.length);
  const fullWidth = visibleWidth(full);
  for (const right of rights) {
    const rightWidth = visibleWidth(right);
    if (!full) {
      if (rightWidth > width - RIGHT_ONLY_OVERHEAD) continue;
      const dashes = width - 5 - rightWidth;
      return `${border(`${capLeft}${'─'.repeat(dashes)} `)}${right}${border(` ─${capRight}`)}`;
    }
    if (fullWidth + rightWidth > width - LEFT_RIGHT_OVERHEAD) continue;
    const dashes = width - 8 - fullWidth - rightWidth;
    return `${border(`${capLeft}─ `)}${full}${border(` ${'─'.repeat(dashes)} `)}${right}${border(` ─${capRight}`)}`;
  }
  if (!full) return plain();

  const labelWidth = width - LEFT_ONLY_OVERHEAD;
  let label: string | undefined;
  for (let count = pieces.length; count >= 1; count--) {
    const candidate = leftWith(count);
    if (visibleWidth(candidate) <= labelWidth) {
      label = candidate;
      break;
    }
  }
  if (label === undefined) {
    if (overflow) {
      const statusWidth = labelWidth - visibleWidth(overflow) - 3;
      const status =
        statusWidth > 0 && pieces.length
          ? truncateToWidth(pieces[0], statusWidth, '')
          : '';
      label = withOverflow(visibleWidth(status) ? status : '');
    } else {
      label = truncateToWidth(pieces[0], labelWidth, '');
    }
  }
  const fitted = truncateToWidth(label, labelWidth, '');
  const dashes = width - visibleWidth(fitted) - 5;
  return `${border(`${capLeft}─ `)}${fitted}${border(` ${'─'.repeat(dashes)}${capRight}`)}`;
}

export function renderInputTop(
  width: number,
  theme: ActiveThemeLike,
  regions: BorderRegions,
  hiddenLineCount = 0,
  frame?: BreathingFrame,
  mode: IconMode = 'nerd',
): string {
  const overflow =
    hiddenLineCount > 0 ? scrollLabel('up', hiddenLineCount, mode) : '';
  return renderBorder(width, theme, regions, overflow, '╭', '╮', frame);
}

export function renderInputBottom(
  width: number,
  theme: ActiveThemeLike,
  regions: BorderRegions,
  hiddenLineCount = 0,
  frame?: BreathingFrame,
  mode: IconMode = 'nerd',
): string {
  const overflow =
    hiddenLineCount > 0 ? scrollLabel('down', hiddenLineCount, mode) : '';
  return renderBorder(width, theme, regions, overflow, '╰', '╯', frame);
}

export function wrapContentRow(
  line: string,
  width: number,
  theme: ActiveThemeLike,
  frame?: BreathingFrame,
): string {
  width = Math.max(0, Math.floor(width));
  if (width < 2)
    return truncateToWidth(colorBorder(theme, '││', frame), width, '');
  const content = truncateToWidth(line, width - 2, '', true);
  const side = colorBorder(theme, '│', frame);
  return `${side}${content}${side}`;
}

export function renderPlaceholder(
  line: string,
  width: number,
  theme: ActiveThemeLike,
  text: string,
): string {
  if (text !== '') return line;
  const cursor = '\x1b[7m \x1b[0m';
  const cursorStart = line.indexOf(cursor);
  if (cursorStart < 0) return line;
  const prefix = line.slice(0, cursorStart + cursor.length);
  const available = Math.max(0, width - visibleWidth(prefix));
  const placeholder = truncateToWidth('type or / for commands', available, '');
  const padding = ' '.repeat(available - visibleWidth(placeholder));
  return prefix + (theme.fg?.('dim', placeholder) ?? placeholder) + padding;
}
