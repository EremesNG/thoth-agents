import { isAbsolute, relative, resolve, sep } from 'node:path';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { combineSessionAndSubagentCost } from '@thoth-agents/pi-core';
import type { IconMode } from '../shared/config.ts';
import { icon } from '../shared/icons.ts';
import type { SessionTokenTotals } from './tokens.ts';

export interface ContextUsageInfo {
  percent?: number | null;
  tokens?: number | null;
  contextWindow?: number;
}

export interface StatusData {
  modelName?: string;
  modelId?: string;
  thinkingLevel?: string;
  gitBranch?: string | null;
  /** Working directory formatted for display, including home abbreviation. */
  cwd?: string;
  contextTokens?: number | null;
  contextWindow?: number;
  contextPercent?: number | null;
  /** Parent session cost; subagent cost is accounted for separately. */
  cost?: number;
  subagentCost?: number;
  isSubscription?: boolean;
}

export interface ActiveThemeLike {
  fg?: (token: string, text: string) => string;
}

export interface RenderStatusLineOptions {
  width: number;
  mode: IconMode;
  theme?: ActiveThemeLike;
}

function themeFg(
  theme: ActiveThemeLike | undefined,
  token: string,
  text: string,
): string {
  return theme?.fg ? theme.fg(token, text) : text;
}

export function formatCwd(cwd: string, home?: string): string {
  if (!home) return cwd;
  const relativeToHome = relative(resolve(home), resolve(cwd));
  if (
    relativeToHome === '..' ||
    relativeToHome.startsWith(`..${sep}`) ||
    isAbsolute(relativeToHome)
  ) {
    return cwd;
  }
  return relativeToHome === '' ? '~' : `~${sep}${relativeToHome}`;
}

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1000000) {
    const k = (count / 1000).toFixed(1).replace(/\.0$/, '');
    return `${k}K`;
  }
  const m = (count / 1000000).toFixed(1).replace(/\.0$/, '');
  return `${m}M`;
}

function thinkingToken(level: string): string {
  const cap = level.charAt(0).toUpperCase() + level.slice(1);
  return `thinking${cap}`;
}

export interface SegmentOptions {
  mode?: IconMode;
  theme?: ActiveThemeLike;
}

/** Git branch piece for the input-box border; empty when no branch. */
export function formatBranchSegment(
  data: StatusData,
  { mode = 'nerd', theme }: SegmentOptions = {},
): string {
  if (!data.gitBranch) return '';
  return `${themeFg(theme, 'dim', icon('separator', mode))} ${themeFg(
    theme,
    'success',
    `${icon('branch', mode)} ${data.gitBranch}`,
  )}`;
}

/** Model then optional effort pieces; each piece starts a droppable region. */
export function formatModelSegments(
  data: StatusData,
  { mode = 'nerd', theme }: SegmentOptions = {},
): string[] {
  const pieces: string[] = [];
  const model = data.modelName || data.modelId;
  if (model) {
    pieces.push(themeFg(theme, 'mdLink', `${icon('model', mode)} ${model}`));
  }
  const level = data.thinkingLevel;
  if (level && level !== 'off') {
    const label =
      level === 'minimal' ? 'min' : level === 'medium' ? 'med' : level;
    const effort = themeFg(
      theme,
      thinkingToken(level),
      `${icon('effort', mode)} ${label}`,
    );
    pieces.push(
      model
        ? `${themeFg(theme, 'dim', icon('separator', mode))} ${effort}`
        : effort,
    );
  }
  return pieces;
}

/** Working directory with folder icon, richest first: full path then `…/leaf`. */
export function formatCwdSegments(
  data: StatusData,
  { mode = 'nerd', theme }: SegmentOptions = {},
): string[] {
  const cwd = data.cwd;
  if (!cwd) return [];
  const folder = icon('folder', mode);
  const variants = [`${folder} ${cwd}`];
  const leaf = cwd.split(/[/\\]/).filter(Boolean).pop();
  const separator = cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/';
  const isDriveRoot = leaf !== undefined && /^[A-Za-z]:$/.test(leaf);
  if (leaf && leaf !== cwd && leaf !== '~' && !isDriveRoot) {
    variants.push(`${folder} ${icon('ellipsis', mode)}${separator}${leaf}`);
  }
  return variants.map((text) => themeFg(theme, 'muted', text));
}

