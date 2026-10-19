import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "vitest";
import { terminateProcessTree } from "../src/process-termination.js";

test.skipIf(process.platform !== "win32")("plain Windows processes terminate only their owned leader", async () => {
	const child = spawn(process.execPath, ["-e", `const {spawn}=require('node:child_process'); const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true,detached:true});console.log(p.pid);setInterval(()=>{},1000);`], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
	let descendant = 0;
	try {
		descendant = Number(String((await once(child.stdout!, "data"))[0]).trim());
		await terminateProcessTree(child);
		assert.doesNotThrow(() => process.kill(descendant, 0));
	} finally {
		child.kill();
		if (descendant) { try { process.kill(descendant); } catch { /* gone */ } }
	}
}, 10_000);
