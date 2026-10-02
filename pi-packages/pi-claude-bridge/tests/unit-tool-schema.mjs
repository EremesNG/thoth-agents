import assert from "node:assert/strict";
import { it as test } from "node:test";
import { normalizeToolSchema } from "../src/tool-schema.js";

// The original ten eligibility fixtures and repair regressions are shared with
// the Antigravity bridge (AC-3/AC-7).
// Eligibility is identical; only advertisement differs: Claude requires the
// union under a required `input` property, while Antigravity accepts it at root.
test("tool-schema: plain object is unchanged", () => {
	const schema = { type: "object", properties: { action: { type: "string" } }, required: ["action"] };
	assert.equal(normalizeToolSchema(schema), schema);
});

test("tool-schema: anyOf of two objects is wrapped without changing the variants", () => {
	const schema = { anyOf: [
		{ type: "object", properties: { action: { const: "list" } }, required: ["action"] },
		{ type: "object", properties: { action: { const: "open" }, url: { type: "string" } }, required: ["action", "url"] },
	] };
	assert.deepEqual(normalizeToolSchema(schema), { type: "object", properties: { input: { anyOf: [
		{ type: "object", properties: { action: { const: "list" } }, required: ["action"] },
		{ type: "object", properties: { action: { const: "open" }, url: { type: "string" } }, required: ["action", "url"] },
	] } }, required: ["input"] });
	assert.equal(normalizeToolSchema(schema).properties.input.anyOf, schema.anyOf);
	assert.equal("type" in schema, false, "Pi's original schema must not be mutated");
});

test("tool-schema: oneOf of objects preserves root $defs, title and description", () => {
	const schema = {
		$defs: { label: { type: "string" } }, title: "Choose an action", description: "Action arguments",
		oneOf: [{ type: "object", properties: { label: { $ref: "#/$defs/label" } } }, { type: "object", properties: {} }],
	};
	assert.deepEqual(normalizeToolSchema(schema), {
		type: "object", $defs: { label: { type: "string" } }, title: "Choose an action", description: "Action arguments",
		properties: { input: { oneOf: [{ type: "object", properties: { label: { $ref: "#/$defs/label" } } }, { type: "object", properties: {} }] } }, required: ["input"],
	});
	assert.equal(normalizeToolSchema(schema).properties.input.oneOf, schema.oneOf);
});

test("tool-schema: anyOf accepts an allOf-of-objects variant", () => {
	const schema = { anyOf: [{ allOf: [{ type: "object", properties: { action: { type: "string" } } }, { type: "object", properties: { id: { type: "number" } } }] }, { type: "object" }] };
	assert.deepEqual(normalizeToolSchema(schema), { type: "object", properties: { input: { anyOf: [
		{ allOf: [{ type: "object", properties: { action: { type: "string" } } }, { type: "object", properties: { id: { type: "number" } } }] }, { type: "object" },
	] } }, required: ["input"] });
});

test("tool-schema: anyOf accepts a local $ref to an object definition", () => {
	const schema = { $defs: { action: { type: "object", properties: { action: { type: "string" } } } }, anyOf: [{ $ref: "#/$defs/action" }, { type: "object" }] };
	assert.deepEqual(normalizeToolSchema(schema), {
		type: "object", $defs: { action: { type: "object", properties: { action: { type: "string" } } } },
		properties: { input: { anyOf: [{ $ref: "#/$defs/action" }, { type: "object" }] } }, required: ["input"],
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
			properties: { input: { anyOf: [{ $ref: `#/${definitions}/shape/allOf/0` }] } }, required: ["input"],
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
	// Both combinators constrain the same required input; neither remains at root.
	assert.deepEqual(normalized, {
		type: "object", title: "Choose an action",
		properties: { input: { anyOf: [{ type: "object" }], oneOf: [{ type: "object" }] } }, required: ["input"],
	});
	assert.equal(normalized.properties.input.anyOf, schema.anyOf);
	assert.equal(normalized.properties.input.oneOf, schema.oneOf);
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
			properties: { input: { anyOf: [{ $ref: `#/${definitions}/shape~1with~0key` }] } }, required: ["input"],
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

test("tool-schema: both root unions are nested, never leaving a Claude root combinator", () => {
	const schema = { type: "object", anyOf: [{ type: "object" }], oneOf: [{ type: "object" }] };
	assert.deepEqual(normalizeToolSchema(schema), {
		type: "object", properties: { input: { anyOf: [{ type: "object" }], oneOf: [{ type: "object" }] } }, required: ["input"],
	});
	assert.equal(normalizeToolSchema({ ...schema, oneOf: [{ type: "string" }] }), undefined);
});

for (const keyword of ["anyOf", "oneOf"]) {
	test(`tool-schema: a typed object root ${keyword} is still wrapped`, () => {
		const variants = [{ type: "object", properties: { action: { const: "list" } } }, { type: "object", properties: { action: { const: "open" } } }];
		const schema = { type: "object", [keyword]: variants };
		assert.deepEqual(normalizeToolSchema(schema), {
			type: "object", properties: { input: { [keyword]: variants } }, required: ["input"],
		});
		assert.equal(normalizeToolSchema(schema).properties.input[keyword], variants);
		assert.deepEqual(schema, { type: "object", [keyword]: variants }, "do not mutate Pi's schema");
	});

	test(`tool-schema: typed object root does not bypass ineligible ${keyword}`, () => {
		for (const variants of [[], [{ type: "object" }, { type: "string" }], [{ $ref: "#/$defs/missing" }]]) {
			assert.equal(normalizeToolSchema({ type: "object", [keyword]: variants }), undefined);
		}
	});
}
