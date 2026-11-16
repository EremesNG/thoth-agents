import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test, vi } from "vitest";
import * as owned from "../src/owned-process.js";
import * as termination from "../src/process-termination.js";
import { AcpConnection } from "../src/acp/connection.js";
import { StreamDriver } from "../src/driver.js";
import { stageAgyHome } from "../src/acp/home.js";
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
for (const engine of ["acp", "stream-json"] as const) test.each([true, false])(`${engine}: home survives exit/fenced termination and is removed only after close (Job=%s)`, async (jobBacked) => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-home-lifecycle-")); roots.push(root);
 const home = stageAgyHome({ geminiHome: path.join(root, ".gemini"), parentDir: root });
 const child = Object.assign(new EventEmitter(), { jobBacked, pid: undefined, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null, signalCode: null, kill: () => true });
 child.stdin.on("data", (data) => {
  if (engine === "acp") { const frame = JSON.parse(String(data)); child.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { protocolVersion: 1 } }) + "\n"); }
  else setImmediate(() => child.stdout.write(JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "ok" } }) + "\n"));
 });
 const spawn = vi.spyOn(owned, "spawnOwnedProcess").mockImplementation(() => { queueMicrotask(() => child.emit("spawn")); return child; });
 // A bounded/fenced termination can resolve without any terminal event.
 vi.spyOn(termination, "terminateProcessTree").mockResolvedValue();
 let stop: () => Promise<void>;
 if (engine === "acp") {
  const conn = new AcpConnection({ bin: "offline", cwd: root, stageHome: () => home, log: () => {}, onUpdate: () => {}, onExit: () => {} });
  await conn.start(); stop = () => conn.kill();
 } else {
  const driver = new StreamDriver(path.join(root, "bridge")); driver.stageHome = () => home;
  const handle = await driver.run({ cwd: root, model: "flash", mode: "accept-edits", skipPermissions: true, prompt: "hi", timeoutMin: 0, inactivityMin: 0 });
  await handle.outcome; stop = () => driver.close("shutdown");
 }
 const args = spawn.mock.calls[0][1]; assert.equal(args[args.indexOf(engine === "acp" ? "--gemini-dir" : "--gemini_dir") + 1], home);
 child.exitCode = 0; child.emit("exit", 0, null);
 assert.equal(fs.existsSync(home), true);
 await stop(); assert.equal(fs.existsSync(home), true, "fenced termination is not settlement evidence");
 child.emit("close", 0, null); assert.equal(fs.existsSync(home), false);
});
