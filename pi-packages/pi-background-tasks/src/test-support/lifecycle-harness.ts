import { EventEmitter } from "node:events";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import backgroundTasksExtension from "../index.js";

export function lifecycleHost(sessionId: string, hasUI = false) {
  const tools = new Map<string, any>();
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  const messages: string[] = [];
  const widgets = new Map<string, unknown>();
  const statuses = new Map<string, unknown>();
  const uiCalls: unknown[] = [];
  let editor: unknown;
  const ctx = {
    cwd: process.cwd(), mode: hasUI ? "tui" : "print", hasUI,
    sessionManager: { getSessionId: () => sessionId },
    ui: {
      theme: { fg: (_: string, value: string) => value },
      setStatus(key: string, value: unknown) { statuses.set(key, value); uiCalls.push([key, value]); },
      setWidget(key: string, value: unknown) { widgets.set(key, value); uiCalls.push([key, value]); },
      getEditorComponent() { return editor; },
      setEditorComponent(value: unknown) { editor = value; uiCalls.push(value); },
      custom() { return Promise.resolve(null); },
    },
  };
  const pi = {
    events: new EventEmitter(),
    registerTool(tool: any) { tools.set(tool.name, tool); },
    on(name: string, handler: (event: any, ctx: any) => unknown) {
      const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list);
    },
    sendMessage(message: { content: string }) { messages.push(message.content); },
  } as unknown as ExtensionAPI;
  backgroundTasksExtension(pi);
  return {
    pi, ctx, tools, messages, widgets, statuses, uiCalls,
    async emit(type: string, reason?: string) {
      for (const handler of handlers.get(type) ?? []) await handler({ type, reason }, ctx);
    },
    async execute(name: string, params: Record<string, unknown>, signal = new AbortController().signal) {
      const result = await tools.get(name).execute("lifecycle-test", params, signal, undefined, ctx);
      return result.content.map((part: { text: string }) => part.text).join("\n") as string;
    },
    async status(id: string) { return JSON.parse(await this.execute("bg_task_status", { id, verbose: true })); },
    async spawn(params: Record<string, unknown>) {
      const text = await this.execute("bg_task_spawn", params);
      const id = text.match(/bg_[a-z0-9_]+/)?.[0]; if (!id) throw new Error(text); return id;
    },
    get editor() { return editor; },
  };
}
