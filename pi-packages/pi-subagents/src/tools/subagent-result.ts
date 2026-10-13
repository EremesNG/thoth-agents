import { Type } from 'typebox';
import { continuationAvailable } from '../continuation-availability.js';
import type { SubagentManager } from '../manager.js';
import { toolSelectionWarning } from '../render/tool-selection-warning.js';
import { emptyComponent } from '../render/tools/components.js';
import { formatTask } from '../render/tools/formatting.js';
import { renderSubagentResult } from '../render/tools/subagent-result.js';
import {
  compactTaskForToolResult,
  totalTimeoutResult,
} from './result-details.js';
import { fail, ok } from './tool-response.js';

export function createSubagentResultTool(manager: SubagentManager, pi?: any) {
  return {
    name: 'subagent_result',
    label: 'Subagent Result',
    description: 'Read result for a delegated subagent task.',
    parameters: Type.Object({ task_id: Type.String() }),
    renderShell: 'self',
    async execute(
      toolCallId: string,
      params: any,
      _signal: any,
      _onUpdate: any,
      ctx: any,
    ) {
      try {
        const task = manager.getTask(params.task_id, ctx?.cwd ?? process.cwd());
        if (!task) throw new Error('Subagent task not found');
        const continueAvailable = continuationAvailable(
          ctx?.cwd ?? process.cwd(),
          pi,
        );
        const fullResult =
          totalTimeoutResult(task, continueAvailable) ??
          task.result ??
          task.error ??
          task.output_preview ??
          formatTask(task);
        const content = [toolSelectionWarning(task), fullResult]
          .filter(Boolean)
          .join('\n\n');
        const response = ok(content, {
          task: compactTaskForToolResult(task, continueAvailable),
          full_result: fullResult,
        });
        manager.stageResultAcknowledgment(toolCallId, task, response.content);
        return response;
      } catch (e) {
        return fail(e);
      }
    },
    renderCall: () => emptyComponent(),
    renderResult: renderSubagentResult,
  };
}
