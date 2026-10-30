import type { Color } from '@earendil-works/pi-tui';
import type { RenderKitTheme } from '@thoth-agents/pi-core';
import { panelFg } from '@thoth-agents/pi-core/panel';
import type { PanelRole } from './chrome.js';

type SeriesPaint = PanelRole | { rgb: readonly [number, number, number] };

/**
 * Ten distinct hues shared by the Cost panel and the curves view, so rank N
 * has one color everywhere. Theme roles that are hue-distinct in every shipped
 * theme come first, amber leading and red last; the rest are fixed hues, since
 * many themes alias their remaining roles to the same few colors (gold/amber/
 * ochre collapse into one orange).
 */
export const SERIES_PALETTE: readonly SeriesPaint[] = [
  'warning',
  'success',
  'mdCode',
  'mdLink',
  { rgb: [180, 142, 240] },
  { rgb: [240, 110, 170] },
  { rgb: [198, 224, 74] },
  { rgb: [150, 98, 40] },
  { rgb: [81, 72, 200] },
  'error',
];

/** Distinct per-series glyphs keep ascii and no-color output distinguishable. */
export const ASCII_MARKERS = '1234567890';

export function seriesMarker(index: number, ascii: boolean): string {
  return ascii ? ASCII_MARKERS[index % ASCII_MARKERS.length] : '●';
}

/** Pi's Theme.style converts rgb to the theme's color mode (truecolor or 256). */
interface StyleCapable {
  style(text: string, options: { fg: Color }): string;
}

export function paintSeries(
  theme: RenderKitTheme,
  index: number,
  text: string,
): string {
  const paint = SERIES_PALETTE[index % SERIES_PALETTE.length];
  if (typeof paint === 'string') return panelFg(theme, paint, text);
  const [r, g, b] = paint.rgb;
  const styled = (theme as Partial<StyleCapable>).style;
  // Themes without a mode-aware style (plain test doubles) get truecolor SGR.
  return typeof styled === 'function'
    ? styled.call(theme, text, { fg: { kind: 'rgb', r, g, b } })
    : `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}
