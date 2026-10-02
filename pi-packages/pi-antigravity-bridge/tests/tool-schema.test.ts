import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeToolSchema } from "../src/tool-schema.js";

// The original ten eligibility fixtures and repair regressions are shared with
// the Claude bridge (AC-3/AC-7).
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
	assert.equal(normalizeToolSchema(schema)!.anyOf, schema.anyOf);
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
	assert.equal(normalizeToolSchema(schema)!.oneOf, schema.oneOf);
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

test.each([
	["anyOf with a string variant", { anyOf: [{ type: "object" }, { type: "string" }] }],
	["empty anyOf", { anyOf: [] }],
	["anyOf with a dangling $ref", { anyOf: [{ $ref: "#/$defs/missing" }] }],
	["cyclic $ref", { $defs: { a: { $ref: "#/$defs/b" }, b: { $ref: "#/$defs/a" } }, anyOf: [{ $ref: "#/$defs/a" }] }],
	["root type string", { type: "string" }],
])("tool-schema: %s is omitted", (_name, schema) => {
	assert.equal(normalizeToolSchema(schema), undefined);
});

test("tool-schema: typed root with an empty union is omitted", () => {
	for (const keyword of ["anyOf", "oneOf"]) {
		const schema = { type: "object", [keyword]: [] };
		assert.equal(normalizeToolSchema(schema), undefined);
	}
});

test("tool-schema: local $refs can traverse an allOf array index", () => {
	for (const definitions of ["$defs", "definitions"]) {
		const schema = {
			[definitions]: { shape: { allOf: [{ type: "object", properties: { action: { const: "list" } } }] } },
			anyOf: [{ $ref: `#/${definitions}/shape/allOf/0` }],
		};
		assert.deepEqual(normalizeToolSchema(schema), {
			type: "object", [definitions]: { shape: { allOf: [{ type: "object", properties: { action: { const: "list" } } }] } },
			anyOf: [{ $ref: `#/${definitions}/shape/allOf/0` }],
		});
	}
});

test("tool-schema: typed root with a mixed union is omitted", () => {
	for (const keyword of ["anyOf", "oneOf"]) {
		const schema = { type: "object", [keyword]: [{ type: "object" }, { type: "string" }] };
		assert.equal(normalizeToolSchema(schema), undefined);
	}
});

test("tool-schema: typed root with a dangling ref is omitted", () => {
	for (const keyword of ["anyOf", "oneOf"]) {
		const schema = { type: "object", [keyword]: [{ $ref: "#/$defs/missing" }] };
		assert.equal(normalizeToolSchema(schema), undefined);
	}
});

test("tool-schema: typed root with a cyclic ref is omitted", () => {
	for (const keyword of ["anyOf", "oneOf"]) {
		const schema = {
			type: "object", $defs: { a: { $ref: "#/$defs/b" }, b: { $ref: "#/$defs/a" } },
			[keyword]: [{ $ref: "#/$defs/a" }],
		};
		assert.equal(normalizeToolSchema(schema), undefined);
	}
});

test("tool-schema: an eligible union cannot mask an ineligible sibling", () => {
	const schema = { anyOf: [{ type: "object" }], oneOf: [{ type: "string" }] };
	assert.equal(normalizeToolSchema(schema), undefined);
	assert.equal(normalizeToolSchema({ ...schema, type: "object" }), undefined);
	assert.equal(normalizeToolSchema({ anyOf: [{ type: "string" }], oneOf: [{ type: "object" }] }), undefined);
});

test("tool-schema: both eligible root unions are kept", () => {
	const schema = { type: "object", title: "Choose an action", anyOf: [{ type: "object" }], oneOf: [{ type: "object" }] };
	const before = structuredClone(schema);
	const normalized = normalizeToolSchema(schema);
	// Antigravity keeps both combinators unchanged at the typed object root.
	assert.deepEqual(normalized, {
		type: "object", title: "Choose an action", anyOf: [{ type: "object" }], oneOf: [{ type: "object" }],
	});
	assert.equal(normalized, schema);
	assert.deepEqual(schema, before, "do not mutate Pi's schema");
});

test("tool-schema: local $refs unescape ~1 and ~0 in definition keys", () => {
	for (const definitions of ["$defs", "definitions"]) {
		const schema = {
			[definitions]: { "shape/with~key": { type: "object" } },
			anyOf: [{ $ref: `#/${definitions}/shape~1with~0key` }],
		};
		assert.deepEqual(normalizeToolSchema(schema), {
			type: "object", [definitions]: { "shape/with~key": { type: "object" } },
			anyOf: [{ $ref: `#/${definitions}/shape~1with~0key` }],
		});
	}
});

test("tool-schema: array-index refs still omit dangling and cyclic targets", () => {
	for (const definitions of ["$defs", "definitions"]) {
		for (const index of ["1", "01", "-", "length"]) {
			assert.equal(normalizeToolSchema({
				[definitions]: { shape: { allOf: [{ type: "object" }] } },
				anyOf: [{ $ref: `#/${definitions}/shape/allOf/${index}` }],
			}), undefined);
		}
		assert.equal(normalizeToolSchema({
			[definitions]: { shape: { allOf: [{ $ref: `#/${definitions}/shape/allOf/0` }] } },
			anyOf: [{ $ref: `#/${definitions}/shape/allOf/0` }],
		}), undefined);
	}
});
