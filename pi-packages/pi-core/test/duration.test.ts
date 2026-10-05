import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/index.js';

describe('formatDuration', () => {
  it.each([
    [NaN, '0s'],
    [Infinity, '0s'],
    [-1, '0s'],
    [0, '0s'],
    [0.5, '0ms'],
    [999.9, '999ms'],
    [1000, '1s'],
    [1250, '1.3s'],
    [59_999, '60s'],
    [60_000, '1m 00s'],
    [61_999, '1m 01s'],
    [3_599_999, '59m 59s'],
    [3_600_000, '1h 00m'],
    [7_260_000, '2h 01m'],
  ])('formats %s milliseconds as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
