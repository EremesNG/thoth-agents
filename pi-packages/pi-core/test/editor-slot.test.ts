import type { EditorComponent, TUI } from '@earendil-works/pi-tui';
import { afterEach, expect, it, vi } from 'vitest';
import { ensureWorkPanel, registerWorkPanelProvider } from '../src/index.js';
import { isEditorReplaced, registerEditorSlot } from '../src/panel.js';
import { provider, uiSession } from './work-panel-fixture.js';

const registryKey = Symbol.for('thoth.pi-core.editor-slot');
const cleanups: Array<() => void> = [];
function useRegistryRecord(value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, registryKey);
  Object.defineProperty(globalThis, registryKey, {
    configurable: true,
    writable: true,
    value,
  });
  cleanups.push(() => {
    if (previous) Object.defineProperty(globalThis, registryKey, previous);
    else Reflect.deleteProperty(globalThis, registryKey);
  });
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

it('returns false without creating a registry when no editor slot exists', () => {
  useRegistryRecord(undefined);
  const { tui } = uiSession();
  expect(isEditorReplaced(tui as unknown as TUI)).toBe(false);
  expect(Reflect.get(globalThis, registryKey)).toBeUndefined();
});

it.each([
  { name: 'legacy', override: {} },
  { name: 'incompatible version', override: { version: 2 } },
  { name: 'incompatible sessions', override: { sessions: new Map() } },
  { name: 'incompatible tuis', override: { tuis: new Map() } },
  { name: 'non-callable query', override: { isEditorReplaced: true } },
  { name: 'non-boolean answer', override: { isEditorReplaced: () => 'yes' } },
  {
    name: 'throwing query',
    override: {
      isEditorReplaced: () => {
        throw new Error('Foreign query');
      },
    },
  },
])('returns false for $name registry records without modifying them', ({
  override,
}) => {
  const record = Object.freeze({
    version: 1,
    sessions: new WeakMap(),
    tuis: new WeakMap(),
    ...override,
  });
  useRegistryRecord(record);
  const { tui } = uiSession();
  expect(isEditorReplaced(tui as unknown as TUI)).toBe(false);
  expect(Reflect.get(globalThis, registryKey)).toBe(record);
});

it('composes editor replacement with work rows without re-invoking the retained factory', async () => {
  const session = uiSession();
  cleanups.push(
    registerWorkPanelProvider(session.ctx, provider()),
    await ensureWorkPanel(session.ctx),
  );
  const retained = session.tui.getFocusedComponent();
  const factory = session.ui.getEditorComponent();
  let expanded = true;
  const question = {
    render: () => ['Question'],
    invalidate() {},
    handleInput: vi.fn(),
  };
  const slot = registerEditorSlot(session.ctx, {
    key: 'question',
    replacement: () => (expanded ? question : undefined),
  });
  expect(slot).toBeDefined();
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  expect(isEditorReplaced(slot.tui)).toBe(true);
  expect(session.ui.getEditorComponent()).toBe(factory);
  expect(session.baseFactory).toHaveBeenCalledTimes(1);
  expect(retained.render(80)).toEqual(['Question']);
  retained.handleInput('answer');
  expect(question.handleInput).toHaveBeenCalledExactlyOnceWith('answer');
  expanded = false;
  slot.refresh();
  expect(isEditorReplaced(slot.tui)).toBe(false);
  expect(retained.render(80)).toEqual([]);
  expect(session.render().join('\n')).toContain('Agents item');
  expect(slot.isRootEditorInputActive()).toBe(true);
});

it('shares a single owner across separately loaded copies and restores the previous factory on final teardown', async () => {
  const session = uiSession();
  const first = registerEditorSlot(session.ctx, { key: 'first' });
  expect(first).toBeDefined();
  cleanups.push(() => first?.dispose());
  vi.resetModules();
  const { isEditorReplaced: queryCopy, registerEditorSlot: registerCopy } =
    await import('../src/panel.js');
  expect(queryCopy).not.toBe(isEditorReplaced);
  let expanded = true;
  const question = { render: () => ['Question'], invalidate() {} };
  const second = registerCopy(session.ctx, {
    key: 'second',
    replacement: () => (expanded ? question : undefined),
  });
  expect(second).toBeDefined();
  cleanups.push(() => second?.dispose());
  if (!first || !second) throw new Error('Editor slot unavailable');
  expect(session.baseFactory).toHaveBeenCalledTimes(1);
  expect(isEditorReplaced(first.tui)).toBe(true);
  expect(queryCopy(second.tui)).toBe(true);
  expanded = false;
  second.refresh();
  expect(isEditorReplaced(first.tui)).toBe(false);
  expect(queryCopy(second.tui)).toBe(false);
  expanded = true;
  second.refresh();
  first.dispose();
  expect(queryCopy(second.tui)).toBe(true);
  expect(session.ui.getEditorComponent()).not.toBe(session.baseFactory);
  second.dispose();
  expect(isEditorReplaced(first.tui)).toBe(false);
  expect(queryCopy(second.tui)).toBe(false);
  expect(session.ui.getEditorComponent()).toBe(session.baseFactory);
  expect(session.listenerCount()).toBe(0);
});

