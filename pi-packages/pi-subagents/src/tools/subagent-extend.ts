import { Type } from 'typebox';
import type { SubagentManager } from '../manager.js';
import {
  renderSubagentExtendCall,
  renderSubagentExtendResult,
} from '../render/tools/subagent-extend.js';
import { sessionIdFromToolContext } from './result-details.js';
import { fail, ok } from './tool-response.js';

export function createSubagentExtendTool(manager: SubagentManager) {
  return {
    name: 'subagent_extend',
    label: 'Subagent Extend',
    description:
      'Extend a running task within its total time ceiling and extension count; require evidence of useful progress.',
    parameters: Type.Object({
      task_id: Type.String(),
      extra_ms: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    renderShell: 'self',
    async execute(
      _id: string,
      params: any,
      _signal: any,
      _onUpdate: any,
      ctx: any,
    ) {
      try {
        const result = manager.extendDeadline(
          params.task_id,
          params.extra_ms,
          sessionIdFromToolContext(ctx),
        );
        return ok(
          `Extended ${result.task_id} by ${result.added_ms}ms; extensions remaining: ${result.extensions_remaining}.`,
          result,
        );
      } catch (error) {
        return fail(error);
      }
    },
    renderCall: renderSubagentExtendCall,
    renderResult: renderSubagentExtendResult,
  };
}
