import type { RenderKitTheme } from '@thoth-agents/pi-core';
import {
  truncateToWidth,
  visibleWidth,
  wrapLineToWidth,
} from '../render/text-width.js';
import {
  formatDuration,
  formatTokens,
  generationSpeed,
} from '../render/tools/formatting.js';
import type { SubagentTask } from '../types.js';
import { themeWarning } from './theme.js';

function normalize(text: string | undefined): string {
  return text ? text.replace(/\s+/g, ' ').trim() : '';
}

export function formatTaskSummary(task: SubagentTask, maxLen = 60): string {
  const name = normalize(task.display_name);
  if (name) return truncateToWidth(name, maxLen, '…');
  const raw = task.task;
  if (!raw) return '';
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const firstContent =
    lines.find((l) => !/^#+\s*(?:delegated task|task)?$/i.test(l)) ??
    lines[0] ??
    '';
  const clean = firstContent
    .replace(/^#+\s*(?:delegated task:?|task:?)?\s*/i, '')
    .trim();
  const summary = normalize(clean || firstContent);
  if (!summary) return '';
  return truncateToWidth(summary, maxLen, '…');
}

function finiteNonnegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function metricLines(parts: string[], contentWidth: number): string[] {
  const lines: string[] = [];
  for (const part of parts) {
    const previous = lines.at(-1);
    const joined = previous ? `${previous} · ${part}` : part;
    if (previous && visibleWidth(joined) > contentWidth) {
      lines.push(part);
    } else if (previous) {
      lines[lines.length - 1] = joined;
    } else {
      lines.push(part);
    }
  }
  return lines;
}

/** Compact, producer-owned body formatting; the host owns glyphs and gutters. */
export function renderSubagentWorkRow(
  task: SubagentTask,
  width: number,
  now: number,
  theme?: RenderKitTheme,
): { text: string; extraRows?: string[] } {
  width = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  if (!width) return { text: '' };
  const metrics = task.runtime_metrics;
  const speed = generationSpeed(metrics);
  const started = task.started_at ? Date.parse(task.started_at) : NaN;
  const ended = task.ended_at ? Date.parse(task.ended_at) : NaN;
  const end =
    task.status === 'running' || task.status === 'stopping' ? now : ended;
  const parts = [
    `tools ${finiteNonnegative(metrics?.toolUses) ? metrics.toolUses : '?'}`,
    `↑${finiteNonnegative(task.usage?.input) ? formatTokens(task.usage.input) : '?'} ↓${finiteNonnegative(task.usage?.output) ? formatTokens(task.usage.output) : '?'}`,
    `ctx ${finiteNonnegative(metrics?.contextPercent) ? `${metrics.contextPercent.toFixed(1)}%` : '?'}`,
    `${speed !== undefined ? Math.round(speed) : '?'} tok/s`,
    `elapsed ${Number.isFinite(started) && Number.isFinite(end) ? formatDuration(Math.floor(Math.max(0, end - started) / 1000) * 1000) : '?'}`,
  ];
  const agent = normalize(task.agent);
  const summary = formatTaskSummary(task);
  const warningText =
    (task.status === 'running' || task.status === 'queued') &&
    task.dropped_tools?.length
      ? `⚠ ${task.dropped_tools.length} dropped`
      : '';
  const warning =
    warningText && theme ? themeWarning(theme, warningText) : warningText;
  const warningSuffix = warning ? ` · ${warning}` : '';
  const metricText = parts.join(' · ');
  const inlineIdentityWidth =
    width - visibleWidth(metricText) - 3 - visibleWidth(warningSuffix);
  if (inlineIdentityWidth >= visibleWidth(agent) + (summary ? 4 : 0)) {
    const label = summary
      ? ` · ${truncateToWidth(summary, inlineIdentityWidth - visibleWidth(agent) - 3, '…')}`
      : '';
    return { text: `${agent}${label}${warningSuffix} · ${metricText}` };
  }
  const identity = `${agent}${summary ? ` · ${summary}` : ''}`;
  const identityWidth = width - visibleWidth(warningSuffix);
  return {
    text:
      warning && identityWidth <= 0
        ? truncateToWidth(warning, width, '')
        : `${truncateToWidth(identity, identityWidth, '…')}${warningSuffix}`,
    extraRows: metricLines(parts, width).flatMap((line) =>
      wrapLineToWidth(line, width),
    ),
  };
}
