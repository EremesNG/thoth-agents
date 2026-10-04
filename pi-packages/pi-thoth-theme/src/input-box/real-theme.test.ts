import { fileURLToPath } from 'node:url';
import {
  DefaultResourceLoader,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import {
  CURSOR_MARKER,
  Editor,
  getCapabilities,
  getTerminalColorMode,
  setCapabilities,
  stripTerminalSequences,
  type TerminalColorMode,
  type TUI,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActiveThemeLike } from '../status-line/layout.ts';
import { decorateEditor } from './decorate.ts';
import { createWorkingState } from './state.ts';

const capabilities = getCapabilities();
const detectedMode = getTerminalColorMode();
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  setCapabilities(capabilities);
  vi.useRealTimers();
});

async function loadThothTheme(mode?: TerminalColorMode) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir: root,
    settingsManager: SettingsManager.inMemory({
      terminal: mode ? { trueColor: mode === 'truecolor' } : {},
    }),
    additionalThemePaths: [
      fileURLToPath(new URL('../../themes/thoth.json', import.meta.url)),
    ],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const { themes, diagnostics } = loader.getThemes();
  expect(diagnostics).toEqual([]);
  const theme = themes.find((theme) => theme.name === 'thoth');
  if (!theme) throw new Error('Thoth theme did not load');
  return theme;
}

const modes = [
  { name: 'truecolor', mode: 'truecolor' },
  { name: '256color', mode: '256color' },
  { name: 'detected', mode: undefined },
] as const;
const ansi = {
  truecolor: {
    muted: '\x1b[38;2;168;154;120m',
    gold: '\x1b[38;2;212;175;55m',
    bright: '\x1b[38;2;242;201;76m',
  },
  '256color': {
    muted: '\x1b[38;5;138m',
    gold: '\x1b[38;5;179m',
    bright: '\x1b[38;5;221m',
  },
};

describe('input box with the real Pi Thoth theme', () => {
  it.each(
    modes,
  )('uses muted sand for the idle and working border and patched color getter in $name', async ({
    mode,
  }) => {
    const theme = await loadThothTheme(mode);
    const expectedMode = mode ?? detectedMode;
    expect(theme.getColorMode()).toBe(expectedMode);
    setCapabilities({
      ...capabilities,
      trueColor: expectedMode === 'truecolor',
    });
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const plain = (text: string) => text;
    const tui = { terminal: { rows: 20 }, requestRender: () => {} };
    const editor = new Editor(tui as unknown as TUI, {
      borderColor: plain,
      selectList: {
        selectedPrefix: plain,
        selectedText: plain,
        description: plain,
        scrollInfo: plain,
        noMatch: plain,
      },
    });
    editor.focused = true;
    editor.setText('content');
    const working = createWorkingState(tui.requestRender);
    cleanups.push(() => working.dispose());
    const decoration = decorateEditor(editor, {
      theme: theme as ActiveThemeLike,
      working,
    });
    if (!decoration) throw new Error('Editor was not decorated');
    cleanups.push(() => decoration.dispose());
    const { muted, gold, bright } = ansi[expectedMode];
    expect(theme.fg('accent', '╭')).toBe(`${gold}╭\x1b[39m`);
    expect(editor.borderColor('│')).toBe(`${muted}│\x1b[39m`);
    const idle = editor.render(40);
    expect(idle[0]).toBe(
      `${muted}╭─ \x1b[39m${muted}▲ ready\x1b[39m${muted} ${'─'.repeat(28)}╮\x1b[39m`,
    );
    expect(idle[1].startsWith(`${muted}│\x1b[39m`)).toBe(true);
    expect(idle[1].endsWith(`${muted}│\x1b[39m`)).toBe(true);
    expect(idle[1]).toContain(`${CURSOR_MARKER}\x1b[7m \x1b[0m`);
    expect(idle[2]).toBe(`${muted}╰${'─'.repeat(38)}╯\x1b[39m`);
    expect(idle.map(visibleWidth)).toEqual([40, 40, 40]);
    working.start();
    const animated = editor.render(40);
    expect(animated[0].startsWith(`${bright}\x1b[1m╭\x1b[22m\x1b[39m`)).toBe(
      true,
    );
    expect(editor.borderColor('│')).toBe(`${muted}│\x1b[39m`);
    expect(animated[0]).toContain(`${muted} ${'─'.repeat(28)}╮\x1b[39m`);
    expect(animated[1].endsWith(`${muted}│\x1b[39m`)).toBe(true);
    expect(animated.map(stripTerminalSequences)).toEqual(
      idle.map(stripTerminalSequences),
    );
    expect(animated.map(visibleWidth)).toEqual([40, 40, 40]);
    working.end();
    expect(editor.render(40)).toEqual(idle);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(
    modes,
  )('renders a bold bright-gold pyramid and shimmer peak over muted letters and elapsed seconds in $name', async ({
    mode,
  }) => {
    const theme = await loadThothTheme(mode);
    const expectedMode = mode ?? detectedMode;
    setCapabilities({
      ...capabilities,
      trueColor: expectedMode === 'truecolor',
    });
    vi.useFakeTimers();
    vi.setSystemTime(1200);
    const working = createWorkingState(() => {});
    cleanups.push(() => working.dispose());
    const indicator = {
      kind: 'working',
      renderInBorder: () => theme.fg('accent', '△ working…'),
    };
    const { muted, bright } = ansi[expectedMode];
    const status = () =>
      working.status(indicator, 30, (text) => theme.fg('muted', text));
    working.start();
    const first = status();
    expect(first.startsWith(`${bright}\x1b[1m△\x1b[22m\x1b[39m`)).toBe(true);
    expect(first).toContain(`${bright}\x1b[1mi\x1b[22m\x1b[39m`);
    expect(first).toContain(`${muted}w\x1b[39m`);
    expect(first.endsWith(`${muted} · 0s\x1b[39m`)).toBe(true);
    expect(stripTerminalSequences(first)).toBe('△ working… · 0s');
    expect(visibleWidth(first)).toBe(15);
    vi.advanceTimersByTime(1200);
    const next = status();
    expect(next).toContain(`${muted}i\x1b[39m`);
    expect(next.endsWith(`${muted} · 1s\x1b[39m`)).toBe(true);
    working.end();
    expect(vi.getTimerCount()).toBe(0);
  });
});
