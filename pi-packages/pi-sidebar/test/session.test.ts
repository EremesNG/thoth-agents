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
  registerRenderKit,
  registerWorkPanelProvider,
  reportProviderLimit,
  SUBAGENTS_STATE_CHANNEL,
  SUBAGENTS_STATE_REQUEST,
  SUBAGENTS_USAGE_CHANNEL,
  SUBAGENTS_USAGE_REQUEST,
  setAnimationLevel,
  subscribeAnimationClock,
  subscribeUIPreferences,
  WORK_PANEL_VERSION,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { createWorkPanelColumnPlan } from '@thoth-agents/pi-core/panel';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@thoth-agents/pi-core/panel', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@thoth-agents/pi-core/panel')>();
  return {
    ...original,
    createWorkPanelColumnPlan: vi.fn(original.createWorkPanelColumnPlan),
  };
});

import { uiSession } from '../../pi-core/test/work-panel-fixture.js';
import sidebar from '../src/index.js';
import { agentRow, source as historySource, strip } from './fixture.js';
import { fullscreen, inline } from './layout/fixture.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const off of cleanup.splice(0).reverse()) off();
  setAnimationLevel('full');
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
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
  let overlay: any;
  const inputs = new Set<(data: string) => any>();
  const ui = {
    custom: vi.fn(
      (factory: any) =>
        new Promise((resolve) => {
          Promise.resolve(
            factory(
              {
                mode: 'fullscreen',
                terminal: { rows: 40, write() {} },
                requestRender() {},
              },
              { fg: (_role: string, value: string) => value },
              {},
              resolve,
            ),
          ).then((component) => {
            overlay = component;
          });
        }),
    ),
    notify: vi.fn(),
    setStatus: vi.fn(),
    getEditorText: () => '',
    onTerminalInput(handler: (data: string) => any) {
      inputs.add(handler);
      const off = fixture.proxy.addInputListener(handler);
      return () => {
        inputs.delete(handler);
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
    input: (data: string) => [...inputs].at(-1)?.(data),
    observe: () => observer?.render(160),
    overlay: () => overlay,
    shutdown: () => handlers.get('session_shutdown')?.({}, ctx),
  };
}
function source(pi: any, status?: string, semantic = false) {
  let change = () => {};
  let primary = 'Task one';
  const off = registerWorkPanelProvider(pi, {
    version: WORK_PANEL_VERSION,
    id: 'test-source',
    label: 'Tasks',
    priority: 10,
    visibleCount: () => 1,
    listRows: () => [
      {
        id: 'one',
        primary,
        status,
        ...(semantic ? { statusGlyph: status } : {}),
      },
    ],
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
  app.terminal.columns = 129;
  app.terminal.resize();
  app.tui.renderNow(true);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  app.terminal.columns = 137;
  app.terminal.resize();
  app.tui.renderNow(true);
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  app.terminal.columns = 138;
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

it('absorbs finished-only Agents and Background history after resume without repeated registry updates', async () => {
  const app = setup();
  app.handlers.get('session_start')?.({ reason: 'startup' }, app.ctx);
  const endedAt = Date.now() - 60 * 60 * 1000;
  cleanup.push(
    historySource(
      'subagents',
      'Agents',
      [{ ...agentRow('agent', 'old agent', 'completed'), endedAt }],
      { running: 0, completed: 136, failed: 3, total: 139 },
    ),
    historySource(
      'background-tasks',
      'Background',
      [{ ...agentRow('background', 'old build', 'completed'), endedAt }],
      { running: 0, completed: 3, failed: 0, total: 3 },
    ),
  );
  const work = uiSession(app.tui as unknown as TuiMainScreen);
  cleanup.push(await ensureWorkPanel(work.ctx));
  const updates = vi.fn();
  cleanup.push(subscribeUIPreferences(updates));

  app.handlers.get('session_start')?.({ reason: 'resume' }, app.ctx);
  app.tui.start();
  app.tui.renderNow(true);
  const screen = strip(app.screen());
  expect(screen).toContain('AGENTS');
  expect(screen).toContain('BACKGROUND');
  expect(screen).toContain('✓136 ✗3');
  expect(screen).toContain('old agent');
  expect(screen).toContain('old build');
  expect(getUIPreferences().absorbedWorkPanelSources).toEqual([
    'subagents',
    'background-tasks',
  ]);
  expect(work.render()).toEqual([]);

  updates.mockClear();
  for (let i = 0; i < 3; i++) {
    app.observe();
    app.tui.renderNow(true);
    expect(work.render()).toEqual([]);
  }
  expect(updates).not.toHaveBeenCalled();
  app.commands.get('sidebar').handler('panels hide subagents', app.ctx);
  expect(updates).toHaveBeenCalledTimes(1);
  expect(getUIPreferences().absorbedWorkPanelSources).toEqual([
    'background-tasks',
  ]);
  expect(work.render().join('\n')).toContain('Agents');
  expect(work.render().join('\n')).not.toContain('Background');
  app.observe();
  expect(updates).toHaveBeenCalledTimes(1);
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
  expect(app.screen()).toMatch(/Cost\s+\$0\.000 \(sub\) \+\$2\.000/);
  app.commands.get('sidebar').handler('resize', app.ctx);
  expect(app.input('\x1b[C')).toEqual({ consume: true });
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(111);
  app.input('\x1b');
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(110);
  app.terminal.input('\x1b[<0;110;2M');
  app.terminal.input('\x1b[<32;110;2M');
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(109);
  app.terminal.input('\x1b[<0;110;2m');
  const overlay = app.tui.showOverlay({
    render: () => ['Dialog'],
    invalidate() {},
  });
  app.commands.get('sidebar').handler('resize', app.ctx);
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

it.each([
  false,
  true,
])('shrinks manual presentation to 28 at 92 columns, restores preferred width, and persists startup without persisting session controls (regular %s)', (regular) => {
  const app = setup(regular);
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
  expect(app.widths.at(-1)).toBe(110);
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
  expect(app.widths.at(-1)).toBe(110);
  expect(app.requests).toHaveBeenCalledTimes(2);
});

it.each([
  false,
  true,
])('preserves 64 main columns when starting manual mode at 92 columns (regular %s)', (regular) => {
  const app = setup(regular);
  writeFileSync(
    join(app.dir, 'thoth-sidebar.json'),
    JSON.stringify({ startup: 'manual', width: 28 }),
  );
  app.terminal.columns = 92;
  app.handlers.get('session_start')?.({}, app.ctx);
  app.tui.start();
  app.tui.renderNow(true);
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(64);
  app.terminal.columns = 160;
  app.terminal.resize();
  app.tui.renderNow(true);
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(124);
});

it('shows provider limits from the registry at start and on report, and clears them when allowed', () => {
  const base = {
    provider: 'claude-bridge',
    window: '5h',
    observedAt: 1,
    sessionId: 'limits',
  };
  // The registry has no replay: an entry reported before start must still show.
  reportProviderLimit({ ...base, status: 'allowed_warning', utilization: 0.9 });
  const app = setup();
  app.handlers.get('session_start')?.({}, app.ctx);
  app.tui.start();
  app.tui.renderNow(true);
  expect(app.screen()).toMatch(/Limit\s+5h 90% · claude-bridge/);
  reportProviderLimit({ ...base, status: 'rejected', utilization: 1 });
  app.tui.renderNow(true);
  expect(app.screen()).toMatch(/Limit\s+5h blocked/);
  reportProviderLimit({ ...base, status: 'allowed' });
  app.tui.renderNow(true);
  expect(app.screen()).not.toContain('Limit');
});

it('refreshes the workspace at turn start and after any tool result', async () => {
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
  writeFileSync(join(app.dir, 'later'), 'x');
  app.handlers.get('turn_start')?.({}, app.ctx);
  await vi.waitFor(() => expect(screen()).toMatch(/Untracked\s+1\b/), {
    timeout: 3000,
  });
  writeFileSync(join(app.dir, 'read-side-effect'), 'x');
  app.handlers.get('tool_result')?.({ toolName: 'read' }, app.ctx);
  await vi.waitFor(() => expect(screen()).toMatch(/Untracked\s+2\b/), {
    timeout: 3000,
  });
});

it('discovers sources after activation and returns absorbed sources when height reduction removes their panel', () => {
  const app = setup();
  app.handlers.get('session_start')?.({}, app.ctx);
  source({ on() {} });
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  app.terminal.rows = 3;
  app.observe();
  expect(getUIPreferences().absorbedWorkPanelSources).toContain('test-source');
  app.terminal.rows = 2;
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
        expect(screen()).toMatch(
          new RegExp(
            `Untracked\\s+${['write', 'edit', 'bash'].indexOf(toolName) + 1}\\b`,
          ),
        ),
      { timeout: 3000 },
    );
  }
  git('add', '.');
  app.handlers.get('turn_end')?.({}, app.ctx);
  await vi.waitFor(
    () => expect(screen()).toMatch(/Changed\s+3 files \+3 [-−]0/),
    {
      timeout: 3000,
    },
  );
});

it.each([
  false,
  true,
])('resizes from the submitted command with live width, confirms for the session and reverts (regular %s)', async (regular) => {
  const app = setup(regular);
  const work = uiSession(app.tui as unknown as TuiMainScreen);
  cleanup.push(await ensureWorkPanel(work.ctx));
  Object.assign(work.ctx.sessionManager, { getEntries: () => [] });
  const ctx = { ...app.ctx, sessionManager: work.ctx.sessionManager };
  app.handlers.get('session_start')?.({}, ctx);
  const command = (text: string) =>
    app.commands.get('sidebar').handler(text, ctx);
  const status = (width: number) =>
    expect(app.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-sidebar-resize',
      `Sidebar width ${width} (36–72) · ←/→ move divider · Shift 4 · Enter confirm · Esc revert`,
    );
  await command('resize');
  status(50);
  expect(app.input('\x1b[D')).toEqual({ consume: true });
  status(51);
  expect(app.input('\x1b[1;2C')).toEqual({ consume: true });
  status(47);
  expect(app.input('\r')).toEqual({ consume: true });
  expect(app.ui.setStatus).toHaveBeenLastCalledWith(
    'thoth-sidebar-resize',
    undefined,
  );
  await command('off');
  await command('on');
  await command('resize');
  status(47);
  app.input('\x1b[C');
  app.input('\x1b');
  await command('resize');
  status(47);
});

it.each([
  false,
  true,
])('prioritizes resize over a retained work panel through native terminal dispatch (regular %s)', async (regular) => {
  const app = setup(regular);
  source({ on() {} });
  const work = uiSession(app.tui as unknown as TuiMainScreen);
  cleanup.push(await ensureWorkPanel(work.ctx));
  Object.assign(work.ctx.sessionManager, { getEntries: () => [] });
  const ctx = { ...app.ctx, sessionManager: work.ctx.sessionManager };
  app.handlers.get('session_start')?.({}, ctx);
  const command = (text: string) =>
    app.commands.get('sidebar').handler(text, ctx);
  command('panels hide test-source');
  expect(work.render().join('\n')).toContain('Task one');
  expect(getUIPreferences().absorbedWorkPanelSources).not.toContain(
    'test-source',
  );
  app.tui.start();
  const inputListeners = (
    app.tui as unknown as { inputListeners: Set<unknown> }
  ).inputListeners;
  const listenerCount = inputListeners.size;
  const status = (width: number) =>
    expect(app.ui.setStatus).toHaveBeenLastCalledWith(
      'thoth-sidebar-resize',
      `Sidebar width ${width} (36–72) · ←/→ move divider · Shift 4 · Enter confirm · Esc revert`,
    );
  command('resize');
  expect(inputListeners.size).toBe(listenerCount + 1);
  app.terminal.input('\x1b[D');
  status(51);
  app.terminal.input('\x1b[1;2D');
  status(55);
  app.terminal.input('\x1b[C');
  status(54);
  app.terminal.input('\x1b');
  expect(inputListeners.size).toBe(listenerCount);
  expect(app.ui.setStatus).toHaveBeenLastCalledWith(
    'thoth-sidebar-resize',
    undefined,
  );
  command('resize');
  status(50);
  app.terminal.input('\r');
  expect(inputListeners.size).toBe(listenerCount);
  // After confirmation, the host receives Left again and focuses its row.
  app.terminal.input('\x1b[D');
  expect(work.render().join('\n')).toContain('›');
  command('resize');
  app.terminal.input('\x1b[C');
  status(49);
  app.shutdown();
  expect(inputListeners.size).toBe(listenerCount - 1);
  app.terminal.input('\x1b[C');
  expect(work.render().join('\n')).not.toContain('›');
});

it.each([
  false,
  true,
])('guards hidden, narrow, unmounted and blocking-overlay resize commands (regular %s)', async (regular) => {
  const app = setup(regular);
  app.handlers.get('session_start')?.({}, app.ctx);
  const command = (text: string) =>
    app.commands.get('sidebar').handler(text, app.ctx);
  await command('off');
  await command('resize');
  expect(app.ui.notify).toHaveBeenLastCalledWith(
    'Sidebar hidden — /sidebar on first.',
    'info',
  );
  await command('on');
  app.terminal.columns = 90;
  await command('resize');
  expect(app.ui.notify).toHaveBeenLastCalledWith(
    'Sidebar hidden — terminal too narrow.',
    'info',
  );
  app.terminal.columns = 160;
  const overlay = app.tui.showOverlay({
    render: () => ['Dialog'],
    invalidate() {},
  });
  await command('resize');
  expect(app.input('\x1b[D')).toBeUndefined();
  expect(app.ui.setStatus).not.toHaveBeenCalled();
  overlay.hide();
  app.shutdown();
  Object.defineProperty(app.tui, 'mode', {
    value: 'unsupported',
    configurable: true,
  });
  app.handlers.get('session_start')?.({}, app.ctx);
  await command('resize');
  expect(app.ui.notify).toHaveBeenLastCalledWith(
    'Sidebar unavailable — renderer is not mounted.',
    'info',
  );
});

it('renders resize guidance inside the sidebar and removes it on confirm and revert', () => {
  const app = setup();
  app.handlers.get('session_start')?.({}, app.ctx);
  app.tui.start();
  app.commands.get('sidebar').handler('resize', app.ctx);
  app.tui.renderNow(true);
  expect(app.screen()).toContain('RESIZE');
  expect(app.screen()).toContain('width 50 (36–72)');
  app.input('\x1b[D');
  app.tui.renderNow(true);
  expect(app.screen()).toContain('width 51');
  app.input(String.fromCharCode(13));
  app.tui.renderNow(true);
  expect(app.screen()).not.toContain('RESIZE');
  app.commands.get('sidebar').handler('resize', app.ctx);
  app.input('\x1b[D');
  app.tui.renderNow(true);
  expect(app.screen()).toContain('width 52');
  app.input(String.fromCharCode(27));
  app.tui.renderNow(true);
  expect(app.screen()).not.toContain('RESIZE');
});

it('reuses one plan through sync, render and unconsumed keystrokes without serializing lines', () => {
  const app = setup();
  vi.setSystemTime(1000);
  source({ on() {} }, 'running');
  app.handlers.get('session_start')?.({}, app.ctx);
  expect(createWorkPanelColumnPlan).toHaveBeenCalledTimes(1);
  app.tui.start();
  app.tui.renderNow(true);
  const stringify = vi.spyOn(JSON, 'stringify');
  for (let index = 0; index < 20; index++) {
    app.observe();
    expect(app.input('ordinary editor input')).toBeUndefined();
    app.tui.renderNow(true);
  }
  expect(createWorkPanelColumnPlan).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(101);
  expect(createWorkPanelColumnPlan).toHaveBeenCalledTimes(2);
  expect(stringify).not.toHaveBeenCalled();
});

it.each(
  (
    [
      ['full', 100],
      ['reduced', 200],
      ['minimal', 500],
      ['off', 1000],
    ] as const
  ).flatMap(([level, period]) =>
    [false, true].flatMap((animated) =>
      ['provider', 'registry', 'limits', 'usage', 'state'].map((event) => ({
        level,
        period,
        animated,
        event,
      })),
    ),
  ),
)('refreshes $event immediately when idle/off and on the next $level step when animated ($animated)', ({
  level,
  period,
  animated,
  event,
}) => {
  const app = setup();
  vi.setSystemTime(1000);
  setAnimationLevel(level);
  const changed = source({ on() {} }, animated ? 'running' : 'pending');
  app.handlers.get('session_start')?.({}, app.ctx);
  const render = vi.spyOn(app.tui, 'requestRender');
  render.mockClear();
  const builds = vi.mocked(createWorkPanelColumnPlan).mock.calls.length;
  if (event === 'provider') changed();
  else if (event === 'registry') {
    cleanup.push(
      registerWorkPanelProvider(
        { on() {} } as any,
        {
          version: WORK_PANEL_VERSION,
          id: 'new-source',
          label: 'New source',
          priority: 20,
          listRows: () => [{ id: 'new', primary: 'New task' }],
        } as any,
      ),
    );
  } else if (event === 'limits') {
    const base = {
      provider: 'sidebar-scheduling',
      window: 'test',
      observedAt: 1000,
      sessionId: 'session',
    };
    cleanup.push(() => reportProviderLimit({ ...base, status: 'allowed' }));
    reportProviderLimit({ ...base, status: 'rejected' });
  } else if (event === 'usage') {
    publish(app.events, SUBAGENTS_USAGE_CHANNEL, {
      sessionId: 'session',
      source: 'test',
      data: { totalCost: 1, runCount: 1 },
    });
  } else {
    publish(app.events, SUBAGENTS_STATE_CHANNEL, {
      sessionId: 'session',
      source: 'test',
      data: stateSnapshot(1),
    });
  }
  if (animated && level !== 'off') {
    expect(render).not.toHaveBeenCalled();
    expect(createWorkPanelColumnPlan).toHaveBeenCalledTimes(builds);
    vi.advanceTimersByTime(period);
  }
  expect(render).toHaveBeenCalledTimes(1);
  expect(
    vi.mocked(createWorkPanelColumnPlan).mock.calls.length,
  ).toBeGreaterThan(builds);
});

it.each(
  (['full', 'off'] as const).flatMap((level) =>
    ['idle', 'hidden', 'clipped'].map((state) => ({ level, state })),
  ),
)('leaves no animation or elapsed-refresh subscription for $state rows at $level', ({
  level,
  state,
}) => {
  const app = setup();
  vi.setSystemTime(1000);
  setAnimationLevel(level);
  source({ on() {} }, state === 'idle' ? 'pending' : 'running');
  if (state === 'hidden')
    writeFileSync(
      join(app.dir, 'thoth-sidebar.json'),
      JSON.stringify({ startup: 'off' }),
    );
  if (state === 'clipped') app.terminal.rows = 3;
  const timers = vi.getTimerCount();
  app.handlers.get('session_start')?.({}, app.ctx);
  expect(vi.getTimerCount()).toBe(timers + 1); // Initial workspace debounce only.
  const off = subscribeAnimationClock(() => {});
  cleanup.push(off);
  expect(vi.getTimerCount()).toBe(timers + (level === 'off' ? 1 : 2));
  off();
  app.shutdown();
  expect(vi.getTimerCount()).toBe(timers);
});

it('shares the aligned clock and defers animated provider bursts until its next tick', () => {
  const app = setup();
  vi.setSystemTime(1050);
  const tick = vi.fn();
  const off = subscribeAnimationClock(tick);
  cleanup.push(off);
  const changed = source({ on() {} }, 'running');
  const timers = vi.getTimerCount();
  app.handlers.get('session_start')?.({}, app.ctx);
  // The only extra timer is the initial event-driven workspace read.
  expect(vi.getTimerCount()).toBe(timers + 1);
  app.tui.start();
  app.tui.renderNow(true);
  const render = vi.spyOn(app.tui, 'requestRender');
  render.mockClear();
  changed();
  changed();
  expect(render).not.toHaveBeenCalled();
  vi.advanceTimersByTime(50);
  expect(render).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(tick).toHaveBeenCalledExactlyOnceWith(1101, expect.any(Number));
  expect(render).toHaveBeenCalledTimes(1);
  app.tui.renderNow(true);
  expect(app.screen()).toContain('Task two');
  app.commands.get('sidebar').handler('off', app.ctx);
  off();
  const idleTimers = vi.getTimerCount();
  const idleTick = subscribeAnimationClock(() => {});
  cleanup.push(idleTick);
  expect(vi.getTimerCount()).toBe(idleTimers + 1);
  idleTick();
});

it.each(
  (
    [
      [undefined, 100],
      ['full', 100],
      ['reduced', 200],
      ['minimal', 500],
    ] as const
  ).flatMap(([level, period]) =>
    [false, true].map((themed) => ({ level, period, themed })),
  ),
)('shows every consecutive sidebar frame at $level (unset defaults to full), themed $themed', ({
  level,
  period,
  themed,
}) => {
  const app = setup();
  vi.setSystemTime(1000);
  if (level !== undefined) setAnimationLevel(level);
  if (themed) {
    const token = registerRenderKit(createTestRenderKit(), {});
    cleanup.push(() => withdrawRenderKit(token));
  }
  source({ on() {} }, 'running', true);
  app.handlers.get('session_start')?.({}, app.ctx);
  app.tui.start();
  app.tui.renderNow(true);
  const frame = () => app.screen().match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u)?.[0] ?? 'missing';
  const frames = [frame()];
  for (let step = 0; step < 10; step++) {
    vi.advanceTimersByTime(period);
    app.tui.renderNow(true);
    expect(frame()).not.toBe(frames.at(-1));
    frames.push(frame());
  }
  expect(frames).toEqual([
    '⠋',
    '⠙',
    '⠹',
    '⠸',
    '⠼',
    '⠴',
    '⠦',
    '⠧',
    '⠇',
    '⠏',
    '⠋',
  ]);
});

it.each([
  '◐',
  '*',
])('at off shows %s, refreshes provider changes immediately and elapsed every second only while running', (glyph) => {
  const app = setup();
  vi.setSystemTime(1000);
  setAnimationLevel('off');
  const render = vi
    .spyOn(app.tui, 'requestRender')
    .mockImplementation(() => {});
  const screen = () => {
    app.tui.renderNow(true);
    return strip(app.screen());
  };
  const kit = createTestRenderKit();
  const token = registerRenderKit(
    {
      ...kit,
      statusGlyph: (theme, status) =>
        status === 'running' ? glyph : kit.statusGlyph(theme, status),
    },
    {},
  );
  cleanup.push(() => withdrawRenderKit(token));
  let running = true;
  let primary = 'First';
  let changed = () => {};
  cleanup.push(
    registerWorkPanelProvider({ on() {} } as any, {
      version: WORK_PANEL_VERSION,
      id: 'elapsed',
      label: 'Tasks',
      priority: 10,
      visibleCount: () => 1,
      detail: () => null,
      armCloseLabel: () => '',
      close() {},
      listRows: () => [
        {
          id: 'one',
          primary: `${primary} elapsed ${Math.floor((Date.now() - 1000) / 1000)}s`,
          status: running ? 'running' : 'completed',
          statusGlyph: running ? 'running' : 'completed',
        },
      ],
      onVisibleChanged: (notify) => {
        changed = notify;
        return () => {};
      },
    }),
  );
  app.handlers.get('session_start')?.({}, app.ctx);
  app.tui.start();
  expect(screen()).toContain(`${glyph} First elapsed 0s`);
  expect(screen()).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u);
  render.mockClear();
  primary = 'Updated';
  changed();
  expect(render).toHaveBeenCalledTimes(1);
  expect(screen()).toContain('Updated elapsed 0s');
  render.mockClear();
  changed();
  expect(render).not.toHaveBeenCalled();
  vi.advanceTimersByTime(999);
  expect(render).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(render).toHaveBeenCalledTimes(1);
  expect(screen()).toContain(`${glyph} Updated elapsed 1s`);
  running = false;
  render.mockClear();
  changed();
  expect(render).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  render.mockClear();
  vi.advanceTimersByTime(2000);
  expect(render).not.toHaveBeenCalled();
  setAnimationLevel('full');
  expect(vi.getTimerCount()).toBe(0);
  app.shutdown();
  expect(vi.getTimerCount()).toBe(0);
});

it('refreshes running text when the sidebar is re-shown without a step at off', () => {
  const app = setup();
  vi.setSystemTime(1000);
  setAnimationLevel('off');
  cleanup.push(
    registerWorkPanelProvider({ on() {} } as any, {
      version: WORK_PANEL_VERSION,
      id: 'reopen',
      label: 'Tasks',
      priority: 10,
      visibleCount: () => 1,
      detail: () => null,
      armCloseLabel: () => '',
      close() {},
      listRows: () => [
        {
          id: 'one',
          primary: `elapsed ${Date.now() / 1000}s`,
          status: 'running',
        },
      ],
    }),
  );
  app.handlers.get('session_start')?.({}, app.ctx);
  app.tui.start();
  app.tui.renderNow(true);
  expect(app.screen()).toContain('elapsed 1s');
  app.commands.get('sidebar').handler('off', app.ctx);
  vi.setSystemTime(10000);
  app.commands.get('sidebar').handler('on', app.ctx);
  app.tui.renderNow(true);
  expect(app.screen()).toContain('elapsed 10s');
});

it('repaints immediately on every level change and preserves consecutive frames across off and pause/resume', () => {
  const app = setup();
  vi.setSystemTime(1000);
  const token = registerRenderKit(createTestRenderKit(), {});
  cleanup.push(() => withdrawRenderKit(token));
  source({ on() {} }, 'running');
  app.handlers.get('session_start')?.({}, app.ctx);
  const render = vi
    .spyOn(app.tui, 'requestRender')
    .mockImplementation(() => {});
  app.tui.start();
  const screen = () => {
    app.tui.renderNow(true);
    return strip(app.screen());
  };
  vi.advanceTimersByTime(200);
  expect(screen()).toContain('⠹ Task one');
  render.mockClear();
  setAnimationLevel('off');
  expect(render).toHaveBeenCalledTimes(1);
  expect(screen()).toContain('◐ Task one');
  vi.advanceTimersByTime(1000);
  expect(screen()).toContain('◐ Task one');
  render.mockClear();
  setAnimationLevel('minimal');
  expect(render).toHaveBeenCalledTimes(1);
  expect(screen()).toContain('⠹ Task one');
  vi.advanceTimersByTime(500);
  expect(screen()).toContain('⠸ Task one');
  render.mockClear();
  setAnimationLevel('reduced');
  expect(render).toHaveBeenCalledTimes(1);
  expect(screen()).toContain('⠸ Task one');
  vi.advanceTimersByTime(200);
  expect(screen()).toContain('⠼ Task one');
  app.commands.get('sidebar').handler('off', app.ctx);
  vi.advanceTimersByTime(1000);
  app.commands.get('sidebar').handler('on', app.ctx);
  expect(screen()).toContain('⠼ Task one');
  vi.advanceTimersByTime(200);
  expect(screen()).toContain('⠴ Task one');
  app.shutdown();
  render.mockClear();
  setAnimationLevel('full');
  expect(render).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('ticks animated visible work at the host cadence and stops on completion, hide and disposal', () => {
  const app = setup();
  vi.setSystemTime(1000);
  let running = true;
  let change = () => {};
  cleanup.push(
    registerWorkPanelProvider(app.ctx, {
      version: WORK_PANEL_VERSION,
      id: 'animated',
      label: 'Animated',
      priority: 10,
      visibleCount: () => 1,
      listRows: () => [
        {
          id: 'task',
          primary: 'Animated task',
          status: running ? 'running' : 'completed',
          statusGlyph: running ? 'running' : 'completed',
        },
      ],
      detail: () => null,
      armCloseLabel: () => '',
      close: () => {},
      onVisibleChanged: (notify) => {
        change = notify;
        return () => {};
      },
    }),
  );
  app.handlers.get('session_start')?.({}, app.ctx);
  const render = vi.spyOn(app.tui, 'requestRender');
  render.mockClear();
  vi.advanceTimersByTime(101);
  expect(render).toHaveBeenCalled();
  render.mockClear();
  running = false;
  change();
  expect(render).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(render).toHaveBeenCalledTimes(1);
  render.mockClear();
  vi.advanceTimersByTime(300);
  expect(render).not.toHaveBeenCalled();
  running = true;
  change();
  app.commands.get('sidebar').handler('off', app.ctx);
  render.mockClear();
  vi.advanceTimersByTime(300);
  expect(render).not.toHaveBeenCalled();
  app.commands.get('sidebar').handler('on', app.ctx);
  app.shutdown();
  render.mockClear();
  vi.advanceTimersByTime(300);
  expect(render).not.toHaveBeenCalled();
});

it('does not request a render for unchanged refreshes or scan entries during main renders', () => {
  const app = setup();
  const entries = vi.spyOn(app.ctx.sessionManager, 'getEntries');
  app.handlers.get('session_start')?.({}, app.ctx);
  const scans = entries.mock.calls.length;
  const render = vi.spyOn(app.tui, 'requestRender');
  render.mockClear();
  for (let index = 0; index < 20; index++) {
    app.observe();
    app.screen();
    app.handlers.get('tool_result')?.({ toolName: 'read' }, app.ctx);
  }
  expect(entries).toHaveBeenCalledTimes(scans);
  expect(render).not.toHaveBeenCalled();
  for (const event of [
    'message_end',
    'turn_end',
    'agent_end',
    'session_tree',
    'session_compact',
    'model_select',
  ]) {
    const previous = entries.mock.calls.length;
    app.handlers.get(event)?.({}, app.ctx);
    expect(entries).toHaveBeenCalledTimes(previous + 1);
  }
});

const stateSnapshot = (cost: number, endedAt?: number) => ({
  tasks: [
    {
      id: 'live',
      agent: 'worker',
      displayName: 'Fix auth',
      mode: 'task' as const,
      status: 'running' as const,
      createdAt: 0,
      startedAt: 1,
      usage: { cost },
    },
  ],
  history: [
    {
      id: 'old',
      agent: 'oracle',
      displayName: 'Old review',
      mode: 'task' as const,
      status: 'completed' as const,
      createdAt: 0,
      endedAt: endedAt ?? 10,
      usage: { cost: 2 },
    },
  ],
  counts: {
    queued: 0,
    running: 1,
    stopping: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    interrupted: 0,
  },
  totals: {
    queued: 0,
    running: 1,
    stopping: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    interrupted: 0,
    total: 1,
  },
});

it('requests subagent state, ranks live and persisted cost from state snapshots and opens the curves overlay', async () => {
  const app = setup();
  writeFileSync(
    join(app.dir, 'thoth-sidebar.json'),
    JSON.stringify({ panels: [{ id: 'cost', visible: true }] }),
  );
  app.handlers.get('session_start')?.({ reason: 'startup' }, app.ctx);
  app.tui.start();
  const requested = vi.fn();
  app.events.on(SUBAGENTS_STATE_REQUEST.name, requested);
  expect(app.listeners.get(SUBAGENTS_STATE_CHANNEL.name)?.size).toBe(1);
  app.handlers.get('session_start')?.({ reason: 'new' }, app.ctx);
  expect(requested).toHaveBeenCalledTimes(1);
  publish(app.events, SUBAGENTS_STATE_CHANNEL, {
    sessionId: 'other-session',
    source: 'test',
    data: stateSnapshot(9),
  });
  app.tui.renderNow(true);
  expect(app.screen()).not.toContain('Fix auth');
  for (const cost of [0.5, 1])
    publish(app.events, SUBAGENTS_STATE_CHANNEL, {
      sessionId: 'session',
      source: 'test',
      data: stateSnapshot(cost),
    });
  app.tui.renderNow(true);
  const screen = app.screen();
  expect(screen).toContain('COST');
  expect(screen.indexOf('Old review')).toBeLessThan(screen.indexOf('Fix auth'));
  expect(screen).toContain('/sidebar cost');
  const done = app.commands.get('sidebar').handler('cost', app.ctx);
  await vi.waitFor(() => expect(app.overlay()).toBeDefined());
  const view = app.overlay().render(80).join('\n');
  expect(view).toContain('Subagent cost curves');
  expect(view).toContain('Fix auth');
  app.overlay().handleInput('q');
  await done;
  app.shutdown();
  expect(app.listeners.get(SUBAGENTS_STATE_CHANNEL.name)?.size).toBe(0);
});

it('lists Cost last and appends it to saved orders without rearranging them', () => {
  const app = setup();
  writeFileSync(
    join(app.dir, 'thoth-sidebar.json'),
    JSON.stringify({
      panels: [
        { id: 'workspace', visible: true },
        { id: 'session', visible: false },
      ],
    }),
  );
  app.handlers.get('session_start')?.({ reason: 'startup' }, app.ctx);
  source({ on() {} });
  app.commands.get('sidebar').handler('panels', app.ctx);
  expect(app.ui.notify.mock.calls.at(-1)?.[0].split('\n')).toEqual([
    'on  workspace',
    'off session',
    'on  test-source',
    'on  cost',
  ]);
  // A panel discovered later still slots in before Cost.
  const fresh = setup();
  fresh.handlers.get('session_start')?.({ reason: 'startup' }, fresh.ctx);
  source({ on() {} });
  fresh.commands.get('sidebar').handler('panels', fresh.ctx);
  expect(
    fresh.ui.notify.mock.calls
      .at(-1)?.[0]
      .split('\n')
      .map((l: string) => l.slice(4)),
  ).toEqual(['session', 'workspace', 'test-source', 'cost']);
});

it('saves settings from the overlay with Enter, preserving unknown keys, and applies the width', async () => {
  const app = setup();
  const path = join(app.dir, 'thoth-sidebar.json');
  writeFileSync(
    path,
    JSON.stringify({
      future: { keep: true },
      panels: [{ id: 'session', visible: true, extra: 1 }],
    }),
  );
  app.handlers.get('session_start')?.({ reason: 'startup' }, app.ctx);
  app.tui.start();
  const done = app.commands.get('sidebar').handler('settings', app.ctx);
  await vi.waitFor(() => expect(app.overlay()).toBeDefined());
  const overlay = app.overlay();
  expect(overlay.render(80).join('\n')).toContain('[x] Session');
  // Hide Session, move Workspace down, then set startup and a wider sidebar.
  const DOWN = '\u001b[B';
  const keys = [
    ' ',
    DOWN,
    '\u001b[1;2B',
    DOWN,
    '\u001b[C',
    DOWN,
    ...Array(4).fill('\u001b[C'),
    '\r',
  ];
  for (const key of keys) overlay.handleInput(key);
  await done;
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(saved.future).toEqual({ keep: true });
  expect(saved.startup).toBe('manual');
  expect(saved.width).toBe(54);
  expect(saved.panels.find((p: any) => p.id === 'session')).toEqual({
    id: 'session',
    visible: false,
    extra: 1,
  });
  app.tui.renderNow(true);
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(106);
});

it('leaves the config untouched when the settings overlay is cancelled', async () => {
  const app = setup();
  const path = join(app.dir, 'thoth-sidebar.json');
  writeFileSync(
    path,
    JSON.stringify({ panels: [{ id: 'session', visible: true }] }),
  );
  const before = readFileSync(path, 'utf8');
  app.handlers.get('session_start')?.({ reason: 'startup' }, app.ctx);
  const done = app.commands.get('sidebar').handler('settings', app.ctx);
  await vi.waitFor(() => expect(app.overlay()).toBeDefined());
  app.overlay().handleInput(' ');
  app.overlay().handleInput('\u001b');
  await done;
  expect(readFileSync(path, 'utf8')).toBe(before);
});

it('applies a saved default width at the next start', () => {
  const app = setup();
  writeFileSync(
    join(app.dir, 'thoth-sidebar.json'),
    JSON.stringify({ width: 60 }),
  );
  app.handlers.get('session_start')?.({ reason: 'startup' }, app.ctx);
  app.tui.start();
  app.tui.renderNow(true);
  app.tui.renderNow(true);
  expect(app.widths.at(-1)).toBe(100);
});
