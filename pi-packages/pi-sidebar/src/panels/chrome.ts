import {
  type RenderKitTheme,
  resolveIcon,
  type SemanticGlyphName,
} from '@thoth-agents/pi-core';
import {
  padPanelText,
  panelFg,
  panelVisibleWidth,
  truncatePanelText,
} from '@thoth-agents/pi-core/panel';

export type PanelRole = Parameters<RenderKitTheme['fg']>[0];

export interface PanelStyle {
  role: PanelRole;
  icon: SemanticGlyphName;
}

/** One hue per panel, drawn from theme roles. */
const STYLES: Record<string, PanelStyle> = {
  session: { role: 'accent', icon: 'model' },
  workspace: { role: 'mdLink', icon: 'folder' },
  subagents: { role: 'mdCode', icon: 'agent' },
  todos: { role: 'success', icon: 'taskInProgress' },
  'background-tasks': { role: 'syntaxNumber', icon: 'tool' },
  cost: { role: 'warning', icon: 'cost' },
};
const FALLBACK: PanelStyle = { role: 'accent', icon: 'tool' };
export const SIDEBAR_ICON_NAMES = [
  ...new Set([...Object.values(STYLES), FALLBACK].map((style) => style.icon)),
  'branch',
  'separator',
  'warning',
  'tokensIn',
  'tokensOut',
  'context',
  'throughput',
  'elapsed',
  'boxTopLeft',
  'boxTopRight',
  'boxBottomLeft',
  'boxBottomRight',
  'boxHorizontal',
  'boxVertical',
  'ellipsis',
] as const satisfies readonly SemanticGlyphName[];

export function panelStyle(id: string): PanelStyle {
  return STYLES[id] ?? FALLBACK;
}

/** Cache-key fragment: changes whenever the active kit resolves different glyphs. */
export function iconSignature(): string {
  return SIDEBAR_ICON_NAMES.map((name) => resolveIcon(name)).join('\u0000');
}

/** ASCII kits resolve box rails to `|`; keep other glyph choices in step. */
export function isAsciiMode(): boolean {
  return resolveIcon('boxVertical', '│') === '|';
}

/** Dim is closed with 22 so only intensity resets, never the surrounding colors. */
const DIM = '\x1b[2m';
const NORMAL_INTENSITY = '\x1b[22m';

/** Atelier label column; narrow sidebars give columns back to the value. */
export function labelColumn(width: number): number {
  return width < 28 ? 9 : 12;
}

function glyph(name: SemanticGlyphName, fallback: string): string {
  return resolveIcon(name, fallback);
}

function border(theme: RenderKitTheme, role: PanelRole, text: string): string {
  return `${DIM}${panelFg(theme, role, text)}${NORMAL_INTENSITY}`;
}

export interface ChromeOptions {
  id: string;
  title: string;
  summary?: string;
  rows: readonly string[];
  width: number;
  height: number;
  theme: RenderKitTheme;
  /** Overrides the id-derived role, e.g. transient warning panels. */
  role?: PanelRole;
}

/** `╭─ ◆ TITLE ──── summary ─╮`, body rows between rails, then `╰──╯`. */
export function renderChrome(options: ChromeOptions): string[] {
  const { theme, width, height } = options;
  if (width <= 0 || height <= 0) return [];
  const style = panelStyle(options.id);
  const role = options.role ?? style.role;
  const tl = glyph('boxTopLeft', '╭');
  const tr = glyph('boxTopRight', '╮');
  const bl = glyph('boxBottomLeft', '╰');
  const br = glyph('boxBottomRight', '╯');
  const h = glyph('boxHorizontal', '─');
  const v = glyph('boxVertical', '│');
  const rule = (count: number) => h.repeat(Math.max(0, count));
  const bold = theme.bold?.bind(theme) ?? ((text: string) => text);
  const icon = resolveIcon(style.icon);
  const title = options.title.toUpperCase();
  const plainHead = icon ? `${icon} ${title}` : title;
  const minimum = 6;
  if (width < minimum)
    return [panelFg(theme, role, bold(truncatePanelText(title, width)))];
  const head = truncatePanelText(plainHead, width - minimum);
  const styledHead = panelFg(theme, role, bold(head));
  const headWidth = panelVisibleWidth(head);
  const summary = options.summary
    ? truncatePanelText(options.summary, width - minimum - 2)
    : '';
  const summaryWidth = panelVisibleWidth(summary);
  // '╭─ ' + head + ' ' + fill + [' ' + summary + ' ─'] + '╮'
  const withSummary = width - headWidth - summaryWidth - 8;
  const top =
    summary && withSummary >= 1
      ? border(theme, role, `${tl}${h} `) +
        styledHead +
        border(theme, role, ` ${rule(withSummary)}`) +
        ` ${panelFg(theme, 'muted', summary)} ` +
        border(theme, role, `${h}${tr}`)
      : border(theme, role, `${tl}${h} `) +
        styledHead +
        border(theme, role, ` ${rule(width - headWidth - 5)}${tr}`);
  if (height < 3) return [top];
  const inner = Math.max(0, width - 4);
  const rail = border(theme, role, v);
  const body = options.rows
    .slice(0, height - 2)
    .map((row) => `${rail} ${padPanelText(row, inner)} ${rail}`);
  return [top, ...body, border(theme, role, `${bl}${rule(width - 2)}${br}`)];
}

/** Right-aligned value after a fixed label column; `…` truncates the value. */
export function labelRow(
  label: string,
  value: string,
  width: number,
  theme: RenderKitTheme,
  truncate: (text: string, cells: number) => string = truncatePanelText,
): string {
  const inner = Math.max(0, width - 4);
  const column = Math.min(labelColumn(width), inner);
  const cell = padPanelText(panelFg(theme, 'muted', label), column);
  const room = Math.max(0, inner - column);
  const shown = truncate(value, room);
  return (
    cell + ' '.repeat(Math.max(0, room - panelVisibleWidth(shown))) + shown
  );
}

/** Keeps the tail of a long path, which identifies the directory. */
export function truncateStart(text: string, cells: number): string {
  if (panelVisibleWidth(text) <= cells) return text;
  const ellipsis = glyph('ellipsis', '…');
  const budget = cells - panelVisibleWidth(ellipsis);
  if (budget <= 0) return truncatePanelText(text, cells);
  let tail = '';
  for (const character of Array.from(text).reverse()) {
    if (panelVisibleWidth(character + tail) > budget) break;
    tail = character + tail;
  }
  return ellipsis + tail;
}
