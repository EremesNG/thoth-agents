export type QuotaWindow = {
  usedPercent: number;
  windowSeconds?: number;
  /** Unix timestamp in milliseconds, like fetchedAt. */
  resetAt?: number;
};
export type QuotaSnapshot = {
  primary?: QuotaWindow;
  secondary?: QuotaWindow;
  planType?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
function resetAt(
  value: unknown,
  after: unknown,
  now: number,
): number | undefined {
  const absolute = number(value);
  if (absolute !== undefined)
    return absolute < 10_000_000_000 ? absolute * 1000 : absolute;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const seconds = number(after);
  return seconds === undefined ? undefined : now + seconds * 1000;
}
function window(value: unknown, now: number): QuotaWindow | undefined {
  const input = record(value);
  const usedPercent = number(input.used_percent);
  if (usedPercent === undefined) return undefined;
  return {
    usedPercent: Math.min(100, usedPercent),
    windowSeconds: number(input.limit_window_seconds),
    resetAt: resetAt(input.reset_at, input.reset_after_seconds, now),
  };
}

export function parseUsage(
  value: unknown,
  now = Date.now(),
): QuotaSnapshot | undefined {
  const input = record(value);
  const limits = record(input.rate_limit ?? input);
  const primary = window(limits.primary_window, now);
  const secondary = window(limits.secondary_window, now);
  if (!primary && !secondary) return undefined;
  return {
    primary,
    secondary,
    planType: typeof input.plan_type === 'string' ? input.plan_type : undefined,
  };
}

export function parseHeaders(
  headers: Headers,
  now = Date.now(),
): QuotaSnapshot | undefined {
  const readNumber = (name: string) => {
    const value = headers.get(name)?.trim();
    return value ? number(Number(value)) : undefined;
  };
  const readWindow = (name: string) => {
    const prefix = `x-codex-${name}`;
    const minutes = readNumber(`${prefix}-window-minutes`);
    return window(
      {
        used_percent: readNumber(`${prefix}-used-percent`),
        limit_window_seconds: minutes === undefined ? undefined : minutes * 60,
        reset_at: readNumber(`${prefix}-reset-at`),
        reset_after_seconds:
          readNumber(`${prefix}-reset-after-seconds`) ??
          readNumber(`${prefix}-reset-after`),
      },
      now,
    );
  };
  const primary = readWindow('primary');
  const secondary = readWindow('secondary');
  return primary || secondary ? { primary, secondary } : undefined;
}

/** Attribution must come from the socket handshake, never the pinned provider. */
export function parseRateLimitEvent(
  frame: string,
  now = Date.now(),
): QuotaSnapshot | undefined {
  try {
    const event = record(JSON.parse(frame));
    if (event.type !== 'codex.rate_limits') return undefined;
    const limits = record(event.rate_limits);
    const convert = (value: unknown) => {
      const input = record(value);
      const minutes = number(input.window_minutes);
      return {
        ...input,
        limit_window_seconds: minutes === undefined ? undefined : minutes * 60,
      };
    };
    return parseUsage(
      {
        plan_type: event.plan_type,
        rate_limit: {
          primary_window: convert(limits.primary),
          secondary_window: convert(limits.secondary),
        },
      },
      now,
    );
  } catch {
    return undefined;
  }
}
