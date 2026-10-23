import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelCallbackBatch,
  createCallbackBatcher,
  getCallbackBatcher,
  setCallbackBatchContext,
  type CallbackBatchEvent,
  type CallbackBatchHost,
  type CallbackBatcher,
} from "./shared-callback-batcher.js";

function event(id: string, extra: Partial<CallbackBatchEvent> = {}): CallbackBatchEvent {
  return { source: "background-task", id, label: id, status: "succeeded", detailTool: "bg_task_status", ...extra };
}

function recordingHost(events = {}) {
  const messages: Array<{ message: Parameters<CallbackBatchHost["sendMessage"]>[0]; options: Record<string, unknown> }> = [];
  const host: CallbackBatchHost = { events, sendMessage: (message, options) => { messages.push({ message, options }); } };
  return { host, messages };
}

const batchers = new Set<CallbackBatcher>();
function track(batcher: CallbackBatcher): CallbackBatcher { batchers.add(batcher); return batcher; }
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  for (const batcher of batchers) batcher.cancel();
  batchers.clear();
  vi.useRealTimers();
});

describe("ordinary callback availability", () => {
  it("holds time-separated busy completions and drains one aggregate after availability refresh", async () => {
    let idle = false;
    const { host, messages } = recordingHost();
    const delivered: string[] = [];
    const batcher = track(createCallbackBatcher(host, { windowMs: 25, retryMs: 100, isAvailable: () => idle }));
    for (const id of ["first", "second", "third"]) {
      batcher.enqueue(event(id, { onDelivered: () => { delivered.push(id); } }));
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(await batcher.flush()).toBe(false);
    expect(messages).toEqual([]);
    expect(delivered).toEqual([]);
    expect(batcher.pendingCount()).toBe(3);

    idle = true;
    batcher.setAvailability(() => idle);
    expect(messages).toEqual([]); // Never send reentrantly from a settled handler.
    await vi.advanceTimersByTimeAsync(24);
    expect(messages).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.message).toMatchObject({
      customType: "background-completion-batch", display: true,
      details: { kind: "batch", entries: [expect.objectContaining({ id: "first" }), expect.objectContaining({ id: "second" }), expect.objectContaining({ id: "third" })] },
    });
    expect(messages[0]!.message.content).toContain("3 background completions are ready");
    expect(messages[0]!.options).toEqual({ deliverAs: "followUp", triggerTurn: true });
    expect(delivered).toEqual(["first", "second", "third"]);
  });

  it("rechecks availability when a foreground run starts inside the debounce window", async () => {
    let idle = true;
    const { host, messages } = recordingHost();
    const batcher = track(createCallbackBatcher(host, { windowMs: 25, retryMs: 100, isAvailable: () => idle }));
    batcher.enqueue(event("debounce-race"));
    await vi.advanceTimersByTimeAsync(24);
    idle = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(messages).toEqual([]);
    expect(batcher.pendingCount()).toBe(1);
    idle = true;
    batcher.setAvailability(() => idle);
    await vi.advanceTimersByTimeAsync(25);
    expect(messages).toHaveLength(1);
  });

  it("recovers after manual compaction without any lifecycle event", async () => {
    let idle = false;
    const { host, messages } = recordingHost();
    const batcher = track(createCallbackBatcher(host, { windowMs: 25, retryMs: 100, isAvailable: () => idle }));
    batcher.enqueue(event("manual-compaction"));
    await vi.advanceTimersByTimeAsync(100);
    expect(messages).toEqual([]);
    idle = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(messages).toHaveLength(1);
    expect(batcher.pendingCount()).toBe(0);
  });

  it("defers a throwing context and rechecks suppression after availability recovers", async () => {
    let stale = true;
    let cancelled = false;
    const { host, messages } = recordingHost();
    const suppressed = vi.fn();
    const batcher = track(createCallbackBatcher(host, { isAvailable: () => {
      if (stale) throw new Error("reloaded context");
      return true;
    } }));
    batcher.enqueue(event("cancelled", { getSuppressionReason: () => cancelled ? "cancelled while busy" : undefined, onSuppressed: suppressed }));
    batcher.enqueue(event("remaining"));
    expect(await batcher.flush()).toBe(false);
    expect(messages).toEqual([]);
    cancelled = true;
    stale = false;
    expect(await batcher.flush()).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.message.content).not.toContain("id=cancelled");
    expect(suppressed).toHaveBeenCalledWith("cancelled while busy", expect.any(Number));
  });

  it("allows only one deferred-run handoff and stays latched indefinitely without an observed busy state", async () => {
    let idle = true;
    const { host, messages } = recordingHost();
    const batcher = track(createCallbackBatcher(host, { windowMs: 0, retryMs: 100, maxBytes: 700, isAvailable: () => idle }));
    for (const id of ["first", "overflow", "last"]) batcher.enqueue(event(id, { label: "x".repeat(160) }));
    await batcher.flush();
    expect(messages).toHaveLength(1);
    expect(batcher.pendingCount()).toBeGreaterThan(0);
    batcher.enqueue(event("arrival"));
    batcher.setAvailability(() => idle); // A second settled handler still sees idle.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await batcher.flush()).toBe(false);
    expect(messages).toHaveLength(1); // No timeout may duplicate the accepted deferred run.
    idle = false;
    batcher.setAvailability(() => idle);
    idle = true;
    batcher.setAvailability(() => idle);
    await vi.advanceTimersByTimeAsync(1);
    expect(messages).toHaveLength(2);
  });

  it("holds bounded overflow and later arrivals until the next observed run settles", async () => {
    let idle = false;
    const { host, messages } = recordingHost();
    const send = host.sendMessage;
    host.sendMessage = (message, options) => { idle = false; return send(message, options); };
    const delivered: string[] = [];
    const batcher = track(createCallbackBatcher(host, { windowMs: 25, retryMs: 100, maxBytes: 700, isAvailable: () => idle }));
    for (const id of ["a", "b", "c"]) batcher.enqueue(event(id, { label: "x".repeat(160), onDelivered: () => { delivered.push(id); } }));
    idle = true;
    batcher.setAvailability(() => idle);
    await vi.advanceTimersByTimeAsync(25);
    expect(messages).toHaveLength(1);
    expect(batcher.pendingCount()).toBeGreaterThan(0);
    expect(delivered.length).toBeLessThan(3);
    expect(messages[0]!.message.content).toContain("not receipted; still queued");
    batcher.enqueue(event("during-run", { onDelivered: () => { delivered.push("during-run"); } }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(messages).toHaveLength(1);
    for (let remainingRuns = 0; batcher.pendingCount() > 0 && remainingRuns < 4; remainingRuns++) {
      idle = true;
      batcher.setAvailability(() => idle);
      await vi.advanceTimersByTimeAsync(25);
    }
    expect(batcher.pendingCount()).toBe(0);
    expect(delivered.sort()).toEqual(["a", "b", "c", "during-run"]);
    expect(messages.every(({ message }) => new TextEncoder().encode(message.content).length <= 700)).toBe(true);
  });

  it("restores a failed handoff plus concurrent arrivals and resets the idle guard", async () => {
    const { host, messages } = recordingHost();
    let reject!: (error: Error) => void;
    const send = host.sendMessage;
    host.sendMessage = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; })).mockImplementation(send);
    const delivered: string[] = [];
    const batcher = track(createCallbackBatcher(host, { windowMs: 25, retryMs: 100, isAvailable: () => true }));
    batcher.enqueue(event("a", { onDelivered: () => { delivered.push("a"); } }));
    batcher.enqueue(event("b", { onDelivered: () => { delivered.push("b"); } }));
    const failed = batcher.flush();
    batcher.enqueue(event("c", { onDelivered: () => { delivered.push("c"); } }));
    expect(batcher.enqueue(event("a"))).toBe(false);
    reject(new Error("handoff failed"));
    expect(await failed).toBe(false);
    expect(delivered).toEqual([]);
    expect(batcher.pendingCount()).toBe(3);
    await vi.advanceTimersByTimeAsync(100);
    expect(messages).toHaveLength(1);
    expect(delivered).toEqual(["a", "b", "c"]);
    expect(messages[0]!.message.content).toContain("3 background completions are ready");
  });

  it("keeps urgent alerts immediate while ordinary delivery is busy or awaiting its run", async () => {
    let idle = false;
    const { host, messages } = recordingHost();
    const batcher = track(createCallbackBatcher(host, { isAvailable: () => idle }));
    batcher.enqueue(event("ordinary"));
    expect(await batcher.flush()).toBe(false);
    const urgent = (id: string) => ({ source: "background-task" as const, id, label: id, status: "lost", customType: "background-task-failure", content: "needs attention" });
    expect(await batcher.deliverUrgent(urgent("busy-alert"))).toBe(true);
    expect(messages).toHaveLength(1);
    idle = true;
    batcher.setAvailability(() => idle);
    await batcher.flush();
    expect(await batcher.deliverUrgent(urgent("deferred-alert"))).toBe(true);
    expect(messages.map(({ message }) => message.customType)).toEqual(["background-task-failure", "background-completion-batch", "background-task-failure"]);
  });
});

