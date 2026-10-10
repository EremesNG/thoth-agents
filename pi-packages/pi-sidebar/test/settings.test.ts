import { afterEach, expect, it, vi } from 'vitest';
import type { PanelPreference } from '../src/config.js';
import {
  createSettingsPanel,
  type SettingsDraft,
  type SettingsOptions,
} from '../src/settings.js';
import { strip, theme } from './fixture.js';

const DOWN = '\u001b[B';
const LEFT = '\u001b[D';
const RIGHT = '\u001b[C';
const SHIFT_UP = '\u001b[1;2A';
const SHIFT_DOWN = '\u001b[1;2B';
const SHIFT_RIGHT = '\u001b[1;2C';
const ENTER = '\r';
const ESC = '\u001b';

afterEach(() => vi.useRealTimers());

function open(overrides: Partial<SettingsOptions> = {}) {
  const panels: PanelPreference[] = [
    { id: 'session', visible: true },
    { id: 'workspace', visible: true, custom: 'kept' },
    { id: 'subagents', visible: true },
    { id: 'cost', visible: false },
  ];
  const save = vi.fn<(draft: SettingsDraft) => void>();
  const onDone = vi.fn<(saved: boolean) => void>();
  const component = createSettingsPanel({
    panels,
    startup: 'auto',
    width: 44,
    save,
    onDone,
    theme,
    maxHeight: () => 30,
    ...overrides,
  });
  const text = () => component.render(80).map(strip).join('\n');
  const press = (...keys: string[]) => {
    for (const key of keys) component.handleInput?.(key);
  };
  return { component, save, onDone, text, press, panels };
}

const order = (text: string) =>
  [...text.matchAll(/\[( |x)\] (\w+)/g)].map((m) => `${m[1]}${m[2]}`);

it('lists panels with checkboxes, then the startup and width rows', () => {
  const { text } = open();
  expect(order(text())).toEqual(['xSession', 'xWorkspace', 'xAgents', ' Cost']);
  expect(text()).toContain('Startup  ‹ auto ›');
  expect(text()).toContain('Width    ‹ 44 ›');
  expect(text()).toContain('Space toggle');
});

it('toggles the selected panel with Space', () => {
  const { text, press } = open();
  press(DOWN, ' ');
  expect(order(text())).toEqual(['xSession', ' Workspace', 'xAgents', ' Cost']);
  press(' ');
  expect(order(text())[1]).toBe('xWorkspace');
});

it('reorders with Shift+Up/Down and the cursor follows the row', () => {
  const { text, press } = open();
  press(DOWN, SHIFT_DOWN);
  expect(order(text())).toEqual(['xSession', 'xAgents', 'xWorkspace', ' Cost']);
  // The cursor stayed on Workspace, so Space toggles it.
  press(' ');
  expect(order(text())[2]).toBe(' Workspace');
  press(SHIFT_UP, SHIFT_UP);
  expect(order(text())).toEqual([' Workspace', 'xSession', 'xAgents', ' Cost']);
  // Past the ends is a no-op.
  press(SHIFT_UP);
  expect(order(text())[0]).toBe(' Workspace');
});

it('keeps Shift+Down inside the panel rows', () => {
  const { text, press } = open();
  press(DOWN, DOWN, DOWN, SHIFT_DOWN);
  expect(order(text()).at(-1)).toBe(' Cost');
  expect(text()).toContain('Startup');
});

it('cycles startup with the arrow keys and clamps width within 28..72', () => {
  const { text, press } = open();
  press(DOWN, DOWN, DOWN, DOWN, RIGHT);
  expect(text()).toContain('Startup  ‹ manual ›');
  press(RIGHT, RIGHT);
  expect(text()).toContain('Startup  ‹ auto ›');
  press(LEFT);
  expect(text()).toContain('Startup  ‹ off ›');
  press(DOWN, RIGHT);
  expect(text()).toContain('Width    ‹ 45 ›');
  press(SHIFT_RIGHT);
  expect(text()).toContain('Width    ‹ 49 ›');
  for (let i = 0; i < 40; i++) press(RIGHT);
  expect(text()).toContain('Width    ‹ 72 ›');
  for (let i = 0; i < 60; i++) press(LEFT);
  expect(text()).toContain('Width    ‹ 28 ›');
});

it('ignores arrows and Space on rows where they do not apply', () => {
  const { text, press } = open();
  press(RIGHT, LEFT);
  expect(order(text())).toHaveLength(4);
  expect(text()).toContain('Startup  ‹ auto ›');
  press(DOWN, DOWN, DOWN, DOWN, ' ');
  expect(text()).toContain('Startup  ‹ auto ›');
});

it('does not filter when typing; letters other than s/q do nothing', () => {
  const { text, press } = open();
  press('x', 'z', 'w');
  expect(order(text())).toHaveLength(4);
  expect(text()).not.toContain('search');
});

it('saves the edited draft on Enter, preserving unknown panel keys', () => {
  const { save, onDone, press, panels } = open();
  press(
    DOWN,
    SHIFT_UP,
    ' ',
    DOWN,
    DOWN,
    DOWN,
    DOWN,
    RIGHT,
    DOWN,
    SHIFT_RIGHT,
    ENTER,
  );
  expect(save).toHaveBeenCalledOnce();
  const draft = save.mock.calls[0][0];
  expect(draft.panels).toEqual([
    { id: 'workspace', visible: false, custom: 'kept' },
    { id: 'session', visible: true },
    { id: 'subagents', visible: true },
    { id: 'cost', visible: false },
  ]);
  expect(draft.startup).toBe('manual');
  expect(draft.width).toBe(48);
  expect(onDone).toHaveBeenCalledWith(true);
  // The caller's objects are never mutated by drafting.
  expect(panels[1]).toEqual({ id: 'workspace', visible: true, custom: 'kept' });
});

it.each([
  ['Escape', ESC],
  ['q', 'q'],
  ['Ctrl-C', '\u0003'],
])('cancels on %s without saving, even with pending changes', (_name, key) => {
  const { save, onDone, press } = open();
  press(' ', DOWN, SHIFT_DOWN, key);
  expect(save).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledOnce();
  expect(onDone).toHaveBeenCalledWith(false);
});

it('stays open and reports a failed save', () => {
  const save = vi.fn<() => void>(() => {
    throw new Error('disk full');
  });
  const { onDone, press, text } = open({ save });
  press(ENTER);
  expect(onDone).not.toHaveBeenCalled();
  expect(text()).toContain('Save failed: disk full');
  // Fix the problem: the same draft saves on retry.
  save.mockImplementation(() => {});
  press(ENTER);
  expect(onDone).toHaveBeenCalledWith(true);
});

it('marks changed rows and marks unavailable sources', () => {
  const { text, press } = open({ unavailable: (id) => id === 'subagents' });
  expect(text()).toContain('Agents (unavailable)');
  expect(text()).toContain('pending: none');
  press(' ');
  expect(text()).toContain('pending: 1 change');
  expect(text()).toMatch(/›\s*\*\s*\[ \] Session/);
});
