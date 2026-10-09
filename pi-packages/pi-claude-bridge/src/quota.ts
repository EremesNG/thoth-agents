import type {
  query,
  SDKControlGetUsageResponse,
} from '@anthropic-ai/claude-agent-sdk';
import { makePromptStream } from './prompt-stream.js';
import { reportClaudeProviderLimit } from './provider-limits.js';

type QueryOptions = Parameters<typeof query>[0]['options'];

function percent(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? 'usage unavailable'
    : `${value}%`;
}

function resetTime(value: string | null): string {
  if (!value) return 'reset time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'reset time unavailable'
    : `resets ${date.toLocaleString()}`;
}

function renderQuota(response: SDKControlGetUsageResponse): string {
  const limits = response.rate_limits;
  if (!limits || response.rate_limits_available === false) {
    return 'Claude quota: plan limits unavailable (API key, Bedrock, Vertex, or missing Claude profile scope).';
  }
  const lines = [
    `Claude quota${response.subscription_type ? ` (${response.subscription_type})` : ''}`,
  ];
  const windows = [
    ['five_hour', '5 hour'],
    ['seven_day', 'Weekly'],
    ['seven_day_opus', 'Weekly Opus'],
    ['seven_day_sonnet', 'Weekly Sonnet'],
    ['seven_day_oauth_apps', 'Weekly OAuth apps'],
  ] as const;
  for (const [key, label] of windows) {
    const window = limits[key];
    if (window)
      lines.push(
        `${label}: ${percent(window.utilization)} — ${resetTime(window.resets_at)}`,
      );
  }
  for (const window of limits.model_scoped ?? []) {
    lines.push(
      `${window.display_name}: ${percent(window.utilization)} — ${resetTime(window.resets_at)}`,
    );
  }
  if (limits.extra_usage) {
    lines.push(
      `Extra usage: ${limits.extra_usage.is_enabled ? percent(limits.extra_usage.utilization) : 'disabled'}`,
    );
  }
  if (lines.length === 1) lines.push('No plan windows returned.');
  return lines.join('\n');
}

/** On-demand control request only: keep stdin open, but never send a user message. */
export async function fetchClaudeQuota(
  queryImpl: typeof query,
  options: QueryOptions,
  sessionId: string,
): Promise<string> {
  const input = makePromptStream();
  let sdkQuery: ReturnType<typeof query> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    sdkQuery = queryImpl({
      prompt: input.stream,
      options: { ...options, tools: [], persistSession: false },
    });
    if (
      typeof sdkQuery.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET !==
      'function'
    ) {
      return 'Claude quota: experimental usage API unavailable; update the Claude Agent SDK and Claude Code.';
    }
    // Events still belong to this short-lived query's Pi session, not the SDK id.
    const eventFailure = new Promise<never>((_resolve, reject) => {
      void (async () => {
        for await (const message of sdkQuery)
          reportClaudeProviderLimit(message, sessionId);
      })().catch(reject);
    });
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('request timed out after 30 seconds')),
        30_000,
      );
    });
    const response = await Promise.race([
      sdkQuery.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
        skipBehaviors: true,
      }),
      timeout,
      eventFailure,
    ]);
    return renderQuota(response);
  } catch (error) {
    return `Claude quota failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    clearTimeout(timer);
    try {
      sdkQuery?.close();
    } catch {
      /* Preserve the usage result or original failure. */
    }
    input.end();
  }
}
