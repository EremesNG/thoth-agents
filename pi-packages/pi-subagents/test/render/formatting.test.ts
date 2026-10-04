import { describe, expect, it } from 'vitest';
import { formatDuration } from '../../src/render/tools/formatting.js';

describe('formatDuration', () => {
  it.each([
    0,
    -0,
    -1,
    -0.1,
    NaN,
    Infinity,
    -Infinity,
  ])('formats zero or invalid duration %s as 0s', (milliseconds) => {
    expect(formatDuration(milliseconds)).toBe('0s');
  });

  it.each<[number, string]>([
    [0.1, '0ms'],
    [1, '1ms'],
    [999, '999ms'],
    [999.9, '999ms'],
    [1000, '1s'],
    [1000.1, '1s'],
    [1500, '1.5s'],
    [12_345, '12.3s'],
    [45_000, '45s'],
    [59_999, '60s'],
    [59_999.9, '60s'],
  ])('formats sub-minute duration %s as %s', (milliseconds, expected) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });

  it.each<[number, string]>([
    [60_000, '1m 00s'],
    [60_000.1, '1m 00s'],
    [60_999, '1m 00s'],
    [61_000, '1m 01s'],
    [845_000, '14m 05s'],
    [845_999, '14m 05s'],
    [3_599_999, '59m 59s'],
    [3_599_999.9, '59m 59s'],
  ])('formats minute duration %s as %s', (milliseconds, expected) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });

  it.each<[number, string]>([
    [3_600_000, '1h 00m'],
    [3_600_000.1, '1h 00m'],
    [3_659_999, '1h 00m'],
    [3_660_000, '1h 01m'],
    [7_380_000, '2h 03m'],
    [7_439_999, '2h 03m'],
    [7_440_000, '2h 04m'],
    [86_400_000, '24h 00m'],
  ])('formats hour duration %s as %s', (milliseconds, expected) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });
});
