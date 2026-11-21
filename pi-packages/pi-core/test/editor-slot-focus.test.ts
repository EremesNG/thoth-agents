import { initTheme } from '@earendil-works/pi-coding-agent';
import type { EditorComponent } from '@earendil-works/pi-tui';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { ensureWorkPanel, registerWorkPanelProvider } from '../src/index.js';
import {
  acquireEditorSlotFocus,
  openOwnedOverlay,
  overlayFocusRestorer,
} from '../src/owned-overlay.js';
import { registerEditorSlot } from '../src/panel.js';
import {
  breakOverlayVisibility,
  inputComponent,
  ownedOverlaySession,
} from './owned-overlay-fixture.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
beforeAll(() => initTheme('dark'));
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});
function session() {
  vi.useFakeTimers();
  const result = ownedOverlaySession();
  Object.assign(result.ctx.ui, {
    setWidget() {},
    onTerminalInput: result.tui.addInputListener.bind(result.tui),
  });
  cleanups.push(() => result.tui.stop());
  return result;
}

it.each([
  'eligible',
  'blocked',
])('expands over an owned history overlay (%s restore) and sends the next key to the questionnaire', async (restore) => {
  const { ctx, tui, editor, editorContainer, input } = session();
  let expanded = false;
  const question = inputComponent('Question');
  const slot = registerEditorSlot(
    ctx,
    { key: 'question', replacement: () => (expanded ? question : undefined) },
    () => editor as unknown as EditorComponent,
  );
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  const mounted = editorContainer.children[0];
  const history = inputComponent('History');
  let close = () => {};
  const historyResult = openOwnedOverlay<void>(
    ctx,
    (_tui, _theme, _keys, done) => {
      close = done;
      return history;
    },
  );
  await Promise.resolve();
  if (restore === 'eligible') tui.setFocus(mounted);
  else {
    const dialog = inputComponent('Dialog');
    tui.addChild(dialog);
    tui.setFocus(dialog);
  }
  expanded = true;
  slot.acquireFocus();
  expect(tui.getFocusedComponent()).toBe(mounted);
  input('answer');
  expect(question.handleInput).toHaveBeenCalledExactlyOnceWith('answer');
  expect(history.handleInput).not.toHaveBeenCalled();
  close();
  await historyResult;
  input('next');
  expect(question.handleInput).toHaveBeenLastCalledWith('next');
});

it.each([
  'release',
  'dispose',
])('restores the owned panel displaced by slot acquisition on %s', async (action) => {
  const { ctx, tui, editor, input } = session();
  const slot = registerEditorSlot(
    ctx,
    { key: 'question' },
    () => editor as unknown as EditorComponent,
  );
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  const panel = inputComponent('Model profiles');
  let close = () => {};
  const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return panel;
  });
  await Promise.resolve();
  slot.acquireFocus();
  slot.acquireFocus(); // Reacquisition must not forget the displaced owner.
  expect(tui.getFocusedComponent()).not.toBe(panel);
  if (action === 'release') slot.releaseFocus();
  else slot.dispose();
  expect(tui.getFocusedComponent()).toBe(panel);
  input('\x1b');
  expect(panel.handleInput).toHaveBeenCalledExactlyOnceWith('\x1b');
  close();
  await result;
});

it.each([
  'non-callable',
  'throwing getter',
  'throwing method',
] as const)('leaves focus alone when overlay visibility is unknown (%s)', (failure) => {
  const { ctx, tui, editor } = session();
  const slot = registerEditorSlot(
    ctx,
    { key: 'question' },
    () => editor as unknown as EditorComponent,
  );
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  const foreign = inputComponent('Foreign');
  const handle = tui.showOverlay(foreign);
  cleanups.push(() => handle.hide());
  expect(tui.getFocusedComponent()).toBe(foreign);
  cleanups.push(breakOverlayVisibility(tui, failure));
  expect(() => slot.acquireFocus()).not.toThrow();
  expect(tui.getFocusedComponent()).toBe(foreign);
  expect(() => slot.releaseFocus()).not.toThrow();
  expect(tui.getFocusedComponent()).toBe(foreign);
});

it.each([
  'closed',
  'hidden',
  'invisible',
  'overlay superseded',
  'component superseded',
])('does not restore a displaced panel that is %s', async (state) => {
  const { ctx, tui, editor } = session();
  const slot = registerEditorSlot(
    ctx,
    { key: 'question' },
    () => editor as unknown as EditorComponent,
  );
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  const panel = inputComponent('Model profiles');
  let close = () => {};
  let hide = () => {};
  let visible = true;
  const result = openOwnedOverlay<void>(
    ctx,
    (_tui, _theme, _keys, done) => {
      close = done;
      return panel;
    },
    {
      overlayOptions: { visible: () => visible },
      onHandle: (handle) => {
        hide = () => handle.setHidden(true);
      },
    },
  );
  await Promise.resolve();
  slot.acquireFocus();
  const other = inputComponent('Other focus owner');
  if (state === 'closed') close();
  if (state === 'hidden') hide();
  if (state === 'invisible') visible = false;
  const otherHandle =
    state === 'overlay superseded' ? tui.showOverlay(other) : undefined;
  if (state === 'component superseded') {
    tui.addChild(other);
    tui.setFocus(other);
  }
  slot.releaseFocus();
  expect(tui.getFocusedComponent()).not.toBe(panel);
  slot.dispose();
  expect(tui.getFocusedComponent()).not.toBe(panel);
  close();
  await result;
  otherHandle?.hide();
});

