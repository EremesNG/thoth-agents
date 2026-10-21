import { safeErrorMetadataDetails } from '../error-metadata.js';
import {
  TIMEOUT_PREVIEW_LIMIT,
  timeoutPartialContext,
} from '../render/timeout-context.js';
import type { SubagentTask } from '../types.js';

export { totalTimeoutResult } from '../render/timeout-context.js';

export function taskFromDetails(result: any): SubagentTask | undefined {
  return (
    result?.details?.tasks?.[0] ??
    result?.details?.results?.[0] ??
    result?.details?.task
  );
}

export function sessionIdFromToolContext(ctx: any): string | undefined {
  const direct = ctx?.sessionManager?.getSessionId?.() ?? ctx?.sessionId;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const file = ctx?.sessionManager?.getSessionFile?.();
  return typeof file === 'string' && file.length > 0 ? file : undefined;
}

function compactErrorMetadataForDetails(
  task: Pick<SubagentTask, 'error_metadata'>,
): Record<string, unknown> | undefined {
  if (!task.error_metadata) return undefined;
  return safeErrorMetadataDetails(task.error_metadata as any);
}

function orchestratorDetails(
  task: SubagentTask,
  continueAvailable: boolean,
): Record<string, unknown> {
  const pending = task.pending_questions ?? [];
  return {
    pending_question_count: pending.length,
    pending_questions: pending.map(({ request_id, message, created_at }) => ({
      request_id,
      message,
      created_at,
    })),
    ...(task.error_metadata?.category === 'total_timeout'
      ? {
          partial_context: timeoutPartialContext(task, continueAvailable),
        }
      : {}),
    progress_updates: (task.progress_updates ?? [])
      .slice(-5)
      .map(({ message, created_at }) => ({ message, created_at })),
  };
}

export function compactTaskForToolResult(
  task: SubagentTask,
  continueAvailable: boolean,
  options: { includeResult?: boolean; includeError?: boolean } = {},
): Record<string, any> {
  const error_metadata = compactErrorMetadataForDetails(task);
  // Labels normalize whitespace before clipping. Normalize long task previews
  // too, so even a long whitespace prefix cannot change the rendered label.
  const taskPreview =
    task.task?.length > TIMEOUT_PREVIEW_LIMIT
      ? task.task.replace(/\s+/g, ' ').trim()
      : task.task;
  // Explicit allowlist: new runtime fields must not silently enter tool details.
  return {
    id: task.id,
    display_name: task.display_name,
    agent: task.agent,
    mode: task.mode,
    effective_mode: task.effective_mode,
    status: task.status,
    task: taskPreview?.slice(0, TIMEOUT_PREVIEW_LIMIT),
    context: task.context?.slice(0, TIMEOUT_PREVIEW_LIMIT),
    prompt: task.prompt?.slice(0, TIMEOUT_PREVIEW_LIMIT),
    continuation_prompt: task.continuation_prompt?.slice(
      0,
      TIMEOUT_PREVIEW_LIMIT,
    ),
    created_at: task.created_at,
    attempt: task.attempt,
    session_id: task.session_id,
    nested_session_path: task.nested_session_path,
    dropped_tools: task.dropped_tools,
    notify_orchestrator_available: task.notify_orchestrator_available,
    started_at: task.started_at,
    ended_at: task.ended_at,
    last_activity_at: task.last_activity_at,
    last_activity: task.last_activity,
    output_preview: task.output_preview,
    pending_message_count: task.pending_message_count,
    undelivered_message_count: task.undelivered_message_count,
    timeout_started_at: task.timeout_started_at,
    timeout_deadline_at: task.timeout_deadline_at,
    timeout_extensions_used: task.timeout_extensions_used,
    timeout_deadline_generation: task.timeout_deadline_generation,
    timeout_max_extensions: task.timeout_max_extensions,
    timeout_continue_enabled: task.timeout_continue_enabled,
    live_activity: task.live_activity,
    usage: task.usage,
    runtime_metrics: task.runtime_metrics,
    model: task.model,
    effort: task.effort,
    model_source: task.model_source,
    effort_source: task.effort_source,
    fallback_used: task.fallback_used,
    interaction_request: task.interaction_request,
    stop_reason: task.stop_reason,
    pi_retry_attempts: task.pi_retry_attempts,
    ...orchestratorDetails(task, continueAvailable),
    ...(options.includeResult !== false ? { result: task.result } : {}),
    ...(options.includeError !== false ? { error: task.error } : {}),
    ...(error_metadata ? { error_metadata } : {}),
  };
}

export function compactTaskWithoutFinalText(
  task: SubagentTask,
  continueAvailable: boolean,
): Record<string, any> {
  return compactTaskForToolResult(task, continueAvailable, {
    includeResult: false,
    includeError: false,
  });
}

export function compactResultDetails<T extends Record<string, any>>(
  details: T,
  continueAvailable: boolean,
): T {
  return {
    ...details,
    task: details.task
      ? compactTaskForToolResult(details.task, continueAvailable)
      : details.task,
    tasks: Array.isArray(details.tasks)
      ? details.tasks.map((task) =>
          compactTaskForToolResult(task, continueAvailable),
        )
      : details.tasks,
    results: Array.isArray(details.results)
      ? details.results.map((task) =>
          compactTaskForToolResult(task, continueAvailable),
        )
      : details.results,
  };
}
