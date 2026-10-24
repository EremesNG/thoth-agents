import {
  type JsonObject,
  type Tool,
  validateToolArguments,
} from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import { describe, expect, it } from 'vitest';
import { createSubagentContinueTool } from '../../src/tools/subagent-continue.js';
import { createSubagentRunTool } from '../../src/tools/subagent-run.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();
const modes = ['task', 'background'] as const;
const efforts = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
const cases: {
  name: string;
  createTool: typeof createSubagentRunTool | typeof createSubagentContinueTool;
  args: JsonObject;
  field: 'mode' | 'effort';
  values: readonly string[];
}[] = [
  {
    name: 'subagent_run',
    createTool: createSubagentRunTool,
    args: { agent: '007', task: '123' },
    field: 'mode',
    values: modes,
  },
  {
    name: 'subagent_continue',
    createTool: createSubagentContinueTool,
    args: { task_id: '007', prompt: '123', model: '456' },
    field: 'mode',
    values: modes,
  },
  {
    name: 'subagent_continue',
    createTool: createSubagentContinueTool,
    args: { task_id: '007', prompt: '123', model: '456' },
    field: 'effort',
    values: efforts,
  },
];

function validate(tool: Tool, args: JsonObject) {
  return validateToolArguments(tool, {
    type: 'toolCall',
    id: 'schema-test',
    name: tool.name,
    arguments: args,
  });
}

function validationOutcome(tool: Tool, args: JsonObject) {
  try {
    return { args: validate(tool, args) };
  } catch {
    return { rejected: true };
  }
}

describe.each(cases)('$name: $field schema', ({
  createTool,
  args,
  field,
  values,
}) => {
  it('declares the exact values as a flat string enum', () => {
    const tool = createTool(env.createManager(env.mockRunner()), {});
    const schema = Reflect.get(tool.parameters.properties, field);
    expect(JSON.parse(JSON.stringify(schema))).toEqual({
      type: 'string',
      enum: values,
    });
  });

  it('Pi accepts each value unchanged and rejects invalid strings and types', () => {
    const tool = createTool(env.createManager(env.mockRunner()), {});
    expect(validate(tool, args)).toEqual(args);
    for (const value of values) {
      const input = { ...args, [field]: value };
      expect(validate(tool, input)).toEqual(input);
    }
    for (const value of [
      '',
      'invalid',
      'TASK',
      'HIGH',
      'max',
      0,
      1,
      false,
      true,
      {},
      [],
    ]) {
      expect(() => validate(tool, { ...args, [field]: value })).toThrow(
        'Validation failed',
      );
    }
  });

  it('preserves Pi normalization and coercion compared with the literal union', () => {
    const tool = createTool(env.createManager(env.mockRunner()), {});
    const previous = {
      ...tool,
      parameters: Type.Object({
        ...tool.parameters.properties,
        [field]: Type.Optional(
          Type.Union(values.map((value) => Type.Literal(value))),
        ),
      }),
    };
    const inputs = [
      undefined,
      null,
      ...values,
      '',
      'invalid',
      0,
      1,
      false,
      true,
      {},
      [],
      [values[0]],
    ];
    for (const value of inputs) {
      const input = value === undefined ? args : { ...args, [field]: value };
      expect(validationOutcome(tool, input), JSON.stringify(input)).toEqual(
        validationOutcome(previous, input),
      );
    }
  });
});

it('Pi accepts every continuation mode and effort combination unchanged', () => {
  const tool = createSubagentContinueTool(
    env.createManager(env.mockRunner()),
    {},
  );
  for (const mode of modes) {
    for (const effort of efforts) {
      const args = { task_id: '007', prompt: '123', mode, effort };
      expect(validate(tool, args)).toEqual(args);
    }
  }
});
