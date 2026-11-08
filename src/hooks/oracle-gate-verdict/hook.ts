import {
  formatGateVerdict,
  summarizeGateResult,
} from '../../../skills/thoth-sdd/scripts/validate-result.mjs';
import type { DelegationToolEvent } from '../delegate-task-retry/hook';

export function createOracleGateVerdictHook(ctx: { directory: string }) {
  return async (event: DelegationToolEvent): Promise<void> => {
    if (event.tool !== 'subagent' || event.status !== 'completed') return;
    if (
      !event.input ||
      typeof event.input !== 'object' ||
      !('agent' in event.input) ||
      event.input.agent !== 'oracle'
    )
      return;
    const output: unknown = event.result.output;
    if (
      !output ||
      typeof output !== 'object' ||
      !('status' in output) ||
      output.status !== 'completed'
    )
      return;
    const text = event.result.content;
    if (typeof text !== 'string' || !text.includes('```thoth-result')) return;

    const opening = /^<subagent\s+sessionID="[^"]+"\s+state="completed">\n/;
    const match = opening.exec(text);
    const end = text.lastIndexOf('</subagent>');
    if (!match || end < match[0].length) return;
    // Only the tail outside the complete native wrapper is adapter-owned.
    // Never recompute a delivered verdict after record repairs.
    const tail = text.slice(end + '</subagent>'.length);
    if (/^thoth-gate-verdict [^\n]+$/m.test(tail)) return;
    const child = text.slice(match[0].length, end);
    const summary = {
      ...summarizeGateResult(child, { cwd: ctx.directory }),
      agent: 'oracle',
    };
    const verdict = formatGateVerdict(summary);
    event.result = { ...event.result, content: `${text}\n\n${verdict}` };
  };
}
