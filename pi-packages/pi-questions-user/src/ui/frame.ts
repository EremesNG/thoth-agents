import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { getRenderKit } from '@thoth-agents/pi-core';

export interface FrameSection {
  title: string;
  rows: string[];
}

export interface FrameParts {
  title: string;
  /** Rows between the title border and the first divider. */
  head: string[];
  sections: FrameSection[];
}

const H = '─';
const V = '│';

/** Clip or right-pad to exactly `width` columns. */
export function pad(text: string, width: number): string {
  const clipped = truncateToWidth(text, width);
  return clipped + ' '.repeat(Math.max(0, width - visibleWidth(clipped)));
}

/** `╭── title ───╮` / `├── title ───┤`: the thoth rounded frame, drawn natively. */
function rule(
  theme: Theme,
  [left, right]: readonly [string, string],
  title: string,
  width: number,
  dimTitle: boolean,
): string {
  const inner = width - 2;
  const label = title
    ? ` ${truncateToWidth(title, Math.max(1, inner - 6))} `
    : '';
  const dashes = H.repeat(Math.max(1, inner - 2 - visibleWidth(label)));
  return (
    theme.fg('accent', `${left}${H}${H}`) +
    (dimTitle ? theme.fg('dim', label) : label) +
    theme.fg('accent', `${dashes}${right}`)
  );
}

/**
 * Draws the questionnaire frame through the pi-core render kit when one is
 * registered at render time; otherwise with the same native glyphs. Row counts
 * are identical in both paths, so the component height never depends on the kit.
 */
export function renderFrame(
  theme: Theme,
  parts: FrameParts,
  width: number,
): string[] {
  const kit = getRenderKit();
  if (kit) {
    return kit.card(
      theme,
      {
        title: parts.title,
        body: parts.head,
        sections: parts.sections,
      },
      width,
    );
  }
  if (width <= 4) return [truncateToWidth(parts.title, width)];
  const side = theme.fg('accent', V);
  const row = (line: string) => `${side} ${pad(line, width - 4)} ${side}`;
  return [
    rule(theme, ['╭', '╮'], parts.title, width, false),
    ...parts.head.map(row),
    ...parts.sections.flatMap((section) => [
      rule(theme, ['├', '┤'], section.title, width, true),
      ...section.rows.map(row),
    ]),
    theme.fg('accent', `╰${H.repeat(width - 2)}╯`),
  ];
}
