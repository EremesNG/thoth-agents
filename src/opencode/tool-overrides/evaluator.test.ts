import { expect, it } from 'vitest';
import type { PermissionRule } from '../permission-rules.js';
import {
  appendOverrideRules,
  evaluateAction,
  removeActionOverride,
  setActionOverride,
} from './evaluator.js';

const base: PermissionRule[] = [
  { action: '*', resource: '*', effect: 'ask' },
  { action: 'read', resource: '*', effect: 'allow' },
  { action: 'external_directory', resource: '/project/*', effect: 'allow' },
];

it('evaluates defaults and layered overrides with last matching rule winning', () => {
  expect(evaluateAction(base, undefined, 'read')).toEqual({
    effect: 'allow',
    origin: 'default',
  });
  expect(evaluateAction([], undefined, 'read')).toEqual({
    effect: 'ask',
    origin: 'default',
  });
  for (const origin of ['global', 'project'] as const) {
    const effective = {
      origin,
      overrides: [
        { action: '*', effect: 'deny' as const },
        { action: 'rea?', effect: 'allow' as const },
        { action: 'read', effect: 'ask' as const },
      ],
    };
    expect(evaluateAction(base, effective, 'read')).toEqual({
      effect: 'ask',
      origin,
    });
    expect(evaluateAction(base, effective, 'external_directory')).toEqual({
      effect: 'deny',
      origin,
    });
    expect(evaluateAction(base, effective, 'subagent')).toEqual({
      effect: 'deny',
      origin: 'default',
    });
  }
  expect(
    evaluateAction(base, { origin: 'project', overrides: [] }, 'read'),
  ).toEqual({ effect: 'allow', origin: 'default' });
});

it('builds only override rules followed by the non-editable subagent deny', () => {
  expect(appendOverrideRules([])).toEqual([]);
  expect(appendOverrideRules([{ action: '*', effect: 'allow' }])).toEqual([
    { action: '*', resource: '*', effect: 'allow' },
    { action: 'subagent', resource: '*', effect: 'deny' },
  ]);
});

it('editor appends explicit choices after broad patterns and inherit removes all exact entries', () => {
  const input = [
    { action: 'read', effect: 'allow' },
    { action: '*', effect: 'deny' },
    { action: 'read', effect: 'deny' },
    { action: 'rea?', effect: 'deny' },
  ] as const;
  const edited = setActionOverride(input, { action: 'read', effect: 'ask' });
  expect(edited).toEqual([
    { action: '*', effect: 'deny' },
    { action: 'rea?', effect: 'deny' },
    { action: 'read', effect: 'ask' },
  ]);
  expect(
    evaluateAction(base, { origin: 'project', overrides: edited }, 'read'),
  ).toEqual({ effect: 'ask', origin: 'project' });
  expect(removeActionOverride(input, 'read')).toEqual([
    { action: '*', effect: 'deny' },
    { action: 'rea?', effect: 'deny' },
  ]);
  expect(input).toHaveLength(4);
  expect(setActionOverride([], { action: 'read', effect: 'allow' })).toEqual([
    { action: 'read', effect: 'allow' },
  ]);
});
