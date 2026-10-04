import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { SubagentOrchestratorChannel } from '../types.js';

const parameters = Type.Object({
  kind: Type.Union([Type.Literal('question'), Type.Literal('progress')]),
  message: Type.String({ minLength: 1 }),
});

export function createAskOrchestratorTool(
  channel: SubagentOrchestratorChannel | undefined,
): ToolDefinition<typeof parameters> {
  return {
    name: 'ask_orchestrator',
    label: 'Ask Orchestrator',
    description:
      'Ask the owning orchestrator a blocking alignment question, or report non-blocking progress. Questions return the orchestrator reply. This is not a human question or delegation tool.',
    parameters,
    async execute(_id, params, signal) {
      if (!channel)
        throw new Error('ask_orchestrator has no owning task channel.');
      if (signal?.aborted) throw new Error('ask_orchestrator call cancelled.');
      if (params.kind === 'progress') {
        channel.reportProgress(params.message);
        return {
          content: [{ type: 'text', text: 'Progress recorded.' }],
          details: {},
        };
      }
      const reply = await channel.askQuestion(params.message, signal);
      return { content: [{ type: 'text', text: reply }], details: {} };
    },
  };
}
