const DECLARED_TIMEOUT_GRACE_MS = 30000;

export function resolveToolStallBudget(
  toolName: string,
  args: unknown,
  toolBudgetMs: number,
  maxTotalTimeoutMs: number,
): number {
  if (!args || typeof args !== 'object') return toolBudgetMs;
  const values = args as Record<string, unknown>;
  const declared = [
    values.timeout_seconds,
    ...(toolName === 'bash' || toolName === 'powershell'
      ? [values.timeout]
      : []),
  ].filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  if (!declared.length) return toolBudgetMs;
  return Math.min(
    maxTotalTimeoutMs,
    Math.max(
      toolBudgetMs,
      ...declared.map((seconds) => seconds * 1000 + DECLARED_TIMEOUT_GRACE_MS),
    ),
  );
}
