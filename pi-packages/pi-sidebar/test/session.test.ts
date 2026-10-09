import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import type { TuiMainScreen } from '@earendil-works/pi-tui';
import {
  ensureWorkPanel,
  getUIPreferences,
  publish,
  registerWorkPanelProvider,
  SUBAGENTS_USAGE_CHANNEL,
  SUBAGENTS_USAGE_REQUEST,
  WORK_PANEL_VERSION,
} from '@thoth-agents/pi-core';
import { afterEach, expect, it, vi } from 'vitest';
import { uiSession } from '../../pi-core/test/work-panel-fixture.js';
import sidebar from '../src/index.js';
import { fullscreen, inline } from './layout/fixture.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const off of cleanup.splice(0).reverse()) off();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
function setup(regular = false) {
  vi.useFakeTimers();
  const dir = mkdtempSync(join(tmpdir(), 'sidebar-session-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  vi.stubEnv('PI_CODING_AGENT_DIR', dir);
  const fixture = regular ? inline() : fullscreen();
  fixture.terminal.columns = 160;
  fixture.terminal.rows = 30;
  const handlers = new Map<string, (event: any, ctx: any) => unknown>();
  const commands = new Map<string, any>();
  const shortcuts = new Map<string, any>();
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const events = {
    on(channel: string, callback: (value: unknown) => void) {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      set.add(callback);
      return () => set.delete(callback);
    },
    emit(channel: string, value: unknown) {
      for (const callback of listeners.get(channel) ?? []) callback(value);
    },
  };
  const requests = vi.fn();
  events.on(SUBAGENTS_USAGE_REQUEST.name, requests);
  let observer: any;
  let input: ((data: string) => any) | undefined;
  const ui = {
    notify: vi.fn(),
    setStatus: vi.fn(),
    getEditorText: () => '',
    onTerminalInput(handler: (data: string) => any) {
      input = handler;
      const off = fixture.proxy.addInputListener(handler);
      return () => {
        input = undefined;
        off();
      };
    },
    setWidget(_key: string, factory: any) {
      observer?.dispose?.();
      if (observer) {
        if ('root' in fixture) fixture.root.removeChild(observer);
        else fixture.tui.removeChild(observer);
      }
      observer = factory?.(fixture.proxy, {
        fg: (_role: string, value: string) => value,
      });
      if (observer) {
        if ('root' in fixture) fixture.root.addChild(observer);
        else fixture.tui.addChild(observer);
      }
    },
  };
  const ctx = {
    ui,
    mode: 'tui',
    hasUI: true,
    cwd: dir,
    model: { id: 'test', provider: 'claude-bridge' },
    getContextUsage: () => ({ tokens: 100, contextWindow: 1000, percent: 10 }),
    sessionManager: { getSessionId: () => 'session', getEntries: () => [] },
  } as unknown as ExtensionContext;
  sidebar({
    on(name: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(name, handler);
    },
    registerCommand(name: string, options: any) {
      commands.set(name, options);
    },
    registerShortcut(name: string, options: any) {
      shortcuts.set(name, options);
    },
    events,
    getThinkingLevel: () => 'high',
  } as unknown as ExtensionAPI);
  cleanup.push(() => {
    handlers.get('session_shutdown')?.({}, ctx);
    fixture.tui.stop();
  });
  return {
    ...fixture,
    handlers,
    commands,
    shortcuts,
    events,
    listeners,
    requests,
    ui,
    ctx,
    dir,
    screen: () =>
      ('getScreenLines' in fixture.tui
        ? fixture.tui.getScreenLines()
        : fixture.tui.render(fixture.terminal.columns)
      ).join('\n'),
    input: (data: string) => input?.(data),
    observe: () => observer?.render(160),
    shutdown: () => handlers.get('session_shutdown')?.({}, ctx),
  };
}
function source(pi: any) {
  let change = () => {};
  let primary = 'Task one';
  const off = registerWorkPanelProvider(pi, {
    version: WORK_PANEL_VERSION,
    id: 'test-source',
    label: 'Tasks',
    priority: 10,
    visibleCount: () => 1,
    listRows: () => [{ id: 'one', primary }],
    detail: () => undefined,
    armCloseLabel: () => '',
    close: () => {},
    onVisibleChanged(callback: () => void) {
      change = callback;
      return () => {};
    },
  } as any);
  cleanup.push(off);
  return () => {
    primary = 'Task two';
    change();
  };
}

it('declares only displayed source panels, releases on hide/narrow/dispose, persists panel commands and refreshes sources', () => {
  const app = setup();
  const changed = source({ on() {} });
  app.handlers.get('session_start')?.({ reason: 'startup' }, app.ctx);
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  expect(app.requests).toHaveBeenCalledTimes(1);
  app.tui.start();
  app.tui.renderNow(true);
  expect(app.screen()).toContain('Task one');
  changed();
  app.tui.renderNow(true);
  expect(app.screen()).toContain('Task two');
  const command = (text: string) =>
    app.commands.get('sidebar').handler(text, app.ctx);
  command('panels hide test-source');
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  expect(
    JSON.parse(
      readFileSync(join(app.dir, 'thoth-sidebar.json'), 'utf8'),
    ).panels.find((p: { id: string }) => p.id === 'test-source').visible,
  ).toBe(false);
  command('panels show test-source');
  command('off');
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  command('on');
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  app.terminal.columns = 123;
  app.terminal.resize();
  app.tui.renderNow(true);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  app.terminal.columns = 131;
  app.terminal.resize();
  app.tui.renderNow(true);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  app.terminal.columns = 132;
  app.terminal.resize();
  app.tui.renderNow(true);
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  app.shutdown();
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  expect(app.listeners.get(SUBAGENTS_USAGE_CHANNEL.name)?.size).toBe(0);
  expect(app.input('\x1b[D')).toBeUndefined();
});

it.each([
  false,
  true,
])('returns absorbed sources on the next work-panel render alone after foreign renderer takeover (regular %s)', async (regular) => {
  const app = setup(regular);
  const originalRender = app.tui.render;
  source({ on() {} });
  const work = uiSession(app.tui as unknown as TuiMainScreen);
  cleanup.push(await ensureWorkPanel(work.ctx));
  app.handlers.get('session_start')?.({}, app.ctx);
  expect(work.render().join('\n')).not.toContain('Task one');
  const foreign = { render: () => work.render(), invalidate() {} };
  if (regular) app.proxy.render = originalRender;
  else if ('setLayoutRoot' in app.tui) app.tui.setLayoutRoot(foreign);
  // Do not run the sidebar observer, refresh, commands, input or timers.
  expect(work.render().join('\n')).toContain('Task one');
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  app.shutdown();
  if (regular) {
    expect(app.tui.render).toBe(originalRender);
    expect(app.tui.hasOverlay()).toBe(false);
  } else expect((app.tui as any).layoutRoot).toBe(foreign);
});

it.each([
  [false, 'sync'],
  [true, 'sync'],
  [false, 'refresh'],
  [true, 'refresh'],
  [false, 'input'],
  [true, 'input'],
  [false, 'command'],
  [true, 'command'],
] as const)('returns absorbed sources to the work panel after foreign %s renderer takeover on %s', async (regular, tick) => {
  const app = setup(regular);
  const originalRender = app.tui.render;
  source({ on() {} });
  const work = uiSession(app.tui as unknown as TuiMainScreen);
  cleanup.push(await ensureWorkPanel(work.ctx));
  expect(work.render().join('\n')).toContain('Task one');
  app.handlers.get('session_start')?.({}, app.ctx);
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  expect(work.render().join('\n')).not.toContain('Task one');
  const foreign = { render: () => work.render(), invalidate() {} };
  if (regular) app.proxy.render = originalRender;
  else if ('setLayoutRoot' in app.tui) app.tui.setLayoutRoot(foreign);
  // A foreign fullscreen root no longer includes the lifecycle widget. Invoke
  // its session.sync() explicitly rather than relying on a surviving render.
  if (tick === 'sync') app.observe();
  else if (tick === 'refresh') app.handlers.get('model_select')?.({}, app.ctx);
  else if (tick === 'input') app.input('ordinary editor input');
  else app.commands.get('sidebar').handler('panels', app.ctx);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  expect(work.render().join('\n')).toContain('Task one');
  app.commands.get('sidebar').handler('off', app.ctx);
  app.commands.get('sidebar').handler('on', app.ctx);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  app.shutdown();
  if (regular) {
    expect(app.tui.render).toBe(originalRender);
    expect(app.tui.hasOverlay()).toBe(false);
  } else expect((app.tui as any).layoutRoot).toBe(foreign);
});

it.each([
  'hidden',
  'removed',
])('withdraws inline absorption when its overlay is externally %s during render', (state) => {
  const app = setup(true);
  const handles: ReturnType<typeof app.tui.showOverlay>[] = [];
  const showOverlay = app.tui.showOverlay.bind(app.tui);
  app.tui.showOverlay = (...args) => {
    const handle = showOverlay(...args);
    handles.push(handle);
    return handle;
  };
  source({ on() {} });
  app.handlers.get('session_start')?.({}, app.ctx);
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  if (state === 'hidden') handles[0].setHidden(true);
  else handles[0].hide();
  app.tui.renderNow(true);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  expect(app.widths.at(-1)).toBe(160);
});

it('combines latest cumulative subagent usage without accumulating, guards foreign sessions, and supports resize/revert and fullscreen divider drag', () => {
  const app = setup();
  app.handlers.get('session_start')?.({}, app.ctx);
  app.tui.start();
  const send = (cost: number, sessionId = 'session') =>
    publish(app.events, SUBAGENTS_USAGE_CHANNEL, {
      sessionId,
      source: 'test',
      data: { totalCost: cost, runCount: 1 },
    });
  send(1);
  send(2);
  send(20, 'foreign');
  app.tui.renderNow(true);
  expect(app.screen()).toContain('$2.000 (sub)');
  app.shortcuts.get('ctrl+shift+r').handler(app.ctx);
  expect(app.input('\x1b[C')).toEqual({ consume: true });
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(117);
  app.input('\x1b');
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(116);
  app.terminal.input('\x1b[<0;116;2M');
  app.terminal.input('\x1b[<32;110;2M');
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(109);
  app.terminal.input('\x1b[<0;110;2m');
  const overlay = app.tui.showOverlay({
    render: () => ['Dialog'],
    invalidate() {},
  });
  app.shortcuts.get('ctrl+shift+r').handler(app.ctx);
  expect(app.input('\x1b[D')).toBeUndefined();
  overlay.hide();
});

it('mounts a decorative regular sidebar and never declares absorption after a failed mount', () => {
  const app = setup(true);
  source({ on() {} });
  app.handlers.get('session_start')?.({}, app.ctx);
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  expect(app.tui.hasOverlay()).toBe(true);
  app.shutdown();
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  Object.defineProperty(app.tui, 'mode', {
    value: 'unsupported',
    configurable: true,
  });
  app.handlers.get('session_start')?.({}, app.ctx);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  expect(app.ui.notify).toHaveBeenCalledTimes(1);
});

it('shrinks manual presentation to 28 at 92 columns, restores preferred width, and persists startup without persisting session controls', () => {
  const app = setup();
  source({ on() {} });
  app.handlers.get('session_start')?.({}, app.ctx);
  app.tui.start();
  const command = (text: string) =>
    app.commands.get('sidebar').handler(text, app.ctx);
  command('manual');
  app.terminal.columns = 92;
  app.terminal.resize();
  app.tui.renderNow(true);
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(64);
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  app.terminal.columns = 91;
  app.terminal.resize();
  app.tui.renderNow(true);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  app.terminal.columns = 160;
  app.terminal.resize();
  app.tui.renderNow(true);
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(116);
  command('startup off');
  const config = JSON.parse(
    readFileSync(join(app.dir, 'thoth-sidebar.json'), 'utf8'),
  );
  expect(Object.keys(config).sort()).toEqual(['panels', 'startup']);
  expect(config.startup).toBe('off');
  app.handlers.get('session_start')?.({ reason: 'new' }, app.ctx);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  command('on');
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(116);
  expect(app.requests).toHaveBeenCalledTimes(2);
});

it('discovers sources after activation and returns absorbed sources when height reduction removes their panel', () => {
  const app = setup();
  app.handlers.get('session_start')?.({}, app.ctx);
  source({ on() {} });
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  app.terminal.rows = 3;
  app.observe();
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  app.terminal.rows = 30;
  app.observe();
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
});

it('refreshes its independent git reader after write/edit/bash results and turn end without a theme', async () => {
  const app = setup();
  vi.useRealTimers();
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: app.dir, stdio: 'pipe' });
  git('init', '-b', 'events-test');
  app.handlers.get('session_start')?.({}, app.ctx);
  app.tui.start();
  const screen = () => {
    app.tui.renderNow(true);
    return app.screen();
  };
  await vi.waitFor(() => expect(screen()).toContain('Clean'), {
    timeout: 3000,
  });
  expect(screen()).toContain('events-test');
  for (const toolName of ['write', 'edit', 'bash']) {
    writeFileSync(join(app.dir, toolName), 'data');
    app.handlers.get('tool_result')?.({ toolName }, app.ctx);
    await vi.waitFor(
      () =>
        expect(screen()).toContain(
          `${['write', 'edit', 'bash'].indexOf(toolName) + 1} untracked`,
        ),
      { timeout: 3000 },
    );
  }
  git('add', '.');
  app.handlers.get('turn_end')?.({}, app.ctx);
  await vi.waitFor(() => expect(screen()).toContain('3 staged'), {
    timeout: 3000,
  });
});
