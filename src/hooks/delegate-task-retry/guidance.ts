import { DELEGATE_TASK_ERROR_PATTERNS, type DetectedError } from './patterns';

function extractAvailableList(output: string): string | null {
  const match = output.match(/Allowed agents:\s*(.+)$/m);
  if (match) return match[1].trim();

  const available = output.match(/Available[^:]*:\s*(.+)$/m);
  if (available) return available[1].trim();

  return null;
}

export function buildRetryGuidance(errorInfo: DetectedError): string {
  const pattern = DELEGATE_TASK_ERROR_PATTERNS.find(
    (p) => p.errorType === errorInfo.errorType,
  );

  if (!pattern) {
    return '\n[delegate-task retry] Fix parameters and retry with corrected arguments.';
  }

  const available = extractAvailableList(errorInfo.originalOutput);

  const lines = [
    '',
    '[delegate-task retry suggestion]',
    `Error type: ${errorInfo.errorType}`,
    `Fix: ${pattern.fixHint}`,
  ];

  if (available) {
    lines.push(`Available: ${available}`);
  }

  if (errorInfo.errorType === 'background_agent_not_allowed') {
    lines.push(
      'Retry now with corrected parameters.',
      'Use `background=true` only for `explorer` or `librarian`; otherwise retry without background.',
      'If the host enables `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`, collect results with `task_status` before reporting completion.',
      'Examples:',
      'task(description="...", prompt="...", subagent_type="explorer", background=true)',
      'task_status(task_id="ses_...", wait=true)',
    );

    return lines.join('\n');
  }

  lines.push(
    'Retry now with corrected parameters. Example:',
    'task(description="...", prompt="...", subagent_type="explorer")',
  );

  return lines.join('\n');
}
