import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { afterEach, test, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { launchInJob, JobLauncherUnavailable } from "@thoth-agents/pi-core/windows-job";
import * as owned from "../src/owned-process.js";
import { StreamDriver } from "../src/driver.js";
import { AcpConnection } from "../src/acp/connection.js";
import { registerAskAntigravityTool } from "../src/ask-tool.js";
import { makeNodeFixture } from "./helpers/node-fixture.js";

vi.mock("@thoth-agents/pi-core/windows-job", async (original) => ({
	...await original<typeof import("@thoth-agents/pi-core/windows-job")>(), launchInJob: vi.fn(),
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const actualSpawn = owned.spawnOwnedProcess;

for (const mode of ["plain", "Windows fallback"] as const) {
	for (const caller of ["stream", "AskAntigravity", "ACP"] as const) {
		test.skipIf(mode === "Windows fallback" && process.platform !== "win32")(`${caller} ${mode} settles while a descendant retains inherited pipes`, async () => {
			const bin = makeNodeFixture(`import {spawn} from 'node:child_process';import fs from 'node:fs';
const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,windowsHide:true,stdio:['ignore',1,2]});
fs.writeFileSync(new URL('./descendant.pid',import.meta.url),String(p.pid));process.exit(0);`);
			let child!: owned.OwnedProcess;
			vi.mocked(launchInJob).mockRejectedValue(new JobLauncherUnavailable("inherited-pipe fixture"));
			vi.spyOn(owned, "spawnOwnedProcess").mockImplementation((_file, _args, options) => {
				child = mode === "plain"
					? spawn(process.execPath, [bin], { cwd: options?.cwd, detached: process.platform !== "win32", windowsHide: true, stdio: "pipe" }) as owned.OwnedProcess
					: actualSpawn(process.execPath, [bin], { ...options, log: () => {} });
				return child;
			});
			let cleanup = async () => {};
			try {
				let run: Promise<any>;
				if (caller === "stream") {
					const driver = new StreamDriver();
					cleanup = () => driver.close("shutdown");
					const handle = await driver.run({ cwd: process.cwd(), model: "gemini-3.6-flash", mode: "accept-edits", skipPermissions: true, prompt: "hi", timeoutMin: 0, inactivityMin: 0 });
					run = handle.outcome;
				} else if (caller === "ACP") {
					const conn = new AcpConnection({ cwd: process.cwd(), bin: process.execPath, log: () => {}, onUpdate: () => {}, onExit: () => {} });
					cleanup = () => conn.kill();
					run = conn.start().then(() => "unexpected success", () => "exited");
				} else {
					let tool: any;
					await registerAskAntigravityTool({ registerTool: (t: unknown) => { tool = t; } } as unknown as ExtensionAPI, [], undefined, "private");
					run = tool.execute("pipes", { prompt: "hi", conversationId: "pipes" }, undefined, undefined, { cwd: process.cwd() });
				}
				await once(child, "exit");
				assert.equal(child.stdout.readableEnded, false, "descendant must still retain stdout");
				let timer: ReturnType<typeof setTimeout> | undefined;
				try {
					const result = await Promise.race([run, new Promise((resolve) => { timer = setTimeout(() => resolve("unsettled"), 300); })]);
					assert.notEqual(result, "unsettled");
					if (caller === "stream") assert.equal(result.status, "ERROR");
					else if (caller === "ACP") assert.equal(result, "exited");
					else assert.equal(result.details.exitCode, 0);
				} finally { clearTimeout(timer); }
			} finally {
				const pidFile = path.join(path.dirname(bin), "descendant.pid");
				if (fs.existsSync(pidFile)) { try { process.kill(Number(fs.readFileSync(pidFile, "utf8"))); } catch { /* already gone */ } }
				await cleanup();
				child?.stdout.destroy(); child?.stderr.destroy(); child?.stdin?.destroy();
				fs.rmSync(path.dirname(bin), { recursive: true, force: true });
			}
		}, 10_000);
	}
}
