import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';
import { registerAskCodexTool } from '../src/ask-tool.js';

it('keeps the enabled AskCodex definition within its model-facing size budget', () => {
  const tools: Pick<
    ToolDefinition,
    'name' | 'description' | 'parameters' | 'promptSnippet' | 'promptGuidelines'
  >[] = [];
  registerAskCodexTool(
    { registerTool: (tool) => tools.push(tool) },
    {
      enabled: true,
      defaultMode: 'accept-edits',
      defaultTimeoutMinutes: 15,
      allowedApps: [],
      webSearch: 'disabled',
    },
  );
  expect(tools.map(({ name }) => name)).toEqual(['AskCodex']);

  const size = tools.reduce(
    (
      total,
      { name, description, parameters, promptSnippet, promptGuidelines },
    ) =>
      total +
      JSON.stringify({
        name,
        description,
        parameters,
        promptSnippet,
        promptGuidelines,
      }).length,
    0,
  );
  // Baseline: 2,035 chars; compact definition: 1,435 chars + <5% headroom.
  expect(size).toBeLessThanOrEqual(1506);
});
