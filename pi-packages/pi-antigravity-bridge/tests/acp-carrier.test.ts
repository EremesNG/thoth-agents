import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test, vi } from "vitest";
import { parse } from "yaml";
import * as owned from "../src/owned-process.js";
import { AcpConnection } from "../src/acp/connection.js";
import { stageAgyHome } from "../src/acp/home.js";
import { syspromptAgentMd } from "../src/sysprompt-agent.js";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-carrier-")); roots.push(root);
 const child = Object.assign(new EventEmitter(), { jobBacked: false, pid: undefined, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, kill: () => true });
 child.stdin.on("data", (data) => { const frame = JSON.parse(String(data)); child.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { protocolVersion: 1 } }) + "\n"); });
 return { root, child };
}

test.each([false, true])("ACP carrier is visible before spawn in its own home (linked agents=%s), not the global agents", async (linked) => {
 const { root, child } = fixture(); const geminiHome = path.join(root, "global");
 const globalAgents = path.join(geminiHome, "config", "agents");
 if (linked) { fs.mkdirSync(path.join(globalAgents, "user"), { recursive: true }); fs.writeFileSync(path.join(globalAgents, "user", "agent.md"), "user agent"); }
 const home = stageAgyHome({ geminiHome, parentDir: root });
 let name = "";
 vi.spyOn(owned, "spawnOwnedProcess").mockImplementation((_command, args) => {
  assert.ok(args.includes("--agent")); name = args[args.indexOf("--agent") + 1];
  assert.equal(args[args.indexOf("--gemini-dir") + 1], home);
  const md = fs.readFileSync(path.join(home, "config", "agents", name, "agent.md"), "utf8");
  const front = parse(md.split("---")[1]);
  assert.deepEqual(front, parse(syspromptAgentMd(name, "unused").split("---")[1]));
  assert.equal(front.mainAgent, true); assert.equal(front.model, "inherit"); assert.equal(front.subagent, false); assert.deepEqual(front.agents, []);
  assert.deepEqual(front.tools, ["read_file", "edit_file", "write_file", "run_command", "manage_task", "search_web"]);
  assert.ok(md.split("---")[2].trim().length < 120);
  assert.equal(fs.existsSync(path.join(globalAgents, name)), false);
  if (linked) assert.equal(fs.readFileSync(path.join(home, "config", "agents", "user", "agent.md"), "utf8"), "user agent");
  return child;
 });
 const conn = new AcpConnection({ cwd: root, bin: "offline", stageHome: () => home, log: () => {}, onUpdate: () => {}, onExit: () => {} });
 await conn.start(); await conn.start();
 assert.equal(vi.mocked(owned.spawnOwnedProcess).mock.calls.length, 1, "carrier does not respawn or drift");
 child.emit("close", 0, null);
 assert.equal(fs.existsSync(home), false);
 if (linked) assert.deepEqual(fs.readdirSync(globalAgents), ["user"]);
});

test("ACP carrier write failure warns and launches without --agent; bypass writes no carrier", async () => {
 const { root, child } = fixture();
 const home = stageAgyHome({ geminiHome: path.join(root, "global"), parentDir: root });
 const write = fs.writeFileSync;
 vi.spyOn(fs, "writeFileSync").mockImplementation((file, ...args) => {
  if (String(file).endsWith("agent.md")) throw new Error("denied");
  return (write as any)(file, ...args);
 });
 const logs: string[] = [];
 const spawn = vi.spyOn(owned, "spawnOwnedProcess").mockImplementation((_command, args) => { assert.equal(args.includes("--agent"), false); return child; });
 const options = { cwd: root, bin: "offline", log: (message: string) => { logs.push(message); }, onUpdate: () => {}, onExit: () => {} };
 await new AcpConnection({ ...options, stageHome: () => home }).start();
 assert.ok(logs.includes("carrier-staging-warning"));
 await new AcpConnection(options).start();
 assert.equal(spawn.mock.calls[1][1].includes("--gemini-dir"), false);
 child.emit("close", 0, null);
});
