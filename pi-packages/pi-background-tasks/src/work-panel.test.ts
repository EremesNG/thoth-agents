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
  it.each([false, true])("opens command/log detail and confirms dismissal in the overlay (KIT=%s)", async (withKit) => {
    const host = lifecycleHost(`panel-detail-${withKit}`, true);
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
      await host.emit("session_start");
      expect(host.panel.key(UP)).toBeUndefined();
      expect(host.panel.key(LEFT)).toEqual({ consume: true });
      expect(host.panel.render().filter((line) => line.includes("› "))).toHaveLength(1);
      expect(host.panel.render().join("\n")).toContain("Enter open · x dismiss");
      expect(host.panel.key("\r")).toEqual({ consume: true });
      const detail = host.panel.detailRender().join("\n");
      expect(detail).toContain("failed build");
      expect(detail).toContain(command);
      expect(detail).toContain("line-29");
      expect(detail).not.toContain("line-0");
      expect(host.panel.key("x")).toBeUndefined();
      expect(readMeta(id)?.dismissedAt).toBeUndefined();
      host.panel.detailKey("l");
      const shortDetail = host.panel.detailRender().join("\n");
      expect(shortDetail).not.toContain("line-19");
      expect(shortDetail).toContain("line-29");
      expect(shortDetail).toContain(command);
      expect(shortDetail).not.toMatch(/folded|Enter expand\/collapse/);
      host.panel.detailKey("\r");
      expect(host.panel.detailRender().join("\n")).toBe(shortDetail);
      host.panel.detailKey("x");
      expect(readMeta(id)?.dismissedAt).toBeUndefined();
      expect(host.statuses.get("thoth-work-panel-close")).toBe("Press x again to dismiss failed build");
      host.panel.detailKey("x");
      expect(readMeta(id)?.dismissedAt).toBeTypeOf("number");
      await Promise.resolve();
      expect(host.panel.render()).toEqual([]);
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
      name: "panel sleeper", shell: false,
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
      expect(host.panel.render().join("\n")).toContain("panel sleeper");
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
