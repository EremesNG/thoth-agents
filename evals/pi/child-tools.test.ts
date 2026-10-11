import { expect, it } from 'vitest';
import { childToolCalls, successfulSkillRead } from './child-tools';

it('pairs native tool calls and results by id and preserves task attribution', () => {
  const entries = [
    {
      type: 'message',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'r1',
            name: 'read',
            arguments: { path: '.pi/skills/fixture-ui-guidelines/SKILL.md' },
          },
        ],
      },
    },
    {
      type: 'message',
      message: {
        role: 'toolResult',
        toolCallId: 'r1',
        isError: false,
        content: [],
      },
    },
  ];
  const calls = childToolCalls('designer-1', entries);
  expect(
    successfulSkillRead(
      calls,
      'designer-1',
      '.pi/skills/fixture-ui-guidelines/SKILL.md',
    ),
  ).toBe(true);
  expect(
    successfulSkillRead(
      [],
      'designer-1',
      '.pi/skills/fixture-ui-guidelines/SKILL.md',
    ),
  ).toBe(false);
  expect(
    successfulSkillRead(
      calls,
      'designer-2',
      '.pi/skills/fixture-ui-guidelines/SKILL.md',
    ),
  ).toBe(false);
  expect(
    successfulSkillRead(
      childToolCalls('designer-1', entries.slice(0, 1)),
      'designer-1',
      '.pi/skills/fixture-ui-guidelines/SKILL.md',
    ),
  ).toBe(false);
  expect(
    successfulSkillRead(
      childToolCalls('designer-1', [
        entries[0],
        { ...entries[1], message: { ...entries[1].message, isError: true } },
      ]),
      'designer-1',
      '.pi/skills/fixture-ui-guidelines/SKILL.md',
    ),
  ).toBe(false);
});