it.each([
  true,
  false,
])('closing each first-party owned overlay restores the slot (expanded=%s)', async (expanded) => {
  const { ctx, tui, editor, input } = session();
  const question = inputComponent('Question');
  const slot = registerEditorSlot(
    ctx,
    { key: 'question', replacement: () => (expanded ? question : undefined) },
    () => editor as unknown as EditorComponent,
  );
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  for (const label of ['Subagents', 'Task-list', 'Background', 'Work detail']) {
    let close = () => {};
    const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
      close = done;
      return inputComponent(label);
    });
    await Promise.resolve();
    close();
    await result;
    expect(tui.hasOverlay()).toBe(false);
    input(label);
    expect((expanded ? question : editor).handleInput).toHaveBeenLastCalledWith(
      label,
    );
  }
});

it.each([
  'collapse',
  'complete',
  'cancel',
  'abort',
])('%s preserves a visible foreign overlay and closing it returns to the editor', async (action) => {
  const { ctx, tui, editor, input } = session();
  let expanded = true;
  const slot = registerEditorSlot(
    ctx,
    {
      key: 'question',
      replacement: () => (expanded ? inputComponent('Question') : undefined),
    },
    () => editor as unknown as EditorComponent,
  );
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  const foreign = inputComponent('Foreign');
  let close = () => {};
  const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return foreign;
  });
  await Promise.resolve();
  expanded = false;
  slot.releaseFocus();
  if (action !== 'collapse') slot.dispose();
  expect(tui.getFocusedComponent()).toBe(foreign);
  input('foreign');
  expect(foreign.handleInput).toHaveBeenCalledExactlyOnceWith('foreign');
  close();
  await result;
  input('editor');
  expect(editor.handleInput).toHaveBeenCalledExactlyOnceWith('editor');
});

const corruptions = [
  'missing',
  'non-callable',
  'throwing getter',
  'throwing method',
  'wrong-typed value',
] as const;
type Corruption = (typeof corruptions)[number];

function corrupt(target: object, key: PropertyKey, failure: Corruption) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  const fail = () => {
    throw new Error(`Incompatible ${String(key)}`);
  };
  if (failure === 'missing' && !original && !(key in target)) return;
  if (failure === 'missing' && original) Reflect.deleteProperty(target, key);
  else
    Object.defineProperty(target, key, {
      configurable: true,
      ...(failure === 'throwing getter'
        ? { get: fail }
        : {
            value: {
              missing: undefined, // Shadow a prototype method.
              'non-callable': 42,
              'throwing method': fail,
              'wrong-typed value': () => 'incompatible',
            }[failure],
          }),
    });
  cleanups.push(() => {
    if (original) Object.defineProperty(target, key, original);
    else Reflect.deleteProperty(target, key);
  });
}

it.each([
  'missing',
  'non-callable',
  'throwing getter',
] as const)('does not report active root input with invalid children (%s) and no overlay', (failure) => {
  const { ctx, tui, editor } = session();
  const slot = registerEditorSlot(
    ctx,
    { key: 'question' },
    () => editor as unknown as EditorComponent,
  );
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  expect(tui.hasOverlay()).toBe(false);
  expect(slot.isRootEditorInputActive()).toBe(true);
  corrupt(tui, 'children', failure);
  expect(slot.isRootEditorInputActive()).toBe(false);
});

