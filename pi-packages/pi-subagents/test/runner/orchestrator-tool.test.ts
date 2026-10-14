import { expect, it, vi } from 'vitest';
import {
  createAskOrchestratorTool,
  createNotifyOrchestratorTool,
} from '../../src/runner/orchestrator-tool.js';

it('asks only questions with a message-only model-only schema', async () => {
  const askQuestion = vi.fn(async () => 'approved');
  const reportProgress = vi.fn();
  const tool = createAskOrchestratorTool({
    askQuestion,
    reportProgress,
    onPendingChange: () => () => {},
    close: () => {},
  });
  expect(Object.keys(tool.parameters.properties)).toEqual(['message']);
  expect(tool.parameters).toMatchObject({ additionalProperties: false });
  expect(tool.exposure).toBe('model-only');
  const result = await tool.execute(
    'id',
    { message: 'scope?' },
    undefined,
    undefined,
    {} as any,
  );
  expect(result.content).toEqual([{ type: 'text', text: 'approved' }]);
  expect(askQuestion).toHaveBeenCalledWith('scope?', undefined);
  expect(reportProgress).not.toHaveBeenCalled();
});

it('notifies immediately without asking a question and is model-only', async () => {
  const reportProgress = vi.fn();
  const askQuestion = vi.fn(() => new Promise<string>(() => {}));
  const tool = createNotifyOrchestratorTool({
    askQuestion,
    reportProgress,
    onPendingChange: () => () => {},
    close: () => {},
  });
  expect(Object.keys(tool.parameters.properties)).toEqual(['message']);
  expect(tool.parameters).toMatchObject({ additionalProperties: false });
  expect(tool.exposure).toBe('model-only');
  expect(
    (
      await tool.execute(
        'id',
        { message: 'checkpoint' },
        undefined,
        undefined,
        {} as any,
      )
    ).content,
  ).toEqual([{ type: 'text', text: 'Progress recorded.' }]);
  expect(reportProgress).toHaveBeenCalledWith('checkpoint');
  expect(askQuestion).not.toHaveBeenCalled();
});
