import { describe, expect, it } from 'vitest';
import { formatDuration } from './duration.ts';

describe('formatDuration', () => {
  it.each([
    0,
    -0,
    -1,
    -0.1,
    Number.NaN,
    Infinity,
    -Infinity,
  ])('formats zero or invalid duration %s as 0s', (ms) => {
    expect(formatDuration(ms)).toBe('0s');
  });

  it.each([
    [Number.MIN_VALUE, '0ms'],
    [0.1, '0ms'],
    [1, '1ms'],
    [123.9, '123ms'],
    [999, '999ms'],
    [999.9, '999ms'],
  ])('floors sub-second duration %s to %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each([
    [1000, '1s'],
    [1001, '1s'],
    [1049, '1s'],
    [12345, '12.3s'],
    [45000, '45s'],
    [59949, '59.9s'],
    [59999.9, '60s'],
  ])('formats duration %s as compact seconds %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each([
    [60000, '1m 00s'],
    [60999.9, '1m 00s'],
    [61000, '1m 01s'],
    [845000, '14m 05s'],
    [845999.9, '14m 05s'],
    [3599999.9, '59m 59s'],
  ])('floors duration %s to minutes and padded seconds %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each([
    [3600000, '1h 00m'],
    [3659999.9, '1h 00m'],
    [3660000, '1h 01m'],
    [7380000, '2h 03m'],
    [7439999.9, '2h 03m'],
    [86399999, '23h 59m'],
    [86400000, '24h 00m'],
    [1e24, '277777777777777760h 24m'],
  ])('floors duration %s to hours and padded minutes %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
