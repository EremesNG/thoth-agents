import {
  getRenderKit,
  type RenderKitTheme,
  resolveIcon,
} from './render-kit.js';

export interface PanelFrameText {
  clip(text: string, width: number): string;
  pad(text: string, width: number): string;
  measure(text: string): number;
}

type Tone = Parameters<RenderKitTheme['fg']>[0];
const glyphs = {
  topLeft: ['boxTopLeft', '╭'],
  topRight: ['boxTopRight', '╮'],
  bottomLeft: ['boxBottomLeft', '╰'],
  bottomRight: ['boxBottomRight', '╯'],
  horizontal: ['boxHorizontal', '─'],
  vertical: ['boxVertical', '│'],
  tDown: ['boxTDown', '┬'],
  tUp: ['boxTUp', '┴'],
  tRight: ['boxTRight', '├'],
  tLeft: ['boxTLeft', '┤'],
  cross: ['boxCross', '┼'],
} as const;
export type PanelFrameBorderPart = keyof typeof glyphs | { horizontal: number };
/** Strings are already-styled side content; arrays are one styled border span. */
export type PanelFramePart = string | readonly PanelFrameBorderPart[];

export function panelFg(
  theme: RenderKitTheme | undefined,
  role: Tone,
  text: string,
): string {
  if (!theme) return text;
  return getRenderKit()?.fg(theme, role, text) ?? theme.fg(role, text);
}

/** Composable frame rows preserve caller-owned layout and ANSI span boundaries. */
export function createPanelFrame(options: {
  theme?: RenderKitTheme;
  text: PanelFrameText;
  borderTone?: Tone;
}) {
  const { text, theme } = options;
  const icon = (name: keyof typeof glyphs) =>
    resolveIcon(glyphs[name][0], glyphs[name][1]);
  const horizontal = (count: number) =>
    icon('horizontal').repeat(Math.max(0, count));
  const border = (
    parts: readonly PanelFrameBorderPart[],
    tone = options.borderTone ?? 'border',
  ) =>
    panelFg(
      theme,
      tone,
      parts
        .map((part) =>
          typeof part === 'string' ? icon(part) : horizontal(part.horizontal),
        )
        .join(''),
    );
  const line = (...parts: PanelFramePart[]) =>
    parts
      .map((part) => (typeof part === 'string' ? part : border(part)))
      .join('');
  return {
    border,
    line,
    /** Pre-styled columns, with shared rails and independently measured widths. */
    cells(
      cells: readonly { text: string; width: number }[],
      padding = 1,
    ): string {
      const space = ' '.repeat(padding);
      return (
        border(['vertical']) +
        cells
          .map(
            (cell) =>
              `${space}${text.pad(cell.text, cell.width)}${space}${border(['vertical'])}`,
          )
          .join('')
      );
    },
    /** Junctions between padded columns, or a full-width top/bottom rule. */
    rule(
      widths: readonly number[],
      kind: 'top' | 'divider' | 'bottom' = 'divider',
    ): string {
      const ends =
        kind === 'top'
          ? (['topLeft', 'topRight', 'tDown'] as const)
          : kind === 'bottom'
            ? (['bottomLeft', 'bottomRight', 'tUp'] as const)
            : (['tRight', 'tLeft', 'cross'] as const);
      const parts: PanelFrameBorderPart[] = [ends[0]];
      widths.forEach((width, index) => {
        if (index) parts.push(ends[2]);
        parts.push({ horizontal: width + 2 });
      });
      parts.push(ends[1]);
      return border(parts);
    },
    /** Single-span title, with an optional leading stroke for native cards. */
    titled(title: string, width: number, leading = 0): string {
      const label = text.clip(` ${title} `, Math.max(0, width - 2 - leading));
      return panelFg(
        theme,
        'accent',
        `${icon('topLeft')}${horizontal(leading)}${label}${horizontal(width - 2 - leading - text.measure(label))}${icon('topRight')}`,
      );
    },
  };
}

/** Semantic kit cards and native cards share one frame boundary, without loading TUI peers. */
export function renderPanelCard(options: {
  title: string;
  body(width: number): string[];
  width: number;
  maxHeight?: number;
  theme: RenderKitTheme;
  text: PanelFrameText;
}): string[] {
  const kit = getRenderKit();
  const { title, body, width, theme, text } = options;
  const frame = createPanelFrame({ theme, text, borderTone: 'accent' });
  const rows = kit
    ? kit.card(theme, { title, body }, width)
    : [
        frame.titled(title, width, 1),
        ...body(Math.max(1, width - 4)).map((line) =>
          frame.cells([{ text: line, width: Math.max(0, width - 4) }]),
        ),
        frame.border([
          'bottomLeft',
          { horizontal: Math.max(0, width - 2) },
          'bottomRight',
        ]),
      ];
  return rows
    .slice(0, options.maxHeight ?? Infinity)
    .map((line) => text.pad(line, width));
}
