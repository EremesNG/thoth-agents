import { afterEach, expect, it, vi } from 'vitest';
import { bindWorkPanelLifecycle, openOwnedOverlay } from '../src/index.js';
import {
  inputComponent,
  overlayLifecycle,
  ownedOverlaySession,
} from './owned-overlay-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

function session() {
  vi.useFakeTimers();
  const result = ownedOverlaySession();
  cleanups.push(() => result.tui.stop());
  return result;
}

it('completes an owned overlay exactly once with its first result', async () => {
  const { ctx, tui, editor, completions } = session();
  const component = inputComponent('Question');
  const dispose = vi.fn();
  let close: (result: string) => void = () => {};
  const result = openOwnedOverlay<string>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return Object.assign(component, { dispose });
  });
  await Promise.resolve();
  expect(tui.getFocusedComponent()).toBe(component);
  expect(tui.hasOverlay()).toBe(true);
  close('answer');
  close('cancel');
  await expect(result).resolves.toBe('answer');
  expect(completions).toHaveBeenCalledExactlyOnceWith('answer');
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(editor);
});

it.each([
  ['quit', 'shutdown first'],
  ['reload', 'shutdown first'],
  ['reload', 'external removal first'],
])('settles owned overlays exactly once on session shutdown (%s, %s)', async (reason, order) => {
  const { ctx, tui, completions } = session();
  const lifecycle = overlayLifecycle(ctx);
  cleanups.push(bindWorkPanelLifecycle(lifecycle.pi, ctx));
  const dispose = vi.fn();
  let close: (result: string) => void = () => {};
  const result = openOwnedOverlay<string>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return Object.assign(inputComponent('Model profiles'), { dispose });
  });
  const settled = vi.fn();
  void result.then(settled);
  await Promise.resolve();
  if (order === 'external removal first') tui.hideOverlay();
  lifecycle.shutdown(reason);
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toHaveBeenCalledExactlyOnceWith(undefined);
  tui.hideOverlay(); // resetExtensionUI may run after lifecycle cleanup.
  lifecycle.shutdown(reason);
  close('late answer');
  await expect(result).resolves.toBeUndefined();
  expect(completions).toHaveBeenCalledExactlyOnceWith(undefined);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(tui.hasOverlay()).toBe(false);
});

it('settles every bundled owner and pending factory, but not another UI session', async () => {
  vi.resetModules();
  const { openOwnedOverlay: openCopy } = await import('../src/index.js');
  const { ctx, tui, completions } = session();
  const other = session();
  const lifecycle = overlayLifecycle(ctx);
  cleanups.push(bindWorkPanelLifecycle(lifecycle.pi, ctx));
  const first = openOwnedOverlay<void>(ctx, () =>
    inputComponent('First panel'),
  );
  const second = openCopy<void>(ctx, () => inputComponent('Second panel'));
  let finishFactory: (component: ReturnType<typeof inputComponent>) => void =
    () => {};
  const pending = openCopy<void>(
    ctx,
    () =>
      new Promise((resolve) => {
        finishFactory = resolve;
      }),
  );
  let closeOther = () => {};
  const otherResult = openCopy<void>(
    other.ctx,
    (_tui, _theme, _keys, close) => {
      closeOther = close;
      return inputComponent('Other session');
    },
  );
  await Promise.resolve();
  lifecycle.shutdown();
  await expect(Promise.all([first, second, pending])).resolves.toEqual([
    undefined,
    undefined,
    undefined,
  ]);
  finishFactory(inputComponent('Late panel'));
  await Promise.resolve();
  await Promise.resolve();
  expect(completions).toHaveBeenCalledTimes(3);
  expect(tui.hasOverlay()).toBe(false);
  expect(other.tui.hasOverlay()).toBe(true);
  expect(other.completions).not.toHaveBeenCalled();
  closeOther();
  await otherResult;
});

it('settles external owned-handle removal as cancellation, without closing a newer overlay', async () => {
  const { ctx, tui, completions } = session();
  let hide = () => {};
  let close: (result: string) => void = () => {};
  const result = openOwnedOverlay<string>(
    ctx,
    (_tui, _theme, _keys, done) => {
      close = done;
      return inputComponent('Model profiles');
    },
    {
      onHandle: (handle) => {
        hide = () => handle.hide();
      },
    },
  );
  const settled = vi.fn();
  void result.then(settled);
  await Promise.resolve();
  const foreign = inputComponent('Newer overlay');
  const foreignHandle = tui.showOverlay(foreign);
  hide();
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toHaveBeenCalledExactlyOnceWith(undefined);
  hide();
  close('late answer');
  await expect(result).resolves.toBeUndefined();
  expect(completions).toHaveBeenCalledExactlyOnceWith(undefined);
  expect(tui.getFocusedComponent()).toBe(foreign);
  foreignHandle.hide();
  expect(tui.hasOverlay()).toBe(false);
});

