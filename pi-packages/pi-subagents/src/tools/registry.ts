import { readSubagentsConfig } from '../config.js';
import type { SubagentManager } from '../manager.js';
import { createSubagentCancelTool } from './subagent-cancel.js';
import { createSubagentContinueTool } from './subagent-continue.js';
import { createSubagentListAgentsTool } from './subagent-list-agents.js';
import { createSubagentListTasksTool } from './subagent-list-tasks.js';
import { createSubagentReplyTool } from './subagent-reply.js';
import { createSubagentResultTool } from './subagent-result.js';
import { createSubagentRunTool } from './subagent-run.js';
import { createSubagentSendMessageTool } from './subagent-send-message.js';
import { createSubagentStatusTool } from './subagent-status.js';

export function registerSubagentTools(
  pi: any,
  manager: SubagentManager,
  cwd = process.cwd(),
): void {
  const registerTool = (tool: { name: string }): void => {
    pi.registerTool({ ...tool, exposure: 'model-only' });
  };

  const config = readSubagentsConfig(cwd);
  registerTool(createSubagentListAgentsTool(manager));
  registerTool(createSubagentRunTool(manager, pi));
  if (config.enable_continue)
    registerTool(createSubagentContinueTool(manager, pi));
  registerTool(createSubagentStatusTool(manager));
  registerTool(createSubagentResultTool(manager));
  registerTool(createSubagentListTasksTool(manager));
  registerTool(createSubagentCancelTool(manager));
  registerTool(createSubagentSendMessageTool(manager));
  if (config.enable_ask_orchestrator)
    registerTool(createSubagentReplyTool(manager));
}
