import { describe, expect, test } from 'vitest';
import { isExplicitEffort, normalizeEffortSelection } from './model-effort';

describe('neutral model effort', () => {
  test.each([
    undefined,
    null,
    '',
    'inherit',
    'default',
  ])('normalizes %s to inherit', (value) => {
    expect(normalizeEffortSelection(value)).toEqual({ kind: 'inherit' });
  });

  test('keeps explicit efforts open-valued and trimmed', () => {
    const selection = normalizeEffortSelection('  ultra  ');
    expect(selection).toEqual({ kind: 'effort', value: 'ultra' });
    expect(isExplicitEffort(selection)).toBe(true);
  });
});
