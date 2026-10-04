import assert from "node:assert/strict";
import { test } from "vitest";
import { formatDuration } from "../src/format-duration.js";

test.each([0, -0, -0.01, -1, -Number.MAX_VALUE, NaN, Infinity, -Infinity])(
	"formatDuration: zero or invalid %s ms is displayed as 0s",
	(ms) => {
		assert.equal(formatDuration(ms), "0s");
	},
);

test.each([
	[Number.MIN_VALUE, "0ms"],
	[0.5, "0ms"],
	[1, "1ms"],
	[123.99, "123ms"],
	[999, "999ms"],
	[999.999, "999ms"],
])("formatDuration: subsecond %s ms is floored to %s", (ms, expected) => {
	assert.equal(formatDuration(ms), expected);
});

test.each([
	[1000, "1s"],
	[1000.001, "1s"],
	[1049, "1s"],
	[1100, "1.1s"],
	[12345, "12.3s"],
	[45000, "45s"],
	[59949, "59.9s"],
	[59999.999, "60s"],
])("formatDuration: under a minute %s ms rounds to %s", (ms, expected) => {
	assert.equal(formatDuration(ms), expected);
});

test.each([
	[60000, "1m 00s"],
	[60000.001, "1m 00s"],
	[60999.999, "1m 00s"],
	[61000, "1m 01s"],
	[845000, "14m 05s"],
	[845999, "14m 05s"],
	[3599999.999, "59m 59s"],
])("formatDuration: under an hour %s ms floors seconds in %s", (ms, expected) => {
	assert.equal(formatDuration(ms), expected);
});

test.each([
	[3600000, "1h 00m"],
	[3600000.001, "1h 00m"],
	[3659999.999, "1h 00m"],
	[3660000, "1h 01m"],
	[7380000, "2h 03m"],
	[7439999.999, "2h 03m"],
	[86400000, "24h 00m"],
])("formatDuration: at least an hour %s ms floors minutes in %s", (ms, expected) => {
	assert.equal(formatDuration(ms), expected);
});

test("formatDuration: huge input calculates hours directly from milliseconds", () => {
	assert.equal(formatDuration(1e30), "2.7777777777777777e+23h 04m");
});
