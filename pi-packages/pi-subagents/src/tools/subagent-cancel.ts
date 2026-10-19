import { Type } from 'typebox';
import { continuationAvailable } from '../continuation-availability.js';
import type { SubagentManager } from '../manager.js';
import {
  appendSubagentResumeGuidance,
  formatTask,
} from '../render/tools/formatting.js';
import {
  renderSubagentCancelCall,
  renderSubagentCancelResult,
} from '../render/tools/subagent-cancel.js';
import { compactTaskForToolResult } from './result-details.js';
import { fail, ok } from './tool-response.js';

export function createSubagentCancelTool(manager: SubagentManager, pi?: any) {
  return {
    name: 'subagent_cancel',
    label: 'Subagent Cancel',
    description: 'Cancel a running task.',
    parameters: Type.Object({ task_id: Type.String() }),
    renderShell: 'self',
    async execute(
      _id: string,
      params: any,
      _signal: any,
      _onUpdate: any,
      ctx: any,
    ) {
      try {
        const available = continuationAvailable(ctx?.cwd ?? process.cwd(), pi);
        const task = manager.cancel(params.task_id);
        return ok(
          appendSubagentResumeGuidance(formatTask(task), [task], available),
          { task: compactTaskForToolResult(task, available) },
        );
      } catch (e) {
        return fail(e);
      }
    },
    renderCall: renderSubagentCancelCall,
    renderResult: renderSubagentCancelResult,
  };
}
