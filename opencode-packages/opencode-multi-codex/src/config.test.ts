import { expect, it } from 'vitest';
import { configFromContext, parseConfig } from './config.js';

it('defaults switching on and accepts explicit booleans from plugin-entry options', () => {
  expect(parseConfig(undefined)).toEqual({ autoSwitchOn429: true });
  expect(parseConfig({})).toEqual({ autoSwitchOn429: true });
  expect(parseConfig({ autoSwitchOn429: true })).toEqual({
    autoSwitchOn429: true,
  });
  expect(configFromContext({ options: { autoSwitchOn429: false } })).toEqual({
    autoSwitchOn429: false,
  });
});

it.each(
  [
    null,
    false,
    'true',
    1,
    [],
    { autoSwitchOn429: 'true' },
    { autoSwitchOn429: 1 },
    { autoSwitchOn429: null },
    { autoSwitchOn429: undefined },
    { autoSwitchOn429: true, typo: false },
    { typo: true },
    new Date(0),
    Object.create({ autoSwitchOn429: true }),
    { [Symbol('unknown')]: true },
  ].map((input) => ({ input })),
)('disables switching and returns a visible warning for malformed config: $input', ({
  input,
}) => {
  expect(parseConfig(input)).toEqual({
    autoSwitchOn429: false,
    warning: expect.stringContaining('autoSwitchOn429'),
  });
});
