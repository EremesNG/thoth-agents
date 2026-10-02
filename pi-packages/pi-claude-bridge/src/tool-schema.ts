type Schema = Record<string, unknown>;

function isSchema(value: unknown): value is Schema {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveLocalRef(root: Schema, ref: string): unknown {
	if (!ref.startsWith("#/$defs/") && !ref.startsWith("#/definitions/")) return undefined;
	let value: unknown = root;
	for (const segment of ref.slice(2).split("/")) {
		const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
		if (!isSchema(value) || !Object.hasOwn(value, key)) return undefined;
		value = value[key];
	}
	return value;
}

function isObjectSchema(schema: unknown, root: Schema, ancestors = new Set<Schema>()): boolean {
	if (!isSchema(schema) || ancestors.has(schema)) return false;
	if (schema.type === "object") return true;
	ancestors.add(schema);
	try {
		if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
			return schema.allOf.every((member) => isObjectSchema(member, root, ancestors));
		}
		return typeof schema.$ref === "string" && isObjectSchema(resolveLocalRef(root, schema.$ref), root, ancestors);
	} finally {
		ancestors.delete(schema);
	}
}

/** MCP requires an object root; Pi retains the original schema for validation. */
export function normalizeToolSchema(schema: unknown): Schema | undefined {
	if (!isSchema(schema)) return undefined;
	if (schema.type === "object") return schema;
	for (const keyword of ["anyOf", "oneOf"] as const) {
		const variants = schema[keyword];
		if (Array.isArray(variants) && variants.length > 0
			&& variants.every((variant) => isObjectSchema(variant, schema))) {
			return { ...schema, type: "object" };
		}
	}
	return undefined;
}
