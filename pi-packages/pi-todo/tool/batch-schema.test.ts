import { type JsonObject, validateToolArguments } from '@earendil-works/pi-ai';
import { expect, it } from 'vitest';
import { TodoParamsSchema } from './types.js';

it('documents shared batch fields only at the top level without changing their types', () => {
  const topLevel = TodoParamsSchema.properties;
  const batch = topLevel.ops.items;
  for (const field of [
    'subject',
    'description',
    'activeForm',
    'status',
    'owner',
    'metadata',
  ] as const) {
    expect(Reflect.get(topLevel[field], 'description')).toBeTypeOf('string');
    const type = { ...topLevel[field] };
    Reflect.deleteProperty(type, 'description');
    expect(batch.properties[field]).toEqual(type);
  }
  expect(TodoParamsSchema.required).toEqual(['action']);
  expect(batch.required).toEqual(['action']);
  const batchDescription = Reflect.get(topLevel.ops, 'description');
  expect(batchDescription).toContain('Op fields match top-level fields');
  expect(batchDescription).toContain(
    '1–50 ordered create/update/delete ops, all-or-nothing',
  );
  expect(batchDescription).toContain(
    'ref: unique call-scoped name (create only)',
  );
  expect(batchDescription).toContain(
    'id/dependencies: numbers are task ids; strings are refs from earlier creates in this call, not persisted ids',
  );
  for (const field of [
    'ref',
    'id',
    'blockedBy',
    'addBlockedBy',
    'removeBlockedBy',
  ] as const) {
    expect(JSON.stringify(batch.properties[field])).not.toContain(
      '"description"',
    );
  }
  expect(JSON.stringify(TodoParamsSchema)).not.toMatch(
    /"\$ref"|"additionalProperties"/,
  );
});

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
