import { openOwnedOverlay } from '@thoth-agents/pi-core';
import { afterEach, expect, it, vi } from 'vitest';
import {
  inputComponent,
  ownedOverlaySession,
} from '../pi-core/test/owned-overlay-fixture.js';
import { evictSession, getState, replaceState } from './state/store.js';
import { createMockCtx, makeTheme } from './test/helpers.js';
import { showTodoPanel, type TodoPanel } from './todo-panel.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each([
  ['same editor', 'history first'],
  ['same editor', 'question first'],
  ['replacement editor', 'history first'],
  ['replacement editor', 'question first'],
])('closes only task-list history and restores the mounted editor (%s, %s)', async (transition, order) => {
  vi.useFakeTimers();
  const {
    ctx: sdkCtx,
    tui,
    editor,
    editorContainer,
    input,
  } = ownedOverlaySession();
  cleanups.push(() => tui.stop());
  const writes = vi.spyOn(tui.terminal, 'write');
  const showOverlay = vi.spyOn(tui, 'showOverlay');
  const render = vi.spyOn(tui, 'requestRender');
  const sdkCustom = sdkCtx.ui.custom;
  const custom: typeof sdkCustom = (factory, options) =>
    sdkCustom(
      (tui, _theme, _keys, done) =>
        factory(tui, makeTheme(), { matches: () => false } as never, done),
      options,
    );
  const ctx = createMockCtx({
    mode: 'tui',
    sessionId: 'overlay-focus',
    ui: { ...sdkCtx.ui, custom } as never,
  });
  const state = {
    tasks: [
      {
        id: 1,
        subject: 'Selected task',
        status: 'pending' as const,
        description: 'Selected task description',
      },
    ],
    nextId: 2,
  };
  replaceState('overlay-focus', state);
  cleanups.push(() => evictSession('overlay-focus'));
  const opening = showTodoPanel(ctx, '1');
  const historySettled = vi.fn();
  void opening.then(historySettled);
  await Promise.resolve();
  const history = tui.getFocusedComponent() as TodoPanel;
  expect(history).not.toBe(editor);
  cleanups.push(() => history.handleInput('q'));
  expect(history.render(120).join('\n')).toContain('Selected task description');
  expect(history.getRenderDebugState().selectedId).toBe('1');
  expect(showOverlay).toHaveBeenCalledExactlyOnceWith(history, {
    anchor: 'top-left',
    width: '100%',
    maxHeight: '100%',
    margin: 0,
  });
  expect(writes).toHaveBeenCalledWith('\x1b[?1000h\x1b[?1006h');

  let mountedEditor = editor;
  if (transition === 'replacement editor') {
    mountedEditor = inputComponent('Replacement editor');
    ctx.ui.setEditorComponent(() => mountedEditor as any);
    expect(editorContainer.children).not.toContain(editor);
  } else {
    tui.setFocus(editor);
  }
  expect(editorContainer.children).toEqual([mountedEditor]);
  expect(tui.getFocusedComponent()).toBe(mountedEditor);
  // Keep the question's preFocus on history, exercising stale-focus repair
  // even when history closes first and the old editor is detached.
  if (transition === 'replacement editor') tui.setFocus(history);
  input('j');
  expect(tui.getFocusedComponent()).toBe(history);
  expect(mountedEditor.handleInput).not.toHaveBeenCalled();

  const question = inputComponent('Question');
  let closeQuestion: (answer: string) => void = () => {};
  const answer = openOwnedOverlay<string>(ctx, (_tui, _theme, _keys, close) => {
    closeQuestion = close;
    return question;
  });
  cleanups.push(() => closeQuestion('cleanup'));
  await Promise.resolve();
  input('before close');
  expect(question.handleInput).toHaveBeenCalledExactlyOnceWith('before close');
  expect(historySettled).not.toHaveBeenCalled();

  if (order === 'history first') {
    history.handleInput('q');
    await opening;
    expect(tui.hasOverlay()).toBe(true);
    expect(tui.getFocusedComponent()).toBe(question);
    input('after close');
    expect(question.handleInput).toHaveBeenLastCalledWith('after close');
    closeQuestion('answer');
  } else {
    closeQuestion('answer');
    await expect(answer).resolves.toBe('answer');
    expect(tui.hasOverlay()).toBe(true);
    expect(tui.getFocusedComponent()).toBe(history);
    expect(historySettled).not.toHaveBeenCalled();
    expect(history.getRenderDebugState().selectedId).toBe('1');
    expect(history.render(120).join('\n')).toContain(
      'Selected task description',
    );
    input('q');
  }
  await opening;
  await expect(answer).resolves.toBe('answer');
  expect(getState('overlay-focus')).toEqual(state);
  expect(writes).toHaveBeenCalledWith('\x1b[?1006l\x1b[?1000l');
  render.mockClear();
  vi.advanceTimersByTime(2000);
  expect(render).not.toHaveBeenCalled();
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(mountedEditor);
  expect(editorContainer.children).toEqual([mountedEditor]);
  input('editor');
  expect(mountedEditor.handleInput).toHaveBeenCalledExactlyOnceWith('editor');
  if (mountedEditor !== editor)
    expect(editor.handleInput).not.toHaveBeenCalled();
});
