import type { CodexState } from '../rpc.js';

type Account = CodexState['accounts'][number];
type QuotaWindow = NonNullable<Account['quota']['primary']>;

const BAR_WIDTH = 10;
const MAX_LINE = 56;

export function formatDuration(ms: number): string {
  if (ms < 60_000) return '<1m';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function windowLabel(seconds?: number): string {
  if (seconds === undefined) return 'window';
  const hours = Math.round(seconds / 3600);
  if (hours <= 0) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (hours >= 160 && hours <= 176) return 'weekly';
  if (hours >= 24 * 28 && hours <= 24 * 31) return 'monthly';
  if (hours % 24 === 0 && hours >= 48) return `${hours / 24}d`;
  return `${hours}h`;
}

export function bar(remainingPercent: number): string {
  const pct = Math.min(100, Math.max(0, remainingPercent));
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  return `[${'#'.repeat(filled)}${'-'.repeat(BAR_WIDTH - filled)}]`;
}

const clock = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function windowLine(
  window: QuotaWindow,
  now: number,
  labelWidth: number,
  stale: boolean,
): string {
  const pct = `${Math.round(window.remainingPercent)}%`.padStart(4);
  const reset =
    window.resetAt === undefined
      ? ''
      : window.resetAt <= now
        ? ' · reset due'
        : ` · resets in ${formatDuration(window.resetAt - now)}`;
  return `   ${windowLabel(window.windowSeconds).padEnd(labelWidth)} ${bar(window.remainingPercent)} ${pct} left${reset}${stale ? ' (old)' : ''}`;
}

function clip(line: string): string {
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line;
}

export function formatAccount(
  account: Account,
  now: number,
  routed: boolean,
): string[] {
  const label = account.label.replace(/\s*\(openai default\)$/, ' (default)');
  const status = account.credentialState === 'ok' ? 'ok' : 'MISSING';
  const head = `#${account.number} ${account.providerID} · ${label}`;
  const tag = `${routed ? '→ ' : ''}${status}`;
  const lines = [
    clip(
      `${head.slice(0, MAX_LINE - tag.length - 1).padEnd(MAX_LINE - tag.length)}${tag}`,
    ),
  ];
  const windows = [account.quota.primary, account.quota.secondary]
    .filter((w): w is QuotaWindow => w !== undefined)
    .sort((a, b) => (a.windowSeconds ?? 0) - (b.windowSeconds ?? 0));
  const width = Math.max(
    0,
    ...windows.map((w) => windowLabel(w.windowSeconds).length),
  );
  for (const window of windows)
    lines.push(
      clip(windowLine(window, now, width, account.quota.state === 'stale')),
    );
  if (account.credentialState !== 'ok')
    lines.push('   credential missing: reconnect in OpenCode');
  else if (account.quota.state === 'unavailable' || windows.length === 0)
    lines.push(
      clip(
        `   quota unavailable${account.quota.error ? `: ${account.quota.error}` : ''}`,
      ),
    );
  else if (account.quota.state === 'stale') lines.push('   quota stale');
  if (account.blockedUntil !== null && account.blockedUntil > now)
    lines.push(
      `   blocked until ${clock(account.blockedUntil)} (in ${formatDuration(account.blockedUntil - now)})`,
    );
  return lines;
}

export function statusView(state: CodexState, now: number): string {
  const override = state.sessionOverride;
  const times = state.accounts
    .map((a) => a.quota.fetchedAt)
    .filter((t): t is number => t !== undefined && t <= now);
  const updated = times.length
    ? `quota updated ${formatDuration(now - Math.min(...times))} ago`
    : 'quota not fetched yet';
  return [
    override === null
      ? 'This session: pinned account'
      : `This session: forced to #${override}`,
    '',
    ...state.accounts.flatMap((a, i) => [
      ...(i ? [''] : []),
      ...formatAccount(a, now, a.number === override),
    ]),
    '',
    updated,
    ...state.notices,
  ].join('\n');
}
