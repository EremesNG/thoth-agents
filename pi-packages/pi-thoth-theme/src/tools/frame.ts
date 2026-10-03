import { relative, resolve } from 'node:path';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

export const FRAME_HORIZONTAL = '─';
export const FRAME_VERTICAL = '│';
export const FRAME_ROUND_TOP_LEFT = '╭';
export const FRAME_ROUND_TOP_RIGHT = '╮';
export const FRAME_ROUND_BOTTOM_LEFT = '╰';
export const FRAME_ROUND_BOTTOM_RIGHT = '╯';
export const FRAME_DIVIDER_LEFT = '├';
export const FRAME_DIVIDER_RIGHT = '┤';

export function formatDisplayPath(targetPath: string, cwd?: string): string {
  if (!targetPath) return '';
  if (!cwd) return targetPath;
  try {
    const absTarget = resolve(cwd, targetPath);
    const absCwd = resolve(cwd);
    const rel = relative(absCwd, absTarget);
    if (
      !rel.startsWith('..') &&
      !rel.startsWith('/') &&
      !/^[A-Za-z]:/.test(rel)
    ) {
      // Inside cwd. Normalize to forward slashes for clean unified display.
      return rel.replace(/\\/g, '/') || '.';
    }
  } catch {
    // ignore resolution error
  }
  return targetPath;
}

export function hasToolResult(context?: {
  isError?: boolean;
  state?: { hasResult?: boolean; [key: string]: unknown };
}): boolean {
  if (!context) return false;
  return Boolean(context.state?.hasResult);
}

export function isFramedContext(context?: {
  toolCallId?: string;
  state?: { hasResult?: boolean; [key: string]: unknown };
}): boolean {
  if (!context) return false;
  return Boolean(context.toolCallId || context.state);
}

export function renderFrameTop(
  theme: Theme,
  title: string,
  width: number,
  isError = false,
): string[] {
  const safeWidth = Math.max(0, Math.floor(width));
  const borderColor = isError ? 'error' : 'accent';

  if (safeWidth <= 0) return [];
  if (safeWidth <= 4) {
    return [truncateToWidth(title, safeWidth)];
  }

  const innerWidth = Math.max(1, safeWidth - 2);
  const rawTitle = ` ${title} `;
  const maxTitleWidth = Math.max(1, innerWidth - 4);
  const fitTitle =
    visibleWidth(rawTitle) > maxTitleWidth
      ? ` ${truncateToWidth(title, Math.max(1, maxTitleWidth - 2))} `
      : rawTitle;
  const titleWidth = visibleWidth(fitTitle);
  const remainingDashes = Math.max(1, innerWidth - 2 - titleWidth);
  const top = `${theme.fg(borderColor, `${FRAME_ROUND_TOP_LEFT}${FRAME_HORIZONTAL}${FRAME_HORIZONTAL}`)}${fitTitle}${theme.fg(
    borderColor,
    `${FRAME_HORIZONTAL.repeat(remainingDashes)}${FRAME_ROUND_TOP_RIGHT}`,
  )}`;
  return [truncateToWidth(top, safeWidth)];
}

export function renderFrameRow(
  theme: Theme,
  line: string,
  width: number,
  isError = false,
): string[] {
  const safeWidth = Math.max(0, Math.floor(width));
  const borderColor = isError ? 'error' : 'accent';

  if (safeWidth <= 0) return [];
  if (safeWidth <= 4) {
    return [truncateToWidth(line, safeWidth)];
  }

  const innerWidth = Math.max(1, safeWidth - 2);
  const contentWidth = Math.max(1, innerWidth - 2);
  const truncated = truncateToWidth(line, contentWidth);
  const pad = Math.max(0, contentWidth - visibleWidth(truncated));
  const framed = `${theme.fg(borderColor, `${FRAME_VERTICAL} `)}${truncated}${' '.repeat(pad)}${theme.fg(borderColor, ` ${FRAME_VERTICAL}`)}`;
  return [truncateToWidth(framed, safeWidth)];
}

export function renderFrameDivider(
  theme: Theme,
  title: string,
  width: number,
  isError = false,
): string[] {
  const safeWidth = Math.max(0, Math.floor(width));
  const borderColor = isError ? 'error' : 'accent';

  if (safeWidth <= 0) return [];
  if (safeWidth <= 4) {
    return [truncateToWidth(title, safeWidth)];
  }

  const innerWidth = Math.max(1, safeWidth - 2);
  const rawTitle = ` ${title} `;
  const maxTitleWidth = Math.max(1, innerWidth - 4);
  const fitTitle =
    visibleWidth(rawTitle) > maxTitleWidth
      ? ` ${truncateToWidth(title, Math.max(1, maxTitleWidth - 2))} `
      : rawTitle;
  const titleWidth = visibleWidth(fitTitle);
  const remainingDashes = Math.max(1, innerWidth - 2 - titleWidth);
  const divider = `${theme.fg(borderColor, `${FRAME_DIVIDER_LEFT}${FRAME_HORIZONTAL}${FRAME_HORIZONTAL}`)}${theme.fg('dim', fitTitle)}${theme.fg(
    borderColor,
    `${FRAME_HORIZONTAL.repeat(remainingDashes)}${FRAME_DIVIDER_RIGHT}`,
  )}`;
  return [truncateToWidth(divider, safeWidth)];
}

export function renderFrameBottom(
  theme: Theme,
  footer: string | undefined,
  width: number,
  isError = false,
): string[] {
  const safeWidth = Math.max(0, Math.floor(width));
  const borderColor = isError ? 'error' : 'accent';

  if (safeWidth <= 0) return [];
  if (safeWidth <= 4) {
    return footer ? [truncateToWidth(footer, safeWidth)] : [];
  }

  const innerWidth = Math.max(1, safeWidth - 2);
  if (footer) {
    const rawFooter = ` ${footer} `;
    const maxFooterWidth = Math.max(1, innerWidth - 4);
    const fitFooter =
      visibleWidth(rawFooter) > maxFooterWidth
        ? ` ${truncateToWidth(footer, Math.max(1, maxFooterWidth - 2))} `
        : rawFooter;
    const footerWidth = visibleWidth(fitFooter);
    const remainingDashes = Math.max(1, innerWidth - 2 - footerWidth);
    const bottom = `${theme.fg(borderColor, `${FRAME_ROUND_BOTTOM_LEFT}${FRAME_HORIZONTAL}${FRAME_HORIZONTAL}`)}${fitFooter}${theme.fg(
      borderColor,
      `${FRAME_HORIZONTAL.repeat(remainingDashes)}${FRAME_ROUND_BOTTOM_RIGHT}`,
    )}`;
    return [truncateToWidth(bottom, safeWidth)];
  }

  const bottom = `${theme.fg(
    borderColor,
    `${FRAME_ROUND_BOTTOM_LEFT}${FRAME_HORIZONTAL.repeat(innerWidth)}${FRAME_ROUND_BOTTOM_RIGHT}`,
  )}`;
  return [truncateToWidth(bottom, safeWidth)];
}
