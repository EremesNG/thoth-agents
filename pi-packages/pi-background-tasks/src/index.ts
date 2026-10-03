import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getBackgroundTasksNavigator } from "./navigator-provider.js";
import { resumeScheduledWork, stopTask, suspendScheduledWork } from "./runtime.js";
import { listMetasForOrigin } from "./registry.js";
import { COMPLETION_BATCH_TYPE, renderBackgroundMessage, TASK_FAILURE_TYPE } from "./render/messages.js";
import { registerTools } from "./tools.js";

export default function backgroundTasksExtension(pi: ExtensionAPI): void {
  const navigator = getBackgroundTasksNavigator(pi);
  // Registered before registerTools(pi), so this runs before running tasks are resumed.
  pi.on("session_start", async (_event, ctx) => {
    resumeScheduledWork(pi);
    navigator.ensure(ctx);
  });
  pi.on("session_before_switch", async () => {
    navigator.dispose();
  });
  pi.on("session_shutdown", async (event, ctx) => {
    suspendScheduledWork(pi);
    if (event.reason !== "reload") {
      const origin = { cwd: ctx.cwd, sessionId: ctx.sessionManager?.getSessionId() };
      const stopped = await Promise.all(listMetasForOrigin(origin).filter((meta) => meta.status === "running")
        .map((meta) => stopTask(pi, meta.id)));
      if (stopped.some((meta) => meta?.status === "running")) throw new Error("Background job cleanup failed: a process tree is still running");
    }
    navigator.dispose(ctx);
  });
  pi.registerMessageRenderer?.(COMPLETION_BATCH_TYPE, renderBackgroundMessage);
  pi.registerMessageRenderer?.(TASK_FAILURE_TYPE, renderBackgroundMessage);
  registerTools(pi);
}