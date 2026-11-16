import assert from "node:assert/strict";
import * as childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import * as ownedProcess from "../src/owned-process.js";
import { test, vi } from "vitest";
import { AcpDriver } from "../src/acp/driver.js";
import { completedChild, makeAgyRuntimeFixture } from "./helpers/agy-runtime-fixture.js";
import { resetAgyVersionCache } from "../src/agy-version.js";

test("native ACP abort during the version probe cannot launch a late owned agent", async () => {
 const fixture = makeAgyRuntimeFixture();
 const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null, signalCode: null, kill: () => true });
 const probe = vi.spyOn(childProcess, "spawn").mockReturnValue(child as any);
 const launch = vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementation(() => { throw new Error("late owned launch"); });
 const driver = new AcpDriver({ bin: fixture.binary, log: () => {} });
 const controller = new AbortController();
 try {
  const rejected = assert.rejects(driver.run({ cwd: fixture.root, model: "flash", mode: "accept-edits", skipPermissions: true, prompt: "hi", signal: controller.signal }), /abort|before prompt dispatch/);
  await vi.waitFor(() => assert.equal(probe.mock.calls.length, 1));
  controller.abort();
  child.stdout.write("1.5.8"); child.exitCode = 0; child.emit("close", 0, null);
  await rejected;
  assert.equal(launch.mock.calls.length, 0);
 } finally { await driver.close("shutdown"); probe.mockRestore(); launch.mockRestore(); resetAgyVersionCache(); fixture.cleanup(); }
});

test.each(["1.5.2", "1.5.3"])("native ACP gates CLI %s before owned agent launch", async (version) => {
 const fixture = makeAgyRuntimeFixture();
 const probe = vi.spyOn(childProcess, "spawn").mockImplementation(() => completedChild(version));
 const launch = vi.spyOn(ownedProcess, "spawnOwnedProcess").mockImplementation(() => { throw new Error("offline native launch"); });
 const driver = new AcpDriver({ bin: fixture.binary, log: () => {} });
 try {
  await assert.rejects(driver.run({ cwd: fixture.root, model: "gemini-3.8-flash", mode: "accept-edits", skipPermissions: true, prompt: "hi" }), version === "1.5.2" ? /1\.5\.3.*1\.5\.2/ : /offline native launch/);
  assert.equal(launch.mock.calls.length, version === "1.5.2" ? 0 : 1);
  if (version === "1.5.3") assert.deepEqual(launch.mock.calls[0][1], ["acp"]);
 } finally {
  await driver.close("shutdown"); probe.mockRestore(); launch.mockRestore(); resetAgyVersionCache(); fixture.cleanup();
 }
});
