export function envelope(
  kind = 'final-verification',
  verdict = 'PASS',
  digest?: string,
) {
  return (
    '```thoth-result\n' +
    JSON.stringify({
      schemaVersion: 1,
      role: 'oracle',
      status: 'complete',
      conclusion: 'Checked.',
      evidence: [],
      verification: [],
      risks: [],
      openQuestions: [],
      nextAction: null,
      review: {
        kind,
        verdict,
        ...(kind === 'final-verification'
          ? {
              reviewedRecord: '.thoth/changes/greeting/greeting.md',
              reviewedRecordSha256: digest ?? 'a'.repeat(64),
            }
          : {}),
      },
    }) +
    '\n```'
  );
}