const handlesKey = Symbol.for('thoth.pi-core.owned-overlay-handles');
it.each(
  [
    'getFocusedComponent',
    'focusedComponent',
    'overlayStack',
    'isOverlayVisible',
    'children',
    'overlay entry component',
    'overlay entry preFocus',
    'overlay entry hidden',
    'overlay visibility callback',
    'owned handle registry',
    'owned handle map',
    'owned map get',
  ].flatMap((member) =>
    corruptions
      // A missing optional callback means the overlay is always visible.
      .filter(
        (failure) =>
          member !== 'overlay visibility callback' || failure !== 'missing',
      )
      .map((failure) => ({ member, failure })),
  ),
)('fails closed for $member ($failure)', async ({ member, failure }) => {
  const { ctx, tui, editor, editorContainer } = session();
  const slot = registerEditorSlot(
    ctx,
    { key: 'question' },
    () => editor as unknown as EditorComponent,
  );
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  const foreign = inputComponent('Foreign');
  const panel = inputComponent('Owned');
  let close = () => {};
  const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return panel;
  });
  await Promise.resolve();
  cleanups.push(() => close());
  const handle = tui.showOverlay(foreign, { visible: () => true });
  cleanups.push(() => handle.hide());
  const mounted = editorContainer.children[0];
  const stack = Reflect.get(tui, 'overlayStack');
  const entry = stack.at(-1);
  const handles = Reflect.get(globalThis, handlesKey).tuis;
  const focus = Object.getOwnPropertyDescriptor(tui, 'focusedComponent');
  const setFocus = vi.spyOn(tui, 'setFocus');
  cleanups.push(() => setFocus.mockRestore());
  const actualFocus = () =>
    member === 'focusedComponent' || member === 'getFocusedComponent'
      ? focus?.value
      : tui.getFocusedComponent();
  const targets: Record<string, [object, PropertyKey]> = {
    'overlay entry component': [entry, 'component'],
    'overlay entry preFocus': [entry, 'preFocus'],
    'overlay entry hidden': [entry, 'hidden'],
    'overlay visibility callback': [entry.options, 'visible'],
    'owned handle registry': [globalThis, handlesKey],
    'owned handle map': [Reflect.get(globalThis, handlesKey), 'tuis'],
    'owned map get': [handles.get(tui), 'get'],
  };
  if (member === 'getFocusedComponent')
    corrupt(tui, 'focusedComponent', 'missing');
  if (member === 'focusedComponent')
    corrupt(tui, 'getFocusedComponent', 'missing');
  corrupt(...(targets[member] ?? [tui, member]), failure);
  expect(() => slot.acquireFocus()).not.toThrow();
  expect(() => slot.releaseFocus()).not.toThrow();
  expect(setFocus).not.toHaveBeenCalled();
  expect(actualFocus()).toBe(foreign);
  // Check eligibility while the editor itself is selected, too. Changing the
  // backing field directly avoids exercising Pi's lifecycle under corruption.
  if (member !== 'focusedComponent' && member !== 'getFocusedComponent') {
    Reflect.set(tui, 'focusedComponent', mounted);
    expect(slot.isRootEditorInputActive()).toBe(false);
    Reflect.set(tui, 'focusedComponent', foreign);
  } else {
    expect(slot.isRootEditorInputActive()).toBe(false);
  }
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  await result;
});

it('keeps the front owned overlay focused if the lower overlay throws on unfocus', async () => {
  const { ctx, tui, editor, input } = session();
  const slot = registerEditorSlot(
    ctx,
    { key: 'question' },
    () => editor as unknown as EditorComponent,
  );
  if (!slot) throw new Error('Editor slot unavailable');
  cleanups.push(() => slot.dispose());
  const lower = inputComponent('Lower');
  const front = inputComponent('Front');
  for (const component of [lower, front]) {
    let close = () => {};
    void openOwnedOverlay<void>(
      ctx,
      (_tui, _theme, _keys, done) => {
        close = done;
        return component;
      },
      {
        onHandle(handle) {
          if (component === lower)
            vi.spyOn(handle, 'unfocus').mockImplementation(() => {
              throw new Error('Cannot unfocus lower overlay');
            });
        },
      },
    );
    await Promise.resolve();
    cleanups.push(() => close());
  }
  expect(tui.getFocusedComponent()).toBe(front);
  expect(() => slot.acquireFocus()).not.toThrow();
  expect(tui.getFocusedComponent()).toBe(front);
  input('next');
  expect(front.handleInput).toHaveBeenCalledExactlyOnceWith('next');
});

it('does not run a deferred foreign restoration if focus became unknown', () => {
  const { tui } = session();
  const foreign = inputComponent('Foreign');
  tui.showOverlay(foreign);
  const restore = overlayFocusRestorer(tui);
  tui.setFocus(null);
  const setFocus = vi.spyOn(tui, 'setFocus');
  cleanups.push(() => setFocus.mockRestore());
  corrupt(tui, 'getFocusedComponent', 'missing');
  corrupt(tui, 'focusedComponent', 'missing');
  expect(restore).not.toThrow();
  expect(setFocus).not.toHaveBeenCalled();
});

it.each([
  null,
  undefined,
])('can acquire with known-empty focus (%s)', (empty) => {
  const { tui, editor } = session();
  vi.spyOn(tui, 'getFocusedComponent').mockReturnValue(empty as null);
  const setFocus = vi.spyOn(tui, 'setFocus');
  acquireEditorSlotFocus(tui, editor);
  expect(setFocus).toHaveBeenCalledWith(editor);
});

it.each(
  corruptions,
)('keeps the work detail open when its focus is unknown (%s)', async (failure) => {
  const { tui } = session();
  const work = uiSession(tui);
  cleanups.push(
    registerWorkPanelProvider(work.ctx, provider()),
    await ensureWorkPanel(work.ctx),
  );
  work.key('\x1b[D');
  work.key('\r');
  await Promise.resolve();
  const detail = work.customComponent;
  expect(tui.getFocusedComponent()).toBe(detail);
  const setFocus = vi.spyOn(tui, 'setFocus');
  cleanups.push(() => setFocus.mockRestore());
  corrupt(tui, 'getFocusedComponent', failure);
  corrupt(tui, 'focusedComponent', 'missing');
  detail.focused = false;
  await Promise.resolve();
  expect(tui.hasOverlay()).toBe(true);
  expect(setFocus).not.toHaveBeenCalled();
});
