import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

// Bundling can lower case-level functions to lexical variables, introducing a
// cross-case TDZ even when source-level provider tests pass. Require a block.
function switchDeclarations(source: string, fileName = "fixture.ts"): string[] {
	const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const violations: string[] = [];
	function visit(node: ts.Node): void {
		if (ts.isCaseClause(node) || ts.isDefaultClause(node)) {
			for (const statement of node.statements) {
				const lexicalVariable = ts.isVariableStatement(statement)
					&& (statement.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0;
				if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || lexicalVariable) {
					const { line, character } = file.getLineAndCharacterOfPosition(statement.getStart(file));
					violations.push(`${fileName}:${line + 1}:${character + 1}: ${statement.getText(file)}`);
				}
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return violations;
}

function typescriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? typescriptFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
	});
}

describe("switch declaration regression guard", () => {
	for (const clause of ["case 1:", "default:"]) {
		test.each([
			"function acpEditFileArg() {}",
			"let lowered = function () {};",
			"const value = 1;",
			"class Value {}",
		])(`detects ${clause} %s`, (declaration) => {
			const source = `switch (kind) { ${clause} ${declaration} break; }`;
			expect(switchDeclarations(source)).toHaveLength(1);
		});
	}

	test("allows explicit blocks, module functions, var, and nested declarations", () => {
		const source = `
			function acpEditFileArg() {}
			switch (kind) {
				case 1: { let value = 1; const fn = function () {}; class Value {} break; }
				case 2: { function scoped() {} break; }
				default: var legacy = 1; (() => { const nested = 1; })(); break;
			}
		`;
		expect(switchDeclarations(source)).toEqual([]);
	});

	test("src and extensions have no declarations directly inside switch clauses", () => {
		const files = ["src", "extensions"].flatMap((directory) => typescriptFiles(join(packageRoot, directory)));
		expect(files.length).toBeGreaterThan(0);
		const violations = files.flatMap((file) => switchDeclarations(readFileSync(file, "utf8"), relative(packageRoot, file)));
		expect(violations, "Wrap each declaration's case body in braces or move it outside the switch").toEqual([]);
	});
});
