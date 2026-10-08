import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { isolatedCore } from './isolated-core-fixture.js';
import { legacyWorkPanel } from './legacy-work-panel-fixture.js';
import { provider, uiSession } from './work-panel-fixture.js';

const ownershipKey = Symbol.for('thoth.pi-core.work-panel');
const legacyLifecycleKey = Symbol.for('thoth.pi-core.work-panel-lifecycle.v1');
const shared = globalThis as typeof globalThis & Record<symbol, unknown>;
const cleanups: Array<() => void> = [];
let first: Awaited<ReturnType<typeof isolatedCore>>;
let second: Awaited<ReturnType<typeof isolatedCore>>;
let compatible: Awaited<ReturnType<typeof isolatedCore>>;
beforeAll(async () => {
  first = await isolatedCore();
  second = await isolatedCore(2);
  compatible = await isolatedCore();
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  delete shared[ownershipKey];
  delete shared[legacyLifecycleKey];
});
afterAll(async () => {
  await first?.dispose();
  await second?.dispose();
  await compatible?.dispose();
});

function activationSession() {
  const ui = uiSession();
  const ctx = { ...ui.ctx, isIdle: () => true } as ExtensionContext;
  const handlers = new Map<
    string,
    Set<(event: any, ctx: ExtensionContext) => unknown>
  >();
  const on = vi.fn(
    (name: string, handler: (event: any, ctx: ExtensionContext) => unknown) => {
      const listeners = handlers.get(name) ?? new Set();
      handlers.set(name, listeners);
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  );
  return {
    ...ui,
    ctx,
    pi: { on } as unknown as ExtensionAPI,
    on,
    emit(name: string, event: Record<string, unknown>) {
      for (const handler of handlers.get(name) ?? []) handler(event, ctx);
    },
  };
}

function activate(
  core: typeof first.core,
  session: ReturnType<typeof activationSession>,
  id: string,
) {
  cleanups.push(core.bindWorkPanelLifecycle(session.pi, session.ctx));
  cleanups.push(
    core.registerWorkPanelProvider(session.pi, {
      ...provider(id, id),
      version: core.WORK_PANEL_VERSION,
    }),
  );
  return core
    .ensureWorkPanel(session.ctx)
    .then((release) => cleanups.push(release));
}

describe('mixed work-panel contracts', () => {
  it('does not claim ownership through the read-only focus query', () => {
    const session = activationSession();
    expect(
      first.core.isWorkPanelRootEditorInputActive(session.ctx),
    ).toBeUndefined();
    expect(shared[ownershipKey]).toBeUndefined();
  });

  it.each([
    false,
    true,
  ])('shares sections, lifecycle and concurrent installation for compatible copies (second first: %s)', async (reverse) => {
    const [owner, other] = reverse
      ? [compatible.core, first.core]
      : [first.core, compatible.core];
    expect(owner.ensureWorkPanel).not.toBe(other.ensureWorkPanel);
    const session = activationSession();
    await Promise.all([
      activate(owner, session, 'Owner'),
      activate(other, session, 'Other'),
    ]);
    expect(session.render().join('\n')).toContain('Owner item');
    expect(session.render().join('\n')).toContain('Other item');
    expect(session.ui.setWidget).toHaveBeenCalledTimes(1);
    expect(session.ui.onTerminalInput).toHaveBeenCalledTimes(1);
    expect(session.listenerCount()).toBe(1);
    expect(
      session.on.mock.calls.filter(([event]) => event === 'input'),
    ).toHaveLength(1);
    session.emit('input', { text: 'new prompt', source: 'interactive' });
    session.emit('before_agent_start', { prompt: 'new prompt' });
    expect(owner.getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
    expect(other.getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
    expect(other.isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
    session.setOverlay(true);
    expect(other.isWorkPanelRootEditorInputActive(session.ctx)).toBe(false);
  });

  it.each([
    false,
    true,
  ])('never duplicates a legacy-layout host (legacy first: %s)', async (legacyFirst) => {
    const session = activationSession();
    if (legacyFirst) cleanups.push(legacyWorkPanel(session.ctx));
    await activate(first.core, session, 'First');
    if (!legacyFirst) cleanups.push(legacyWorkPanel(session.ctx));
    await expect(
      activate(compatible.core, session, 'Second'),
    ).resolves.not.toThrow();
    expect(session.ui.setWidget).toHaveBeenCalledTimes(1);
    expect(session.ui.onTerminalInput).toHaveBeenCalledTimes(1);
    expect(session.listenerCount()).toBe(1);
    expect(session.render().join('\n')).toContain('Legacy');
    if (legacyFirst) {
      expect(session.render().join('\n')).not.toContain('First');
      expect(session.render().join('\n')).not.toContain('Second');
      expect(session.on).not.toHaveBeenCalled();
      expect(
        first.core.isWorkPanelRootEditorInputActive(session.ctx),
      ).toBeUndefined();
      expect(
        compatible.core.isWorkPanelRootEditorInputActive(session.ctx),
      ).toBeUndefined();
    } else {
      expect(session.render().join('\n')).toContain('First item');
      expect(session.render().join('\n')).toContain('Second item');
    }
  });

  it.each([
    false,
    true,
  ])('keeps the first contract as sole owner (v2 first: %s)', async (reverse) => {
    const [owner, incompatible] = reverse
      ? [second.core, first.core]
      : [first.core, second.core];
    expect(owner.ensureWorkPanel).not.toBe(incompatible.ensureWorkPanel);
    expect(incompatible.WORK_PANEL_VERSION).not.toBe(owner.WORK_PANEL_VERSION);
    const session = activationSession();
    await activate(owner, session, 'Owner');
    const subscriptions = session.on.mock.calls.length;
    await expect(
      activate(incompatible, session, 'Incompatible'),
    ).resolves.not.toThrow();
    expect(session.render().join('\n')).toContain('Owner item');
    expect(session.render().join('\n')).not.toContain('Incompatible');
    expect(session.ui.setWidget).toHaveBeenCalledTimes(1);
    expect(session.ui.onTerminalInput).toHaveBeenCalledTimes(1);
    expect(session.listenerCount()).toBe(1);
    expect(session.on).toHaveBeenCalledTimes(subscriptions);
    expect(
      incompatible.isWorkPanelRootEditorInputActive(session.ctx),
    ).toBeUndefined();
    session.emit('input', { text: 'new prompt', source: 'interactive' });
    session.emit('before_agent_start', { prompt: 'new prompt' });
    expect(owner.getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
    expect(incompatible.getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
  });
});
