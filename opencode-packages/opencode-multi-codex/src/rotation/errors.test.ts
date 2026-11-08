import { expect, test } from 'vitest';
import { usageLimit } from './errors.js';

test('usage errors require a Codex usage code and HTTP 429, but socket frames can omit status', () => {
  expect(
    usageLimit(
      {
        status: 429,
        response: {
          body: JSON.stringify({
            error: { type: 'usage_limit_reached', resets_in_seconds: 60 },
          }),
        },
      },
      1000,
    ),
  ).toEqual({ resetAt: 61000 });
  expect(
    usageLimit(
      {
        type: 'error',
        error: { code: 'usage_limit_reached', resets_at: 2000000000 },
      },
      1000,
    ),
  ).toEqual({ resetAt: 2000000000000 });
  expect(
    usageLimit({
      error: {
        type: 'usage_limit_exceeded',
        resets_at: '2030-01-01T00:00:00Z',
      },
    }),
  ).toEqual({ resetAt: 1893456000000 });
  for (const error of [
    { status: 429, error: { type: 'rate_limit_exceeded' } },
    { status: 500, error: { type: 'usage_limit_reached' } },
    { status: 401, error: { type: 'usage_limit_reached' } },
    { status: 429, message: 'usage_limit_reached' },
    { status: 429, response: { body: 'not JSON' } },
  ])
    expect(usageLimit(error)).toBeUndefined();
});
