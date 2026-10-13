import type { SubagentTask } from '../types.js';
import {
  renderSubagentCompletionMessage,
  SUBAGENT_NOTIFICATION_MARKER,
} from './completion-message.js';
import { timeoutWorkingContext } from './timeout-context.js';

export function attentionMessage(task: SubagentTask): string {
  const used = task.timeout_extensions_used ?? 0;
  return [
    SUBAGENT_NOTIFICATION_MARKER,
    `Subagent timeout attention — task_id: ${task.id}`,
    `Remaining time: ${Math.max(0, (task.timeout_deadline_at ?? Date.now()) - Date.now())}ms`,
    `Extensions used: ${used}; remaining: ${Math.max(0, (task.timeout_max_extensions ?? 3) - used)}`,
    timeoutWorkingContext(task),
    'subagent_extend grants more time within the configured bounds; silence lets the execution ceiling apply.',
    'Checkpoint steering is best-effort; only the updates above are confirmed received.',
  ].join('\n');
}

export function sendSubagentAttentionMessage(
  pi: any,
  task: SubagentTask,
): void {
  const content = attentionMessage(task);
  pi.sendMessage?.(
    {
      customType: 'subagent-attention',
      content,
      display: true,
      details: {
        task: { id: task.id, agent: task.agent, status: task.status },
        full_result: content,
      },
    },
    { triggerTurn: true, deliverAs: 'followUp' },
  );
}

export function renderSubagentAttentionMessage(
  message: any,
  options: any,
  theme: any,
) {
  // Reuse the existing notification card, with an explicit attention label.
  return renderSubagentCompletionMessage(
    {
      ...message,
      details: {
        ...message.details,
        task: { ...message.details?.task, status: 'attention' },
      },
    },
    options,
    theme,
  );
}
