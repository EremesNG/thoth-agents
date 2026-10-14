import { type JsonObject, validateToolArguments } from '@earendil-works/pi-ai';
import { expect, it } from 'vitest';
import { TodoParamsSchema } from './types.js';

it('Pi host validates batch unions without coercing numeric-looking string refs', () => {
  const args: JsonObject = {
    action: 'batch',
    ops: [
      { action: 'create', subject: 'Root', ref: '123' },
      { action: 'create', subject: 'Child', blockedBy: ['123', 7] },
      {
        action: 'update',
        id: '123',
        addBlockedBy: ['007', 8],
        removeBlockedBy: ['123', 9],
      },
      { action: 'delete', id: 7 },
    ],
  };
  expect(
    validateToolArguments(
      { name: 'todo', description: '', parameters: TodoParamsSchema },
      {
        type: 'toolCall',
        id: 'batch',
        name: 'todo',
        arguments: structuredClone(args),
      },
    ),
  ).toEqual(args);
});
