import { afterEach, expect, test, vi } from "vitest";
import { AcpDriver } from "../src/acp/driver.js";

const mock = vi.hoisted(() => ({ update: undefined as undefined | ((sessionId: string, update: unknown) => void), finish: undefined as undefined | ((value: unknown) => void) }));
vi.mock("../src/acp/connection.js", () => ({
 AcpConnection: class {
  alive = true;
  agentInfo = {};
  constructor(opts: { onUpdate: typeof mock.update }) { mock.update = opts.onUpdate; }
  async start() { return this; }
  serverVersion() { return "test"; }
  async newSession() { return { sessionId: "session" }; }
  async setConfigOption() {}
  prompt(_id: unknown, _prompt: unknown, _images: unknown, _context: unknown, dispatched: () => void) {
   dispatched(); return new Promise(resolve => { mock.finish = resolve; });
  }
  abortAll() {}
  async kill() { this.alive = false; }
 },
}));

let driver: AcpDriver | undefined;
afterEach(async () => { mock.finish?.({ stopReason: "end_turn" }); await driver?.close("shutdown"); driver = undefined; vi.useRealTimers(); });
async function start(timeoutMin = 0) {
 vi.useFakeTimers();
 driver = new AcpDriver({ bin: "fake", binArgs: [], usageEstimate: "off" });
 const handle = await driver.run({ cwd: process.cwd(), model: "flash", mode: "accept-edits", skipPermissions: true, prompt: "hi", timeoutMin, inactivityMin: 1 / 60 });
 const settled = vi.fn(); void handle.outcome.then(settled);
 return { driver, handle, settled };
}
function update(id: string, status?: string) {
 mock.update!("session", status ? { sessionUpdate: "tool_call_update", toolCallId: id, status } : { sessionUpdate: "tool_call", toolCallId: id, name: "run_command" });
}

test("ACP: concurrent tools and parks suspend idle, including adopted completion", async () => {
 const { driver, handle, settled } = await start();
 update("a"); update("a"); update("b");
 await vi.advanceTimersByTimeAsync(2_000);
 handle.pushExternal({ type: "bridge_call", callId: "p", name: "bash", args: {} });
 driver.kickIdle(); update("a", "failed");
 await vi.advanceTimersByTimeAsync(2_000);
 expect(settled).not.toHaveBeenCalled();
 handle.pushExternal({ type: "bridge_call", callId: "p2", name: "bash", args: {} });
 update("adopted", "completed");
 await vi.advanceTimersByTimeAsync(2_000);
 expect(settled).not.toHaveBeenCalled();
 driver.kickIdle();
 await vi.advanceTimersByTimeAsync(999);
 expect(settled).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);
 expect(await handle.outcome).toMatchObject({ status: "ERROR", error: expect.stringContaining("stalled") });
});

test("ACP: native work does not pause overall cap", async () => {
 const { handle } = await start(2 / 60);
 update("a");
 await vi.advanceTimersByTimeAsync(2_000);
 expect(await handle.outcome).toMatchObject({ status: "ERROR", error: expect.stringContaining("deadline") });
});

test("ACP: last completion starts a full idle budget", async () => {
 const { handle, settled } = await start();
 update("a");
 await vi.advanceTimersByTimeAsync(3_000);
 update("a", "completed");
 await vi.advanceTimersByTimeAsync(999);
 expect(settled).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);
 expect(await handle.outcome).toMatchObject({ status: "ERROR", error: expect.stringContaining("stalled") });
});

test("ACP: an unfinished tool cannot suspend a subsequent turn", async () => {
 const { driver, handle } = await start();
 update("a");
 mock.finish!({ stopReason: "end_turn" });
 expect(await handle.outcome).toMatchObject({ status: "OK" });
 const next = await driver.run({ cwd: process.cwd(), model: "flash", mode: "accept-edits", skipPermissions: true, prompt: "next", timeoutMin: 0, inactivityMin: 1 / 60 });
 await vi.advanceTimersByTimeAsync(1_000);
 expect(await next.outcome).toMatchObject({ status: "ERROR", error: expect.stringContaining("stalled") });
});
