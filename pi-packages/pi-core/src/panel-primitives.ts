import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { createPanelFrame, panelFg } from './panel-frame.js';
import { type RenderKitTheme, resolveIcon } from './render-kit.js';

export { panelFg } from './panel-frame.js';

export type PanelTheme = RenderKitTheme & {
  bg?(role: 'selectedBg', text: string): string;
};

export interface PanelRow {
  text: string;
  selected?: boolean;
  tone?: Parameters<RenderKitTheme['fg']>[0];
}
export type PanelRowInput = string | PanelRow;

export interface PanelFrameOptions {
  title: string;
  rows: readonly PanelRowInput[];
  width: number;
  maxHeight?: number;
  theme?: PanelTheme;
}

export function panelHintRow(text: string): PanelRow {
  return { text, tone: 'muted' };
}

/** Measure ANSI/OSC-styled text in terminal cells, not JavaScript string units. */
export const panelVisibleWidth = visibleWidth;

/** Physical panel rows cannot contain tabs or newlines. */
export function truncatePanelText(text: string, width: number): string {
  const cells = Math.max(0, Math.floor(width));
  if (!cells) return '';
  const normalized = text.replace(/\r?\n|\r/g, ' ').replace(/\t/g, '  ');
  return truncateToWidth(normalized, cells, resolveIcon('ellipsis', '…'));
}

export function padPanelText(text: string, width: number): string {
  const clipped = truncatePanelText(text, width);
  return (
    clipped + ' '.repeat(Math.max(0, Math.floor(width) - visibleWidth(clipped)))
  );
}

/** Apply selection after clipping/padding, so the background fills the row. */
export function renderPanelRow(
  row: PanelRowInput,
  width: number,
  theme?: PanelTheme,
): string {
  const item = typeof row === 'string' ? { text: row } : row;
  const text = truncatePanelText(item.text, width);
  const content = panelFg(
    theme,
    item.selected ? 'accent' : (item.tone ?? 'text'),
    text,
  );
  const padded = padPanelText(content, width);
  return item.selected ? (theme?.bg?.('selectedBg', padded) ?? padded) : padded;
}

export function renderPanelFrame(options: PanelFrameOptions): string[] {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.maxHeight ?? Infinity));
  if (height < 3) return [truncatePanelText(options.title, width)];
  if (width < 4) {
    return [
      options.title,
      ...options.rows.map((row) => (typeof row === 'string' ? row : row.text)),
    ]
      .slice(0, height)
      .map((row) => truncatePanelText(row, width));
  }
  const frame = createPanelFrame({
    theme: options.theme,
    text: { clip: truncatePanelText, pad: padPanelText, measure: visibleWidth },
  });
  const top = frame.titled(options.title, width);
  const bottom = frame.rule([width - 4], 'bottom');
  const body = options.rows.slice(0, height - 2).map((row) =>
    frame.cells([
      {
        text: renderPanelRow(row, width - 4, options.theme),
        width: width - 4,
      },
    ]),
  );
  return [top, ...body, bottom].map((row) => truncatePanelText(row, width));
}

export interface PanelViewport {
  start: number;
  /** Exclusive end. The budget includes the optional notice row. */
  end: number;
  notice?: string;
}

/** Budget includes a notice; maxRows caps choices only, not the notice. */
export function panelViewport(
  count: number,
  cursor: number,
  budget: number,
  maxRows = Infinity,
): PanelViewport {
  const length = Math.max(0, Math.floor(count));
  const available = Math.max(0, Math.min(length, Math.floor(budget)));
  if (!available) return { start: 0, end: 0 };
  const cap = Math.max(0, Math.floor(maxRows));
  if (!cap) return { start: 0, end: 0 };
  const showRange = length > Math.min(available, cap) && available > 1;
  const size = Math.min(cap, available - Number(showRange));
  const selected = Math.max(0, Math.min(Math.floor(cursor), length - 1));
  const start = Math.max(
    0,
    Math.min(selected - Math.floor(size / 2), length - size),
  );
  const end = start + size;
  return {
    start,
    end,
    ...(showRange
      ? { notice: `Showing ${start + 1}–${end} of ${length}` }
      : {}),
  };
}