it('repairs a detached preFocus to the mounted editor after SDK editor replacement', async () => {
  const { ctx, tui, editor, editorContainer, input } = session();
  const component = inputComponent('History');
  let close: () => void = () => {};
  const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return component;
  });
  await Promise.resolve();
  const replacement = inputComponent('Replacement editor');
  ctx.ui.setEditorComponent(() => replacement as any);
  expect(editorContainer.children).toEqual([replacement]);
  expect(editorContainer.children).not.toContain(editor);
  expect(tui.getFocusedComponent()).toBe(replacement);
  // A capturing overlay can regain focus after the real replacement.
  tui.setFocus(component);
  expect(tui.getFocusedComponent()).toBe(component);
  close();
  await result;
  expect(tui.getFocusedComponent()).toBe(replacement);
  input('answer');
  expect(replacement.handleInput).toHaveBeenCalledExactlyOnceWith('answer');
  expect(editor.handleInput).not.toHaveBeenCalled();
});

it('closes only its own handle beneath a newer foreign overlay', async () => {
  const { ctx, tui, editor, completions, input } = session();
  const component = inputComponent('Question');
  let close: (result: string) => void = () => {};
  const result = openOwnedOverlay<string>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return component;
  });
  await Promise.resolve();
  const foreign = inputComponent('Foreign overlay');
  const foreignHandle = tui.showOverlay(foreign);
  const originalHide = tui.hideOverlay;
  close('cancel');
  close('answer');
  await expect(result).resolves.toBe('cancel');
  expect(completions).toHaveBeenCalledExactlyOnceWith('cancel');
  expect(tui.hideOverlay).toBe(originalHide);
  expect(tui.hasOverlay()).toBe(true);
  expect(tui.getFocusedComponent()).toBe(foreign);
  input('foreign');
  expect(foreign.handleInput).toHaveBeenCalledExactlyOnceWith('foreign');
  foreignHandle.hide();
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(editor);
});

it.each([
  'history first',
  'question first',
])('restores the mounted editor across bundled helper copies when question opens atop history after replacement (%s)', async (order) => {
  vi.resetModules();
  const { openOwnedOverlay: openQuestion } = await import('../src/index.js');
  expect(openQuestion).not.toBe(openOwnedOverlay);
  const { ctx, tui, editor, editorContainer, input } = session();
  const history = inputComponent('History');
  let closeHistory: () => void = () => {};
  const historyResult = openOwnedOverlay<void>(
    ctx,
    (_tui, _theme, _keys, done) => {
      closeHistory = done;
      return history;
    },
  );
  await Promise.resolve();
  const replacement = inputComponent('Replacement editor');
  ctx.ui.setEditorComponent(() => replacement as any);
  expect(editorContainer.children).toEqual([replacement]);
  expect(editorContainer.children).not.toContain(editor);
  tui.setFocus(history);
  const question = inputComponent('Question');
  let closeQuestion: (result: string) => void = () => {};
  const questionResult = openQuestion<string>(
    ctx,
    (_tui, _theme, _keys, done) => {
      closeQuestion = done;
      return question;
    },
  );
  await Promise.resolve();
  input('question');
  expect(question.handleInput).toHaveBeenCalledExactlyOnceWith('question');
  if (order === 'history first') {
    closeHistory();
    expect(tui.getFocusedComponent()).toBe(question);
    closeQuestion('answer');
  } else {
    closeQuestion('answer');
    expect(tui.getFocusedComponent()).toBe(history);
    closeHistory();
  }
  await historyResult;
  await expect(questionResult).resolves.toBe('answer');
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(replacement);
  input('editor');
  expect(replacement.handleInput).toHaveBeenCalledExactlyOnceWith('editor');
  expect(editor.handleInput).not.toHaveBeenCalled();
});

it('settles completion before a handle exists without popping an existing overlay', async () => {
  const { ctx, tui, editor, completions } = session();
  const foreign = inputComponent('Foreign overlay');
  const foreignHandle = tui.showOverlay(foreign);
  const onHandle = vi.fn();
  const originalHide = tui.hideOverlay;
  const result = openOwnedOverlay<string>(
    ctx,
    (_tui, _theme, _keys, close) => {
      close('abort');
      close('answer');
      return inputComponent('Aborted question');
    },
    { onHandle },
  );
  await expect(result).resolves.toBe('abort');
  expect(completions).toHaveBeenCalledExactlyOnceWith('abort');
  expect(onHandle).not.toHaveBeenCalled();
  expect(tui.getFocusedComponent()).toBe(foreign);
  expect(tui.hideOverlay).toBe(originalHide);
  foreignHandle.hide();
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(editor);
});

it('does not repair a still-mounted same-editor focus', async () => {
  const { ctx, tui, editor, input } = session();
  const component = inputComponent('History');
  let close: () => void = () => {};
  const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return component;
  });
  await Promise.resolve();
  tui.setFocus(editor);
  input('history');
  expect(tui.getFocusedComponent()).toBe(component);
  const setFocus = vi.spyOn(tui, 'setFocus');
  close();
  await result;
  expect(tui.getFocusedComponent()).toBe(editor);
  // Only pi-tui's own restoration; no helper-issued redundant focus transition.
  expect(setFocus).toHaveBeenCalledExactlyOnceWith(editor);
});

