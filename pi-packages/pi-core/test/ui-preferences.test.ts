import { afterEach, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  getUIPreferences,
  registerUIPreferences,
  registerWorkPanelProvider,
  subscribeUIPreferences,
  updateUIPreferences,
  withdrawUIPreferences,
} from '../src/index.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

it('merges owner preferences across copies, updates and releases independently', async () => {
  const changed = vi.fn();
  cleanups.push(subscribeUIPreferences(changed));
  const first = registerUIPreferences({ absorbedWorkPanelSources: ['agents'] });
  cleanups.push(() => withdrawUIPreferences(first));
  vi.resetModules();
  const copy = await import('../src/ui-preferences.js');
  const second = copy.registerUIPreferences({
    absorbedWorkPanelSources: ['todos', 'agents'],
  });
  cleanups.push(() => copy.withdrawUIPreferences(second));
  expect(getUIPreferences()).toEqual({
    absorbedWorkPanelSources: ['agents', 'todos'],
  });
  updateUIPreferences(first, { absorbedWorkPanelSources: ['background'] });
  expect(copy.getUIPreferences()).toEqual({
    absorbedWorkPanelSources: ['background', 'todos', 'agents'],
  });
  copy.withdrawUIPreferences(second);
  expect(getUIPreferences()).toEqual({
    absorbedWorkPanelSources: ['background'],
  });
  withdrawUIPreferences(first);
  withdrawUIPreferences(first);
  expect(getUIPreferences()).toEqual({ absorbedWorkPanelSources: [] });
  expect(changed).toHaveBeenCalledTimes(5);
});

it('isolates inactive owners, preserves legacy owners and replaces liveness on updates', () => {
  const legacy = registerUIPreferences({
    absorbedWorkPanelSources: ['agents'],
  });
  const live = registerUIPreferences({
    absorbedWorkPanelSources: ['agents', 'todos'],
    isActive: () => true,
  });
  const failed = registerUIPreferences({
    absorbedWorkPanelSources: ['background'],
    isActive: () => {
      throw new Error('Foreign UI');
    },
  });
  cleanups.push(
    () => withdrawUIPreferences(legacy),
    () => withdrawUIPreferences(live),
    () => withdrawUIPreferences(failed),
  );
  expect(getUIPreferences().absorbedWorkPanelSources).toEqual([
    'agents',
    'todos',
  ]);
  updateUIPreferences(live, {
    absorbedWorkPanelSources: ['agents', 'todos'],
    isActive: () => false,
  });
  expect(getUIPreferences().absorbedWorkPanelSources).toEqual(['agents']);
  updateUIPreferences(live, { absorbedWorkPanelSources: ['todos'] });
  expect(getUIPreferences().absorbedWorkPanelSources).toEqual([
    'agents',
    'todos',
  ]);
});

it.each([
  'false',
  'throw',
] as const)('restores absorbed sources on render when owner liveness becomes %s without a refresh', async (failure) => {
  const session = uiSession();
  const agents = { ...provider(), open: vi.fn() };
  cleanups.push(
    registerWorkPanelProvider(session.ctx, agents),
    await ensureWorkPanel(session.ctx),
  );
  let active = true;
  const isActive = vi.fn(() => {
    if (!active && failure === 'throw') throw new Error('Lost UI owner');
    return active;
  });
  const owner = registerUIPreferences({
    absorbedWorkPanelSources: ['agents'],
    isActive,
  });
  cleanups.push(() => withdrawUIPreferences(owner));
  expect(session.render()).toEqual([]);
  expect(session.key('\x1b[D')).toBeUndefined();
  const renders = session.tui.requestRender.mock.calls.length;
  active = false;
  expect(session.render().join('\n')).toContain('Agents item');
  expect(session.tui.requestRender).toHaveBeenCalledTimes(renders);
  expect(session.key('\x1b[D')).toEqual({ consume: true });
  session.key('\r');
  expect(agents.open).toHaveBeenCalledOnce();
});

it('reevaluates owner liveness for focus and selection without a preceding render', async () => {
  const session = uiSession();
  const agents = { ...provider(), open: vi.fn() };
  cleanups.push(
    registerWorkPanelProvider(session.ctx, agents),
    await ensureWorkPanel(session.ctx),
  );
  let active = true;
  const owner = registerUIPreferences({
    absorbedWorkPanelSources: ['agents'],
    isActive: () => active,
  });
  cleanups.push(() => withdrawUIPreferences(owner));
  expect(session.key('\x1b[D')).toBeUndefined();
  active = false;
  expect(session.key('\x1b[D')).toEqual({ consume: true });
  active = true;
  session.key('\r');
  expect(agents.open).not.toHaveBeenCalled();
});

it('absorbs rendered and selected sources, retains left navigation, and restores on release without a render', async () => {
  const session = uiSession();
  const agents = { ...provider(), open: vi.fn() };
  const todos = { ...provider('todos', 'Todos', 20), open: vi.fn() };
  cleanups.push(
    registerWorkPanelProvider(session.ctx, agents),
    registerWorkPanelProvider(session.ctx, todos),
    await ensureWorkPanel(session.ctx),
  );
  session.key('\x1b[D');
  const owner = registerUIPreferences({ absorbedWorkPanelSources: ['agents'] });
  cleanups.push(() => withdrawUIPreferences(owner));
  session.key('\r');
  expect(agents.open).not.toHaveBeenCalled();
  expect(todos.open).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(session.render().join('\n')).not.toContain('Agents');
  expect(session.key('\x1b[D')).toEqual({ consume: true });
  updateUIPreferences(owner, { absorbedWorkPanelSources: ['agents', 'todos'] });
  expect(session.key('\x1b[D')).toBeUndefined();
  expect(session.render()).toEqual([]);
  expect(session.ui.setStatus).toHaveBeenLastCalledWith(
    'thoth-work-panel',
    undefined,
  );
  withdrawUIPreferences(owner);
  expect(session.key('\x1b[D')).toEqual({ consume: true });
  expect(session.render().join('\n')).toContain('Agents');
});
