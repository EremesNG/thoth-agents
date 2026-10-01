import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { disposeBackgroundWorkNavigator } from "./shared-navigator.ts";
import { clearBackgroundTasksNavigatorSession, ensureBackgroundTasksNavigator, ensureBackgroundTasksNavigatorProvider } from "./navigator-provider.js";
import { resumeScheduledWork, suspendScheduledWork } from "./runtime.js";
import { registerTools } from "./tools.js";

export default function backgroundTasksExtension(pi: ExtensionAPI): void {
  ensureBackgroundTasksNavigatorProvider(pi);
  // Registered before registerTools(pi), so this runs before running tasks are resumed.
  pi.on("session_start", async (_event, ctx) => {
    resumeScheduledWork();
    ensureBackgroundTasksNavigator(ctx);
  });
  pi.on("session_before_switch", async () => {
    clearBackgroundTasksNavigatorSession();
    disposeBackgroundWorkNavigator();
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    // /reload, session replacement, and quit load a fresh instance; stop this one's timers (#324).
    suspendScheduledWork();
    clearBackgroundTasksNavigatorSession();
    disposeBackgroundWorkNavigator(ctx);
  });
  registerTools(pi);
}