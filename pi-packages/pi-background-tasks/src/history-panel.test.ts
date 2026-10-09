import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Component, OverlayHandle } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  BackgroundTasksHistoryPanel,
  showBackgroundTasksHistory,
} from './history-panel.js';
import { logPathFor, taskDir, writeMeta } from './registry.js';
import { lifecycleHost } from './test-support/lifecycle-harness.js';
import type { BackgroundTaskMeta } from './types.js';

function task(
  host: ReturnType<typeof lifecycleHost>,
  id: string,
  overrides: Partial<BackgroundTaskMeta> = {},
): BackgroundTaskMeta {
  const meta: BackgroundTaskMeta = {
    id,
    name: id,
    kind: 'process',
    status: 'succeeded',
    startedAt: 1000,
    endedAt: 2000,
    cwd: host.ctx.cwd,
    logPath: logPathFor(id),
    spawnPid: process.pid,
    callbackOrigin: {
      cwd: host.ctx.cwd,
      sessionId: host.ctx.sessionManager.getSessionId(),
    },
    command: 'pnpm build',
    ...overrides,
  };
  writeMeta(meta);
  return meta;
}

function panelFor(
  host: ReturnType<typeof lifecycleHost>,
  selectedTaskId?: string,
) {
  return new BackgroundTasksHistoryPanel(
    host.pi,
    {
      cwd: host.ctx.cwd,
      sessionId: host.ctx.sessionManager.getSessionId(),
    },
    { onClose() {}, maxLines: 42, initialSelectedId: selectedTaskId },
  );
}

// Model Pi 1.0.2's top-pop completion while supplying owner-scoped handles.
function overlayHost(mode: 'inline' | 'fullscreen' = 'inline') {
  const editor: Component = { render: () => [], invalidate() {} };
  let focused = editor;
  const stack: Array<{ component: Component; preFocus: Component }> = [];
  const hideOwned = vi.fn();
  const tui = {
    mode,
    terminal: { rows: 50, columns: 120, write: vi.fn() },
    children: [editor],
    overlayStack: stack,
    requestRender: vi.fn(),
    getFocusedComponent: () => focused,
    setFocus: (component: Component) => { focused = component; },
    hideOverlay: vi.fn(() => {
      const removed = stack.pop();
      if (removed) focused = removed.preFocus;
    }),
  };
  const custom = vi.fn((
    factory: Parameters<ExtensionContext['ui']['custom']>[0],
    options?: Parameters<ExtensionContext['ui']['custom']>[1],
  ) =>
    new Promise((resolve) => {
      const done = (result: unknown) => {
        tui.hideOverlay();
        resolve(result);
      };
      const component = factory(
        tui as unknown as Parameters<typeof factory>[0],
        { fg: (_role: string, text: string) => text } as Parameters<typeof factory>[1],
        { matches: (data: string, key: string) => data === 'dismiss-history' && key === 'app.interrupt' } as unknown as Parameters<typeof factory>[2],
        done,
      ) as Component;
      const entry = { component, preFocus: focused };
      stack.push(entry);
      focused = component;
      options?.onHandle?.({
        hide: () => {
          hideOwned();
          const index = stack.indexOf(entry);
          if (index < 0) return;
          stack.splice(index, 1);
          for (const newer of stack)
            if (newer.preFocus === component) newer.preFocus = entry.preFocus;
          if (focused === component) focused = entry.preFocus;
        },
      } as OverlayHandle);
    }),
  );
  const ctx = { hasUI: true, mode: 'tui', ui: { custom } } as unknown as ExtensionContext;
  return { ctx, tui, editor, stack, hideOwned, custom };
}

