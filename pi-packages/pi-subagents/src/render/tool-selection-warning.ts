import type { SubagentTask } from './types.js';

export function toolSelectionWarning(
  task: Pick<SubagentTask, 'dropped_tools'>,
): string | undefined {
  return task.dropped_tools?.length
    ? `Warning: Dropped tools unavailable in the child session (missing implementation: ${task.dropped_tools.join(', ')}).`
    : undefined;
}
