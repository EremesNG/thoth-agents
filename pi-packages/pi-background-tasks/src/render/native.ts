import type { KeybindingHints, Theme, ThemeColor } from '@earendil-works/pi-coding-agent';
import {
  Box,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import { type RenderKitTheme, resolveIcon } from '@thoth-agents/pi-core';

export const COLLAPSED_LINES = 8;

export function renderTheme(theme: unknown): RenderKitTheme {
  const t = theme as Partial<Theme> | undefined;
  return {
    fg: (role, text) => t?.fg?.(role, text) ?? text,
    bold: (text) => t?.bold?.(text) ?? text,
  };
}

export function themed(theme: unknown, role: ThemeColor, text: string): string {
  return renderTheme(theme).fg(role, text);
}

export function resolveExpandHint(context?: Partial<KeybindingHints>): string {
  const key = context?.keyText?.('app.tools.expand') ?? '';
  return key ? `${key} to expand` : '';
}

export function collapseNative(
  rows: string[],
  expanded: boolean,
  theme: unknown,
  context?: Partial<KeybindingHints>,
): string[] {
  if (expanded || rows.length <= COLLAPSED_LINES) return rows;
  const hidden = rows.length - COLLAPSED_LINES;
  const hint = resolveExpandHint(context);
  return [
    ...rows.slice(0, COLLAPSED_LINES),
    themed(
      theme,
      'dim',
      `${resolveIcon('ellipsis', '…')} ${hidden} more line${hidden === 1 ? '' : 's'}${hint ? ` (${hint})` : ''}`,
    ),
  ];
}

export function nativeRows(
  rows: readonly string[],
  width: number,
  wrap = false,
): string[] {
  if (!(width > 0)) return [];
  const cells = Math.floor(width);
  const lines = wrap
    ? rows.flatMap((row) => wrapTextWithAnsi(row, cells))
    : rows;
  const ellipsis = resolveIcon('ellipsis', '…');
  const marker = visibleWidth(ellipsis) <= cells ? ellipsis : '';
  return lines.map((row) => truncateToWidth(row, cells, marker));
}

/** Split padding lets stacked self-shell renderers match one SDK Box(1, 1). */
export function nativeToolRows(
  rows: string[],
  width: number,
  theme: unknown,
  options: {
    pending: boolean;
    isError: boolean;
    top?: boolean;
    bottom?: boolean;
    wrap?: boolean;
  },
): string[] {
  if (!(width > 0)) return [];
  const t = theme as Partial<Theme> | undefined;
  const role = options.pending
    ? 'toolPendingBg'
    : options.isError
      ? 'toolErrorBg'
      : 'toolSuccessBg';
  const bg = (text: string) => t?.bg?.(role, text) ?? text;
  const box = new Box(1, 0, bg);
  box.addChild({
    render: (innerWidth) => nativeRows(rows, innerWidth, options.wrap),
    invalidate() {},
  });
  const padding = bg(' '.repeat(Math.floor(width)));
  return [
    ...(options.top ? [padding] : []),
    ...box.render(width),
    ...(options.bottom ? [padding] : []),
  ].map((line) => truncateToWidth(line, Math.floor(width)));
}
