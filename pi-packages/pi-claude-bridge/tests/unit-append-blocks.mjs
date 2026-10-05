import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffBlocks, segment, splitParts } from "../src/append-blocks.js";
import { projectedAppend, taskBlock } from "./fixtures/append-instructions.mjs";

const slices = (parts) =>
	parts
		.map((part) => part.slice(part.indexOf("\n\n") + 2, part.lastIndexOf("\n</claude-bridge-appended-instructions>")))
		.join("");

describe("size-bounded append updates", () => {
	it("bounds every framed value, numbers all parts and preserves every string-length unit", () => {
		for (const payload of ["", "small", "x".repeat(9_000), "x".repeat(90_000), "😀".repeat(15_000)]) {
			const parts = splitParts(payload, 9_000);
			assert.equal(slices(parts), payload);
			parts.forEach((part, index) => {
				assert.ok(part.length <= 9_000);
				assert.ok(part.startsWith(`<claude-bridge-appended-instructions>\nPart ${index + 1}/${parts.length}`));
				assert.doesNotMatch(part, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
			});
		}
		assert.throws(() => splitParts("hello", 1), RangeError);
	});
});

describe("projected append blocks", () => {
	it("changes only a small extension block beyond a large static project context", () => {
		const before = projectedAppend("A");
		const after = projectedAppend("B");
		assert.ok(after.length > 10_000);
		assert.ok(after.indexOf(taskBlock("B")) > 2_000);
		const segmented = segment(after);
		assert.equal(segmented.ambiguous, false);
		assert.ok(segmented.blocks.some((block) => block.key === 'xml:project_instructions:path="/workspace/AGENTS.md"'));
		assert.ok(segmented.blocks.some((block) => block.key === "comment:thoth-agents:pi-root"));
		assert.deepEqual(diffBlocks(before, after), {
			full: false,
			blocks: [{ key: "xml:thoth-todo-open-tasks", text: taskBlock("B") }],
			removed: [],
		});
	});

	it("keys generic regions, XML identities, nested same-tag elements and ordinal free-text runs", () => {
		const text = [
			"Host prose with inline <not-a-block>",
			'<instructions name="host > default">\n<instructions>nested</instructions>\n</instructions>',
			"Other prose",
			"<!-- extension:rules:start -->\nopaque <example>\n<!-- extension:rules:end -->",
			"<config path='/a' name='ignored' />",
		].join("\r\n");
		const result = segment(text);
		assert.equal(result.ambiguous, false);
		assert.deepEqual(
			result.blocks.map((block) => block.key),
			["free:1", 'xml:instructions:name="host > default"', "free:2", "comment:extension:rules", 'xml:config:path="/a"'],
		);
		assert.match(result.blocks[1].text, /<instructions>nested<\/instructions>/);
	});

	it("recurses only one level into project context, keeping child bodies opaque", () => {
		const before =
			'<project_context>\nGuidance:\n<project_instructions path="/a">\n<example>not XML\n</project_instructions>\n<project_instructions path="/b">B</project_instructions>\n</project_context>';
		const after = before.replace("not XML", "changed prose");
		const change = diffBlocks(before, after);
		assert.equal(change.full, false);
		assert.deepEqual(change.blocks, [
			{
				key: 'xml:project_instructions:path="/a"',
				text: '<project_instructions path="/a">\n<example>changed prose\n</project_instructions>',
			},
		]);
		assert.deepEqual(change.removed, []);
	});

	it("reports additions, removals, empty current append, free text changes and retained-key order", () => {
		assert.deepEqual(diffBlocks("<a>A</a>\n<b>B</b>", "<a>A</a>\n<c>C</c>"), {
			full: false,
			blocks: [{ key: "xml:c", text: "<c>C</c>" }],
			removed: ["xml:b"],
		});
		assert.deepEqual(diffBlocks("<a>A</a>\n<b>B</b>", ""), { full: false, blocks: [], removed: ["xml:a", "xml:b"] });
		assert.deepEqual(diffBlocks("Host=A", "Host=B"), {
			full: false,
			blocks: [{ key: "free:1", text: "Host=B" }],
			removed: [],
		});
		assert.deepEqual(diffBlocks("<a>A</a>\n<b>B</b>", "<b>B</b>\n<a>A</a>"), {
			full: true,
			blocks: [{ key: "full", text: "<b>B</b>\n<a>A</a>" }],
			removed: [],
		});
		assert.equal(diffBlocks("<a>A</a>\n<b>B</b>", "<a>A</a>\n<c>C</c>\n<b>B</b>").full, false);
	});

	for (const text of [
		"<rules>A</rules>\n<rules>B</rules>",
		"<rules>missing end",
		"<rules>invalid closing tag</rules extra>",
		"<!-- rules:start -->A<!-- rules:end -->\n<!-- rules:start -->B<!-- rules:end -->",
		'<project_context>\n<project_instructions path="/a">A</project_instructions>\n<project_instructions path="/a">B</project_instructions>\n</project_context>',
		"</rules>",
		"<!-- rules:start -->\nwrong end\n<!-- other:end -->",
		"<!-- rules:end -->",
		'<rules name="unterminated>bad</rules>',
		'<rules path="/a" path="/b">ambiguous identity</rules>',
	]) {
		it(`falls back to one full block for ambiguous input ${JSON.stringify(text)}`, () => {
			assert.deepEqual(segment(text), { ambiguous: true, blocks: [{ key: "full", text }] });
			assert.equal(diffBlocks("<valid>A</valid>", text).full, true);
			assert.equal(diffBlocks(text, "<valid>B</valid>").full, true);
		});
	}
});
