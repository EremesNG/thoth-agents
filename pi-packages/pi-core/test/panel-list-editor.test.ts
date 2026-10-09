import { describe, expect, it, vi } from 'vitest';
import {
  createListEditor,
  type ListEditorOptions,
  panelVisibleWidth,
} from '../src/panel.js';

function overviewRows(count = 20) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    label: `agent-${index}`,
    dirty: index === 10,
  }));
}

function editor(options: Partial<ListEditorOptions> = {}) {
  return createListEditor({
    overview: { title: 'Editor', rows: () => overviewRows() },
    onSave: () => ({ success: true }),
    onCancel: vi.fn(),
    ...options,
  });
}

describe('list editor picker', () => {
  it('honors the choice-row cap independently of the range notice, with wheel navigation in each protocol', () => {
    const panel = editor();
    panel.openPicker({
      title: 'Tools',
      rows: () => overviewRows(11),
      maxVisibleRows: 10,
    });
    let text = panel.render(70).join('\n');
    expect(text).toContain('agent-9');
    expect(text).not.toContain('agent-10');
    expect(text).toContain('Showing 1–10 of 11');
    for (const wheel of ['\u001b[<65;1;1M', '\u001b[97;1;1M', '\u001b[Ma!!'])
      panel.handleInput(wheel);
    expect(panel.getState().selectedIndex).toBe(3);
    panel.handleInput('G');
    text = panel.render(70).join('\n');
    expect(text).toContain('› * agent-10');
    expect(text).toContain('Showing 2–11 of 11');
  });

  it('supports tools-style actions and a wrapping picker without taking ownership of drafts', () => {
    let dirty = false;
    const panel = editor({
      overview: {
        title: 'Roles',
        rows: () => [{ id: 'worker', label: 'worker', dirty }],
        onAction(key, row, shell) {
          if (key !== 'enter' && key !== 'e') return false;
          expect(row?.id).toBe('worker');
          shell.openPicker({
            title: 'Tools',
            navigation: 'wrap',
            rows: () => [
              { id: 'read', label: dirty ? '[x] read' : '[ ] read' },
              { id: 'bash', label: '[ ] bash' },
            ],
            onAction(key) {
              if (key === 'space') {
                dirty = !dirty;
                return true;
              }
              return false;
            },
          });
          return true;
        },
      },
    });
    panel.handleInput('e');
    panel.handleInput('k');
    expect(panel.getState()).toMatchObject({
      view: 'picker',
      selectedIndex: 1,
    });
    panel.handleInput('j');
    panel.handleInput(' ');
    expect(panel.render(50).join('\n')).toContain('[x] read');
    panel.handleInput('\r');
    expect(panel.getState()).toMatchObject({
      view: 'overview',
      pendingCount: 1,
    });
    expect(panel.render(50).join('\n')).toContain('› * worker');
  });

  it('filters model choices with backspace/Ctrl-U, reserves j/k navigation and retains overview selection', () => {
    const panel = editor();
    panel.handleInput('j');
    panel.openPicker({
      title: 'Models',
      rows: () => [
        { id: 'qwen', label: 'Qwen' },
        { id: 'gpt', label: 'GPT' },
        { id: 'gemini', label: 'Gemini' },
      ],
      filter: { text: (row) => row.id },
    });
    panel.handleInput('q');
    expect(panel.getState()).toMatchObject({
      view: 'picker',
      filter: 'q',
      selectedIndex: 0,
    });
    expect(panel.render(50).join('\n')).toContain('Qwen');
    expect(panel.render(50).join('\n')).not.toContain('Gemini');
    panel.handleInput('\u0015');
    panel.handleInput('g'); // Without a query, g still means first.
    expect(panel.getState().filter).toBe('');
    panel.handleInput('p');
    panel.handleInput('g'); // With a query, g is printable filter input.
    expect(panel.getState().filter).toBe('pg');
    expect(panel.render(50).join('\n')).toContain('No matching rows');
    panel.handleInput('\u007f');
    expect(panel.getState().filter).toBe('p');
    panel.handleInput('\u0015');
    panel.handleInput('j');
    expect(panel.getState().selectedIndex).toBe(1);
    panel.handleInput('\u001b');
    expect(panel.getState()).toMatchObject({
      view: 'overview',
      selectedIndex: 1,
      filter: '',
    });
    expect(panel.getState().view).not.toBe('discard');
  });
});

