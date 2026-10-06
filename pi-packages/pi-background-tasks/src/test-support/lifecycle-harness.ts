import { EventEmitter } from "node:events";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import backgroundTasksExtension from "../index.js";
import { workPanelUI } from "./work-panel-ui.js";

export function lifecycleHost(sessionId: string, hasUI = false) {
  const tools = new Map<string, any>();
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  const messages: string[] = [];
  const panel = workPanelUI();
  const { widgets, statuses, uiCalls } = panel;
  const ctx = {
    cwd: process.cwd(), mode: hasUI ? "tui" : "print", hasUI,
    sessionManager: { getSessionId: () => sessionId },
    ui: panel.ui,
  };
  const pi = {
    events: new EventEmitter(),
    registerTool(tool: any) { tools.set(tool.name, tool); },
    on(name: string, handler: (event: any, ctx: any) => unknown) {
      const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) ?? []).filter((entry) => entry !== handler));
    },
    sendMessage(message: { content: string }) { messages.push(message.content); },
  } as unknown as ExtensionAPI;
  backgroundTasksExtension(pi);
  return {
    pi, ctx, tools, messages, widgets, statuses, uiCalls, panel,
    async emit(type: string, reason?: string) {
      for (const handler of [...(handlers.get(type) ?? [])]) await handler({ type, reason }, ctx);
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
    get editor() { return panel.editor; },
  };
}
