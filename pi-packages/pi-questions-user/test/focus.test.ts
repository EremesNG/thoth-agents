import type { ExtensionToolContext } from '@earendil-works/pi-coding-agent';
import { initTheme } from '@earendil-works/pi-coding-agent';
import type { OverlayBounds } from '@earendil-works/pi-tui';
import { openOwnedOverlay } from '@thoth-agents/pi-core';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  inputComponent,
  ownedOverlaySession,
} from '../../pi-core/test/owned-overlay-fixture.js';
import { buildResult, selectOption } from '../src/answers.js';
import { createQuestionTool } from '../src/index.js';

const params = {
  questions: [
    {
      id: 'plan',
      header: 'Plan',
      prompt: 'Choose a plan',
      options: [
        { value: 'safe', label: 'Safe' },
        { value: 'fast', label: 'Fast' },
      ],
    },
  ],
};

const cleanups: Array<() => void> = [];
beforeAll(() => initTheme('dark'));
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

function session() {
  vi.useFakeTimers();
  const result = ownedOverlaySession();
  cleanups.push(() => result.tui.stop());
  const ctx = Object.assign(result.ctx, {
    hasUI: true,
  }) as ExtensionToolContext;
  return { ...result, ctx };
}

it.each([
  'same editor',
  'replacement editor',
])('keeps questionnaire input over history after an intervening focus transition (%s)', async (transition) => {
  const { ctx, tui, editor, editorContainer, input, completions } = session();
  const history = inputComponent('History');
  let closeHistory: () => void = () => {};
  const historyResult = openOwnedOverlay<void>(
    ctx,
    (_tui, _theme, _keys, close) => {
      closeHistory = close;
      return history;
    },
  );
  await Promise.resolve();
  const mountedEditor =
    transition === 'same editor'
      ? editor
      : inputComponent('Replacement editor');
  if (transition === 'same editor') tui.setFocus(editor);
  else ctx.ui.setEditorComponent(() => mountedEditor as any);
  expect(editorContainer.children).toEqual([mountedEditor]);

  const result = createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  await Promise.resolve();
  const question = tui.getFocusedComponent();
  expect(question?.render(120).join('\n')).toContain('Choose a plan');
  input('\x1b[B');
  expect(tui.getFocusedComponent()).toBe(question);
  expect(history.handleInput).not.toHaveBeenCalled();
  expect(editor.handleInput).not.toHaveBeenCalled();
  expect(mountedEditor.handleInput).not.toHaveBeenCalled();

  closeHistory();
  await historyResult;
  expect(tui.getFocusedComponent()).toBe(question);
  expect(tui.hasOverlay()).toBe(true);
  input('\r');
  await expect(result).resolves.toMatchObject({
    details: {
      cancelled: false,
      answers: { plan: { values: ['fast'], labels: ['Fast'] } },
    },
  });
  expect(completions).toHaveBeenCalledTimes(2);
  expect(tui.hasOverlay()).toBe(false);
  expect(editorContainer.children).toEqual([mountedEditor]);
  expect(tui.getFocusedComponent()).toBe(mountedEditor);
  input('editor');
  expect(mountedEditor.handleInput).toHaveBeenCalledExactlyOnceWith('editor');
  if (mountedEditor !== editor)
    expect(editor.handleInput).not.toHaveBeenCalled();
});

it('aborts before the questionnaire handle exists without taking a foreign overlay or completing twice', async () => {
  const { ctx, tui, input, editor, completions } = session();
  const foreign = inputComponent('Foreign overlay');
  const foreignHandle = tui.showOverlay(foreign);
  const controller = new AbortController();
  let lateAnswer = () => {};
  const tool = createQuestionTool((session) => (_tui, _theme, _keys, done) => {
    const answered = selectOption(session.state, 'plan', 'safe');
    session.onStateChange(answered);
    lateAnswer = () => done(buildResult(answered));
    controller.abort();
    return inputComponent('Question');
  });
  const result = await tool.execute(
    'call',
    params,
    controller.signal,
    undefined,
    ctx,
  );
  expect(result.details).toMatchObject({
    cancelled: true,
    error: 'aborted',
    answers: { plan: { values: ['safe'] } },
  });
  lateAnswer();
  expect(completions).toHaveBeenCalledExactlyOnceWith(result);
  expect(tui.getFocusedComponent()).toBe(foreign);
  input('foreign');
  expect(foreign.handleInput).toHaveBeenCalledExactlyOnceWith('foreign');
  expect(editor.handleInput).not.toHaveBeenCalled();
  foreignHandle.hide();
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(editor);
});

