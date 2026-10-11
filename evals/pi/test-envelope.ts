export function envelope(
  role = 'oracle',
  kind = 'final-verification',
  verdict = 'PASS',
  digest?: string,
) {
  return (
    '```thoth-result\n' +
    JSON.stringify({
      schemaVersion: 1,
      role,
      status: 'complete',
      conclusion: 'Checked.',
      evidence: [],
      verification: [],
      risks: [],
      openQuestions: [],
      nextAction: null,
      ...(role === 'oracle'
        ? {
            review: {
              kind,
              verdict,
              ...(digest
                ? {
                    reviewedRecord: '.thoth/changes/greeting/greeting.md',
                    reviewedRecordSha256: digest,
                  }
                : {}),
            },
          }
        : { changedFiles: [] }),
    }) +
    '\n```'
  );
}
