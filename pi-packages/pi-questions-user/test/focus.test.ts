import {
  type ExtensionToolContext,
  getSelectListTheme,
  initTheme,
  type Theme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import { type Component, Editor } from '@earendil-works/pi-tui';
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
const theme = {
  fg: (_role: string, text: string) => text,
  bg: (_role: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;
const cleanups: Array<() => void> = [];
beforeAll(() => initTheme('dark'));
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});
function session() {
  vi.useFakeTimers();
  const result = ownedOverlaySession();
  const widgets = new Map<string, Component>();
  Object.assign(result.ctx.ui, {
    theme,
    setWidget(
      key: string,
      factory?: (tui: typeof result.tui, theme: Theme) => Component,
    ) {
      if (factory) widgets.set(key, factory(result.tui, theme));
      else widgets.delete(key);
    },
    onTerminalInput: result.tui.addInputListener.bind(result.tui),
  });
  result.ctx.ui.setEditorComponent(() => result.editor as any);
  cleanups.push(() => result.tui.stop());
  return {
    ...result,
    ctx: Object.assign(result.ctx, { hasUI: true }) as ExtensionToolContext,
    dock: (width = 120) =>
      [...widgets.values()].flatMap((widget) => widget.render(width)),
  };
}
const opened = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it('replaces the editor without an overlay, collapses to a dock, and lets editor Enter steer without resolving the question', async () => {
  const { ctx, tui, editor, editorContainer, input, dock } = session();
  const custom = vi.spyOn(ctx.ui, 'custom');
  const result = createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  const settled = vi.fn();
  void result.then(settled);
  await opened();
  const mounted = editorContainer.children[0];
  expect(mounted.render(120).join('\n')).toContain('Choose a plan');
  expect(mounted.render(120).join('\n')).not.toContain('Editor');
  expect(tui.hasOverlay()).toBe(false);
  expect(custom).not.toHaveBeenCalled();
  expect(dock()).toEqual([]);
  input('\x1b[B');
  input(' ');
  input('\x1d');
  expect(dock()).toEqual([' Ask user · Ctrl+] expand']);
  expect(mounted.render(120)).toEqual(['Editor']);
  expect(tui.getFocusedComponent()).toBe(mounted);
  input('\x1b');
  input('steering');
  input('\r');
  expect(editor.handleInput.mock.calls).toEqual([
    ['\x1b'],
    ['steering'],
    ['\r'],
  ]);
  expect(settled).not.toHaveBeenCalled();
  input('\x1d');
  expect(dock()).toEqual([]);
  expect(mounted.render(120).join('\n')).toContain('Choose a plan');
  input('\r');
  await expect(result).resolves.toMatchObject({
    details: { cancelled: false, answers: { plan: { values: ['fast'] } } },
  });
  expect(editorContainer.children).toEqual([editor]);
  expect(tui.getFocusedComponent()).toBe(editor);
  input('\x1d');
  expect(editor.handleInput).toHaveBeenLastCalledWith('\x1d');
});

it('collapsed Enter submits through the real native editor callback while the question remains pending', async () => {
  const { ctx, editor, tui, input } = session();
  const steering = vi.fn();
  Object.assign(editor, {
    onSubmit: steering,
    borderColor: (text: string) => text,
    getPaddingX: () => 0,
    getAutocompleteMaxVisible: () => 5,
  });
  ctx.ui.setEditorComponent(
    (liveTui) =>
      new Editor(liveTui, {
        borderColor: (text) => text,
        selectList: getSelectListTheme(),
      }),
  );
  const result = createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  const settled = vi.fn();
  void result.then(settled);
  await opened();
  input('\x1d');
  input('new instruction');
  input('\r');
  expect(steering).toHaveBeenCalledExactlyOnceWith('new instruction');
  expect(settled).not.toHaveBeenCalled();
  expect(tui.hasOverlay()).toBe(false);
  input('\x1d');
  input('1');
  await result;
});

it.each([
  'same editor',
  'replacement editor',
])('opens over history after a focus transition and closing history keeps question input (%s)', async (transition) => {
  const { ctx, tui, editor, editorContainer, input } = session();
  const history = inputComponent('History');
  let closeHistory = () => {};
  const historyResult = openOwnedOverlay<void>(
    ctx,
    (_tui, _theme, _keys, close) => {
      closeHistory = close;
      return history;
    },
  );
  await opened();
  const mountedEditor =
    transition === 'same editor'
      ? editor
      : inputComponent('Replacement editor');
  if (transition === 'same editor') tui.setFocus(editor);
  else ctx.ui.setEditorComponent(() => mountedEditor as any);
  const result = createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  await opened();
  const questionSlot = editorContainer.children[0];
  input('\x1b[B');
  expect(history.handleInput).not.toHaveBeenCalled();
  closeHistory();
  await historyResult;
  expect(tui.getFocusedComponent()).toBe(questionSlot);
  expect(tui.hasOverlay()).toBe(false);
  input('\r');
  await expect(result).resolves.toMatchObject({
    details: { answers: { plan: { values: ['fast'] } } },
  });
  expect(editorContainer.children).toEqual([mountedEditor]);
  expect(tui.getFocusedComponent()).toBe(mountedEditor);
});

it.each([
  true,
  false,
])('each history/detail overlay closes back to the current slot (expanded=%s)', async (expanded) => {
  const { ctx, tui, editor, input, dock } = session();
  const result = createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  await opened();
  if (!expanded) input('\x1d');
  for (const label of ['Subagents', 'Task-list', 'Background', 'Work detail']) {
    let close = () => {};
    const overlay = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
      close = done;
      return inputComponent(label);
    });
    await opened();
    close();
    await overlay;
    expect(tui.hasOverlay()).toBe(false);
    input(' ');
    if (!expanded) {
      expect(editor.handleInput).toHaveBeenLastCalledWith(' ');
      expect(dock()).toHaveLength(1);
    } else
      expect(tui.getFocusedComponent()?.render(120).join('\n')).toContain(
        'Choose a plan',
      );
  }
  if (!expanded) input('\x1d');
  input('\x1b');
  await result;
});

