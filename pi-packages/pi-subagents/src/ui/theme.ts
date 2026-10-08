import type { ThemeColor } from '@earendil-works/pi-coding-agent';
import { getRenderKit, resolveIcon } from '@thoth-agents/pi-core';
import { truncateToWidth, visibleWidth } from '../render/text-width.js';

export {
  stripAnsi,
  truncateToWidth,
  visibleWidth,
} from '../render/text-width.js';

export function agentIcon(): string {
  return resolveIcon('agent', '󰣇');
}
export function cyberSeparator(): string {
  return resolveIcon('separatorHeavy', '┃');
}
export const BOX_CHARS = {
  get topLeft() {
    return resolveIcon('boxTopLeft', '╭');
  },
  get topRight() {
    return resolveIcon('boxTopRight', '╮');
  },
  get vertical() {
    return resolveIcon('boxVertical', '│');
  },
  get bottomLeft() {
    return resolveIcon('boxBottomLeft', '╰');
  },
  get bottomRight() {
    return resolveIcon('boxBottomRight', '╯');
  },
  get horizontal() {
    return resolveIcon('boxHorizontal', '─');
  },
} as const;

export function themeFg(theme: any, role: ThemeColor, text: string): string {
  const kit = getRenderKit();
  return kit ? kit.fg(theme, role, text) : (theme?.fg?.(role, text) ?? text);
}

export function themeBg(theme: any, role: string, text: string): string {
  return theme?.bg?.(role, text) ?? text;
}

export function themeBold(theme: any, text: string): string {
  return theme?.bold?.(text) ?? text;
}

export function themeAccent(theme: any, text: string): string {
  return themeFg(theme, 'accent', text);
}
export function themeDim(theme: any, text: string): string {
  return themeFg(theme, 'dim', text);
}
export function themeSuccess(theme: any, text: string): string {
  return themeFg(theme, 'success', text);
}
export function themeWarning(theme: any, text: string): string {
  return themeFg(theme, 'warning', text);
}
export function themeError(theme: any, text: string): string {
  return themeFg(theme, 'error', text);
}
export function themeTitle(theme: any, text: string): string {
  return themeFg(theme, 'toolTitle', themeBold(theme, text));
}

export function themeStatus(
  theme: any,
  status: string,
  customLabel?: string,
): string {
  const label = customLabel ?? status;
  switch (status.toLowerCase()) {
    case 'completed':
    case 'done':
    case 'success':
      return themeSuccess(theme, label);
    case 'failed':
    case 'error':
      return themeError(theme, label);
    case 'queued':
    case 'cancelled':
    case 'interrupted':
    case 'stopping':
      return themeWarning(theme, label);
    case 'running':
      return themeAccent(theme, label);
    default:
      return themeDim(theme, label);
  }
}

export function padToWidth(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, '');
  return `${clipped}${' '.repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}

export function frameBox(
  title: string,
  lines: string[],
  width: number,
  options?: { borderFn?: (text: string) => string },
): string[] {
  const borderFn = options?.borderFn ?? ((text: string) => text);
  const safeWidth = Math.max(1, Math.floor(width || 1));
  if (safeWidth < 10) {
    const all = title ? [title, ...lines] : lines;
    return all.map((l) =>
      truncateToWidth(l, safeWidth, resolveIcon('ellipsis', '…')),
    );
  }
  const innerWidth = safeWidth - 2;
  const contentWidth = Math.max(1, innerWidth - 2);

  let top: string;
  if (title) {
    const maxTitleWidth = Math.max(0, innerWidth - 4);
    const clippedTitle = truncateToWidth(
      title,
      maxTitleWidth,
      resolveIcon('ellipsis', '…'),
    );
    const titleVisWidth = visibleWidth(clippedTitle);
    const filler = Math.max(0, innerWidth - titleVisWidth - 3);
    top = `${borderFn(BOX_CHARS.topLeft + BOX_CHARS.horizontal)} ${clippedTitle} ${borderFn(BOX_CHARS.horizontal.repeat(filler))}${borderFn(BOX_CHARS.topRight)}`;
  } else {
    top = `${borderFn(BOX_CHARS.topLeft)}${borderFn(BOX_CHARS.horizontal.repeat(innerWidth))}${borderFn(BOX_CHARS.topRight)}`;
  }

  const flatLines = lines.flatMap((l) => l.split('\n'));
  const middle = flatLines.map(
    (l) =>
      `${borderFn(BOX_CHARS.vertical)} ${padToWidth(l, contentWidth)} ${borderFn(BOX_CHARS.vertical)}`,
  );
  const bottom = `${borderFn(BOX_CHARS.bottomLeft)}${borderFn(BOX_CHARS.horizontal.repeat(innerWidth))}${borderFn(BOX_CHARS.bottomRight)}`;

  return [top, ...middle, bottom];
}
