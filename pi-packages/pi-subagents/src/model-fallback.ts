import { SubagentStructuredError } from './error-metadata.js';
import type {
  SubagentErrorCategory,
  SubagentErrorMetadata,
  SubagentFallbackAttempt,
} from './types.js';

/** Provider failures that justify continuing the session on another model. */
const FALLBACK_ELIGIBLE_CATEGORIES: ReadonlySet<SubagentErrorCategory> =
  new Set([
    'provider_api_error',
    'provider_rate_limit',
    'provider_network_error',
    'provider_auth_error',
  ]);

const REASON_LIMIT = 200;

/**
 * Returns the structured failure when the thrown runner error may switch to
 * the next fallback model. Only classified runner errors qualify; timeouts,
 * cancellation, context overflow and unclassified throws never do. A failure
 * explicitly marked non-retryable (for example request-shape errors that every
 * model would reject) is excluded, except authentication errors, which are
 * non-retryable by default for the same model but are model/provider-specific.
 */
export function eligibleFallbackFailure(
  error: unknown,
): SubagentErrorMetadata | undefined {
  if (!(error instanceof SubagentStructuredError)) return undefined;
  const metadata = error.error_metadata;
  if (!FALLBACK_ELIGIBLE_CATEGORIES.has(metadata.category)) return undefined;
  if (
    metadata.category !== 'provider_auth_error' &&
    metadata.retryable === false
  )
    return undefined;
  return metadata;
}

function reason(metadata: SubagentErrorMetadata): string {
  const message = metadata.message.replace(/\s+/g, ' ').trim();
  return message.length > REASON_LIMIT
    ? `${message.slice(0, REASON_LIMIT - 1)}…`
    : message;
}

export function fallbackAttemptRecord(input: {
  attempt: number;
  model: string;
  metadata: SubagentErrorMetadata;
}): SubagentFallbackAttempt {
  return {
    attempt: input.attempt,
    model: input.model,
    category: input.metadata.category,
    message: reason(input.metadata),
  };
}

/** Short prompt replacing the delegated task when reopening the session. */
export function fallbackContinuationPrompt(input: {
  failedModel: string;
  nextModel: string;
  metadata: SubagentErrorMetadata;
}): string {
  return [
    `Your previous model (${input.failedModel}) failed with a ${input.metadata.category.replace(/_/g, ' ')} (${reason(input.metadata)}) and this session was switched to ${input.nextModel}.`,
    'Your session history above is preserved, including the delegated task and any tool activity.',
    'Continue the delegated task from where it stopped. Do not repeat work already done; finish with the final response the original task requires.',
  ].join('\n');
}

/** Completion-message section; empty when no fallback was involved. */
export function fallbackSummaryLines(task: {
  model?: string;
  status?: string;
  error_metadata?: SubagentErrorMetadata;
  fallback_attempts?: SubagentFallbackAttempt[];
}): string[] {
  const attempts = task.fallback_attempts;
  if (!attempts?.length) return [];
  const currentModelLine =
    task.status === 'completed' || task.status === 'running' || !task.status
      ? `- continued on ${task.model}`
      : task.status === 'cancelled' || task.status === 'interrupted'
        ? `- ${task.model} ${task.status}${task.error_metadata ? ` (${task.error_metadata.category}): ${reason(task.error_metadata)}` : ''}`
        : task.error_metadata
          ? `- ${task.model} failed (${task.error_metadata.category}): ${reason(task.error_metadata)}`
          : `- ${task.model} ${task.status}`;
  return [
    'Model fallback:',
    ...attempts.map(
      (attempt) =>
        `- ${attempt.model} failed (${attempt.category}): ${attempt.message}`,
    ),
    ...(task.model ? [currentModelLine] : []),
  ];
}
