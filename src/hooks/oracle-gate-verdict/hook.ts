import type { PluginInput } from '@opencode-ai/plugin';
import {
  formatGateVerdict,
  summarizeGateResult,
} from '../../../skills/thoth-sdd/scripts/validate-result.mjs';
import { getAgentRole } from '../../harness/core/agent-pack';

const ORACLE_AGENT = getAgentRole('oracle').name;

export function createOracleGateVerdictHook(ctx: PluginInput) {
  return {
    'tool.execute.after': async (
      input: { tool: string; args?: { subagent_type?: unknown } },
      output: { output: unknown },
    ): Promise<void> => {
      if (input.tool.toLowerCase() !== 'task') return;
      if (input.args?.subagent_type !== ORACLE_AGENT) return;
      if (typeof output.output !== 'string') return;
      const text = output.output;
      if (!text.includes('```thoth-result')) return;

      const opening = '<task_result>';
      const closing = '</task_result>';
      const start = text.indexOf(opening);
      const end = text.lastIndexOf(closing);
      const wrapped = start !== -1 && end >= start + opening.length;
      const child = wrapped ? text.slice(start + opening.length, end) : text;
      const summary = {
        ...summarizeGateResult(child, { cwd: ctx.directory }),
        agent: ORACLE_AGENT,
      };
      const verdict = formatGateVerdict(summary);
      // Only an exact tail after the complete native wrapper is adapter-owned.
      // Unwrapped text has no trustworthy boundary, so always validate it whole.
      if (
        wrapped &&
        text.slice(end + closing.length).endsWith(`\n\n${verdict}`)
      )
        return;
      output.output += `\n\n${verdict}`;
    },
  };
}
