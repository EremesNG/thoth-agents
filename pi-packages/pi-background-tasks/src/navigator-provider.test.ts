import { rmSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { logPathFor, readMeta, taskDir, writeMeta } from "./registry.js";
import { getBackgroundTasksNavigator } from "./navigator-provider.js";
import { lifecycleHost } from "./test-support/lifecycle-harness.js";
import type { BackgroundTaskMeta } from "./types.js";

function task(host: ReturnType<typeof lifecycleHost>, id: string, status: BackgroundTaskMeta["status"]): BackgroundTaskMeta {
  const now = Date.now();
  const meta: BackgroundTaskMeta = {
    id, name: id, kind: "process", status,
    startedAt: now - 1000, endedAt: status === "running" ? undefined : now,
    logPath: logPathFor(id), cwd: host.ctx.cwd, callback: false,
    callbackOrigin: { cwd: host.ctx.cwd, sessionId: host.ctx.sessionManager.getSessionId() },
    command: "pnpm build", spawnPid: process.pid,
  };
  writeMeta(meta);
  return meta;
}

describe("Background Work panel provider", () => {
  it("renders a compact Background counter and uses only the shared host cue and listener", async () => {
    const host = lifecycleHost("work-panel-summary", true);
    const metas = [task(host, "bg_panel_running", "running"), task(host, "bg_panel_failed", "failed")];
    try {
      await host.emit("session_start");
      const lines = host.panel.render();
      expect(lines[0]).toContain("Background · 1 running · 1 failed");
      expect(lines).toHaveLength(3);
      expect(lines.join("\n")).toContain("bg_panel_running");
      expect(host.statuses.get("thoth-work-panel")).toBe("← work · 1");
      expect(host.panel.listenerCount()).toBe(1);
      expect(host.widgets.has("background-work-list")).toBe(false);
      expect(lines.join("\n")).not.toContain("work navigator");
      writeMeta({ ...metas[0]!, status: "succeeded", endedAt: Date.now() });
      expect(host.panel.render()[0]).toContain("Background · 0 running · 1 failed");
      expect(host.statuses.get("thoth-work-panel")).toBeUndefined();
    } finally {
      await host.emit("session_shutdown", "reload");
      for (const meta of metas) rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it("expires terminal rows at exactly 30 seconds without another tool call", async () => {
    const host = lifecycleHost("panel-expiry", true);
    await host.emit("session_start");
    vi.useFakeTimers();
    const meta = task(host, "bg_panel_expiring", "failed");
    try {
      expect(host.panel.render().join("\n")).toContain(meta.id);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(host.panel.render().join("\n")).toContain(meta.id);
      await vi.advanceTimersByTimeAsync(1);
      expect(host.panel.render()).toEqual([]);
      expect(readMeta(meta.id)?.status).toBe("failed");
      expect(readMeta(meta.id)?.dismissedAt).toBeUndefined();
    } finally {
      await host.emit("session_shutdown", "reload");
      vi.useRealTimers();
      rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it("re-registers on a session switch and scopes rows to both cwd and session id", async () => {
    const host = lifecycleHost("panel-before-switch", true);
    const old = task(host, "bg_panel_old", "failed");
    const cwd = host.ctx.cwd;
    const next = task(host, "bg_panel_new", "timed_out");
    writeMeta({ ...next, callbackOrigin: { cwd, sessionId: "panel-after-switch" } });
    const foreignCwd = task(host, "bg_panel_foreign_cwd", "failed");
    writeMeta({ ...foreignCwd, callbackOrigin: { cwd: `${cwd}/other`, sessionId: "panel-after-switch" } });
    try {
      await host.emit("session_start");
      expect(host.panel.render().join("\n")).toContain(old.id);
      expect(host.panel.render().join("\n")).not.toContain(next.id);
      await host.emit("session_before_switch");
      expect(host.panel.listenerCount()).toBe(0);
      expect(host.panel.render()).toEqual([]);
      host.ctx.sessionManager.getSessionId = () => "panel-after-switch";
      await host.emit("session_start");
      await host.emit("session_start");
      expect(host.panel.listenerCount()).toBe(1);
      const lines = host.panel.render();
      expect(lines[0]).toContain("Background · 0 running · 1 failed");
      expect(lines.join("\n")).toContain(next.id);
      expect(lines.join("\n")).not.toContain(old.id);
      expect(lines.join("\n")).not.toContain(foreignCwd.id);
    } finally {
      await host.emit("session_shutdown", "reload");
      expect(host.panel.listenerCount()).toBe(0);
      for (const meta of [old, next, foreignCwd]) rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it("does not expose or dismiss another session's task through the provider", async () => {
    const host = lifecycleHost("work-panel-owner", true);
    const foreign = task(host, "bg_panel_foreign", "failed");
    writeMeta({ ...foreign, callbackOrigin: { cwd: host.ctx.cwd, sessionId: "other-session" } });
    try {
      await host.emit("session_start");
      const provider = getBackgroundTasksNavigator(host.pi).provider;
      expect(host.panel.render()).toEqual([]);
      expect(provider.detail(foreign.id, Date.now())).toBeNull();
      provider.close(foreign.id);
      expect(readMeta(foreign.id)?.dismissedAt).toBeUndefined();
    } finally {
      await host.emit("session_shutdown", "reload");
      rmSync(taskDir(foreign.id), { recursive: true, force: true });
    }
  });
});


it('shows provider status and timing instead of commands with semantic name, status and elapsed roles', async () => {
  const host = lifecycleHost('panel-status-hierarchy', true);
  const now = Date.now();
  const watch = task(host, 'bg_panel_watch_status', 'running');
  writeMeta({ ...watch, name: 'watch tests', kind: 'command_watch', intervalMs: 20_000, deadlineAt: now + 587_000 });
  const failed = task(host, 'bg_panel_failed_status', 'failed');
  writeMeta({ ...failed, name: 'failed build', result: { reason: 'result' } });
  const styled: Array<[string, string]> = [];
  host.panel.ui.theme.fg = (role, text) => { styled.push([role, text]); return text; };
  try {
    await host.emit('session_start');
    const text = host.panel.render().join('\n');
    expect(text).toContain('every 20s');
    expect(text).toMatch(/9m (46|47)s left/);
    expect(text).toContain('result');
    expect(text).not.toContain('pnpm build');
    expect(styled).toContainEqual(['toolTitle', 'watch tests']);
    expect(styled.some(([role, value]) => role === 'text' && value.includes('every 20s'))).toBe(true);
    expect(styled.some(([role, value]) => role === 'dim' && value.includes('1s'))).toBe(true);
    expect(styled).toContainEqual(['error', '1 failed']);
  } finally {
    await host.emit('session_shutdown', 'reload');
    for (const meta of [watch, failed]) rmSync(taskDir(meta.id), { recursive: true, force: true });
  }
});