it.each([
  'delivered handle',
  'late handle',
])('aborts beneath a newer foreign overlay with recorded answers and exactly one completion (%s)', async (timing) => {
  const { ctx, tui, editor, input, completions } = session();
  const custom = ctx.ui.custom;
  let deliverHandle = () => {};
  const opened = new Promise<void>((resolve) => {
    ctx.ui.custom = (factory, options) =>
      custom(factory, {
        ...options,
        onHandle(handle) {
          deliverHandle = () => options?.onHandle?.(handle);
          if (timing === 'delivered handle') deliverHandle();
          resolve();
        },
      });
  });
  const controller = new AbortController();
  const result = createQuestionTool().execute(
    'call',
    params,
    controller.signal,
    undefined,
    ctx,
  );
  const settled = vi.fn();
  void result.then(settled);
  await opened;
  const question = tui.getFocusedComponent();
  input(' ');
  const foreign = inputComponent('Foreign overlay');
  const foreignHandle = tui.showOverlay(foreign);
  controller.abort();
  const aborted = await result;
  expect(aborted.details).toMatchObject({
    cancelled: true,
    error: 'aborted',
    answers: { plan: { status: 'answered', values: ['safe'] } },
  });
  deliverHandle();
  controller.abort();
  question?.handleInput?.('1');
  expect(settled).toHaveBeenCalledExactlyOnceWith(aborted);
  expect(completions).toHaveBeenCalledExactlyOnceWith(aborted);
  expect(tui.getFocusedComponent()).toBe(foreign);
  input('foreign');
  expect(foreign.handleInput).toHaveBeenCalledExactlyOnceWith('foreign');
  expect(editor.handleInput).not.toHaveBeenCalled();
  foreignHandle.hide();
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(editor);
});

it.each([
  ['answer', '1', false],
  ['cancel', '\x1b', true],
] as const)('%s removes only the questionnaire beneath a newer foreign overlay and completes once', async (_action, key, cancelled) => {
  const { ctx, tui, input, editor, completions } = session();
  const result = createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  const settled = vi.fn();
  void result.then(settled);
  await Promise.resolve();
  const question = tui.getFocusedComponent();
  expect(question?.render(120).join('\n')).toContain('Choose a plan');
  input(' ');
  const foreign = inputComponent('Foreign overlay');
  const foreignHandle = tui.showOverlay(foreign);
  question?.handleInput?.(key);
  const completed = await result;
  expect(completed.details).toMatchObject({
    cancelled,
    answers: { plan: { values: ['safe'], labels: ['Safe'] } },
  });
  expect(completed.details.error).toBeUndefined();
  question?.handleInput?.('1');
  question?.handleInput?.('\x1b');
  expect(completions).toHaveBeenCalledExactlyOnceWith(completed);
  expect(settled).toHaveBeenCalledExactlyOnceWith(completed);
  expect(tui.getFocusedComponent()).toBe(foreign);
  input('foreign');
  expect(foreign.handleInput).toHaveBeenCalledExactlyOnceWith('foreign');
  expect(editor.handleInput).not.toHaveBeenCalled();
  foreignHandle.hide();
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(editor);
});

it.each([
  { columns: 120, rows: 40, height: 16 },
  { columns: 80, rows: 40, height: 16 },
  { columns: 120, rows: 24, height: 15 },
])('renders a full-width bottom overlay with its adaptive height at $columns×$rows', async ({
  columns,
  rows,
  height,
}) => {
  const { ctx, tui, editorContainer, editor, input } = session();
  Object.assign(tui.terminal, { columns, rows });
  const custom = ctx.ui.custom;
  let getBounds: () => OverlayBounds | undefined = () => undefined;
  ctx.ui.custom = (factory, options) =>
    custom(factory, {
      ...options,
      onHandle(handle) {
        getBounds = () => handle.getBounds();
        options?.onHandle?.(handle);
      },
    });
  const result = createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  const render = async () => {
    // The real TUI queues renders on nextTick before scheduling its timer.
    await new Promise<void>((resolve) => process.nextTick(resolve));
    vi.runOnlyPendingTimers();
  };
  await render();
  expect(getBounds()).toEqual({
    row: rows - height,
    col: 0,
    width: columns,
    height,
  });
  expect(editorContainer.children).toEqual([editor]);
  input('\x1d');
  await render();
  expect(getBounds()).toEqual({
    row: rows - 1,
    col: 0,
    width: columns,
    height: 1,
  });
  input('\x1d');
  await render();
  expect(getBounds()).toEqual({
    row: rows - height,
    col: 0,
    width: columns,
    height,
  });
  input('1');
  await expect(result).resolves.toMatchObject({
    details: { cancelled: false },
  });
});
