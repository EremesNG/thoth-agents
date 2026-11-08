import { expect, it } from 'vitest';
import {
  formatModelString,
  mergeProfileModelChain,
  resolveRoleProfile,
} from './resolver.js';

it('resolves model/variant pairs and variant-only overrides against the effective roster', () => {
  const roster = {
    worker: {
      model: [{ id: 'base/worker', variant: 'high' }, 'backup/worker'],
      variant: 'low',
    },
  };
  expect(
    resolveRoleProfile(
      'worker',
      { agents: { worker: { model: 'custom/worker' } } },
      roster,
    ),
  ).toEqual({ model: 'custom/worker' });
  expect(
    resolveRoleProfile(
      'worker',
      { agents: { worker: { variant: 'max' } } },
      roster,
    ),
  ).toEqual({ model: 'base/worker', variant: 'max' });
  expect(formatModelString({ model: 'custom/worker', variant: 'max' })).toBe(
    'custom/worker#max',
  );
  expect(formatModelString({ model: 'custom/worker' })).toBe('custom/worker');
  expect(formatModelString({})).toBeUndefined();
  expect(
    mergeProfileModelChain({ model: 'custom/worker', variant: 'max' }, [
      { id: 'base/worker' },
      { id: 'custom/worker', variant: 'low' },
      { id: 'base/worker' },
      { id: 'backup/worker' },
    ]),
  ).toEqual([
    { id: 'custom/worker', variant: 'max' },
    { id: 'base/worker' },
    { id: 'backup/worker' },
  ]);
});
