export interface DelegateTaskErrorPattern {
  pattern: string;
  errorType: string;
  fixHint: string;
}

export const DELEGATE_TASK_ERROR_PATTERNS: DelegateTaskErrorPattern[] = [
  {
    pattern: 'Unknown agent:',
    errorType: 'unknown_agent',
    fixHint: 'Use an available agent name in the agent argument.',
  },
  {
    pattern: 'cannot run as a subagent',
    errorType: 'primary_agent',
    fixHint: 'Choose a specialist agent, not a primary agent.',
  },
  {
    pattern: 'Subagent depth limit reached',
    errorType: 'depth_limit',
    fixHint:
      'Return to the root coordinator; nesting depth is 1. Do not retry nested delegation.',
  },
  {
    pattern: 'Subagent denied:',
    errorType: 'permission_denied',
    fixHint:
      'Return the permission blocker to the root coordinator; do not bypass the denial.',
  },
  {
    pattern: 'Invalid arguments',
    errorType: 'invalid_arguments',
    fixHint:
      'Supply agent, description and prompt; optional model, sessionID and background must have the native types.',
  },
];

export interface DetectedError {
  errorType: string;
  originalOutput: string;
}

export function detectDelegateTaskError(output: string): DetectedError | null {
  const pattern = DELEGATE_TASK_ERROR_PATTERNS.find((entry) =>
    output.includes(entry.pattern),
  );
  return pattern
    ? { errorType: pattern.errorType, originalOutput: output }
    : null;
}
