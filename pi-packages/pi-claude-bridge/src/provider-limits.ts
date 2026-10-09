import type {
  SDKMessage,
  SDKRateLimitInfo,
} from '@anthropic-ai/claude-agent-sdk';
import { reportProviderLimit } from '@thoth-agents/pi-core';

/** Capture observations before any content/abort guard; SDK session_id is not a Pi id. */
export function reportClaudeProviderLimit(
  message: SDKMessage,
  sessionId: string | null | undefined,
): void {
  if (message.type !== 'rate_limit_event' || !sessionId) return;
  const info: SDKRateLimitInfo & {
    windowType?: string;
    overageEnabled?: boolean;
  } = message.rate_limit_info;
  reportProviderLimit({
    provider: 'claude-bridge',
    window: info.rateLimitType ?? 'unknown',
    status: info.status,
    utilization: info.utilization,
    resetsAt:
      info.resetsAt === undefined
        ? undefined
        : Math.round(info.resetsAt * 1000),
    observedAt: Date.now(),
    windowType: info.windowType,
    overageInUse: info.overageInUse,
    overageEnabled: info.overageEnabled,
    isUsingOverage: info.isUsingOverage,
    sessionId,
  });
}
