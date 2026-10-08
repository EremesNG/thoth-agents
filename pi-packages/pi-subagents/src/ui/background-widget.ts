import type {
  RenderKitTheme,
  WorkPanelRowContent,
  WorkPanelSegment,
} from '@thoth-agents/pi-core';
import { resolveIcon } from '@thoth-agents/pi-core';
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
  if (name)
    return truncateToWidth(name, maxLen, `${resolveIcon('ellipsis', '…')}`);
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
  return truncateToWidth(summary, maxLen, `${resolveIcon('ellipsis', '…')}`);
}

function finiteNonnegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function metricLines(parts: string[], contentWidth: number): string[] {
  const lines: string[] = [];
  for (const part of parts) {
    const previous = lines.at(-1);
    const joined = previous
      ? `${previous} ${resolveIcon('separator', '·')} ${part}`
      : part;
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
): WorkPanelRowContent {
  width = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  if (!width) return { text: '' };
  const separatorWidth = visibleWidth(` ${resolveIcon('separator', '·')} `);
  const metrics = task.runtime_metrics;
  const speed = generationSpeed(metrics);
  const started = task.started_at ? Date.parse(task.started_at) : NaN;
  const ended = task.ended_at ? Date.parse(task.ended_at) : NaN;
  const end =
    task.status === 'running' || task.status === 'stopping' ? now : ended;
  const parts = [
    `tools ${finiteNonnegative(metrics?.toolUses) ? metrics.toolUses : '?'}`,
    `${resolveIcon('tokensIn', '↑')}${finiteNonnegative(task.usage?.input) ? formatTokens(task.usage.input) : '?'} ${resolveIcon('tokensOut', '↓')}${finiteNonnegative(task.usage?.output) ? formatTokens(task.usage.output) : '?'}`,
    `ctx ${finiteNonnegative(metrics?.contextPercent) ? `${metrics.contextPercent.toFixed(1)}%` : '?'}`,
    `${speed !== undefined ? Math.round(speed) : '?'} tok/s`,
    `elapsed ${Number.isFinite(started) && Number.isFinite(end) ? formatDuration(Math.floor(Math.max(0, end - started) / 1000) * 1000) : '?'}`,
  ];
  const agent = normalize(task.agent);
  const summary = formatTaskSummary(task);
  const warningText =
    (task.status === 'running' || task.status === 'queued') &&
    task.dropped_tools?.length
      ? `${resolveIcon('warning', '⚠')} ${task.dropped_tools.length} dropped`
      : '';
  const warning =
    warningText && theme ? themeWarning(theme, warningText) : warningText;
  const warningSuffix = warning
    ? ` ${resolveIcon('separator', '·')} ${warning}`
    : '';
  const metricText = parts.join(` ${resolveIcon('separator', '·')} `);
  const inlineIdentityWidth =
    width -
    visibleWidth(metricText) -
    separatorWidth -
    visibleWidth(warningSuffix);
  if (
    inlineIdentityWidth >=
    visibleWidth(agent) + (summary ? separatorWidth + 1 : 0)
  ) {
    const label = summary
      ? ` ${resolveIcon('separator', '·')} ${truncateToWidth(summary, inlineIdentityWidth - visibleWidth(agent) - separatorWidth, `${resolveIcon('ellipsis', '…')}`)}`
      : '';
    return {
      text: `${agent}${label}${warningSuffix} ${resolveIcon('separator', '·')} ${metricText}`,
      segments: [
        { text: agent, role: 'primary' },
        { text: label, role: 'secondary' },
        ...(warningText
          ? [
              {
                text: ` ${resolveIcon('separator', '·')} ${warningText}`,
                role: 'warning' as const,
              },
            ]
          : []),
        {
          text: ` ${resolveIcon('separator', '·')} ${metricText}`,
          role: 'meta',
        },
      ],
    };
  }
  const identity = `${agent}${summary ? ` ${resolveIcon('separator', '·')} ${summary}` : ''}`;
  const identityWidth = width - visibleWidth(warningSuffix);
  const visibleIdentity = truncateToWidth(
    identity,
    identityWidth,
    `${resolveIcon('ellipsis', '…')}`,
  );
  const visibleAgent = truncateToWidth(
    agent,
    identityWidth,
    `${resolveIcon('ellipsis', '…')}`,
  );
  const segments: WorkPanelSegment[] =
    warning && identityWidth <= 0
      ? [{ text: truncateToWidth(warningText, width, ''), role: 'warning' }]
      : [
          { text: visibleAgent, role: 'primary' },
          {
            text: visibleIdentity.slice(visibleAgent.length),
            role: 'secondary',
          },
          ...(warningText
            ? [
                {
                  text: ` ${resolveIcon('separator', '·')} ${warningText}`,
                  role: 'warning' as const,
                },
              ]
            : []),
        ];
  const extraRows = metricLines(parts, width).flatMap((line) =>
    wrapLineToWidth(line, width),
  );
  return {
    text:
      warning && identityWidth <= 0
        ? truncateToWidth(warning, width, '')
        : `${visibleIdentity}${warningSuffix}`,
    segments,
    extraRows,
    extraSegments: extraRows.map((text) => [{ text, role: 'meta' }]),
  };
}
