import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { IconMode } from '../shared/config.ts';
import { iconFor } from '../shared/icons.ts';
import { formatCost } from './cost.ts';

export interface ContextUsageInfo {
  percent?: number | null;
  tokens?: number | null;
  contextWindow?: number;
}

export interface StatusData {
  model?: string;
  thinkingLevel?: string;
  gitBranch?: string | null;
  contextUsage?: ContextUsageInfo;
  cost?: number;
  extensionStatuses?:
    | ReadonlyMap<string, string>
    | Record<string, string>
    | Iterable<[string, string]>;
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

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function thinkingToken(level: string): string {
  const cap = level.charAt(0).toUpperCase() + level.slice(1);
  return `thinking${cap}`;
}

interface SegmentItem {
  id: 'model' | 'git' | 'context' | 'cost' | 'extension_statuses';
  content: string;
  priority: number; // lower number = lower priority (dropped earlier)
}

export function renderStatusLine(
  data: StatusData,
  options: RenderStatusLineOptions,
): string {
  const { width, mode, theme } = options;
  if (width <= 0) return '';

  const segments: SegmentItem[] = [];

  // 1. Model + effort
  if (data.model) {
    const modelIcon = iconFor('model', mode);
    const modelName = data.model;
    let modelText = `${modelIcon} ${modelName}`;
    if (data.thinkingLevel && data.thinkingLevel !== 'off') {
      const effort =
        data.thinkingLevel === 'minimal'
          ? 'min'
          : data.thinkingLevel === 'medium'
            ? 'med'
            : data.thinkingLevel;
      const dot = themeFg(theme, 'dim', '·');
      const effortColored = themeFg(
        theme,
        thinkingToken(data.thinkingLevel),
        effort,
      );
      modelText = `${modelText} ${dot} ${effortColored}`;
    }
    segments.push({
      id: 'model',
      content: themeFg(theme, 'accent', modelText),
      priority: 100,
    });
  }

  // 2. Git branch
  if (data.gitBranch) {
    const gitIcon = iconFor('git', mode);
    const gitText = `${gitIcon} ${data.gitBranch}`;
    segments.push({
      id: 'git',
      content: themeFg(theme, 'text', gitText),
      priority: 75,
    });
  }

  // 3. Context usage
  if (data.contextUsage) {
    const ctxIcon = iconFor('context', mode);
    const pct = data.contextUsage.percent;
    const pctStr =
      pct !== null && pct !== undefined ? `${Math.round(pct)}%` : '?';
    const windowStr = data.contextUsage.contextWindow
      ? `/${formatTokens(data.contextUsage.contextWindow)}`
      : '';
    const ctxText = `${ctxIcon} ${pctStr}${windowStr}`;

    let token = 'muted';
    if (pct !== null && pct !== undefined) {
      if (pct >= 90) token = 'error';
      else if (pct >= 70) token = 'warning';
    }

    segments.push({
      id: 'context',
      content: themeFg(theme, token, ctxText),
      priority: 90,
    });
  }

  // 4. Cumulative session cost
  if (data.cost !== undefined) {
    const costText = formatCost(data.cost, mode);
    segments.push({
      id: 'cost',
      content: themeFg(theme, 'accent', costText),
      priority: 65,
    });
  }

  // 5. Extension statuses
  if (data.extensionStatuses) {
    let entries: [string, string][] = [];
    if (data.extensionStatuses instanceof Map) {
      entries = Array.from(data.extensionStatuses.entries());
    } else if (Symbol.iterator in Object(data.extensionStatuses)) {
      entries = Array.from(
        data.extensionStatuses as Iterable<[string, string]>,
      );
    } else if (
      typeof data.extensionStatuses === 'object' &&
      data.extensionStatuses !== null
    ) {
      entries = Object.entries(data.extensionStatuses);
    }

    if (entries.length > 0) {
      const sorted = entries.sort(([a], [b]) => a.localeCompare(b));
      const extText = sorted.map(([_, v]) => v).join(' ');
      if (extText.length > 0) {
        segments.push({
          id: 'extension_statuses',
          content: themeFg(theme, 'muted', extText),
          priority: 30,
        });
      }
    }
  }

  const sepChar = mode === 'nerd' ? '│' : '|';
  const sep = ` ${themeFg(theme, 'dim', sepChar)} `;

  // Helper to join active segments
  const joinSegments = (items: SegmentItem[]): string =>
    items.map((item) => item.content).join(sep);

  // If already fits, return
  let currentItems = [...segments];
  let rendered = joinSegments(currentItems);
  if (visibleWidth(rendered) <= width) {
    return rendered;
  }

  // Drop lowest priority segments one by one until it fits or only 1 segment remains
  // Priority order to drop: extension_statuses (30), cost (65), git (75), context (90)
  const droppable = [...currentItems].sort((a, b) => a.priority - b.priority);

  for (const toDrop of droppable) {
    if (currentItems.length <= 1) break;
    currentItems = currentItems.filter((item) => item.id !== toDrop.id);
    rendered = joinSegments(currentItems);
    if (visibleWidth(rendered) <= width) {
      return rendered;
    }
  }

  // If even the remaining segment exceeds width, truncate it to width
  if (visibleWidth(rendered) > width) {
    return truncateToWidth(rendered, width, '');
  }

  return rendered;
}
