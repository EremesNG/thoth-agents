import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

import backgroundTasksExtension from "./index.js";
import { readMeta, taskDir, writeMeta } from "./registry.js";
import { getCallbackBatcher } from "./shared-callback-batcher.js";

const origin = { cwd: process.cwd(), sessionId: "callback-reload-ownership" };
const ids: string[] = [];
interface LifecycleHost {
  pi: ExtensionAPI;
  messages: string[];
  events: EventEmitter;
  sessionManager: { getSessionId(): string };
  fire(type: string): Promise<void>;
}
const hosts: LifecycleHost[] = [];

function lifecycleHost(events = new EventEmitter(), sessionManager = { getSessionId: () => origin.sessionId }): LifecycleHost {
  const messages: string[] = [];
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
  const context = { cwd: origin.cwd, hasUI: false, mode: "print", sessionManager, isIdle: () => true };
  const pi = {
    events, registerTool() {}, registerCommand() {},
    on(name: string, handler: (event: unknown, ctx: unknown) => unknown) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return () => { const index = list.indexOf(handler); if (index >= 0) list.splice(index, 1); };
    },
    sendMessage(message: { content: string }) { messages.push(message.content); },
  } as unknown as ExtensionAPI;
  const host = { pi, messages, events, sessionManager, async fire(type: string) {
    for (const handler of [...handlers.get(type) ?? []]) await handler({ type, reason: "reload" }, context);
  } };
  hosts.push(host);
  return host;
}

function terminal(id: string) {
  ids.push(id);
  writeMeta({ id, kind: "process", status: "succeeded", startedAt: Date.now() - 1_000, endedAt: Date.now(),
    logPath: `${taskDir(id)}/output.log`, cwd: origin.cwd, callbackOrigin: origin, callback: true, spawnPid: process.pid });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
  vi.mocked(fs.renameSync).mockRestore();
  for (const host of hosts.splice(0)) {
    await host.fire("session_shutdown");
    getCallbackBatcher(host.pi).cancel();
  }
  for (const id of ids.splice(0)) fs.rmSync(taskDir(id), { recursive: true, force: true });
  vi.useRealTimers();
});

describe("durable callback reload ownership", () => {
  it.each([false, true])("cancels an already-queued callback and replays with fresh ownership (wrapped bus: %s)", async (wrappedBus) => {
    const before = lifecycleHost();
    backgroundTasksExtension(before.pi);
    terminal("bg_callback_queued_at_reload");
    await before.fire("session_start");
    expect(getCallbackBatcher(before.pi).pendingCount()).toBe(1);
    await before.fire("session_shutdown");
    expect(getCallbackBatcher(before.pi).pendingCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(before.messages).toEqual([]);
    expect(readMeta(ids[0]!)?.callbackSentAt).toBeUndefined();

    vi.resetModules();
    const fresh = await import("./index.js");
    const after = lifecycleHost(wrappedBus ? new EventEmitter() : before.events, before.sessionManager);
    fresh.default(after.pi);
    await after.fire("session_start");
    await vi.advanceTimersByTimeAsync(100);
    expect(after.messages).toHaveLength(1);
    expect(after.messages[0]).toContain(ids[0]);
    expect(readMeta(ids[0]!)?.callbackSentAt).toBeDefined();
    expect(readMeta(ids[0]!)?.callbackSuppressedAt).toBeUndefined();
    await after.fire("session_start");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(before.messages).toEqual([]);
    expect(after.messages).toHaveLength(1);
  });

  it("retains an accepted handoff after a receipt-write failure and reloads without resending it", async () => {
    const before = lifecycleHost();
    backgroundTasksExtension(before.pi);
    terminal("bg_callback_receipt_write_failed");
    await before.fire("session_start");
    vi.mocked(fs.renameSync).mockImplementationOnce(() => { throw new Error("receipt storage unavailable"); });
    expect(await getCallbackBatcher(before.pi).flush()).toBe(false);
    expect(before.messages).toHaveLength(1);
    expect(readMeta(ids[0]!)?.callbackSentAt).toBeUndefined();
    await before.fire("session_shutdown");
    terminal("bg_callback_fresh_after_reload");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(before.messages).toHaveLength(1);

    vi.resetModules();
    const fresh = await import("./index.js");
    const after = lifecycleHost(before.events, before.sessionManager);
    fresh.default(after.pi);
    await after.fire("session_start");
    await vi.advanceTimersByTimeAsync(100);
    expect(after.messages).toHaveLength(1);
    expect(after.messages[0]).toContain("bg_callback_fresh_after_reload");
    expect(after.messages[0]).not.toContain("bg_callback_receipt_write_failed");
    for (const id of ids) {
      expect(readMeta(id)?.callbackSentAt).toBeDefined();
      expect(readMeta(id)?.callbackSuppressedAt).toBeUndefined();
    }
    await vi.advanceTimersByTimeAsync(5_000);
    expect(before.messages).toHaveLength(1);
    expect(after.messages).toHaveLength(1);
  });
});
