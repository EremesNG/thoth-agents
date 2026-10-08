import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openOwnedOverlay } from '@thoth-agents/pi-core';
import { afterEach, expect, it, vi } from 'vitest';
import {
  inputComponent,
  ownedOverlaySession,
} from '../../../pi-core/test/owned-overlay-fixture.js';
import type { SubagentManager } from '../../src/manager.js';
import type { SubagentTask } from '../../src/types.js';
import { showSubagentsPanel } from '../../src/ui/panel-overlay.js';

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
])('closes only subagents history and restores the mounted editor (%s, %s)', async (transition, order) => {
  vi.useFakeTimers();
  const cwd = fs.mkdtempSync(
    path.join(os.tmpdir(), 'subagents-overlay-focus-'),
  );
  cleanups.push(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const { ctx, tui, editor, editorContainer, input } = ownedOverlaySession();
  cleanups.push(() => tui.stop());
  const custom = ctx.ui.custom;
  ctx.ui.custom = (factory, options) =>
    custom(
      (tui, _theme, keys, done) =>
        factory(
          tui,
          {
            fg: (_role: string, text: string) => text,
            bold: (text: string) => text,
          } as never,
          keys,
          done,
        ),
      options,
    );
  const writes = vi.spyOn(tui.terminal, 'write');
  const showOverlay = vi.spyOn(tui, 'showOverlay');
  const render = vi.spyOn(tui, 'requestRender');
  const cancelSelected = vi.fn();
  const requestRender = vi.fn();
  const task: SubagentTask = {
    id: 'selected-task',
    agent: 'analyst',
    mode: 'task',
    status: 'completed',
    task: 'Selected history task',
    created_at: new Date().toISOString(),
    result: 'Selected task result',
  };
  const opening = showSubagentsPanel({
    ctx: { ...ctx, cwd },
    pi: {},
    manager: {
      listSessionTasks: () => [task],
      getTask: () => task,
    } as unknown as SubagentManager,
    selectedTaskId: task.id,
    setActivePanelCancelSelected: cancelSelected,
    setActivePanelRequestRender: requestRender,
  });
  const historySettled = vi.fn();
  void opening.then(historySettled);
  await Promise.resolve();
  const history = tui.getFocusedComponent();
  expect(history).not.toBe(editor);
  cleanups.push(() => history?.handleInput?.('q'));
  expect(history?.render(120).join('\n')).toContain(task.result);
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
    history?.handleInput?.('q');
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
    expect(history?.render(120).join('\n')).toContain(task.result);
    input('q');
  }
  await opening;
  await expect(answer).resolves.toBe('answer');
  expect(cancelSelected).toHaveBeenLastCalledWith(undefined);
  expect(requestRender).toHaveBeenLastCalledWith(undefined);
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
