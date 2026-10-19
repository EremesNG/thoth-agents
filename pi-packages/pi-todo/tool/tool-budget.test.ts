import { expect, it } from 'vitest';
import { createMockPi } from '../test/helpers.js';
import { registerTodoTool } from '../todo.js';

it('keeps the registered todo definition within its model-facing budget', () => {
  const { pi, captured } = createMockPi();
  registerTodoTool(pi);
  expect([...captured.tools.keys()]).toEqual(['todo']);

  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('todo not registered');
  const serialized = JSON.stringify({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    promptSnippet: tool.promptSnippet,
    promptGuidelines: tool.promptGuidelines,
  });

  // Baseline: 6,313 chars; compacted: 4,597, with 5% headroom.
  expect(serialized.length).toBeLessThanOrEqual(4827);
});
