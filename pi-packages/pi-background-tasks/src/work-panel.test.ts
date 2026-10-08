import { rmSync, writeFileSync } from "node:fs";
import { visibleWidth } from "@earendil-works/pi-tui";
import { registerRenderKit, withdrawRenderKit } from "@thoth-agents/pi-core";
import { createTestRenderKit } from "@thoth-agents/pi-core/testing";
import { describe, expect, it } from "vitest";
import { logPathFor, readMeta, taskDir, writeMeta } from "./registry.js";
import { lifecycleHost } from "./test-support/lifecycle-harness.js";

const LEFT = "\x1b[D";
const UP = "\x1b[A";

describe("Background interaction through the pi-core host", () => {
  it("contributes no lines or interaction hint in a fresh session without tasks", async () => {
    const host = lifecycleHost("panel-fresh-empty", true);
    try {
      await host.emit("session_start");
      expect(host.panel.render()).toEqual([]);
      expect(host.statuses.get("thoth-work-panel")).toBeUndefined();
      for (const key of [LEFT, UP, "\x1b[B", "\r", "x", "\x1b"])
        expect(host.panel.key(key)).toBeUndefined();
    } finally {
      await host.emit("session_shutdown", "reload");
    }
  });

  it.each([false, true])("restores durable completed and failed counts in a resumed session (dismissed=%s)", async (dismissed) => {
    const host = lifecycleHost(`panel-resume-empty-${dismissed}`, true);
    const sessionId = `panel-resumed-${dismissed}`;
    const statuses = ["succeeded", "cancelled", "failed", "timed_out"] as const;
    const ids = statuses.map((status) => `bg_panel_resumed_${dismissed}_${status}`);
    const now = Date.now();
    try {
      for (const [index, status] of statuses.entries()) {
        const id = ids[index]!;
        writeMeta({
          id, name: `retained ${status}`, kind: "process", status,
          startedAt: now - 10000, endedAt: now - 5000,
          logPath: logPathFor(id), cwd: host.ctx.cwd, spawnPid: process.pid,
          callback: false, callbackOrigin: { cwd: host.ctx.cwd, sessionId },
          ...(dismissed ? { dismissedAt: now - 4000 } : {}),
        });
      }
      await host.emit("session_start");
      expect(host.panel.render()).toEqual([]);
      await host.emit("session_before_switch");
      host.ctx.sessionManager.getSessionId = () => sessionId;
      await host.emit("session_start");
      expect(host.panel.render()).toEqual([
        "◆ Background · 2 done · 2 failed",
        "← interact",
      ]);
      expect(host.statuses.get("thoth-work-panel")).toBe("← work · 1");
      expect(host.panel.key(LEFT)).toEqual({ consume: true });
      expect(host.panel.render()).toEqual([
        "› ◆ Background · 2 done · 2 failed",
        "Enter history · Esc back",
      ]);
    } finally {
      await host.emit("session_shutdown", "reload");
      for (const id of ids) rmSync(taskDir(id), { recursive: true, force: true });
    }
  });

  it.each([false, true])("opens selected history with full retained logs and keeps terminal dismissal on the work row (KIT=%s)", async (withKit) => {
    const host = lifecycleHost(`panel-detail-${withKit}`, true);
    await host.emit('session_start');
    host.setIdle(false);
    await host.emit('agent_start');
    const id = `bg_panel_detail_${withKit}`;
    const now = Date.now();
    const command = "pnpm run build --verbose --all";
    const token = withKit ? registerRenderKit(createTestRenderKit(), {}) : undefined;
    writeMeta({
      id, name: "failed build", kind: "process", status: "failed", startedAt: now - 2000, endedAt: now,
      logPath: logPathFor(id), cwd: host.ctx.cwd, spawnPid: process.pid, callback: false, command,
      callbackOrigin: { cwd: host.ctx.cwd, sessionId: host.ctx.sessionManager.getSessionId() },
    });
    writeFileSync(logPathFor(id), Array.from({ length: 30 }, (_, index) => `line-${index}`).join("\n"));
    try {
      expect(host.panel.key(UP)).toBeUndefined();
      expect(host.panel.key(LEFT)).toEqual({ consume: true });
      expect(host.panel.render().filter((line) => line.includes("› "))).toHaveLength(1);
      expect(host.panel.render().join("\n")).toContain("Enter open · x dismiss");
      expect(host.panel.key("\r")).toEqual({ consume: true });
      const detail = host.panel.detailRender().join("\n");
      expect(detail).toContain("failed build");
      expect(detail).toContain(command);
      expect(detail).toContain("line-29");
      expect(detail).toContain("line-0");
      expect(host.panel.key("x")).toBeUndefined();
      expect(readMeta(id)?.dismissedAt).toBeUndefined();
      expect(detail).not.toMatch(/folded|Enter expand\/collapse/);
      host.panel.detailKey("x");
      host.panel.detailKey("x");
      expect(readMeta(id)?.dismissedAt).toBeUndefined();
      host.panel.detailKey('q');
      await new Promise<void>(resolve => setImmediate(resolve));
      host.panel.key(LEFT);
      host.panel.key('x');
      expect(readMeta(id)?.dismissedAt).toBeUndefined();
      expect(host.statuses.get("thoth-work-panel-close")).toBe("Press x again to dismiss failed build");
      host.panel.key('x');
      expect(readMeta(id)?.dismissedAt).toBeTypeOf("number");
      host.setIdle(true);
      await host.emit('agent_settled');
      expect(host.panel.render()[0]).toContain('Background · 0 done · 1 failed');
      host.panel.key('\x1b');
      expect(host.panel.key(UP)).toBeUndefined();
      expect(host.statuses.get("thoth-work-panel-close")).toBeUndefined();
    } finally {
      await host.emit("session_shutdown", "reload");
      if (token) withdrawRenderKit(token);
      rmSync(taskDir(id), { recursive: true, force: true });
    }
  });

  it("stops a running process only after two x presses, leaving unfocused history and typed prompts alone", async () => {
    const host = lifecycleHost("panel-stop", true);
    await host.emit("session_start");
    const id = await host.spawn({
      name: "panel sleeper", shell: "none" as const,
      argv: [process.execPath, "-e", "setInterval(() => {}, 10000)"], callback: false,
    });
    try {
      expect(host.panel.key(UP)).toBeUndefined();
      host.panel.setText("draft");
      expect(host.panel.key(LEFT)).toBeUndefined();
      host.panel.setText("");
      host.panel.setOverlay(true);
      expect(host.panel.key(LEFT)).toBeUndefined();
      host.panel.setOverlay(false);
      expect(host.panel.key(LEFT)).toEqual({ consume: true });
      expect(host.panel.key("x")).toEqual({ consume: true });
      expect(readMeta(id)?.status).toBe("running");
      expect(readMeta(id)?.stopRequestedAt).toBeUndefined();
      expect(host.statuses.get("thoth-work-panel-close")).toBe("Press x again to stop panel sleeper");
      expect(host.panel.key("x")).toEqual({ consume: true });
      await expect.poll(() => readMeta(id)?.status, { timeout: 10000 }).toBe("cancelled");
      expect(host.panel.render()[0]).toContain('Background · 1 done · 0 failed');
      expect(host.panel.key("\x1b")).toEqual({ consume: true });
      expect(host.panel.render().join("\n")).not.toContain("› ");
      for (const width of [1, 24, 80]) {
        for (const line of host.panel.render(width)) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    } finally {
      await host.execute("bg_task_stop", { id });
      await host.emit("session_shutdown", "reload");
      rmSync(taskDir(id), { recursive: true, force: true });
    }
  });
});
