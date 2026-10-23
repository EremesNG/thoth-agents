import {
  formatGateVerdict,
  summarizeGateResult,
} from '../skills/thoth-sdd/scripts/validate-result.mjs';

const VERDICT_PREFIX = 'thoth-gate-verdict ';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasAppendedVerdict(content: unknown, verdict: string): boolean {
  if (typeof content === 'string') return content.endsWith(`\n\n${verdict}`);
  if (!Array.isArray(content)) return false;
  // Delivery adds standalone blocks at the tail, never lines inside child text.
  for (let index = content.length - 1; index >= 0; index--) {
    const block = asRecord(content[index]);
    if (
      block?.type !== 'text' ||
      typeof block.text !== 'string' ||
      !block.text.startsWith(VERDICT_PREFIX) ||
      block.text.includes('\n')
    )
      break;
    if (block.text === verdict) return true;
  }
  return false;
}

function oracleGateVerdict(
  taskValue: unknown,
  result: unknown,
  cwd: string,
): string | undefined {
  const task = asRecord(taskValue);
  if (
    task?.agent !== 'thoth-oracle' ||
    typeof result !== 'string' ||
    !result.includes('```thoth-result')
  )
    return undefined;
  const taskId = typeof task.id === 'string' ? task.id : null;
  const summary = {
    ...summarizeGateResult(result, { cwd }),
    agent: 'thoth-oracle',
    taskId,
  };
  return formatGateVerdict(summary);
}

export function withPiContextGateVerdicts(
  event: Record<string, unknown>,
  cwd: string,
): { messages: unknown[] } | undefined {
  if (!Array.isArray(event.messages)) return undefined;
  let changed = false;
  const messages = event.messages.map((value: unknown) => {
    const message = asRecord(value);
    if (
      message?.role !== 'custom' ||
      message.customType !== 'subagent-completion' ||
      (typeof message.content !== 'string' && !Array.isArray(message.content))
    )
      return value;
    const details = asRecord(message.details);
    const task = asRecord(details?.task);
    const verdict = oracleGateVerdict(
      task,
      details?.full_result ?? task?.result,
      cwd,
    );
    if (!verdict || hasAppendedVerdict(message.content, verdict)) return value;
    changed = true;
    return {
      ...message,
      content:
        typeof message.content === 'string'
          ? `${message.content}\n\n${verdict}`
          : [...message.content, { type: 'text', text: verdict }],
    };
  });
  return changed ? { messages } : undefined;
}

export function withPiToolGateVerdicts(
  event: Record<string, unknown>,
  cwd: string,
): Record<string, unknown> | undefined {
  if (!Array.isArray(event.content)) return undefined;
  const details = asRecord(event.details);
  const task = asRecord(details?.task);
  let verdicts: (string | undefined)[];
  if (event.toolName === 'subagent_result') {
    verdicts = [
      oracleGateVerdict(task, details?.full_result ?? task?.result, cwd),
    ];
  } else if (
    event.toolName === 'subagent_run' &&
    details?.mode === 'task' &&
    Array.isArray(details.results)
  ) {
    verdicts = details.results.map((result) =>
      oracleGateVerdict(result, asRecord(result)?.result, cwd),
    );
  } else {
    return undefined;
  }
  const blocks = verdicts
    .filter(
      (verdict): verdict is string =>
        verdict !== undefined && !hasAppendedVerdict(event.content, verdict),
    )
    .map((text) => ({ type: 'text', text }));
  if (blocks.length === 0) return undefined;
  return {
    content: [...event.content, ...blocks],
    details: event.details,
    // Pi drops structuredContent when content is replaced unless it is returned too.
    structuredContent: event.structuredContent,
  };
}