describe('list editor encoded Ctrl-C', () => {
  const inputs = ['\x1b[99;5u', '\x1b[99;5:1u'];

  it.each(inputs)('cancels a clean draft once without saving (%j)', (data) => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const panel = editor({ pendingCount: () => 0, onCancel, onSave });
    panel.handleInput(data);
    panel.handleInput(data);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
    expect(panel.getState().completed).toBe(true);
  });

  it.each(
    inputs,
  )('requires discard confirmation for a dirty draft (%j)', (data) => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const panel = editor({ onCancel, onSave });
    panel.handleInput(data);
    expect(panel.getState()).toMatchObject({
      view: 'discard',
      pendingCount: 1,
      completed: false,
    });
    expect(onCancel).not.toHaveBeenCalled();
    panel.handleInput(data);
    expect(panel.getState().view).toBe('overview');
    panel.handleInput(data);
    panel.handleInput('d');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each(
    inputs,
  )('returns a filtered picker to the overview without cancelling or losing dirty rows (%j)', (data) => {
    const onCancel = vi.fn();
    const panel = editor({ onCancel });
    panel.handleInput('j');
    panel.openPicker({
      title: 'Models',
      rows: () => [{ id: 'model', label: 'Model' }],
      filter: {},
    });
    panel.handleInput('m');
    expect(panel.getState().filter).toBe('m');
    panel.handleInput(data);
    expect(panel.getState()).toMatchObject({
      view: 'overview',
      selectedIndex: 1,
      filter: '',
      pendingCount: 1,
      completed: false,
    });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('list editor completion', () => {
  it('converts synchronous persistence throws but does not mislabel a completion callback error as a save failure', () => {
    const broken = editor({
      onSave() {
        throw new Error('disk full');
      },
    });
    broken.handleInput('s');
    expect(broken.getState()).toMatchObject({
      error: 'disk full',
      completed: false,
    });
    const callbackError = new Error('owner callback');
    const saved = editor({
      onSave: () => undefined,
      onSaved() {
        throw callbackError;
      },
    });
    expect(() => saved.handleInput('s')).toThrow(callbackError);
    expect(saved.getState()).toMatchObject({
      completed: true,
      error: undefined,
    });
  });

  it('confirms dirty cancellation, resumes editing and completes a discard only once', () => {
    const onCancel = vi.fn();
    const panel = editor({ onCancel });
    panel.handleInput('\u0003');
    expect(panel.getState().view).toBe('discard');
    expect(panel.render(70).join('\n')).toContain('d discard and close');
    panel.handleInput('q');
    expect(onCancel).not.toHaveBeenCalled();
    panel.handleInput('k');
    expect(panel.getState().view).toBe('overview');
    panel.handleInput('q');
    panel.handleInput('\u001b');
    expect(panel.getState().view).toBe('overview');
    panel.handleInput('q');
    panel.handleInput('d');
    panel.handleInput('d');
    panel.handleInput('s');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(panel.getState().completed).toBe(true);
  });

  it('cancels a clean draft immediately and saves through the adapter exactly once', () => {
    const onCancel = vi.fn();
    const onSave = vi.fn(() => ({ success: true }));
    const onSaved = vi.fn();
    const clean = editor({ pendingCount: () => 0, onCancel });
    clean.handleInput('q');
    expect(onCancel).toHaveBeenCalledOnce();
    const saving = editor({ onSave, onSaved });
    saving.handleInput('s');
    saving.handleInput('s');
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('retains failed/partial-save errors and discard protection even when no dirty rows remain', () => {
    const onCancel = vi.fn();
    const onSaved = vi.fn();
    const onSave = vi
      .fn()
      .mockReturnValueOnce({
        success: false,
        error: 'stale file',
        warning: 'Already changed: worker',
      })
      .mockReturnValueOnce({ success: true });
    const panel = editor({
      pendingCount: () => 0,
      onSave,
      onSaved,
      onCancel,
      maxHeight: () => 8,
    });
    panel.handleInput('s');
    const text = panel.render(70).join('\n');
    expect(text).toContain('Save failed: stale file');
    expect(text).toContain('Already changed: worker');
    expect(text).toContain('s save');
    expect(text).toContain('›   agent-0');
    panel.handleInput('q');
    expect(panel.getState().view).toBe('discard');
    panel.handleInput('k');
    panel.handleInput('s');
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('blocks duplicate save/cancel during an async save and converts thrown persistence errors into resumable failures', async () => {
    let rejectSave: (reason: Error) => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    const onCancel = vi.fn();
    const panel = editor({ onSave, onCancel });
    panel.handleInput('s');
    panel.handleInput('q');
    panel.handleInput('s');
    expect(panel.getState().saving).toBe(true);
    expect(panel.render(70).join('\n')).toContain('Saving…');
    expect(onSave).toHaveBeenCalledOnce();
    rejectSave(new Error('write denied'));
    await Promise.resolve();
    await Promise.resolve();
    expect(panel.getState()).toMatchObject({
      saving: false,
      error: 'write denied',
      completed: false,
    });
    panel.handleInput('q');
    panel.handleInput('d');
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('list editor overview', () => {
  it('keeps the centered selection, pending count and hints visible on resize', () => {
    let height = 10;
    const filled: string[] = [];
    const panel = editor({
      maxHeight: () => height,
      theme: {
        fg: (_role, text) => text,
        bg: (_role, text) => {
          filled.push(text);
          return text;
        },
      },
    });
    for (let index = 0; index < 10; index++) panel.handleInput('\u001bOB');
    let lines = panel.render(60);
    expect(lines).toHaveLength(10);
    expect(lines.join('\n')).toContain('pending: 1 change');
    expect(lines.join('\n')).toContain('s save');
    expect(lines.join('\n')).toContain('› * agent-10');
    expect(lines.join('\n')).toContain('Showing 9–13 of 20');
    expect(filled.map(panelVisibleWidth)).toEqual([56]);
    height = 5;
    lines = panel.render(60);
    expect(lines).toHaveLength(5);
    expect(lines.join('\n')).toContain('› * agent-10');
    expect(lines.join('\n')).toContain('s save');
    expect(lines.map(panelVisibleWidth)).toEqual([60, 60, 60, 60, 60]);
    panel.handleInput('\u001b[<65;2;3M');
    expect(panel.getState().selectedIndex).toBe(11);
    panel.handleInput('\u001b[H');
    panel.handleInput('\u001b[A');
    expect(panel.getState().selectedIndex).toBe(0);
    panel.handleInput('\u001b[8~');
    panel.handleInput('\u001b[B');
    expect(panel.getState().selectedIndex).toBe(19);
  });

  it.each([
    84, 102,
  ])('chooses compact vs wide at configurable outer-width breakpoint %i', (breakpoint) => {
    const panel = editor({
      wideBreakpoint: breakpoint,
      overview: {
        title: 'Editor',
        rows: () => [
          { id: 'a', label: ({ layout, width }) => `${layout} ${width}` },
        ],
      },
    });
    expect(panel.render(breakpoint - 1).join('\n')).toContain('compact');
    expect(panel.render(breakpoint).join('\n')).toContain('wide');
  });
});
