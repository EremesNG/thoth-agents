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

/** Rows available to the option window; independent of the number of options. */
export function listWindowSize(terminalRows: number): number {
  return Math.max(5, Math.min(12, terminalRows - 14));
}

/** Split `width` into list and preview columns separated by a three-column gutter. */
export function splitColumns(width: number): { left: number; right: number } {
  const usable = width - 3;
  const left = Math.floor(usable * 0.45);
  return { left, right: usable - left };
}
