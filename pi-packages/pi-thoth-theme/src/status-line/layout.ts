import { isAbsolute, relative, resolve, sep } from 'node:path';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { IconMode } from '../shared/config.ts';

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

export function renderStatusLine(
  data: StatusData,
  options: RenderStatusLineOptions,
): string {
  const { width, mode, theme } = options;
  if (width <= 0) return '';

  const isAscii = mode === 'ascii';
  const sepChar = isAscii ? '|' : '◆';
  const sep = ` ${themeFg(theme, 'border', sepChar)} `;

  // 1. Model
  const rawModel = data.modelName || data.modelId;
  const modelIcon = isAscii ? '*' : '●';
  const modelText = rawModel ? `${modelIcon} ${rawModel}` : '';
  const modelColored = modelText ? themeFg(theme, 'mdLink', modelText) : '';

  // 1b. Effort
  let effortColored = '';
  let dot = '';
  if (data.thinkingLevel && data.thinkingLevel !== 'off') {
    const effortIcon = isAscii ? 'o' : '◐';
    const effortLabel =
      data.thinkingLevel === 'minimal'
        ? 'min'
        : data.thinkingLevel === 'medium'
          ? 'med'
          : data.thinkingLevel;
    dot = themeFg(theme, 'dim', isAscii ? '.' : '·');
    effortColored = themeFg(
      theme,
      thinkingToken(data.thinkingLevel),
      `${effortIcon} ${effortLabel}`,
    );
  }

  // 2. Working directory and Git branch
  let branchOnlyText = '';
  let branchText = data.cwd || '';
  if (data.gitBranch) {
    const branchIcon = isAscii ? 'git' : '⑂';
    branchOnlyText = `${branchIcon} ${data.gitBranch}`;
    branchText = data.cwd
      ? `${branchIcon} ${data.cwd} (${data.gitBranch})`
      : branchOnlyText;
  }
  let branchSegment = branchText ? themeFg(theme, 'success', branchText) : '';

  // 3. Context Bar
  let barSegment = '';
  const hasContext =
    data.contextPercent !== undefined ||
    data.contextTokens !== undefined ||
    data.contextWindow !== undefined;

  if (hasContext) {
    if (data.contextPercent !== null && data.contextPercent !== undefined) {
      const pct = data.contextPercent;
      let colorToken = 'success';
      if (pct >= 90) colorToken = 'error';
      else if (pct >= 70) colorToken = 'warning';

      const filledCount = Math.min(
        10,
        Math.max(0, Math.round((pct / 100) * 10)),
      );
      const emptyCount = 10 - filledCount;
      const fillChar = isAscii ? '#' : '█';
      const emptyChar = isAscii ? '-' : '░';

      const barContent = `${themeFg(theme, 'dim', '[')}${themeFg(
        theme,
        colorToken,
        fillChar.repeat(filledCount),
      )}${themeFg(theme, 'dim', emptyChar.repeat(emptyCount))}${themeFg(
        theme,
        'dim',
        ']',
      )}`;
      const pctContent = themeFg(theme, colorToken, `${Math.round(pct)}% used`);
      barSegment = `${barContent} ${pctContent}`;
    } else if (data.contextPercent === null) {
      barSegment = themeFg(theme, 'muted', '—');
    }
  }

  // 4. Tokens
  let tokensSegment = '';
  if (data.contextTokens !== null && data.contextTokens !== undefined) {
    const usedStr = formatTokens(data.contextTokens);
    const windowStr = data.contextWindow
      ? `/${formatTokens(data.contextWindow)}`
      : '';
    tokensSegment = themeFg(theme, 'muted', `${usedStr}${windowStr}`);
  } else if (data.contextTokens === null) {
    const windowStr = data.contextWindow
      ? `/${formatTokens(data.contextWindow)}`
      : '';
    tokensSegment = themeFg(theme, 'muted', `—${windowStr}`);
  }

  // 5. Cost
  let costSegment = '';
  if (data.cost !== undefined) {
    const totalCost = data.cost + (data.subagentCost ?? 0);
    const costText = `$${totalCost.toFixed(3)}${data.isSubscription ? ' (sub)' : ''}`;
    costSegment = themeFg(theme, 'accent', costText);
  }

  function buildLine(opts: {
    bar: boolean;
    tokens: boolean;
    branch: boolean;
    effort: boolean;
  }): string {
    const parts: string[] = [];

    let modelPart = modelColored;
    if (modelPart && opts.effort && effortColored) {
      modelPart = `${modelPart} ${dot} ${effortColored}`;
    } else if (!modelPart && opts.effort && effortColored) {
      modelPart = effortColored;
    }

    if (modelPart) {
      parts.push(modelPart);
    }
    if (opts.branch && branchSegment) {
      parts.push(branchSegment);
    }
    if (opts.bar && barSegment) {
      parts.push(barSegment);
    }
    if (opts.tokens && tokensSegment) {
      parts.push(tokensSegment);
    }
    if (costSegment) {
      parts.push(costSegment);
    }

    return parts.join(sep);
  }

  // Width degradation order:
  // 1. All segments
  let line = buildLine({ bar: true, tokens: true, branch: true, effort: true });
  if (visibleWidth(line) <= width) return line;

  // 2. Fall back to branch-only before dropping segments
  if (data.cwd && branchOnlyText) {
    branchSegment = themeFg(theme, 'success', branchOnlyText);
    line = buildLine({ bar: true, tokens: true, branch: true, effort: true });
    if (visibleWidth(line) <= width) return line;
  }

  // 3. Drop bar first
  if (barSegment) {
    line = buildLine({
      bar: false,
      tokens: true,
      branch: true,
      effort: true,
    });
    if (visibleWidth(line) <= width) return line;
  }

  // 4. Drop tokens next
  if (tokensSegment) {
    line = buildLine({
      bar: false,
      tokens: false,
      branch: true,
      effort: true,
    });
    if (visibleWidth(line) <= width) return line;
  }

  // 5. Drop branch next
  if (branchSegment) {
    line = buildLine({
      bar: false,
      tokens: false,
      branch: false,
      effort: true,
    });
    if (visibleWidth(line) <= width) return line;
  }

  // 6. Drop effort next
  if (effortColored) {
    line = buildLine({
      bar: false,
      tokens: false,
      branch: false,
      effort: false,
    });
    if (visibleWidth(line) <= width) return line;
  }

  // 7. Truncate model last, keeping cost high priority
  if (modelColored && costSegment) {
    const costW = visibleWidth(costSegment);
    const sepW = visibleWidth(sep);
    const availForModel = width - sepW - costW;
    if (availForModel > 0) {
      const truncatedModel = truncateToWidth(modelColored, availForModel, '');
      if (visibleWidth(truncatedModel) > 0) {
        const candidate = `${truncatedModel}${sep}${costSegment}`;
        if (visibleWidth(candidate) <= width) return candidate;
      }
    }
    // Model cannot fit with cost and separator: keep cost if it fits
    if (costW <= width) return costSegment;
    return truncateToWidth(costSegment, width, '');
  }

  if (modelColored) {
    return truncateToWidth(modelColored, width, '');
  }

  if (costSegment) {
    if (visibleWidth(costSegment) <= width) return costSegment;
    return truncateToWidth(costSegment, width, '');
  }

  return truncateToWidth(line, width, '');
}
