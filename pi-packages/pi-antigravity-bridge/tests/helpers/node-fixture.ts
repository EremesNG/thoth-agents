import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Spawned through Node by the test-only child_process seam, never a shell. */
export function makeNodeFixture(source: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-node-fixture-"));
	const file = path.join(dir, "agy.mjs");
	fs.writeFileSync(file, `// pi-test-node-fixture\n${source}\n`);
	return file;
}