it('tracks the last active replacement, falling back to earlier contributions before restoring the editor', () => {
  const session = uiSession();
  const first = registerEditorSlot(session.ctx, {
    key: 'first',
    replacement: () => ({ render: () => ['First'], invalidate() {} }),
  });
  cleanups.push(() => first?.dispose());
  let expanded = false;
  const second = registerEditorSlot(session.ctx, {
    key: 'second',
    replacement: () =>
      expanded ? { render: () => ['Second'], invalidate() {} } : undefined,
  });
  cleanups.push(() => second?.dispose());
  if (!first || !second) throw new Error('Editor slot unavailable');
  const mounted = session.tui.getFocusedComponent();
  expect(mounted.render(80)).toEqual(['First']);
  expect(isEditorReplaced(first.tui)).toBe(true);
  expect(isEditorReplaced(uiSession().tui as unknown as TUI)).toBe(false);
  expanded = true;
  second.refresh();
  expect(mounted.render(80)).toEqual(['Second']);
  expect(isEditorReplaced(first.tui)).toBe(true);
  expanded = false;
  second.refresh();
  expect(mounted.render(80)).toEqual(['First']);
  expect(isEditorReplaced(first.tui)).toBe(true);
  first.dispose();
  expect(mounted.render(80)).toEqual([]);
  expect(isEditorReplaced(first.tui)).toBe(false);
  second.dispose();
  expect(isEditorReplaced(first.tui)).toBe(false);
});

it.each([
  'foreign factory',
  'remounted factory',
])('returns false when the owner loses liveness through a %s', (change) => {
  const session = uiSession();
  const slot = registerEditorSlot(session.ctx, {
    key: 'question',
    replacement: () => ({ render: () => ['Question'], invalidate() {} }),
  });
  cleanups.push(() => slot?.dispose());
  if (!slot) throw new Error('Editor slot unavailable');
  expect(isEditorReplaced(slot.tui)).toBe(true);
  session.ui.setEditorComponent(
    change === 'foreign factory'
      ? session.baseFactory
      : session.ui.getEditorComponent(),
  );
  expect(isEditorReplaced(slot.tui)).toBe(false);
});

it('does not add a query to a legacy registry even when registering a replacement', () => {
  const record = Object.freeze({
    version: 1,
    sessions: new WeakMap(),
    tuis: new WeakMap(),
  });
  useRegistryRecord(record);
  const session = uiSession();
  const slot = registerEditorSlot(session.ctx, {
    key: 'question',
    replacement: () => ({ render: () => ['Question'], invalidate() {} }),
  });
  cleanups.push(() => slot?.dispose());
  if (!slot) throw new Error('Editor slot unavailable');
  expect(session.tui.getFocusedComponent().render(80)).toEqual(['Question']);
  expect(isEditorReplaced(slot.tui)).toBe(false);
  expect(Reflect.get(globalThis, registryKey)).toBe(record);
  expect(record).not.toHaveProperty('isEditorReplaced');
});

it('does not upgrade or replace a legacy owner in a current registry', () => {
  useRegistryRecord(undefined);
  const session = uiSession();
  const slot = registerEditorSlot(session.ctx, { key: 'seed' });
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  slot.dispose();
  const record = Reflect.get(globalThis, registryKey) as {
    sessions: WeakMap<object, unknown>;
    tuis: WeakMap<TUI, unknown>;
  };
  const owner = Object.freeze({
    register: vi.fn(),
    focusTarget: () => undefined,
  });
  record.sessions.set(session.ctx.sessionManager, owner);
  record.tuis.set(slot.tui, owner);
  const contribution = { key: 'new' };
  registerEditorSlot(session.ctx, contribution);
  expect(isEditorReplaced(slot.tui)).toBe(false);
  expect(owner.register).toHaveBeenCalledExactlyOnceWith(contribution);
  expect(record.tuis.get(slot.tui)).toBe(owner);
  expect(owner).not.toHaveProperty('isEditorReplaced');
});

it('returns false when a foreign registry accessor throws', () => {
  useRegistryRecord(undefined);
  Object.defineProperty(globalThis, registryKey, {
    get() {
      throw new Error('Foreign registry accessor');
    },
  });
  expect(isEditorReplaced(uiSession().tui as unknown as TUI)).toBe(false);
});

it('tears down a failed first contribution without leaving its factory or input listener installed', () => {
  const session = uiSession();
  session.ui.setWidget.mockImplementationOnce(() => {
    throw new Error('Widget failure');
  });
  expect(() =>
    registerEditorSlot(session.ctx, {
      key: 'question',
      aboveEditor: () => ({ render: () => [], invalidate() {} }),
    }),
  ).toThrow('Widget failure');
  expect(session.ui.getEditorComponent()).toBe(session.baseFactory);
  expect(session.listenerCount()).toBe(0);
});

it('forwards editor callbacks, methods and app actions to the retained editor', () => {
  const session = uiSession();
  const actions = new Map();
  const editor = {
    render: () => [],
    invalidate() {},
    handleInput() {},
    text: '',
    getText() {
      return this.text;
    },
    setText(value: string) {
      this.text = value;
    },
    actionHandlers: actions,
  };
  session.ui.setEditorComponent(() => editor as unknown as EditorComponent);
  const slot = registerEditorSlot(session.ctx, { key: 'question' });
  cleanups.push(() => slot?.dispose());
  const mounted = session.tui.getFocusedComponent();
  const onSubmit = vi.fn();
  mounted.onSubmit = onSubmit;
  mounted.setText('steering');
  expect(editor).toMatchObject({ onSubmit, text: 'steering' });
  expect(mounted.getText()).toBe('steering');
  expect(mounted.actionHandlers).toBe(actions);
});
