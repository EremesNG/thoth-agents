import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { expect, it } from 'vitest';
import registerQuestions, { type createQuestionTool } from '../src/index.js';

it('keeps the registered model-facing question tool within its size budget', () => {
  const tools: ReturnType<typeof createQuestionTool>[] = [];
  registerQuestions({
    registerTool(tool: ReturnType<typeof createQuestionTool>) {
      tools.push(tool);
    },
    on() {},
  } as unknown as ExtensionAPI);
  expect(tools.map(({ name }) => name)).toEqual(['ask_user_question']);

  const tool = tools[0];
  const serialized = JSON.stringify({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    promptSnippet: tool.promptSnippet,
    promptGuidelines: tool.promptGuidelines,
  });
  expect(serialized).not.toContain('"$ref":');
  expect(serialized).not.toContain('"additionalProperties":');
  // Measured 5,759 chars before compaction, 3,880 after; allow 5% headroom.
  expect(serialized.length).toBeLessThanOrEqual(4074);
});
