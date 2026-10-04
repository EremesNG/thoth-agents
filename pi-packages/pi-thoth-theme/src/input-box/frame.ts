import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { ActiveThemeLike } from '../status-line/layout.ts';
import { type CometFrame, colorCometBorder } from './gradient.ts';

function muted(theme: ActiveThemeLike, text: string): string {
  return theme.fg?.('muted', text) ?? text;
}

export function inputLabelWidth(width: number, hiddenLineCount = 0): number {
  const overflowWidth =
    hiddenLineCount > 0 ? visibleWidth(`↑ ${hiddenLineCount} more`) + 3 : 0;
  return Math.max(0, Math.floor(width) - 6 - overflowWidth);
}

function renderBorder(
  width: number,
  theme: ActiveThemeLike,
  label: string,
  left: string,
  right: string,
  overflow: string,
  frame?: CometFrame,
  row = 0,
): string {
  width = Math.max(0, Math.floor(width));
  const border = (text: string, column: number) =>
    frame
      ? colorCometBorder(text, column, row, frame, (text) => muted(theme, text))
      : muted(theme, text);
  if (width <= 5 || (!label && !overflow)) {
    return truncateToWidth(
      border(`${left}${'─'.repeat(Math.max(0, width - 2))}${right}`, 0),
      width,
      '',
    );
  }
  const labelWidth = width - 6;
  if (overflow) {
    const statusWidth = labelWidth - visibleWidth(overflow) - 3;
    if (statusWidth <= 0) {
      label = muted(theme, overflow);
    } else {
      const fittedStatus = truncateToWidth(label, statusWidth, '');
      const separator = frame
        ? `${border(' ─ ', 3 + visibleWidth(fittedStatus))}${muted(theme, overflow)}`
        : muted(theme, ` ─ ${overflow}`);
      label = fittedStatus + separator;
    }
  }
  const fitted = truncateToWidth(label, labelWidth, '');
  const dashes = width - visibleWidth(fitted) - 5;
  return `${border(`${left}─ `, 0)}${fitted}${border(` ${'─'.repeat(dashes)}${right}`, 3 + visibleWidth(fitted))}`;
}

export function renderInputTop(
  width: number,
  theme: ActiveThemeLike,
  status: string,
  hiddenLineCount = 0,
  frame?: CometFrame,
): string {
  const overflow = hiddenLineCount > 0 ? `↑ ${hiddenLineCount} more` : '';
  return renderBorder(width, theme, status, '╭', '╮', overflow, frame);
}

export function renderInputBottom(
  width: number,
  theme: ActiveThemeLike,
  hiddenLineCount = 0,
  frame?: CometFrame,
): string {
  const label =
    hiddenLineCount > 0 ? muted(theme, `↓ ${hiddenLineCount} more`) : '';
  return renderBorder(
    width,
    theme,
    label,
    '╰',
    '╯',
    '',
    frame,
    frame ? frame.height - 1 : 0,
  );
}

export function wrapContentRow(
  line: string,
  width: number,
  theme: ActiveThemeLike,
  frame?: CometFrame,
  row = 1,
): string {
  width = Math.max(0, Math.floor(width));
  if (width < 2) return truncateToWidth(muted(theme, '││'), width, '');
  const content = truncateToWidth(line, width - 2, '', true);
  const side = (column: number) =>
    frame
      ? colorCometBorder('│', column, row, frame, (text) => muted(theme, text))
      : muted(theme, '│');
  return `${side(0)}${content}${side(width - 1)}`;
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
