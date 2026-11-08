function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return;
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Normalize only known envelope fields, never classify by free-form message text. */
export function usageLimit(
  value: unknown,
  now = Date.now(),
): { resetAt?: number } | undefined {
  const root = record(value);
  if (!root) return;
  const nodes: Record<string, unknown>[] = [];
  const visit = (node: Record<string, unknown>, depth: number) => {
    if (depth > 6) return;
    nodes.push(node);
    for (const key of ['error', 'response', 'body']) {
      const nested = record(node[key]);
      if (nested) visit(nested, depth + 1);
    }
  };
  visit(root, 0);
  if (nodes.some((node) => node.status !== undefined && node.status !== 429))
    return;
  const codes = new Set([
    'usage_limit_reached',
    'usage_limit_exceeded',
    'usage_limit_error',
  ]);
  if (
    !nodes.some((node) =>
      [node.type, node.code].some(
        (code) => typeof code === 'string' && codes.has(code),
      ),
    )
  )
    return;
  for (const node of nodes) {
    const absolute = node.resets_at;
    let resetAt: number | undefined;
    if (
      typeof absolute === 'number' &&
      Number.isFinite(absolute) &&
      absolute >= 0
    )
      resetAt = absolute < 10_000_000_000 ? absolute * 1000 : absolute;
    else if (typeof absolute === 'string') {
      const parsed = Date.parse(absolute);
      if (Number.isFinite(parsed)) resetAt = parsed;
    }
    const seconds = node.resets_in_seconds;
    if (
      resetAt === undefined &&
      typeof seconds === 'number' &&
      Number.isFinite(seconds) &&
      seconds >= 0
    )
      resetAt = now + seconds * 1000;
    if (resetAt !== undefined) return { resetAt };
  }
  return {};
}
