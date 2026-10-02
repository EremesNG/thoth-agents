import assert from "node:assert/strict";
import { it as test } from "node:test";
import { normalizeToolSchema } from "../src/tool-schema.js";

// The ten eligibility fixtures shared with the Antigravity bridge (AC-3/AC-7).
test("tool-schema: plain object is unchanged", () => {
	const schema = { type: "object", properties: { action: { type: "string" } }, required: ["action"] };
	assert.equal(normalizeToolSchema(schema), schema);
});

test("tool-schema: anyOf of two objects is wrapped without changing the variants", () => {
	const schema = { anyOf: [
		{ type: "object", properties: { action: { const: "list" } }, required: ["action"] },
		{ type: "object", properties: { action: { const: "open" }, url: { type: "string" } }, required: ["action", "url"] },
	] };
	assert.deepEqual(normalizeToolSchema(schema), { type: "object", anyOf: [
		{ type: "object", properties: { action: { const: "list" } }, required: ["action"] },
		{ type: "object", properties: { action: { const: "open" }, url: { type: "string" } }, required: ["action", "url"] },
	] });
	assert.equal(normalizeToolSchema(schema).anyOf, schema.anyOf);
	assert.equal("type" in schema, false, "Pi's original schema must not be mutated");
});

test("tool-schema: oneOf of objects preserves root $defs, title and description", () => {
	const schema = {
		$defs: { label: { type: "string" } }, title: "Choose an action", description: "Action arguments",
		oneOf: [{ type: "object", properties: { label: { $ref: "#/$defs/label" } } }, { type: "object", properties: {} }],
	};
	assert.deepEqual(normalizeToolSchema(schema), {
		type: "object", $defs: { label: { type: "string" } }, title: "Choose an action", description: "Action arguments",
		oneOf: [{ type: "object", properties: { label: { $ref: "#/$defs/label" } } }, { type: "object", properties: {} }],
	});
	assert.equal(normalizeToolSchema(schema).oneOf, schema.oneOf);
});

test("tool-schema: anyOf accepts an allOf-of-objects variant", () => {
	const schema = { anyOf: [{ allOf: [{ type: "object", properties: { action: { type: "string" } } }, { type: "object", properties: { id: { type: "number" } } }] }, { type: "object" }] };
	assert.deepEqual(normalizeToolSchema(schema), { type: "object", anyOf: [
		{ allOf: [{ type: "object", properties: { action: { type: "string" } } }, { type: "object", properties: { id: { type: "number" } } }] }, { type: "object" },
	] });
});

test("tool-schema: anyOf accepts a local $ref to an object definition", () => {
	const schema = { $defs: { action: { type: "object", properties: { action: { type: "string" } } } }, anyOf: [{ $ref: "#/$defs/action" }, { type: "object" }] };
	assert.deepEqual(normalizeToolSchema(schema), {
		type: "object", $defs: { action: { type: "object", properties: { action: { type: "string" } } } }, anyOf: [{ $ref: "#/$defs/action" }, { type: "object" }],
	});
});

test("tool-schema: anyOf with a string variant is omitted", () => {
	assert.equal(normalizeToolSchema({ anyOf: [{ type: "object" }, { type: "string" }] }), undefined);
});

test("tool-schema: empty anyOf is omitted", () => {
	assert.equal(normalizeToolSchema({ anyOf: [] }), undefined);
});

test("tool-schema: anyOf with a dangling local $ref is omitted", () => {
	assert.equal(normalizeToolSchema({ anyOf: [{ $ref: "#/$defs/missing" }] }), undefined);
});

test("tool-schema: cyclic local $refs are omitted", () => {
	assert.equal(normalizeToolSchema({
		$defs: { a: { $ref: "#/$defs/b" }, b: { $ref: "#/$defs/a" } }, anyOf: [{ $ref: "#/$defs/a" }],
	}), undefined);
});

test("tool-schema: root string is omitted", () => {
	assert.equal(normalizeToolSchema({ type: "string" }), undefined);
});
