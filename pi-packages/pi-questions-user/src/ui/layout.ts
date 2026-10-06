/** Preview goes beside the options at this terminal width or wider, below otherwise. */
export const WIDE_BREAKPOINT = 100;

export function isWide(width: number): boolean {
  return width >= WIDE_BREAKPOINT;
}

/** Keep the cursor inside a window of `size` rows, moving `start` as little as possible. */
export function windowStart(
  total: number,
  cursor: number,
  size: number,
  start: number,
): number {
  if (total <= size) return 0;
  const clamped = Math.min(Math.max(start, 0), total - size);
  if (cursor < clamped) return cursor;
  if (cursor >= clamped + size) return cursor - size + 1;
  return clamped;
}

/** Fraction of the terminal the whole questionnaire may occupy; the chat above stays visible. */
const HEIGHT_FRACTION = 0.4;
/** Frame, tabs, dividers, note row and two hint rows around prompt + content. */
export const CHROME_ROWS = 8;
/** Smallest content area: room for a label plus a short editor. */
export const MIN_CONTENT_ROWS = 6;
export const MAX_PROMPT_ROWS = 3;

/** Total rows the component may use, derived from the terminal height. */
export function heightBudget(terminalRows: number): number {
  return Math.max(12, Math.floor(terminalRows * HEIGHT_FRACTION));
}

/** Split `width` into list and preview columns separated by a three-column gutter. */
export function splitColumns(width: number): { left: number; right: number } {
  const usable = width - 3;
  const left = Math.floor(usable * 0.45);
  return { left, right: usable - left };
}
