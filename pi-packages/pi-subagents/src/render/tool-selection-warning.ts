import type { SubagentTask } from './types.js';

export function toolSelectionWarning(
  task: Pick<SubagentTask, 'dropped_tools'>,
  compact = false,
): string | undefined {
  if (!task.dropped_tools?.length) return undefined;
  const names = task.dropped_tools.join(', ');
  return compact
    ? `⚠ Dropped tools: ${names}`
    : `Warning: Dropped tools unavailable in the child session (missing implementation: ${names}).`;
}
