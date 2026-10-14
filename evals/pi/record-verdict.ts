/** Shared text normalization, not a Markdown renderer. */
function normalizeVerdictLine(raw: string): string {
  return raw
    .replace(/[*_]/g, '')
    .replace(/^(?:\s|[-+]\s+|\d+\.\s+|>|#)+/, '')
    .trim();
}

/** Inclusive detection: even qualified/example PASS writes require provenance. */
export function hasApprovalWrite(
  content: string,
  kind: 'plan-review' | 'final-verification' = 'final-verification',
  previousContent?: string,
): boolean {
  // Existing instructions/examples are not new approval writes. Consume exact
  // prior lines once so adding even a duplicate approval still needs provenance.
  const prior = new Map<string, number>();
  for (const line of previousContent?.split(/\r?\n/) ?? [])
    prior.set(line, (prior.get(line) ?? 0) + 1);
  return content.split(/\r?\n/).some((raw) => {
    const count = prior.get(raw) ?? 0;
    if (count > 0) {
      prior.set(raw, count - 1);
      return false;
    }
    const line = normalizeVerdictLine(raw);
    const field = (
      kind === 'plan-review'
        ? /^plan review\s*[:—–-]\s*(.*)$/i
        : /^verdict\s*[:—–-]\s*(.*)$/i
    ).exec(line);
    return (
      !!field &&
      (kind === 'plan-review' ? /\bokay\b/i : /\bpass\b/i).test(field[1])
    );
  });
}
