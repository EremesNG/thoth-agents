import fs from 'node:fs';
import type { SubagentTask } from '../types.js';

export const TIMEOUT_PREVIEW_LIMIT = 2000;
export const TIMEOUT_PROGRESS_LIMIT = 1000;

/** Bounded working context, never a claim that the requested checkpoint arrived. */
export function timeoutWorkingContext(task: SubagentTask): string {
  const progress = (task.progress_updates ?? []).slice(-5);
  return [
    'Latest progress/checkpoint updates:',
    ...(progress.length
      ? progress.map(
          (update) =>
            `- ${update.created_at}: ${update.message.slice(-TIMEOUT_PROGRESS_LIMIT)}`,
        )
      : ['- No progress/checkpoint updates received.']),
    'Output preview tail (partial, not a final result):',
    task.output_preview?.slice(-TIMEOUT_PREVIEW_LIMIT) || '(none)',
  ].join('\n');
}

export function totalTimeoutResult(
  task: SubagentTask,
  continueAvailable: boolean,
): string | undefined {
  if (task.error_metadata?.category !== 'total_timeout') return undefined;
  return [
    task.error ?? task.error_metadata.message,
    timeoutPartialContext(task, continueAvailable),
  ].join('\n\n');
}

export function timeoutPartialContext(
  task: SubagentTask,
  continueAvailable: boolean,
): string {
  const nestedAvailable = Boolean(
    task.nested_session_path && fs.existsSync(task.nested_session_path),
  );
  return [
    '## Partial context (total timeout)',
    timeoutWorkingContext(task),
    `Extensions used: ${task.timeout_extensions_used ?? 0}`,
    `Nested session: ${nestedAvailable ? 'available' : 'unavailable'}`,
    `subagent_continue: ${continueAvailable ? 'enabled' : 'disabled'}`,
  ].join('\n');
}
