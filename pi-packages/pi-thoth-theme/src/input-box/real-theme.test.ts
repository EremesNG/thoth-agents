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

function themedEditor(theme: ActiveThemeLike) {
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
  const working = createWorkingState(tui.requestRender);
  cleanups.push(() => working.dispose());
  const decoration = decorateEditor(editor, { theme, working });
  if (!decoration) throw new Error('Editor was not decorated');
  cleanups.push(() => decoration.dispose());
  return { editor, working };
}

const modes = [
  { name: 'truecolor', mode: 'truecolor' },
  { name: '256color', mode: '256color' },
  { name: 'detected', mode: undefined },
] as const;
const ansi = {
  truecolor: {
    muted: '\x1b[38;2;168;154;120m',
    dim: '\x1b[38;2;115;104;80m',
    gold: '\x1b[38;2;212;175;55m',
    bright: '\x1b[38;2;242;201;76m',
  },
  '256color': {
    muted: '\x1b[38;5;138m',
    dim: '\x1b[38;5;59m',
    gold: '\x1b[38;5;179m',
    bright: '\x1b[38;5;221m',
  },
};

describe('input box with the real Pi Thoth theme', () => {
  it.each([
    'truecolor',
    '256color',
  ] as const)('keeps the pre-impact idle render byte-identical in %s', async (mode) => {
    const theme = await loadThothTheme(mode);
    setCapabilities({ ...capabilities, trueColor: mode === 'truecolor' });
    const { editor } = themedEditor(theme as ActiveThemeLike);
    editor.setText('content');
    expect(editor.render(40)).toMatchSnapshot();
  });

  it.each(
    modes,
  )('keeps idle borders and the patched color getter muted but breathes every working border in $name', async ({
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
    const { editor, working } = themedEditor(theme as ActiveThemeLike);
    editor.setText('content');
    const { muted, dim, gold, bright } = ansi[expectedMode];
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
    for (const [now, color] of [
      [0, dim],
      [600, gold],
      [1200, bright],
      [1800, gold],
      [2400, dim],
    ] as const) {
      vi.setSystemTime(now);
      const animated = editor.render(40);
      expect(animated[0]).toBe(
        `${color}╭─ \x1b[39m${muted}▲ ready\x1b[39m${color} ${'─'.repeat(28)}╮\x1b[39m`,
      );
      expect(editor.borderColor('│')).toBe(`${muted}│\x1b[39m`);
      expect(animated[1].startsWith(`${color}│\x1b[39m`)).toBe(true);
      expect(animated[1].endsWith(`${color}│\x1b[39m`)).toBe(true);
      expect(animated[2]).toBe(`${color}╰${'─'.repeat(38)}╯\x1b[39m`);
      expect(animated.join('\n')).not.toMatch(/[━┃┏┓┗┛]/u);
      expect(animated.map(stripTerminalSequences)).toEqual(
        idle.map(stripTerminalSequences),
      );
      expect(animated.map(visibleWidth)).toEqual([40, 40, 40]);
    }
    working.end();
    expect(editor.render(40)).toEqual(idle);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(
    modes,
  )('pulses the pyramid in the border color and keeps the working text and elapsed seconds muted in $name', async ({
    mode,
  }) => {
    const theme = await loadThothTheme(mode);
    const expectedMode = mode ?? detectedMode;
    setCapabilities({
      ...capabilities,
      trueColor: expectedMode === 'truecolor',
    });
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { editor, working } = themedEditor(theme as ActiveThemeLike);
    Object.assign(editor, {
      workingStatusIndicator: {
        kind: 'working',
        renderInBorder: () => theme.fg('accent', '△ working…'),
      },
    });
    const { muted, dim, gold, bright } = ansi[expectedMode];
    working.start();
    for (const [now, color, elapsed] of [
      [0, dim, 0],
      [600, gold, 0],
      [1200, bright, 1],
      [1800, gold, 1],
      [2400, dim, 2],
    ] as const) {
      vi.setSystemTime(now);
      const lines = editor.render(40);
      expect(lines[0]).toBe(
        `${color}╭─ \x1b[39m${color}△\x1b[39m ${muted}working…\x1b[39m${muted} · ${elapsed}s\x1b[39m${color} ${'─'.repeat(20)}╮\x1b[39m`,
      );
      expect(lines[1].startsWith(`${color}│\x1b[39m`)).toBe(true);
      expect(lines[1].endsWith(`${color}│\x1b[39m`)).toBe(true);
      expect(lines[2]).toBe(`${color}╰${'─'.repeat(38)}╯\x1b[39m`);
      expect(lines.map(visibleWidth)).toEqual([40, 40, 40]);
    }
    working.end();
    expect(vi.getTimerCount()).toBe(0);
  });
});
