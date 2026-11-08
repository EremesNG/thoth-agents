import { expect, test } from 'vitest';
import { parseHeaders, parseRateLimitEvent, parseUsage } from './parsers.js';

test('usage preserves both windows, plan and absolute or relative reset times in milliseconds', () => {
  expect(
    parseUsage(
      {
        plan_type: 'plus',
        rate_limit: {
          primary_window: {
            used_percent: 25,
            limit_window_seconds: 18000,
            reset_after_seconds: 60,
          },
          secondary_window: {
            used_percent: 80,
            limit_window_seconds: 604800,
            reset_at: 1800000000,
          },
        },
      },
      1000,
    ),
  ).toEqual({
    planType: 'plus',
    primary: { usedPercent: 25, windowSeconds: 18000, resetAt: 61000 },
    secondary: {
      usedPercent: 80,
      windowSeconds: 604800,
      resetAt: 1800000000000,
    },
  });
});

test('usage tolerates missing windows and fields, ISO and millisecond resets, and invalid data', () => {
  expect(parseUsage({ primary_window: { used_percent: 0 } })?.primary).toEqual({
    usedPercent: 0,
  });
  expect(
    parseUsage({
      rate_limit: {
        secondary_window: {
          used_percent: 105,
          reset_at: '2027-01-01T00:00:00Z',
        },
      },
    })?.secondary,
  ).toEqual({ usedPercent: 100, resetAt: 1798761600000 });
  expect(
    parseUsage({
      primary_window: { used_percent: 10, reset_at: 1800000000000 },
    })?.primary?.resetAt,
  ).toBe(1800000000000);
  for (const value of [
    null,
    {},
    [],
    { rate_limit: { primary_window: { used_percent: '10' } } },
    { primary_window: { used_percent: Number.NaN } },
  ])
    expect(parseUsage(value)).toBeUndefined();
});

test('headers read case-insensitively, convert minutes and resets, and ignore malformed/missing values', () => {
  expect(
    parseHeaders(
      new Headers({
        'X-Codex-Primary-Used-Percent': '12.5',
        'x-codex-primary-window-minutes': '300',
        'x-codex-primary-reset-at': '1800000000',
        'x-codex-secondary-used-percent': '0',
        'x-codex-secondary-reset-after-seconds': '30',
      }),
      1000,
    ),
  ).toEqual({
    primary: {
      usedPercent: 12.5,
      windowSeconds: 18000,
      resetAt: 1800000000000,
    },
    secondary: { usedPercent: 0, resetAt: 31000 },
  });
  expect(
    parseHeaders(
      new Headers({
        'x-codex-primary-used-percent': 'NaN',
        'x-codex-secondary-used-percent': '',
      }),
    ),
  ).toBeUndefined();
  expect(
    parseHeaders(
      new Headers({
        'x-codex-primary-used-percent': '5',
        'x-codex-primary-reset-after': '10',
      }),
      1000,
    )?.primary?.resetAt,
  ).toBe(11000);
});

test('WebSocket event parser accepts only codex.rate_limits and never throws on other frames', () => {
  expect(
    parseRateLimitEvent(
      JSON.stringify({
        type: 'codex.rate_limits',
        plan_type: 'pro',
        rate_limits: {
          primary: {
            used_percent: 90,
            window_minutes: 300,
            reset_at: 1800000000,
          },
        },
      }),
    ),
  ).toEqual({
    primary: { usedPercent: 90, windowSeconds: 18000, resetAt: 1800000000000 },
    planType: 'pro',
  });
  for (const frame of ['oops', '{}', '{"type":"response.completed"}', 'null'])
    expect(parseRateLimitEvent(frame)).toBeUndefined();
});