it('Ctrl+] from a history overlay expands and the next key goes to the question, not history', async () => {
  const { ctx, tui, input } = session();
  const result = createQuestionTool().execute(
    'call',
    params,
    undefined,
    undefined,
    ctx,
  );
  await opened();
  input('\x1d');
  const history = inputComponent('History');
  let close = () => {};
  const overlay = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return history;
  });
  await opened();
  input('\x1d');
  input('\x1b[B');
  expect(history.handleInput).not.toHaveBeenCalled();
  close();
  await overlay;
  input('\r');
  await expect(result).resolves.toMatchObject({
    details: { answers: { plan: { values: ['fast'] } } },
  });
  expect(tui.hasOverlay()).toBe(false);
});

it.each([
  'collapse',
  'answer',
  'cancel',
  'abort',
])('%s preserves a visible foreign overlay and only removes the question dock', async (action) => {
  const { ctx, tui, input, editor, editorContainer, dock } = session();
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
  await opened();
  const question = editorContainer.children[0];
  input(' ');
  const foreign = inputComponent('Foreign');
  let close = () => {};
  const foreignResult = openOwnedOverlay<void>(
    ctx,
    (_tui, _theme, _keys, done) => {
      close = done;
      return foreign;
    },
  );
  await opened();
  if (action === 'collapse') input('\x1d');
  else if (action === 'abort') controller.abort();
  else question.handleInput?.(action === 'answer' ? '1' : '\x1b');
  if (action !== 'collapse') {
    const completed = await result;
    expect(completed.details).toMatchObject({
      cancelled: action !== 'answer',
      answers: { plan: { values: ['safe'] } },
    });
    expect(settled).toHaveBeenCalledExactlyOnceWith(completed);
    expect(dock()).toEqual([]);
  } else expect(dock()).toHaveLength(1);
  expect(tui.getFocusedComponent()).toBe(foreign);
  input('foreign');
  expect(foreign.handleInput).toHaveBeenCalledExactlyOnceWith('foreign');
  close();
  await foreignResult;
  input('editor');
  expect(editor.handleInput).toHaveBeenCalledExactlyOnceWith('editor');
  if (action === 'collapse') {
    input('\x1d');
    input('\x1b');
    await result;
  }
});

