import { describe, expect, it, vi } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  createCallbackBatcher,
  packCallbackBatch,
  packUrgentCallback,
  type CallbackBatchEvent,
  type UrgentCallbackEvent,
} from "../shared-callback-batcher.js";
import { renderBackgroundMessage } from "./messages.js";

const theme = { fg: (color: string, text: string) => `[${color === "error" ? 31 : 36}m${text}[0m`, bold: (text: string) => text };
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const strip = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, "").replace(/<\/?[a-zA-Z]+>/g, "");

function event(n: number, extra: Partial<CallbackBatchEvent> = {}): CallbackBatchEvent {
  return { source: "background-task", id: `bg_${n}`, label: `job ${n}`, status: "completed", detailTool: "bg_task_status", outcome: "exit 0", ...extra };
}

describe("notification details", () => {
  it("keeps content and options unchanged and adds details for the packed entries in order", async () => {
    const sent: Array<{ message: Record<string, unknown>; options: unknown }> = [];
    const batcher = createCallbackBatcher({ sendMessage: (message, options) => { sent.push({ message: message as never, options }); } }, { windowMs: 0 });
    batcher.enqueue(event(1));
    batcher.enqueue(event(2, { status: "failed", outcome: "exit 3", decision: "matched condition", failureRows: ["row a", "row b"], incidentCount: 5 }));
    await batcher.flush();
    const { message, options } = sent[0]!;
    expect(options).toEqual({ deliverAs: "followUp", triggerTurn: true });
    expect(message.customType).toBe("background-completion-batch");
    expect(message.display).toBe(true);
    expect(Object.keys(message).sort()).toEqual(["content", "customType", "details", "display"]);
    const packed = packCallbackBatch([event(1), event(2, { status: "failed", outcome: "exit 3", decision: "matched condition", failureRows: ["row a", "row b"], incidentCount: 5 })]);
    expect(message.content).toBe(packed.text);
    const details = message.details as ReturnType<typeof packCallbackBatch>["details"];
    expect(details.entries.map((e) => e.id)).toEqual(packed.represented.map((e) => e.id));
    expect(details.entries[1]).toMatchObject({ id: "bg_2", label: "job 2", status: "failed", outcome: "exit 3", decision: "matched condition", rows: ["row a", "row b"], incidents: { total: 5, shown: 2, omitted: 3 } });
    expect(JSON.parse(JSON.stringify(details))).toEqual(details);
    expect(JSON.stringify(details)).not.toContain("isDelivered");
  });

  it("counts omitted completions and bounds details at 2 KiB and 8 KiB", () => {
    for (const maxBytes of [2048, 8192]) {
      const events = Array.from({ length: 80 }, (_, i) => event(i, { label: `label ${"x".repeat(150)} ${i}`, decision: "d".repeat(500), failureRows: Array.from({ length: 6 }, (_, r) => `incident ${r} ${"é".repeat(120)}`) }));
      const packed = packCallbackBatch(events, { maxBytes });
      expect(packed.omitted).toBeGreaterThan(0);
      expect(packed.details.omitted).toBe(packed.omitted);
      expect(packed.details.entries.length + packed.details.unlisted).toBe(packed.represented.length);
      expect(bytes(packed.details)).toBeLessThanOrEqual(maxBytes);
    }
  });

  it("bounds a single long-incident event", () => {
    const long = event(1, { status: "failed", failureRows: ["q\"\\n".repeat(900)], incidentCount: 40, decision: "z".repeat(3000) });
    for (const maxBytes of [2048, 8192]) {
      const packed = packCallbackBatch([long, event(2)], { maxBytes });
      expect(bytes(packed.details)).toBeLessThanOrEqual(maxBytes);
      expect(packed.details.entries[0]?.incidents?.total).toBe(40);
    }
  });

  it("projects urgent failures with inspectId and shown rows", async () => {
    const urgent: UrgentCallbackEvent = {
      source: "background-task", id: "failure:bg_9:k", inspectId: "bg_9", label: "build", status: "failure",
      customType: "background-task-failure", content: "still running with 2 failure observations", detailTool: "bg_task_status",
      failureRows: ["first", "second"], incidentCount: 2,
    };
    const sent: Array<Record<string, unknown>> = [];
    const options: unknown[] = [];
    const batcher = createCallbackBatcher({ sendMessage: (m, o) => { sent.push(m as never); options.push(o); } });
    await batcher.deliverUrgent(urgent);
    const packed = packUrgentCallback(urgent);
    expect(sent[0]).toMatchObject({ customType: "background-task-failure", content: packed.text, display: true });
    expect(options[0]).toEqual({ deliverAs: "followUp", triggerTurn: true });
    const details = sent[0]!.details as typeof packed.details;
    expect(details.kind).toBe("failure");
    expect(details.entries).toHaveLength(1);
    expect(details.entries[0]).toMatchObject({ id: "bg_9", label: "build", rows: ["first", "second"], incidents: { total: 2, shown: 2, omitted: 0 } });
  });

  it("bounds urgent details with a huge explanation and rows", () => {
    const urgent: UrgentCallbackEvent = {
      source: "background-task", id: "f", inspectId: "bg_1", label: "x".repeat(400), status: "failure", customType: "background-task-failure",
      content: "c".repeat(20_000), failureRows: Array.from({ length: 50 }, (_, i) => `row ${i} ${"r".repeat(300)}`), incidentCount: 50,
    };
    for (const maxBytes of [2048, 8192]) {
      const packed = packUrgentCallback(urgent, { maxBytes });
      expect(bytes(packed.details)).toBeLessThanOrEqual(maxBytes);
      expect(packed.details.entries[0]?.incidents?.total).toBe(50);
    }
  });
});

