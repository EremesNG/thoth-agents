import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  publishToolDefinitions,
  type ToolDefinitionHandle,
  type ToolDefinitionLike,
} from "@thoth-agents/pi-core";
import { getBackgroundTasksNavigator } from "./navigator-provider.js";
import { listOwnedTaskIdsForOrigin, resumeScheduledWork, stopTask, suspendScheduledWork } from "./runtime.js";
import { listMetasForOrigin } from "./registry.js";
import { COMPLETION_BATCH_TYPE, renderBackgroundMessage, TASK_FAILURE_TYPE } from "./render/messages.js";
import { registerTools } from "./tools.js";

export default function backgroundTasksExtension(pi: ExtensionAPI): void {
  const definitions: ToolDefinitionLike[] = [];
  let publication: ToolDefinitionHandle | undefined;
  const registerTool = pi.registerTool.bind(pi);
  pi.registerTool = (tool) => {
    const result = registerTool(tool);
    definitions.push(tool);
    publication?.publish([tool]);
    return result;
  };
  const navigator = getBackgroundTasksNavigator(pi);
  // Registered before registerTools(pi), so this runs before running tasks are resumed.
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI && !publication) publication = publishToolDefinitions(definitions);
    resumeScheduledWork(pi);
    await navigator.ensure(ctx);
  });
  pi.on("session_before_switch", async () => {
    navigator.dispose();
  });
  pi.on("session_shutdown", async (event, ctx) => {
    publication?.withdraw();
    publication = undefined;
    suspendScheduledWork(pi);
    if (event.reason !== "reload") {
      const origin = { cwd: ctx.cwd, sessionId: ctx.sessionManager?.getSessionId() };
      const ids = new Set([
        ...listMetasForOrigin(origin).filter((meta) => meta.status === "running").map((meta) => meta.id),
        ...listOwnedTaskIdsForOrigin(origin),
      ]);
      const stopped = await Promise.all([...ids].map((id) => stopTask(pi, id)));
      if (stopped.some((meta) => meta?.status === "running")) throw new Error("Background job cleanup failed: a process tree is still running");
    }
    navigator.dispose();
  });
  pi.registerMessageRenderer?.(COMPLETION_BATCH_TYPE, renderBackgroundMessage);
  pi.registerMessageRenderer?.(TASK_FAILURE_TYPE, renderBackgroundMessage);
  registerTools(pi);
}