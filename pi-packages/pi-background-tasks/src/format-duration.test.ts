import { describe, expect, it } from "vitest";
import { formatDuration } from "./format-duration.js";

describe("formatDuration", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -0.5, -60_000, -0, 0])(
    "treats invalid or zero duration %s as 0s",
    (ms) => {
      expect(formatDuration(ms)).toBe("0s");
    },
  );

  it.each<[number, string]>([
    [0.1, "0ms"],
    [1, "1ms"],
    [123.999, "123ms"],
    [999, "999ms"],
    [999.999, "999ms"],
  ])("floors sub-second duration %s to %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each<[number, string]>([
    [1_000, "1s"],
    [1_001, "1s"],
    [1_049, "1s"],
    [1_051, "1.1s"],
    [12_345, "12.3s"],
    [12_567, "12.6s"],
    [45_000, "45s"],
    [59_949, "59.9s"],
    [59_999, "60s"],
  ])("formats seconds duration %s as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each<[number, string]>([
    [60_000, "1m 00s"],
    [60_001, "1m 00s"],
    [60_999.999, "1m 00s"],
    [61_000, "1m 01s"],
    [845_000, "14m 05s"],
    [845_999, "14m 05s"],
    [3_599_999.999, "59m 59s"],
  ])("formats minutes duration %s as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each<[number, string]>([
    [3_600_000, "1h 00m"],
    [3_600_001, "1h 00m"],
    [3_659_999, "1h 00m"],
    [3_660_000, "1h 01m"],
    [7_380_000, "2h 03m"],
    [7_439_999, "2h 03m"],
    [86_400_000, "24h 00m"],
  ])("formats hours duration %s as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
