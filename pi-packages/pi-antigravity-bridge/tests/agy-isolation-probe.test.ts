import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { probeGeminiDirFlag, resetGeminiDirProbeCache, resolveStreamHomeMode } from "../src/gemini-dir-probe.js";
const roots: string[] = [];
afterEach(() => { resetGeminiDirProbeCache(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function binary(body: string): string {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-probe-test-")); roots.push(root);
 const bin = path.join(root, "agy.mjs"); fs.writeFileSync(bin, "// pi-test-node-fixture\n" + body); return bin;
}
test.each([
 ["console.log('1.5.8')", true, false],
 ["console.log('9.9.9')", true, true],
 ["console.log('dev')", true, true],
 ["console.error('warning: not defined'); console.log('1.5.8')", true, false],
 ["console.error('flag not defined'); process.exit(2)", false, false],
] as const)("capability probe handles %s", async (body, supported, unverifiedVersion) => {
 const r = await probeGeminiDirFlag(binary(body)); assert.equal(r.supported, supported); assert.equal(r.unverifiedVersion, unverifiedVersion);
 if (!supported) assert.equal(r.detail, "refused");
});
test("probe temp staging failure resolves unsupported", async () => {
 const bin = binary("console.log('1.5.8')");
 assert.equal((await probeGeminiDirFlag(bin, { tmpRoot: path.join(path.dirname(bin), "absent") })).detail, "spawn-failure");
});
test("probe timeout is bounded and unsupported", async () => {
 const bin = binary("setInterval(() => {}, 1000)");
 assert.equal((await probeGeminiDirFlag(bin, { watchdogMs: 50 })).detail, "timeout");
});
test("probe missing executable resolves unsupported", async () => {
 const bin = binary("");
 assert.equal((await probeGeminiDirFlag(bin + ".missing")).detail, "spawn-failure");
});
test("probe memoizes until reset", async () => {
 const bin = binary("console.log('1.5.8')");
 const first = await probeGeminiDirFlag(bin); assert.equal(await probeGeminiDirFlag(bin), first);
 resetGeminiDirProbeCache(); assert.notEqual(await probeGeminiDirFlag(bin), first);
});
test("AGY_AGENTS_ROOT wins over a supported probe", () => {
 assert.equal(resolveStreamHomeMode({ engine: "stream-json", agentsRootOverride: true, probe: { supported: true, unverifiedVersion: false } }), "override-skip");
 assert.equal(resolveStreamHomeMode({ engine: "stream-json", agentsRootOverride: false, probe: { supported: true, unverifiedVersion: false } }), "isolated");
 assert.equal(resolveStreamHomeMode({ engine: "stream-json", agentsRootOverride: false, probe: undefined }), "legacy");
 assert.equal(resolveStreamHomeMode({ engine: "acp", agentsRootOverride: false, probe: undefined }), "legacy");
});