describe("shared queue identity", () => {
  it("shares API wrappers by event bus and refreshes the sender and context", async () => {
    const before = recordingHost();
    const after = recordingHost(before.host.events);
    const first = track(getCallbackBatcher(before.host));
    const second = track(getCallbackBatcher(after.host));
    expect(second).toBe(first);
    setCallbackBatchContext(before.host, { isIdle: () => false });
    first.enqueue(event("shared"));
    expect(await second.flush()).toBe(false);
    setCallbackBatchContext(after.host, { isIdle: () => true });
    await vi.advanceTimersByTimeAsync(100);
    expect(before.messages).toEqual([]);
    expect(after.messages).toHaveLength(1);
  });

  it("shares wrapped event buses through the lifecycle session-manager object", async () => {
    const before = recordingHost();
    const after = recordingHost();
    const sessionManager = {};
    setCallbackBatchContext(before.host, { sessionManager, isIdle: () => false });
    const first = track(getCallbackBatcher(before.host));
    first.enqueue(event("session-shared"));
    setCallbackBatchContext(after.host, { sessionManager, isIdle: () => true });
    const second = track(getCallbackBatcher(after.host));
    expect(second).toBe(first);
    await vi.advanceTimersByTimeAsync(100);
    expect(before.messages).toEqual([]);
    expect(after.messages).toHaveLength(1);
  });

  it("isolates distinct sessions and Pi instances even when callback IDs match", async () => {
    const busy = recordingHost();
    const idle = recordingHost();
    setCallbackBatchContext(busy.host, { sessionManager: {}, isIdle: () => false });
    setCallbackBatchContext(idle.host, { sessionManager: {}, isIdle: () => true });
    const busyBatcher = track(getCallbackBatcher(busy.host));
    const idleBatcher = track(getCallbackBatcher(idle.host));
    expect(busyBatcher).not.toBe(idleBatcher);
    busyBatcher.enqueue(event("same-id"));
    idleBatcher.enqueue(event("same-id"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(busy.messages).toEqual([]);
    expect(idle.messages).toHaveLength(1);
    expect(busyBatcher.pendingCount()).toBe(1);
  });

  it("cancels pending entries and disables delivery until a fresh context is installed", async () => {
    const { host, messages } = recordingHost();
    setCallbackBatchContext(host, { isIdle: () => true });
    const batcher = track(getCallbackBatcher(host));
    batcher.enqueue(event("old-pending"));
    cancelCallbackBatch(host);
    expect(batcher.pendingCount()).toBe(0);
    batcher.enqueue(event("late-old-callback"));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await batcher.flush()).toBe(false);
    expect(messages).toEqual([]);
    cancelCallbackBatch(host);
    setCallbackBatchContext(host, { isIdle: () => true });
    batcher.enqueue(event("fresh-replay"));
    await vi.advanceTimersByTimeAsync(100);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.message.content).toContain("fresh-replay");
    expect(messages[0]!.message.content).not.toContain("old");
  });
});
