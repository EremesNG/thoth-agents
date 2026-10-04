import { Type } from 'typebox';
import type { SubagentManager } from '../manager.js';
import {
  renderSubagentReplyCall,
  renderSubagentReplyResult,
} from '../render/tools/subagent-reply.js';
import { sessionIdFromToolContext } from './result-details.js';
import { fail, ok } from './tool-response.js';

export function createSubagentReplyTool(manager: SubagentManager) {
  return {
    name: 'subagent_reply',
    label: 'Subagent Reply',
    description:
      'Answer an outstanding ask_orchestrator question owned by the current Pi session. request_id may be omitted only when the task has exactly one pending question.',
    parameters: Type.Object({
      task_id: Type.String(),
      request_id: Type.Optional(Type.String()),
      message: Type.String(),
    }),
    renderShell: 'self',
    renderCall: renderSubagentReplyCall,
    renderResult: renderSubagentReplyResult,
    async execute(
      _id: string,
      params: any,
      _signal: any,
      _onUpdate: any,
      ctx: any,
    ) {
      try {
        const result = manager.replyToQuestion(
          sessionIdFromToolContext(ctx),
          params.task_id,
          params.request_id,
          params.message,
        );
        return ok(
          `Replied to task_id: ${result.task_id} · request_id: ${result.request_id}`,
          result,
        );
      } catch (error) {
        return fail(error);
      }
    },
  };
}
