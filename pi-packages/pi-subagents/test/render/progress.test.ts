import { describe, expect, it } from 'vitest';
import { progressText } from '../../src/render/tools/progress.js';
import type { SubagentTask } from '../../src/types.js';

const task: SubagentTask = {
  id: 'progress',
  agent: 'analyst',
  mode: 'background',
  status: 'running',
  task: 'review changes',
  created_at: '2026-01-01T00:00:00.000Z',
  model: 'mock/model',
  last_activity: 'thinking',
};

describe('progress text', () => {
  it('separates model and usage in raw progress updates with a background hint', () => {
    const lines = progressText(
      [
        {
          ...task,
          usage: {
            turns: 2,
            input: 1500,
            output: 100,
            cacheRead: 0,
            cacheWrite: 0,
            cost: 0,
            contextTokens: 0,
          },
        },
      ],
      0,
      { backgroundable: true, backgroundShortcut: 'ctrl+b' },
    ).split('\n');
    expect(lines.slice(1)).toEqual([
      '↳ model: mock/model',
      '↳ usage: 2 turns ↑1.5k ↓100',
      '↳ thinking',
      '↳ ctrl+b to send to background',
    ]);
  });

  it.each([
    undefined,
    {
      turns: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
    },
  ])('omits the usage line when no usage or runtime is available (%j)', (usage) => {
    const lines = progressText([{ ...task, usage }]).split('\n');
    expect(lines.slice(1)).toEqual(['↳ model: mock/model', '↳ thinking']);
  });
});