it('leaves any other still-mounted base-tree focus untouched', async () => {
  const { ctx, tui } = session();
  const component = inputComponent('History');
  let close: () => void = () => {};
  const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return component;
  });
  await Promise.resolve();
  const dialog = inputComponent('Native dialog');
  tui.addChild(dialog);
  tui.setFocus(dialog);
  const setFocus = vi.spyOn(tui, 'setFocus');
  close();
  await result;
  expect(tui.getFocusedComponent()).toBe(dialog);
  expect(setFocus).not.toHaveBeenCalled();
});

it('safely skips focus repair when runtime introspection is unavailable', async () => {
  vi.useFakeTimers();
  const { ctx, tui, editor, completions } = ownedOverlaySession({
    introspection: false,
  });
  cleanups.push(() => tui.stop());
  const component = inputComponent('History');
  let close: () => void = () => {};
  const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return component;
  });
  await Promise.resolve();
  ctx.ui.setEditorComponent(() => inputComponent('Replacement editor') as any);
  tui.setFocus(component);
  expect(() => close()).not.toThrow();
  close();
  await result;
  expect(completions).toHaveBeenCalledTimes(1);
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(editor);
});

it('repairs detached preFocus when a late handle arrives after SDK completion already hid the overlay', async () => {
  const { ctx, tui, editorContainer, completions } = session();
  const custom = ctx.ui.custom;
  let deliverHandle: () => void = () => {};
  ctx.ui.custom = (factory, options) =>
    custom(factory, {
      ...options,
      onHandle(handle) {
        deliverHandle = () => options?.onHandle?.(handle);
      },
    });
  const component = inputComponent('History');
  let close: () => void = () => {};
  const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return component;
  });
  await Promise.resolve();
  const replacement = inputComponent('Replacement editor');
  ctx.ui.setEditorComponent(() => replacement as any);
  expect(editorContainer.children).toEqual([replacement]);
  tui.setFocus(component);
  close();
  await result;
  // Pi >=1.3 retains its own handle even when consumer delivery is delayed.
  expect(tui.hasOverlay()).toBe(false);
  deliverHandle();
  close();
  expect(completions).toHaveBeenCalledTimes(1);
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(replacement);
});

it('never mounts an async factory result after early completion beneath a newer overlay', async () => {
  const { ctx, tui, completions } = session();
  let finishFactory: (component: ReturnType<typeof inputComponent>) => void =
    () => {};
  const pending = new Promise<ReturnType<typeof inputComponent>>((resolve) => {
    finishFactory = resolve;
  });
  let close: (result: string) => void = () => {};
  const onHandle = vi.fn();
  const result = openOwnedOverlay<string>(
    ctx,
    (_tui, _theme, _keys, done) => {
      close = done;
      return pending;
    },
    { onHandle },
  );
  const foreign = inputComponent('Foreign overlay');
  const foreignHandle = tui.showOverlay(foreign);
  close('abort');
  await expect(result).resolves.toBe('abort');
  finishFactory(inputComponent('Aborted question'));
  await pending;
  await Promise.resolve();
  close('answer');
  expect(onHandle).not.toHaveBeenCalled();
  expect(completions).toHaveBeenCalledExactlyOnceWith('abort');
  expect(tui.getFocusedComponent()).toBe(foreign);
  foreignHandle.hide();
  expect(tui.hasOverlay()).toBe(false);
});

it('passes overlay options and the owned handle through to consumers', async () => {
  const { ctx, tui } = session();
  const component = inputComponent('Question');
  const showOverlay = vi.spyOn(tui, 'showOverlay');
  const onHandle = vi.fn();
  const overlayOptions = vi.fn(() => ({ width: 80, maxHeight: 8 }));
  let close: () => void = () => {};
  const result = openOwnedOverlay<void>(
    ctx,
    (_tui, _theme, _keys, done) => {
      close = done;
      return component;
    },
    { overlayOptions, onHandle },
  );
  await Promise.resolve();
  expect(overlayOptions).toHaveBeenCalledTimes(1);
  expect(showOverlay).toHaveBeenCalledExactlyOnceWith(component, {
    width: 80,
    maxHeight: 8,
  });
  expect(onHandle).toHaveBeenCalledExactlyOnceWith(
    showOverlay.mock.results[0].value,
  );
  close();
  await result;
});

it('opens and completes a frozen component even when slot metadata cannot be retained', async () => {
  const { ctx, tui, editor } = session();
  const component = Object.freeze({
    render: () => ['Question'],
    invalidate() {},
    handleInput: vi.fn(),
  });
  let close: () => void = () => {};
  const result = openOwnedOverlay<void>(ctx, (_tui, _theme, _keys, done) => {
    close = done;
    return component;
  });
  await Promise.resolve();
  expect(tui.getFocusedComponent()).toBe(component);
  close();
  await result;
  expect(tui.hasOverlay()).toBe(false);
  expect(tui.getFocusedComponent()).toBe(editor);
});