function contextBar(
  percent: number,
  isAscii: boolean,
  theme: ActiveThemeLike | undefined,
): { bar: string; pct: string } {
  let token = 'success';
  if (percent >= 90) token = 'error';
  else if (percent >= 70) token = 'warning';
  const filled = Math.min(10, Math.max(0, Math.round((percent / 100) * 10)));
  const fillChar = isAscii ? '#' : '█';
  const emptyChar = isAscii ? '-' : '░';
  const dim = (text: string) => themeFg(theme, 'dim', text);
  return {
    bar: `${dim('[')}${themeFg(theme, token, fillChar.repeat(filled))}${dim(
      emptyChar.repeat(10 - filled),
    )}${dim(']')}`,
    pct: themeFg(theme, token, `${Math.round(percent)}%`),
  };
}

/**
 * Context usage, richest first: bar + percent + tokens, percent + tokens,
 * tokens. Unavailable usage collapses to a dash.
 */
export function formatContextSegments(
  data: StatusData,
  { mode = 'nerd', theme }: SegmentOptions = {},
): string[] {
  const contextIcon = themeFg(theme, 'muted', icon('context', mode));
  const windowText = data.contextWindow
    ? `/${formatTokens(data.contextWindow)}`
    : '';
  const hasTokens =
    data.contextTokens !== null && data.contextTokens !== undefined;
  const hasPercent =
    data.contextPercent !== null && data.contextPercent !== undefined;
  const tokens = themeFg(
    theme,
    'muted',
    `${hasTokens ? formatTokens(data.contextTokens as number) : '—'}${windowText}`,
  );
  if (!hasPercent) {
    const hasAny =
      hasTokens ||
      windowText !== '' ||
      data.contextPercent !== undefined ||
      data.contextTokens !== undefined;
    return hasAny
      ? [`${contextIcon} ${tokens}`]
      : [themeFg(theme, 'muted', '—')];
  }
  const { bar, pct } = contextBar(
    data.contextPercent as number,
    mode === 'ascii',
    theme,
  );
  return [
    `${contextIcon} ${bar} ${pct} ${tokens}`,
    `${contextIcon} ${pct} ${tokens}`,
    `${contextIcon} ${tokens}`,
  ];
}

export interface FooterData extends StatusData {
  tokenTotals?: SessionTokenTotals;
  /** `null` means not yet measured; `undefined` hides the segment. */
  tokensPerSecond?: number | null;
}

function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return rate < 10 ? rate.toFixed(1) : Math.round(rate).toString();
}

/**
 * One-row footer below the editor: cost, total input/output, cache hit %, tok/s.
 * Lowest priority drops first: tok/s, cache, tokens; cost truncates last.
 */
export function renderStatusLine(
  data: FooterData,
  options: RenderStatusLineOptions,
): string {
  const { width, mode, theme } = options;
  if (width <= 0) return '';

  const sep = ` ${themeFg(theme, 'border', icon('separator', mode))} `;
  const segments: string[] = [];

  if (data.cost !== undefined) {
    const total = combineSessionAndSubagentCost(data.cost, data.subagentCost);
    segments.push(
      themeFg(
        theme,
        'accent',
        `${icon('cost', mode)}${mode === 'ascii' ? '' : ' '}${total.toFixed(3)}${data.isSubscription ? ' (sub)' : ''}`,
      ),
    );
  }
  const totals = data.tokenTotals;
  if (totals) {
    const totalInput = totals.input + totals.cacheRead + totals.cacheWrite;
    const cacheHitRatio =
      totalInput === 0
        ? '—'
        : `${Math.round((totals.cacheRead / totalInput) * 100)}%`;
    const up = icon('tokensIn', mode);
    const down = icon('tokensOut', mode);
    segments.push(
      themeFg(
        theme,
        'muted',
        `${up}${formatTokens(totalInput)} ${down}${formatTokens(totals.output)}`,
      ),
      themeFg(theme, 'muted', `${icon('cache', mode)} ${cacheHitRatio}`),
    );
  }
  if (data.tokensPerSecond !== undefined) {
    segments.push(
      themeFg(
        theme,
        'muted',
        mode === 'ascii'
          ? `${formatRate(data.tokensPerSecond)} ${icon('throughput', mode)}`
          : `${icon('throughput', mode)} ${formatRate(data.tokensPerSecond)} tok/s`,
      ),
    );
  }

  for (let count = segments.length; count >= 1; count--) {
    const line = segments.slice(0, count).join(sep);
    if (visibleWidth(line) <= width) return line;
  }
  return segments.length ? truncateToWidth(segments[0], width, '') : '';
}
