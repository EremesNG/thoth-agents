import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { ActiveThemeLike } from '../status-line/layout.ts';

function accent(theme: ActiveThemeLike, text: string): string {
  return theme.fg?.('accent', text) ?? text;
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
): string {
  width = Math.max(0, Math.floor(width));
  if (width <= 5 || (!label && !overflow)) {
    return truncateToWidth(
      accent(theme, `${left}${'─'.repeat(Math.max(0, width - 2))}${right}`),
      width,
      '',
    );
  }
  const labelWidth = width - 6;
  if (overflow) {
    const statusWidth = labelWidth - visibleWidth(overflow) - 3;
    label =
      statusWidth > 0
        ? `${truncateToWidth(label, statusWidth, '')}${accent(theme, ` ─ ${overflow}`)}`
        : accent(theme, overflow);
  }
  const fitted = truncateToWidth(label, labelWidth, '');
  const dashes = width - visibleWidth(fitted) - 5;
  return `${accent(theme, `${left}─ `)}${fitted}${accent(theme, ` ${'─'.repeat(dashes)}${right}`)}`;
}

export function renderInputTop(
  width: number,
  theme: ActiveThemeLike,
  status: string,
  hiddenLineCount = 0,
): string {
  const overflow = hiddenLineCount > 0 ? `↑ ${hiddenLineCount} more` : '';
  return renderBorder(width, theme, status, '╭', '╮', overflow);
}

export function renderInputBottom(
  width: number,
  theme: ActiveThemeLike,
  hiddenLineCount = 0,
): string {
  const label =
    hiddenLineCount > 0 ? accent(theme, `↓ ${hiddenLineCount} more`) : '';
  return renderBorder(width, theme, label, '╰', '╯', '');
}

export function wrapContentRow(
  line: string,
  width: number,
  theme: ActiveThemeLike,
): string {
  width = Math.max(0, Math.floor(width));
  if (width < 2) return truncateToWidth(accent(theme, '││'), width, '');
  const content = truncateToWidth(line, width - 2, '', true);
  return `${accent(theme, '│')}${content}${accent(theme, '│')}`;
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
