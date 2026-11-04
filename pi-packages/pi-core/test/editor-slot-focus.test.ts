import { initTheme } from '@earendil-works/pi-coding-agent';
import type { EditorComponent } from '@earendil-works/pi-tui';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { openOwnedOverlay } from '../src/owned-overlay.js';
import { registerEditorSlot } from '../src/panel.js';
import {
  inputComponent,
  ownedOverlaySession,
} from './owned-overlay-fixture.js';

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