describe('Background history overlay ownership', () => {
  it.each(['inline', 'fullscreen'] as const)('preserves full-terminal placement, bound close keys and mouse lifecycle in %s mode', async (mode) => {
    const host = lifecycleHost(`history-overlay-${mode}`);
    const overlay = overlayHost(mode);
    const opened = showBackgroundTasksHistory(host.pi, overlay.ctx, {
      cwd: host.ctx.cwd,
      sessionId: host.ctx.sessionManager.getSessionId(),
    });
    const panel = overlay.stack[0].component as BackgroundTasksHistoryPanel;
    try {
      expect(overlay.custom.mock.calls[0][1]).toMatchObject({
        overlay: true,
        overlayOptions: {
          anchor: 'top-left', width: '100%', maxHeight: '100%', margin: 0,
        },
        onHandle: expect.any(Function),
      });
      expect(panel.render(120)).toHaveLength(50);
      expect(overlay.tui.terminal.write.mock.calls).toEqual(
        mode === 'fullscreen' ? [] : [['\x1b[?1000h\x1b[?1006h']],
      );
      panel.handleInput('dismiss-history');
      await opened;
      expect(overlay.hideOwned).toHaveBeenCalledOnce();
      expect(overlay.tui.getFocusedComponent()).toBe(overlay.editor);
      expect(overlay.tui.terminal.write.mock.calls).toEqual(
        mode === 'fullscreen' ? [] : [
          ['\x1b[?1000h\x1b[?1006h'], ['\x1b[?1006l\x1b[?1000l'],
        ],
      );
      const renders = overlay.tui.requestRender.mock.calls.length;
      panel.handleInput('q');
      expect(overlay.tui.requestRender).toHaveBeenCalledTimes(renders);
    } finally {
      panel.dismiss();
      await opened;
    }
  });

  it('closes only history beneath a newer foreign overlay and leaves its focus intact', async () => {
    const host = lifecycleHost('history-overlay-foreign');
    const overlay = overlayHost();
    const opened = showBackgroundTasksHistory(host.pi, overlay.ctx, {
      cwd: host.ctx.cwd,
      sessionId: host.ctx.sessionManager.getSessionId(),
    });
    const panel = overlay.stack[0].component as BackgroundTasksHistoryPanel;
    const foreign: Component = { render: () => ['Question'], invalidate() {} };
    overlay.stack.push({ component: foreign, preFocus: panel });
    overlay.tui.setFocus(foreign);
    try {
      panel.dismiss();
      await opened;
      expect(overlay.hideOwned).toHaveBeenCalledOnce();
      expect(overlay.stack.map((entry) => entry.component)).toEqual([foreign]);
      expect(overlay.tui.getFocusedComponent()).toBe(foreign);
      overlay.tui.hideOverlay();
      expect(overlay.tui.getFocusedComponent()).toBe(overlay.editor);
    } finally {
      panel.dismiss();
      await opened;
    }
  });

  it('disposes history and disables its mouse tracking when custom rejects after creation', async () => {
    const host = lifecycleHost('history-overlay-rejection');
    let panel: BackgroundTasksHistoryPanel | undefined;
    const write = vi.fn();
    const requestRender = vi.fn();
    const custom: ExtensionContext['ui']['custom'] = (factory) => {
      panel = factory(
        { mode: 'inline', terminal: { rows: 50, write }, requestRender } as unknown as Parameters<typeof factory>[0],
        { fg: (_role, text) => text } as Parameters<typeof factory>[1],
        { matches: () => false } as unknown as Parameters<typeof factory>[2],
        () => {},
      ) as BackgroundTasksHistoryPanel;
      return Promise.reject(new Error('overlay failed'));
    };
    await expect(showBackgroundTasksHistory(host.pi, {
      hasUI: true, mode: 'tui', ui: { custom },
    } as ExtensionContext, {
      cwd: host.ctx.cwd,
      sessionId: host.ctx.sessionManager.getSessionId(),
    })).rejects.toThrow('overlay failed');
    expect(write.mock.calls).toEqual([
      ['\x1b[?1000h\x1b[?1006h'], ['\x1b[?1006l\x1b[?1000l'],
    ]);
    panel?.handleInput('q');
    expect(requestRender).not.toHaveBeenCalled();
  });
});

