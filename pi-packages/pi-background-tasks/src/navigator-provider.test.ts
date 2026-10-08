import { rmSync } from "node:fs";
import { getWorkPanelLifecycle } from '@thoth-agents/pi-core';
import { describe, expect, it } from "vitest";
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
  it('binds prompt lifecycle, collapses idle outcomes, and disposes across switch/shutdown', async () => {
    const host = lifecycleHost('panel-lifecycle', true);
    const metas: BackgroundTaskMeta[] = [];
    try {
      await host.emit('session_start');
      await host.emit('input', { source: 'interactive', text: 'build it' });
      await host.emit('before_agent_start', { prompt: 'build it' });
      expect(getWorkPanelLifecycle(host.ctx as any).epoch).toBe(1);
      await host.emit('session_start');
      expect(getWorkPanelLifecycle(host.ctx as any).epoch).toBe(1);
      host.setIdle(false);
      await host.emit('agent_start');
      expect(getWorkPanelLifecycle(host.ctx as any).busy).toBe(true);
      const done = task(host, 'bg_panel_lifecycle_done', 'succeeded');
      metas.push(done);
      expect(host.panel.render().join('\n')).toContain(done.id);
      host.setIdle(true);
      await host.emit('agent_settled');
      expect(host.panel.render().filter(line => !line.includes('interact'))).toEqual(['◆ Background · 1 done · 0 failed']);
      host.panel.key('\x1b[D');
      expect(host.panel.render().at(-1)).toContain('Enter history');
      expect(host.panel.render().at(-1)).not.toContain('x ');
      host.panel.key('\x1b');
      await host.emit('session_before_switch');
      host.ctx.sessionManager.getSessionId = () => 'panel-lifecycle-new';
      await host.emit('session_start');
      expect(getWorkPanelLifecycle(host.ctx as any).epoch).toBe(0);
      await host.emit('input', { source: 'rpc', text: 'new task' });
      await host.emit('before_agent_start', { prompt: 'new task' });
      expect(getWorkPanelLifecycle(host.ctx as any).epoch).toBe(1);
      await host.emit('session_shutdown', 'reload');
      await host.emit('input', { source: 'interactive', text: 'after shutdown' });
      await host.emit('before_agent_start', { prompt: 'after shutdown' });
      expect(getWorkPanelLifecycle(host.ctx as any).epoch).toBe(0);
    } finally {
      await host.emit('session_shutdown', 'reload');
      for (const meta of metas) rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it("renders a compact Background counter and uses only the shared host cue and listener", async () => {
    const host = lifecycleHost("work-panel-summary", true);
    await host.emit("session_start");
    const metas = [task(host, "bg_panel_running", "running"), task(host, "bg_panel_failed", "failed")];
    try {
      const lines = host.panel.render();
      expect(lines[0]).toContain("Background · 1 running · 1 failed");
      expect(lines).toHaveLength(4);
      expect(lines.at(-1)).toBe('← interact');
      expect(lines.join("\n")).toContain("bg_panel_running");
      expect(getBackgroundTasksNavigator(host.pi).provider.supportsLogTail).toBe(true);
      expect(host.statuses.get("thoth-work-panel")).toBe("← work · 2");
      expect(host.panel.listenerCount()).toBe(1);
      expect(host.widgets.has("background-work-list")).toBe(false);
      expect(lines.join("\n")).not.toContain("work navigator");
      writeMeta({ ...metas[0]!, status: "succeeded", endedAt: Date.now() });
      expect(host.panel.render()[0]).toContain("Background · 1 done · 1 failed");
      expect(host.panel.render()).toHaveLength(2);
      expect(host.statuses.get("thoth-work-panel")).toBe("← work · 1");
    } finally {
      await host.emit("session_shutdown", "reload");
      for (const meta of metas) rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it('shows the command once under its heading and omits unrecorded process fields', async () => {
    const host = lifecycleHost('panel-detail-hierarchy', true);
    const meta = task(host, 'bg_panel_detail_hierarchy', 'running');
    try {
      await host.emit('session_start');
      const detail = getBackgroundTasksNavigator(host.pi).provider.detail(meta.id, Date.now())!;
      expect(detail.subtitle).toBeUndefined();
      expect(detail.metadata.map(field => field.label)).not.toContain('pid');
      expect(detail.metadata.map(field => field.label)).not.toContain('pgid');
      expect(detail.foldedSections).toEqual([expect.objectContaining({ label: 'Command', text: 'pnpm build' })]);
      expect(detail.evidence.label).toBe('Log');
      host.panel.key('\x1b[D');
      host.panel.key('\r');
      expect(host.panel.detailRender().join('\n').match(/pnpm build/g)).toHaveLength(1);
    } finally {
      await host.emit('session_shutdown', 'reload');
      rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it("opts into prompt retention without expiring terminal rows and counts dismissed outcomes", async () => {
    const host = lifecycleHost("panel-retention", true);
    const failed = task(host, "bg_panel_old_failed", "failed");
    writeMeta({ ...failed, endedAt: Date.now() - 60_000 });
    const timedOut = task(host, "bg_panel_timed_out", "timed_out");
    const done = task(host, "bg_panel_done", "succeeded");
    const dismissed = task(host, "bg_panel_dismissed", "cancelled");
    writeMeta({ ...dismissed, dismissedAt: Date.now() });
    const running = task(host, "bg_panel_live", "running");
    try {
      await host.emit("session_start");
      const provider = getBackgroundTasksNavigator(host.pi).provider;
      expect(provider.retention).toBe("prompt");
      const rows = provider.listRows(Date.now() + 120_000);
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: failed.id, state: "failed", endedAt: expect.any(Number) }),
        expect.objectContaining({ id: timedOut.id, state: "failed" }),
        expect.objectContaining({ id: done.id, state: "done" }),
        expect.objectContaining({ id: running.id, state: "running" }),
      ]));
      expect(rows.some(row => row.id === dismissed.id)).toBe(false);
      expect(rows.every(row => row.expiresAt === undefined)).toBe(true);
      expect(provider.summary?.()).toMatchObject({ running: 1, failed: 2, completed: 2 });
    } finally {
      await host.emit("session_shutdown", "reload");
      for (const meta of [failed, timedOut, done, dismissed, running]) rmSync(taskDir(meta.id), { recursive: true, force: true });
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
      expect(getBackgroundTasksNavigator(host.pi).provider.listRows(Date.now()).map(row => row.id)).toEqual([old.id]);
      expect(host.panel.render().join("\n")).not.toContain(next.id);
      await host.emit("session_before_switch");
      expect(host.panel.listenerCount()).toBe(0);
      expect(host.panel.render()).toEqual([]);
      host.ctx.sessionManager.getSessionId = () => "panel-after-switch";
      await host.emit("session_start");
      await host.emit("session_start");
      expect(host.panel.listenerCount()).toBe(1);
      const lines = host.panel.render();
      expect(lines[0]).toContain("Background · 0 done · 1 failed");
      expect(getBackgroundTasksNavigator(host.pi).provider.listRows(Date.now()).map(row => row.id)).toEqual([next.id]);
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
      expect(provider.listRows(Date.now())).toEqual([]);
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
    writeMeta({ ...failed, name: 'failed build', result: { reason: 'result' }, endedAt: Date.now() });
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

it('background navigator segments resolve the registered UI separator', async () => {
  const { registerRenderKit, withdrawRenderKit } = await import('@thoth-agents/pi-core');
  const { createTestRenderKit } = await import('@thoth-agents/pi-core/testing');
  const host = lifecycleHost('panel-icons', true);
  const meta = task(host, 'bg_panel_icons', 'running');
  let token: ReturnType<typeof registerRenderKit> | undefined;
  try {
    await host.emit('session_start');
    const provider = getBackgroundTasksNavigator(host.pi).provider;
    expect(provider.listRows(Date.now())[0].segments?.[1].text).toMatch(/^ · /);
    token = registerRenderKit(createTestRenderKit({ icon: (name) => name === 'separator' ? '|' : name }), {});
    expect(provider.listRows(Date.now())[0].segments?.[1].text).toMatch(/^ \| /);
    expect(provider.listRows(Date.now())[0].segments?.[2].text).toMatch(/^ \| /);
    withdrawRenderKit(token);
    token = undefined;
    expect(provider.listRows(Date.now())[0].segments?.[1].text).toMatch(/^ · /);
  } finally {
    if (token) withdrawRenderKit(token);
    await host.emit('session_shutdown', 'reload');
    rmSync(taskDir(meta.id), { recursive: true, force: true });
  }
});
