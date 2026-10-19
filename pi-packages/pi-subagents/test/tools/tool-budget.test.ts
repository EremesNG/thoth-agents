import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';
import {
  createAskOrchestratorTool,
  createNotifyOrchestratorTool,
} from '../../src/runner/orchestrator-tool.js';
import { registerSubagentTools } from '../../src/tools/registry.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

it('keeps all root and child tool definitions within the serialized character budget', () => {
  fs.writeFileSync(
    path.join(env.tmp, '.pi', 'subagents.json'),
    JSON.stringify({
      default_mode: 'background',
      enable_continue: true,
      enable_ask_orchestrator: true,
    }),
  );
  const rootTools: ToolDefinition[] = [];
  registerSubagentTools(
    { registerTool: (tool: ToolDefinition) => rootTools.push(tool) },
    env.createManager(env.mockRunner()),
    env.tmp,
  );
  expect(rootTools.map((tool) => tool.name).sort()).toEqual([
    'subagent_cancel',
    'subagent_continue',
    'subagent_extend',
    'subagent_list_agents',
    'subagent_list_tasks',
    'subagent_reply',
    'subagent_result',
    'subagent_run',
    'subagent_send_message',
    'subagent_status',
  ]);
  const childTools = [
    createAskOrchestratorTool(undefined),
    createNotifyOrchestratorTool(undefined),
  ];
  expect(childTools.map((tool) => tool.name)).toEqual([
    'ask_orchestrator',
    'notify_orchestrator',
  ]);
  const sizes = [...rootTools, ...childTools].map((tool) => {
    expect(tool.exposure).toBe('model-only');
    const { name, description, parameters, promptSnippet, promptGuidelines } =
      tool;
    return {
      name,
      chars: JSON.stringify({
        name,
        description,
        parameters,
        promptSnippet,
        promptGuidelines,
      }).length,
    };
  });
  const total = sizes.reduce((sum, tool) => sum + tool.chars, 0);
  // Baseline: 4,869 chars; compacted: 4,049. Allow about 5% growth.
  expect(total, JSON.stringify(sizes)).toBeLessThanOrEqual(4_252);
});
