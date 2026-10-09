import type { EditorComponent } from '@earendil-works/pi-tui';
import { afterEach, expect, it, vi } from 'vitest';
import { ensureWorkPanel, registerWorkPanelProvider } from '../src/index.js';
import { registerEditorSlot } from '../src/panel.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
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
  cleanups.push(() => slot?.dispose());
  expect(session.ui.getEditorComponent()).toBe(factory);
  expect(session.baseFactory).toHaveBeenCalledTimes(1);
  expect(retained.render(80)).toEqual(['Question']);
  retained.handleInput('answer');
  expect(question.handleInput).toHaveBeenCalledExactlyOnceWith('answer');
  expanded = false;
  slot?.refresh();
  expect(retained.render(80)).toEqual([]);
  expect(session.render().join('\n')).toContain('Agents item');
  expect(slot?.isRootEditorInputActive()).toBe(true);
});

it('shares a single owner across separately loaded copies and restores the previous factory on final teardown', async () => {
  const session = uiSession();
  const first = registerEditorSlot(session.ctx, { key: 'first' });
  expect(first).toBeDefined();
  cleanups.push(() => first?.dispose());
  vi.resetModules();
  const { registerEditorSlot: registerCopy } = await import('../src/panel.js');
  const second = registerCopy(session.ctx, { key: 'second' });
  expect(second).toBeDefined();
  cleanups.push(() => second?.dispose());
  expect(session.baseFactory).toHaveBeenCalledTimes(1);
  first?.dispose();
  expect(session.ui.getEditorComponent()).not.toBe(session.baseFactory);
  second?.dispose();
  expect(session.ui.getEditorComponent()).toBe(session.baseFactory);
  expect(session.listenerCount()).toBe(0);
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
