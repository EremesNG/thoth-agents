import { validateSpecialistTask } from './specialist-results';

export type OracleVerdict = 'PASS' | 'NON_PASS' | 'UNKNOWN';

/** Compatibility helper: free-text verdicts are never specialist approval. */
export function parseOracleVerdict(text: string): OracleVerdict {
  const validation = validateSpecialistTask(
    { agent: 'thoth-oracle', result: text },
    { reviewKind: 'final-verification' },
  );
  if (!validation.valid || validation.envelope.role !== 'oracle')
    return 'UNKNOWN';
  return validation.envelope.review.verdict === 'PASS' ? 'PASS' : 'NON_PASS';
}
