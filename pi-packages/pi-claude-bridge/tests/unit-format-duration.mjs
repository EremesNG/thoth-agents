import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDuration } from "@thoth-agents/pi-core";

describe("formatDuration", () => {
	it("treats zero, negative, and non-finite durations as zero seconds", () => {
		for (const ms of [0, -0, -0.1, -1, -1000, NaN, Infinity, -Infinity]) {
			assert.equal(formatDuration(ms), "0s", `duration: ${ms}`);
		}
	});

	it("floors positive sub-second durations to milliseconds", () => {
		for (const [ms, expected] of [
			[Number.MIN_VALUE, "0ms"],
			[0.1, "0ms"],
			[1, "1ms"],
			[1.9, "1ms"],
			[999, "999ms"],
			[999.999, "999ms"],
		]) {
			assert.equal(formatDuration(ms), expected, `duration: ${ms}`);
		}
	});

	it("rounds seconds to one decimal below a minute and drops trailing .0", () => {
		for (const [ms, expected] of [
			[1000, "1s"],
			[1001, "1s"],
			[12345, "12.3s"],
			[12567, "12.6s"],
			[45000, "45s"],
			[59900, "59.9s"],
			[59999.999, "60s"],
		]) {
			assert.equal(formatDuration(ms), expected, `duration: ${ms}`);
		}
	});

	it("formats minutes with floored, zero-padded seconds below an hour", () => {
		for (const [ms, expected] of [
			[60000, "1m 00s"],
			[60001, "1m 00s"],
			[60999.999, "1m 00s"],
			[61000, "1m 01s"],
			[845000, "14m 05s"],
			[845999.999, "14m 05s"],
			[3599000, "59m 59s"],
			[3599999.999, "59m 59s"],
		]) {
			assert.equal(formatDuration(ms), expected, `duration: ${ms}`);
		}
	});

	it("formats hours with floored, zero-padded minutes without wrapping at a day", () => {
		for (const [ms, expected] of [
			[3600000, "1h 00m"],
			[3600001, "1h 00m"],
			[3659999.999, "1h 00m"],
			[3660000, "1h 01m"],
			[7380000, "2h 03m"],
			[7439999.999, "2h 03m"],
			[7440000, "2h 04m"],
			[86400000, "24h 00m"],
		]) {
			assert.equal(formatDuration(ms), expected, `duration: ${ms}`);
		}
	});
});
