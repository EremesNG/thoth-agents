import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../shared/config.ts';
import {
  createThemeSettingsPanel,
  draftFromConfig,
  needsReload,
  patchFromDraft,
  type ThemeSettingsOptions,
} from './panel.ts';

const DOWN = '\u001b[B';
const LEFT = '\u001b[D';
const RIGHT = '\u001b[C';
const ENTER = '\r';
const ESC = '\u001b';

const theme = { fg: (_role: string, value: string) => value };
const strip = (text: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: SGR stripping
  text.replace(/\x1b\[[0-9;]*m/g, '');

function open(overrides: Partial<ThemeSettingsOptions> = {}) {
  const save = vi.fn<ThemeSettingsOptions['save']>();
  const onDone = vi.fn<(saved: boolean) => void>();
  const component = createThemeSettingsPanel({
    initial: draftFromConfig(loadConfig('/nonexistent/pi-thoth-theme.json')),
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
  return { save, onDone, text, press };
}

describe('theme settings panel', () => {
  it('renders enum rows, then module checkboxes marked as requiring /reload', () => {
    const { text } = open();
    const out = text();
    expect(out).toContain('Thoth theme settings');
    expect(out).toContain('Icons         ‹ nerd ›');
    expect(out).toContain('Animation     ‹ full ›');
    expect(out).toContain('Tool density  ‹ frame ›');
    for (const label of ['Status line', 'Input box', 'Tool cards', 'Welcome'])
      expect(out).toContain(`[x] ${label}  (requires /reload)`);
    expect(out).toContain('Space toggle');
    expect(out).toContain('pending: none');
  });

  it.each([
    [0, RIGHT, 'Icons         ‹ unicode ›'],
    [0, LEFT, 'Icons         ‹ ascii ›'],
    [1, RIGHT, 'Animation     ‹ reduced ›'],
    [1, LEFT, 'Animation     ‹ off ›'],
    [2, RIGHT, 'Tool density  ‹ compact ›'],
    [2, LEFT, 'Tool density  ‹ line ›'],
  ])('cycles the enum on row %i with %j', (row, key, expected) => {
    const { text, press } = open();
    press(...Array(row).fill(DOWN), key);
    expect(text()).toContain(expected);
    expect(text()).toContain('pending: 1 change');
  });

  it('wraps enums and returns to a clean state', () => {
    const { text, press } = open();
    press(RIGHT, RIGHT, RIGHT);
    expect(text()).toContain('‹ nerd ›');
    expect(text()).toContain('pending: none');
  });

  it('toggles modules with Space and ignores Space and arrows where they do not apply', () => {
    const { text, press } = open();
    press(' ');
    expect(text()).toContain('pending: none');
    press(DOWN, DOWN, DOWN, ' ', RIGHT, LEFT);
    expect(text()).toContain('‹ nerd ›');
    expect(text()).toContain('[ ] Status line');
    expect(text()).toContain('[x] Input box');
    press(' ');
    expect(text()).toContain('[x] Status line');
  });

  it('marks changed rows dirty', () => {
    const { text, press } = open();
    press(DOWN, RIGHT, DOWN, DOWN, DOWN, DOWN, DOWN, ' ');
    expect(text()).toContain('pending: 2 changes');
  });

  it('saves only changed settings on Enter and closes as saved', () => {
    const { save, onDone, press } = open();
    press(RIGHT, DOWN, DOWN, RIGHT, DOWN, DOWN, DOWN, DOWN, DOWN, ' ', ENTER);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0]).toEqual({
      icons: 'unicode',
      tools: { collapsed: 'compact' },
      welcome: { enabled: false },
    });
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('also saves with s', () => {
    const { save, press } = open();
    press(DOWN, RIGHT, 's');
    expect(save.mock.calls[0]?.[0]).toEqual({ animation: 'reduced' });
  });

  it('keeps the overlay open and shows the error when saving throws', () => {
    const { save, onDone, text, press } = open();
    save.mockImplementation(() => {
      throw new Error('disk full');
    });
    press(RIGHT, ENTER);
    expect(onDone).not.toHaveBeenCalled();
    expect(text()).toContain('disk full');
    expect(text()).toContain('‹ unicode ›');
  });

  it.each([
    ['Escape', ESC],
    ['q', 'q'],
  ])('cancels on %s without saving', (_name, key) => {
    const { save, onDone, press } = open();
    press(RIGHT, ' ', key);
    expect(save).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it('does not filter when typing', () => {
    const { text, press } = open();
    press('x', 'z', 'w');
    expect(text()).toContain('Welcome');
    expect(text()).not.toContain('search');
  });
});

describe('patchFromDraft and needsReload', () => {
  const initial = draftFromConfig(loadConfig('/nonexistent/x.json'));
  it('is empty when nothing changed', () => {
    expect(patchFromDraft(initial, initial)).toEqual({});
  });
  it('combines density and tool enablement under tools', () => {
    const patch = patchFromDraft(initial, {
      ...initial,
      density: 'line',
      modules: { ...initial.modules, tools: false },
    });
    expect(patch).toEqual({ tools: { collapsed: 'line', enabled: false } });
    expect(needsReload(patch)).toBe(true);
  });
  it('treats live settings as not needing a reload', () => {
    expect(
      needsReload({
        icons: 'ascii',
        animation: 'off',
        tools: { collapsed: 'line' },
      }),
    ).toBe(false);
  });
});