it('refreshes only the matching open SDK tool row on collapse/expand, never through partial results', async () => {
  const { ctx, tui, input } = session();
  const tool = createQuestionTool();
  const row = new ToolExecutionComponent(
    tool.name,
    'call',
    params,
    {},
    tool,
    tui,
    process.cwd(),
  );
  const other = new ToolExecutionComponent(
    tool.name,
    'other',
    params,
    {},
    tool,
    tui,
    process.cwd(),
  );
  row.markExecutionStarted();
  const invalidate = vi.spyOn(row, 'invalidate');
  const onUpdate = vi.fn();
  const result = tool.execute('call', params, undefined, onUpdate, ctx);
  await opened();
  expect(row.render(120).join('\n')).not.toContain('collapsed');
  input('\x1d');
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(row.render(120).join('\n')).toContain('collapsed · Ctrl+] expand');
  expect(other.render(120).join('\n')).not.toContain('collapsed');
  input('\x1d');
  expect(row.render(120).join('\n')).not.toContain('collapsed');
  input('\x1d');
  input('\x1d');
  input('1');
  const completed = await result;
  row.updateResult({ ...completed, isError: false });
  expect(row.render(120).join('\n')).not.toContain('collapsed');
  expect(onUpdate).not.toHaveBeenCalled();
});

it('aborts an unresolved async UI factory, removes input/widget hooks, and disposes its late component', async () => {
  const { ctx, tui, dock, input, editor } = session();
  const controller = new AbortController();
  let finishFactory: (component: Component & { dispose(): void }) => void =
    () => {};
  const pending = new Promise<Component & { dispose(): void }>((resolve) => {
    finishFactory = resolve;
  });
  const result = createQuestionTool(() => () => pending).execute(
    'call',
    params,
    controller.signal,
    undefined,
    ctx,
  );
  await opened();
  controller.abort();
  await expect(result).resolves.toMatchObject({
    details: { cancelled: true, error: 'aborted' },
  });
  const dispose = vi.fn();
  finishFactory(Object.assign(inputComponent('Late question'), { dispose }));
  await opened();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(dock()).toEqual([]);
  expect(tui.getFocusedComponent()).toBe(editor);
  input('\x1d');
  expect(editor.handleInput).toHaveBeenCalledExactlyOnceWith('\x1d');
});

it('aborting a collapsed question clears the SDK open-call collapsed indicator', async () => {
  const { ctx, tui, input } = session();
  const controller = new AbortController();
  const tool = createQuestionTool();
  const row = new ToolExecutionComponent(
    tool.name,
    'call',
    params,
    {},
    tool,
    tui,
    process.cwd(),
  );
  const result = tool.execute(
    'call',
    params,
    controller.signal,
    undefined,
    ctx,
  );
  await opened();
  input('\x1d');
  expect(row.render(120).join('\n')).toContain('collapsed');
  controller.abort();
  await result;
  expect(row.render(120).join('\n')).not.toContain('collapsed');
});

it('abort during synchronous factory creation settles once, disposes the late component and preserves foreign focus', async () => {
  const { ctx, tui } = session();
  const foreign = inputComponent('Foreign');
  const foreignHandle = tui.showOverlay(foreign);
  const controller = new AbortController();
  const dispose = vi.fn();
  let lateAnswer = () => {};
  const tool = createQuestionTool((session) => (_tui, _theme, _keys, done) => {
    const answered = selectOption(session.state, 'plan', 'safe');
    session.onStateChange(answered);
    lateAnswer = () => done(buildResult(answered));
    controller.abort();
    return Object.assign(inputComponent('Question'), { dispose });
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
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(tui.getFocusedComponent()).toBe(foreign);
  foreignHandle.hide();
});