describe("background message renderer", () => {
  const packed = packCallbackBatch([event(1), event(2, { status: "failed", outcome: "exit 3" })]);
  const message = { content: packed.text, details: packed.details };

  it("renders a collapsed framed summary with an expand hint", () => {
    const lines = renderBackgroundMessage(message, { expanded: false }, theme).render(80).map(strip);
    expect(lines[0]).toContain("2 completions · 1 failed");
    expect(lines.join("\n")).toContain("job 1 · completed · exit 0");
    expect(lines.join("\n")).toContain("job 2 · failed · exit 3");
    expect(lines.join("\n")).toContain("to expand");
    expect(lines.join("\n")).not.toContain("Retrieve durable");
    expect(renderBackgroundMessage(message, { expanded: false }, theme).render(80).join("")).toContain("[31m");
  });

  it("shows the full text when expanded", () => {
    const text = renderBackgroundMessage(message, { expanded: true }, theme).render(120).map(strip).join("\n");
    expect(text).toContain("Retrieve durable");
    expect(text).toContain("source=background-task");
  });

  it("falls back to the text without details", () => {
    const lines = renderBackgroundMessage({ content: "plain old text" }, { expanded: false }, theme).render(40).map(strip);
    expect(lines.join("\n")).toContain("plain old text");
    expect(lines[0]?.startsWith("╭")).toBe(true);
  });

  it("renders the failure message", () => {
    const { text, details } = packUrgentCallback({ source: "background-task", id: "f", inspectId: "bg_1", label: "build", status: "failure", customType: "background-task-failure", content: "attention", failureRows: ["r"], incidentCount: 1 });
    const out = renderBackgroundMessage({ content: text, details }, { expanded: false }, theme).render(80).map(strip);
    expect(out[0]).toContain("background failure");
    expect(out[0]).toContain("build");
  });

  it("stays within width at 0, 1, 40 and 80", () => {
    const wide = packCallbackBatch(Array.from({ length: 12 }, (_, i) => event(i, { label: "日本語".repeat(20) })));
    for (const expanded of [false, true]) {
      for (const msg of [message, { content: wide.text, details: wide.details }, { content: "x".repeat(300) }]) {
        expect(renderBackgroundMessage(msg, { expanded }, theme).render(0)).toEqual([]);
        for (const width of [1, 40, 80]) {
          for (const line of renderBackgroundMessage(msg, { expanded }, theme).render(width)) {
            expect(visibleWidth(line)).toBeLessThanOrEqual(width);
          }
        }
      }
    }
  });
});

describe("registration", () => {
  it("registers both renderers", async () => {
    const { default: extension } = await import("../index.js");
    const registerMessageRenderer = vi.fn();
    extension({ on: vi.fn(), registerTool: vi.fn(), registerMessageRenderer, registerCommand: vi.fn(), events: { on: vi.fn(), emit: vi.fn() } } as never);
    expect(registerMessageRenderer.mock.calls.map((c) => c[0]).sort()).toEqual(["background-completion-batch", "background-task-failure"]);
  });
});
