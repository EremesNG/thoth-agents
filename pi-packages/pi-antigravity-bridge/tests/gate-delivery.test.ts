// Merge + read-back verification of owned hook groups (agy-upstream-safety-sync).
//
// Run: npm test

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { homeHooksFile, mergeOwnedHookGroups, verifyOwnedHookGroups, type OwnedHookSpec } from "../src/gate-delivery.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "gate-delivery-")); dirs.push(d); return d; };

function spec(dir: string, key: string, source = "// handler\n"): OwnedHookSpec {
	const scriptPath = path.join(dir, `${key}.mjs`);
	fs.writeFileSync(scriptPath, source);
	return {
		label: key,
		groupKey: key,
		group: { enabled: true, PreToolUse: [{ matcher: ".*", hooks: [{ type: "command", command: `node ${JSON.stringify(scriptPath)}`, timeout: 540 }] }] },
		scriptPath,
		scriptSource: source,
	};
}

test("homeHooksFile points at config/hooks.json inside the staged home", () => {
	assert.equal(homeHooksFile("/h"), path.join("/h", "config", "hooks.json"));
});

test("merge preserves foreign groups (BOM tolerant) and replaces only owned keys", () => {
	const dir = tmp();
	const file = homeHooksFile(dir);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `\uFEFF${JSON.stringify({ foreign: { enabled: true }, owned: { stale: true } })}`);
	const owned = spec(dir, "owned");
	mergeOwnedHookGroups(file, [owned]);
	const merged = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
	assert.deepEqual(merged.foreign, { enabled: true });
	assert.deepEqual(merged.owned, owned.group);
});

test("merge over an unparsable or absent file leaves only the owned groups", () => {
	const dir = tmp();
	const file = homeHooksFile(dir);
	mergeOwnedHookGroups(file, [spec(dir, "a")]);
	assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, "utf8"))), ["a"]);
	fs.writeFileSync(file, "{broken");
	mergeOwnedHookGroups(file, [spec(dir, "b")]);
	assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, "utf8"))), ["b"]);
});

test("verify: usable group + matching handler passes; each defect is a distinct refusal reason", () => {
	const dir = tmp();
	const file = homeHooksFile(dir);
	const a = spec(dir, "a");
	mergeOwnedHookGroups(file, [a]);
	assert.equal(verifyOwnedHookGroups(file, [a]).get("a"), null);

	// missing group
	assert.match(verifyOwnedHookGroups(file, [spec(dir, "other")]).get("other")!, /group other is missing/);
	// malformed group
	fs.writeFileSync(file, JSON.stringify({ a: { enabled: true } }));
	assert.match(verifyOwnedHookGroups(file, [a]).get("a")!, /malformed or does not match/);
	// missing handler
	mergeOwnedHookGroups(file, [a]);
	fs.rmSync(a.scriptPath);
	assert.match(verifyOwnedHookGroups(file, [a]).get("a")!, /handler .* missing or unreadable/);
	// mismatched handler
	fs.writeFileSync(a.scriptPath, "// other\n");
	assert.match(verifyOwnedHookGroups(file, [a]).get("a")!, /does not match this instance/);
	// unreadable / invalid file
	assert.match(verifyOwnedHookGroups(path.join(dir, "nope.json"), [a]).get("a")!, /not readable/);
	fs.writeFileSync(file, "[]");
	assert.match(verifyOwnedHookGroups(file, [a]).get("a")!, /not a valid hooks object/);
});

test("verify reports gate and guard independently", () => {
	const dir = tmp();
	const file = homeHooksFile(dir);
	const gate = spec(dir, "gate");
	const guard = spec(dir, "guard");
	mergeOwnedHookGroups(file, [gate, guard]);
	fs.rmSync(guard.scriptPath);
	const result = verifyOwnedHookGroups(file, [gate, guard]);
	assert.equal(result.get("gate"), null);
	assert.match(result.get("guard")!, /missing or unreadable/);
});
