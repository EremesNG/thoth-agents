import { describe, expect, test } from 'vitest';
import { parseOperationArgs } from './parser';

describe('operation role effort parsing', () => {
  test('merges repeatable role efforts with model input or an effort-only role', () => {
    const parsed = parseOperationArgs([
      '--harness=codex',
      '--role-model=deep=openai/gpt-5.6-sol',
      '--role-effort=deep=ultra',
      '--role-effort=quick=default',
    ]);

    expect(parsed.roles).toEqual([
      {
        role: 'deep',
        model: 'openai/gpt-5.6-sol',
        provider: undefined,
        effort: { kind: 'effort', value: 'ultra' },
      },
      { role: 'quick', effort: { kind: 'inherit' } },
    ]);
  });

  test('rejects malformed and conflicting role efforts without partial output', () => {
    expect(() => parseOperationArgs(['--role-effort=deep'])).toThrow(
      '--role-effort must use role=effort or role:effort',
    );
    expect(() =>
      parseOperationArgs(['--role-effort=deep=high', '--role-effort=deep=low']),
    ).toThrow('Conflicting --role-effort values for deep');
  });

  test('preserves existing role, provider, and model flags', () => {
    expect(
      parseOperationArgs([
        '--harness=opencode',
        '--role=deep',
        '--provider=openai',
        '--model=gpt-5.4',
      ]).roles,
    ).toEqual([{ role: 'deep', model: 'gpt-5.4', provider: 'openai' }]);
  });
});
