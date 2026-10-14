import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { SubagentOrchestratorChannel } from '../types.js';

const parameters = Type.Object(
  {
    message: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export function createAskOrchestratorTool(
  channel: SubagentOrchestratorChannel | undefined,
): ToolDefinition<typeof parameters> {
  return {
    name: 'ask_orchestrator',
    exposure: 'model-only',
    label: 'Ask Orchestrator',
    description:
      'Ask the owning orchestrator a blocking alignment question. Returns the orchestrator reply. This is not a human question or delegation tool.',
    parameters,
    async execute(_id, params, signal) {
      if (!channel)
        throw new Error('ask_orchestrator has no owning task channel.');
      if (signal?.aborted) throw new Error('ask_orchestrator call cancelled.');
      const reply = await channel.askQuestion(params.message, signal);
      return { content: [{ type: 'text', text: reply }], details: {} };
    },
  };
}

export function createNotifyOrchestratorTool(
  channel: SubagentOrchestratorChannel | undefined,
): ToolDefinition<typeof parameters> {
  return {
    name: 'notify_orchestrator',
    exposure: 'model-only',
    label: 'Notify Orchestrator',
    description:
      'Report progress to the owning orchestrator without waiting for a reply or triggering a root turn.',
    parameters,
    async execute(_id, params, signal) {
      if (!channel)
        throw new Error('notify_orchestrator has no owning task channel.');
      if (signal?.aborted)
        throw new Error('notify_orchestrator call cancelled.');
      channel.reportProgress(params.message);
      return {
        content: [{ type: 'text', text: 'Progress recorded.' }],
        details: {},
      };
    },
  };
}
