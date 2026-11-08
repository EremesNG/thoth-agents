import { DELEGATE_TASK_ERROR_PATTERNS, type DetectedError } from './patterns';

export function buildRetryGuidance(errorInfo: DetectedError): string {
  const pattern = DELEGATE_TASK_ERROR_PATTERNS.find(
    (entry) => entry.errorType === errorInfo.errorType,
  );
  const lines = [
    '[subagent retry suggestion]',
    `Error type: ${errorInfo.errorType}`,
    `Fix: ${pattern?.fixHint ?? 'Correct the native subagent arguments before retrying.'}`,
  ];
  if (
    errorInfo.errorType !== 'depth_limit' &&
    errorInfo.errorType !== 'permission_denied'
  ) {
    lines.push(
      'Example: subagent({agent:"explorer", description:"Locate entrypoint", prompt:"Find the bounded entrypoint"})',
      'Use background:true for independent work; completion arrives automatically. Use sessionID to clarify or continue the same child, including while running. Do not poll.',
    );
  }
  return lines.join('\n');
}