describe('Background task history', () => {
  it('/bg and summary Enter open full session history; row Enter selects that task', async () => {
    const host = lifecycleHost('history-entrypoints', true);
    await host.emit('session_start');
    const old = task(host, 'bg_history_entry_old', { dismissedAt: Date.now() });
    const newer = task(host, 'bg_history_entry_new', { startedAt: 3000 });
    try {
      const command = host.commands.get('bg');
      expect(command).toBeDefined();
      const opened = command.handler('', host.ctx);
      expect(host.panel.detailRender(160).join('\n')).toContain(old.id);
      expect(host.panel.detailRender(160).join('\n')).toContain(newer.id);
      host.panel.detailKey('q');
      await opened;
      host.panel.key('\x1b[D');
      host.panel.key('\r');
      expect(host.panel.detailRender(160).join('\n')).toContain('Retained log');
      host.panel.detailKey('q');
      await new Promise<void>((resolve) => setImmediate(resolve));
      const running = task(host, newer.id, {
        status: 'running',
        endedAt: undefined,
        name: 'selected running task',
      });
      task(host, 'bg_history_row_newest', {
        status: 'running',
        endedAt: undefined,
        startedAt: 5000,
        name: 'newest running task',
      });
      host.panel.key('\x1b[D');
      host.panel.key('\x1b[B');
      host.panel.key('\r');
      expect(host.panel.detailRender(160).join('\n')).toContain(
        'selected running task · running',
      );
      expect(host.panel.detailRender(160).join('\n')).toContain('[/] log page');
      host.panel.detailKey('q');
      writeMeta({ ...running, status: 'cancelled', endedAt: Date.now() });
    } finally {
      host.panel.closeDetail();
      await host.emit('session_shutdown', 'reload');
      for (const id of [old.id, newer.id, 'bg_history_row_newest'])
        rmSync(taskDir(id), { recursive: true, force: true });
    }
  });

  it('resolves selection and generated separators at render time without changing retained log text', () => {
    const host = lifecycleHost('history-icons', true);
    const meta = task(host, 'bg_history_icons', { dismissedAt: 3000, name: 'icon task' });
    writeFileSync(meta.logPath, 'literal · log › content\n');
    const panel = panelFor(host, meta.id);
    let token: ReturnType<typeof registerRenderKit> | undefined;
    try {
      const native = panel.render(160);
      expect(native.join('\n')).toContain('› icon task');
      expect(native.join('\n')).toContain('Status: succeeded · dismissed');
      token = registerRenderKit(createTestRenderKit({
        icon: (name) => name === 'selection' ? '>' : name === 'separator' ? '|' : '',
      }), {});
      const themed = panel.render(160).join('\n');
      expect(themed).toContain('> icon task');
      expect(themed).toContain('icon task | succeeded');
      expect(themed).toContain('Status: succeeded | dismissed');
      expect(themed).toContain('Retained log | bytes');
      expect(themed).toContain('literal · log › content');
      withdrawRenderKit(token);
      token = undefined;
      expect(panel.render(160)).toEqual(native);
    } finally {
      if (token) withdrawRenderKit(token);
      panel.dispose();
      rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it('does not open a history overlay for headless commands', async () => {
    const host = lifecycleHost('history-headless');
    await host.commands.get('bg').handler('', host.ctx);
    expect(host.uiCalls).toEqual([]);
  });

  it('rechecks running eligibility on the second x press', () => {
    const host = lifecycleHost('history-close-race', true);
    const meta = task(host, 'bg_history_close_race', {
      status: 'running',
      endedAt: undefined,
    });
    const panel = panelFor(host, meta.id);
    try {
      panel.render(160);
      panel.handleInput('x');
      writeMeta({ ...meta, status: 'succeeded', endedAt: Date.now() });
      panel.handleInput('x');
      expect(panel.selectedItem()?.status).toBe('succeeded');
      expect(panel.selectedItem()?.stopRequestedAt).toBeUndefined();
      expect(panel.selectedItem()?.dismissedAt).toBeUndefined();
    } finally {
      panel.dispose();
      rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it('shows command, timing, exit/error metadata and retained output with capture and retention loss notices', () => {
    const host = lifecycleHost('history-content', true);
    const meta = task(host, 'bg_history_content', {
      status: 'failed',
      lastExitCode: 7,
      lastSignal: 'SIGTERM',
      error: 'build failed',
      logDiscardedBytes: 2048,
      stdoutDiscardedBytes: 1024,
    });
    writeFileSync(meta.logPath, 'first retained line\nlast retained line\n');
    const panel = panelFor(host, meta.id);
    try {
      const text = panel.render(160).join('\n');
      for (const value of [
        'failed',
        'pnpm build',
        'Started:',
        'Ended:',
        'Elapsed: 1s',
        'Exit: 7',
        'Signal: SIGTERM',
        'Error: build failed',
        'first retained line',
        'last retained line',
        'retention',
        '2048',
        'capture',
        '1024',
      ])
        expect(text).toContain(value);
      expect(text).toContain('output lost');
    } finally {
      panel.dispose();
      rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it('pages retained logs lazily in bounded pages and keeps loss visible while scrolling', () => {
    const host = lifecycleHost('history-pages', true);
    const meta = task(host, 'bg_history_pages', { logDiscardedBytes: 4096 });
    writeFileSync(
      meta.logPath,
      'first retained line\n' +
        'padding\n'.repeat(9000) +
        'final retained line\n',
    );
    const panel = panelFor(host, meta.id);
    try {
      expect(panel.render(160).join('\n')).not.toContain('final retained line');
      panel.handleInput('\x1b[H');
      expect(panel.render(160).join('\n')).toContain('first retained line');
      panel.handleInput(']');
      let text = panel.render(160).join('\n');
      expect(text).toContain('final retained line');
      expect(text).toContain('retention output lost');
      panel.handleInput('[');
      text = panel.render(160).join('\n');
      expect(text).not.toContain('final retained line');
      writeFileSync(meta.logPath, 'new retained log\n');
      writeMeta({ ...meta, logGeneration: 1, logDiscardedBytes: 8192 });
      text = panel.render(160).join('\n');
      expect(text).toContain('new retained log');
      expect(text).toContain('8192');
      expect(text).toContain('Log reset: compacted');
    } finally {
      panel.dispose();
      rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it('stops running work only after x twice and leaves terminal history intact', async () => {
    const host = lifecycleHost('history-stop', true);
    await host.emit('session_start');
    const id = await host.spawn({
      name: 'history sleeper',
      shell: 'none',
      argv: [process.execPath, '-e', 'setInterval(() => {}, 10000)'],
      callback: false,
    });
    const panel = panelFor(host, id);
    try {
      panel.render(160);
      panel.handleInput('x');
      expect(panel.selectedItem()?.status).toBe('running');
      expect(panel.selectedItem()?.stopRequestedAt).toBeUndefined();
      expect(panel.render(160).join('\n')).toContain('x again to stop');
      panel.handleInput('x');
      await expect
        .poll(() => panel.selectedItem()?.status, { timeout: 10_000 })
        .toBe('cancelled');
      panel.handleInput('x');
      panel.handleInput('x');
      expect(panel.selectedItem()?.dismissedAt).toBeUndefined();
    } finally {
      panel.dispose();
      await host.execute('bg_task_stop', { id });
      await host.emit('session_shutdown', 'reload');
      rmSync(taskDir(id), { recursive: true, force: true });
    }
  });

  it('allows paging newly appended output after reaching the previous log end', () => {
    const host = lifecycleHost('history-append', true);
    const meta = task(host, 'bg_history_append', {
      status: 'running',
      endedAt: undefined,
    });
    writeFileSync(meta.logPath, 'original log\n');
    const panel = panelFor(host, meta.id);
    try {
      expect(panel.render(160).join('\n')).toContain('original log');
      appendFileSync(meta.logPath, 'appended log\n');
      panel.handleInput(']');
      expect(panel.render(160).join('\n')).toContain('appended log');
    } finally {
      panel.dispose();
      rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });

  it('lists every session task newest first, including dismissed and formerly expired outcomes', () => {
    const host = lifecycleHost('history-list', true);
    const old = task(host, 'bg_history_old');
    const dismissed = task(host, 'bg_history_dismissed', {
      startedAt: 3000,
      dismissedAt: 4000,
    });
    const current = task(host, 'bg_history_current', {
      startedAt: 5000,
      status: 'running',
      endedAt: undefined,
    });
    const foreign = task(host, 'bg_history_foreign', {
      callbackOrigin: { cwd: host.ctx.cwd, sessionId: 'foreign' },
    });
    const otherCwd = task(host, 'bg_history_other_cwd', {
      callbackOrigin: {
        cwd: `${host.ctx.cwd}/other`,
        sessionId: host.ctx.sessionManager.getSessionId(),
      },
    });
    const panel = panelFor(host);
    try {
      const text = panel.render(140).join('\n');
      expect(text).toContain(old.id);
      expect(text).toContain(dismissed.id);
      expect(text).not.toContain(foreign.id);
      expect(text).not.toContain(otherCwd.id);
      expect(panel.getRenderDebugState()).toMatchObject({
        itemCount: 3,
        selectedId: current.id,
      });
      panel.handleInput('\x1b[C');
      expect(panel.selectedItem()?.id).toBe(dismissed.id);
      panel.handleInput('\x1b[C');
      expect(panel.selectedItem()?.id).toBe(old.id);
    } finally {
      panel.dispose();
      for (const meta of [old, dismissed, current, foreign, otherCwd])
        rmSync(taskDir(meta.id), { recursive: true, force: true });
    }
  });
});
