import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  formatCwd,
  type ProviderLimitEntry,
  type RenderKitTheme,
} from '@thoth-agents/pi-core';
import { panelFg } from '@thoth-agents/pi-core/panel';
import { isAsciiMode, labelColumn, labelRow, truncateStart } from './chrome.js';
import type { WorkspaceSnapshot } from './workspace.js';

/** Provider text is data, not terminal control sequences. */
export function clean(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || (code >= 127 && code <= 159) ? ' ' : character;
  }).join('');
}

/** Plain, serializable Session inputs; doubles as the plan cache key. */
export interface SessionView {
  provider?: string;
  model?: string;
  thinking: string;
  context?: { percent: number | null; known: boolean };
  cost: number;
  subscription: boolean;
  subagentCost: number;
  limit?: {
    window: string;
    status: ProviderLimitEntry['status'];
    utilization?: number;
    provider: string;
  };
}

/** The most urgent warning or rejected entry, if any. */
export function activeLimit(
  limits: readonly ProviderLimitEntry[],
): SessionView['limit'] {
  let worst: ProviderLimitEntry | undefined;
  for (const entry of limits) {
    if (entry.status === 'allowed') continue;
    if (
      !worst ||
      (entry.status === 'rejected' && worst.status !== 'rejected') ||
      (entry.status === worst.status &&
        (entry.utilization ?? 0) > (worst.utilization ?? 0))
    )
      worst = entry;
  }
  return (
    worst && {
      window: worst.window,
      status: worst.status,
      ...(worst.utilization === undefined
        ? {}
        : { utilization: worst.utilization }),
      provider: worst.provider,
    }
  );
}

export function sessionView(
  ctx: ExtensionContext,
  thinking: string,
  cost: { cost: number; isSubscription: boolean },
  subagentCost: number,
  usage: ReturnType<ExtensionContext['getContextUsage']> | null,
  limits: readonly ProviderLimitEntry[],
): SessionView {
  return {
    provider: ctx.model?.provider,
    model: ctx.model?.id,
    thinking: ctx.thinkingLevel ?? thinking,
    ...(usage
      ? {
          context: {
            percent: usage.percent ?? null,
            known: usage.tokens != null,
          },
        }
      : {}),
    cost: cost.cost,
    subscription: cost.isSubscription,
    subagentCost,
    limit: activeLimit(limits),
  };
}

const THINKING_ROLES: Record<string, Parameters<RenderKitTheme['fg']>[0]> = {
  off: 'thinkingOff',
  minimal: 'thinkingMinimal',
  low: 'thinkingLow',
  medium: 'thinkingMedium',
  high: 'thinkingHigh',
  xhigh: 'thinkingXhigh',
};
const EIGHTHS = ' ▏▎▍▌▋▊▉';

/** Eighth-block meter; ASCII uses `#` and `-`. */
export function contextMeter(percent: number, cells: number): string {
  const ratio = Math.min(1, Math.max(0, percent / 100));
  if (isAsciiMode()) {
    const filled = Math.round(ratio * cells);
    return '#'.repeat(filled) + '-'.repeat(cells - filled);
  }
  const eighths = Math.round(ratio * cells * 8);
  const full = Math.floor(eighths / 8);
  const partial = EIGHTHS[eighths % 8].trim();
  const empty = cells - full - (partial ? 1 : 0);
  return `${'█'.repeat(full)}${partial}${'░'.repeat(empty)}`;
}

export function limitText(limit: NonNullable<SessionView['limit']>): string {
  const detail =
    limit.status === 'rejected'
      ? 'blocked'
      : limit.utilization === undefined
        ? 'warning'
        : `${Math.round(limit.utilization * 100)}%`;
  return clean(`${limit.window} ${detail} · ${limit.provider}`);
}

export function renderSessionRows(
  view: SessionView,
  width: number,
  theme: RenderKitTheme,
): string[] {
  const row = (label: string, value: string) =>
    labelRow(label, value, width, theme);
  const fg = (role: Parameters<RenderKitTheme['fg']>[0], text: string) =>
    panelFg(theme, role, text);
  const rows = [
    row('Model', clean(view.model ?? 'No model')),
    row('Provider', clean(view.provider ?? 'No provider')),
    row(
      'Thinking',
      fg(THINKING_ROLES[view.thinking] ?? 'muted', clean(view.thinking)),
    ),
  ];
  const room = Math.max(0, width - 4 - labelColumn(width));
  const context = view.context;
  if (!context || !context.known || context.percent == null)
    rows.push(row('Context', fg('muted', 'unknown')));
  else {
    const percent = context.percent;
    const role = percent > 90 ? 'error' : percent > 70 ? 'warning' : 'success';
    const label = `${Math.round(percent)}%`;
    const cells = Math.min(10, room - label.length - 1);
    rows.push(
      row(
        'Context',
        (cells >= 3 ? `${fg(role, contextMeter(percent, cells))} ` : '') +
          fg(role, label),
      ),
    );
  }
  const amount = (value: number) => `$${value.toFixed(3)}`;
  rows.push(
    row(
      'Cost',
      amount(view.cost) +
        (view.subscription ? ` ${fg('muted', '(sub)')}` : '') +
        (view.subagentCost > 0 ? ` +${amount(view.subagentCost)}` : ''),
    ),
  );
  if (view.limit)
    rows.push(
      row(
        'Limit',
        fg(
          view.limit.status === 'rejected' ? 'error' : 'warning',
          limitText(view.limit),
        ),
      ),
    );
  return rows;
}

export function renderWorkspaceRows(
  snapshot: WorkspaceSnapshot,
  width: number,
  theme: RenderKitTheme,
  home: string | undefined,
  branchIcon: string,
): string[] {
  const row = (label: string, value: string) =>
    labelRow(label, value, width, theme);
  const fg = (role: Parameters<RenderKitTheme['fg']>[0], text: string) =>
    panelFg(theme, role, text);
  const rows = [
    labelRow(
      'Path',
      clean(formatCwd(snapshot.cwd, home)),
      width,
      theme,
      truncateStart,
    ),
  ];
  if (snapshot.branch)
    rows.push(row('Branch', `${branchIcon} ${clean(snapshot.branch)}`.trim()));
  const git = snapshot.git;
  if (!git) {
    if (snapshot.note) rows.push(row('Git', fg('muted', snapshot.note)));
    return rows;
  }
  rows.push(
    row(
      'State',
      git.state === 'conflicts'
        ? fg('error', 'Conflicts')
        : git.state === 'modified'
          ? fg('warning', 'Modified')
          : fg('success', 'Clean'),
    ),
  );
  if (git.files > 0) {
    const minus = isAsciiMode() ? '-' : '−';
    rows.push(
      row(
        'Changed',
        `${git.files} ${git.files === 1 ? 'file' : 'files'}` +
          (git.added === undefined || git.removed === undefined
            ? ''
            : ` ${fg('toolDiffAdded', `+${git.added}`)} ${fg('toolDiffRemoved', `${minus}${git.removed}`)}`),
      ),
    );
  }
  for (const [label, count] of [
    ['Untracked', git.untracked],
    ['Binary', git.binary],
    ['Conflicts', git.conflicts],
  ] as const)
    if (count > 0) rows.push(row(label, String(count)));
  return rows;
}
