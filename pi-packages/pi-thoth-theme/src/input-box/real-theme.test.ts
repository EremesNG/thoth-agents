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
import { decorateEditor, type InputBoxDeps } from './decorate.ts';
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

function themedEditor(
  theme: ActiveThemeLike,
  getStatusSnapshot?: InputBoxDeps['getStatusSnapshot'],
) {
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
  const decoration = decorateEditor(editor, {
    theme,
    working,
    getStatusSnapshot,
  });
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
  )('shimmers the working text while the pyramid breathes with the border and elapsed duration stays muted in $name', async ({
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
    const idle = editor.render(40);
    working.start();
    for (const [now, color, elapsed, unlit, dashes] of [
      [0, dim, '0s', 'w', 20],
      [600, gold, '0s', 'g', 20],
      [1200, bright, '1s', 'w', 20],
      [1800, gold, '1s', 'w', 20],
      [2400, dim, '2s', 'w', 20],
      [59400, gold, '59s', null, 19],
      [60000, dim, '1m 00s', null, 16],
      [845400, gold, '14m 05s', null, 15],
      [7380000, dim, '2h 03m', null, 16],
    ] as const) {
      vi.setSystemTime(now);
      const lines = editor.render(40);
      expect(lines[0].startsWith(`${color}╭─ \x1b[39m${color}△\x1b[39m `)).toBe(
        true,
      );
      if (unlit !== null) {
        expect(lines[0]).toContain(`${muted}${unlit}\x1b[39m`);
      }
      if (now === 1200) {
        expect(lines[0]).toContain(`${bright}\x1b[1mi\x1b[22m\x1b[39m`);
      }
      expect(
        lines[0].endsWith(
          `${muted} · ${elapsed}\x1b[39m${color} ${'─'.repeat(dashes)}╮\x1b[39m`,
        ),
      ).toBe(true);
      expect(stripTerminalSequences(lines[0])).toBe(
        `╭─ △ working… · ${elapsed} ${'─'.repeat(dashes)}╮`,
      );
      expect(lines[1].startsWith(`${color}│\x1b[39m`)).toBe(true);
      expect(lines[1].endsWith(`${color}│\x1b[39m`)).toBe(true);
      expect(lines[2]).toBe(`${color}╰${'─'.repeat(38)}╯\x1b[39m`);
      expect(lines.map(visibleWidth)).toEqual([40, 40, 40]);
      if (expectedMode === '256color') {
        expect(lines.join('\n')).not.toContain('\x1b[38;2;');
      }
    }
    working.end();
    expect(editor.render(40)).toEqual(idle);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    'truecolor',
    '256color',
  ] as const)('renders themed status content on both borders at exact width in %s', async (mode) => {
    const theme = await loadThothTheme(mode);
    setCapabilities({ ...capabilities, trueColor: mode === 'truecolor' });
    const { editor } = themedEditor(theme as ActiveThemeLike, () => ({
      modelName: 'Opus',
      thinkingLevel: 'high',
      gitBranch: 'main',
      cwd: '~/proj',
      contextTokens: 60_000,
      contextPercent: 30,
      contextWindow: 200_000,
      tokenTotals: { input: 0, output: 0, cacheRead: 0 },
      tokensPerSecond: null,
    }));
    editor.setText('content');
    const lines = editor.render(100);
    expect(stripTerminalSequences(lines[0])).toBe(
      `╭─ ▲ ready · ⑂ main ${'─'.repeat(70)} ~/proj ─╮`,
    );
    expect(stripTerminalSequences(lines[2])).toBe(
      `╰─ ● Opus · ◐ high ${'─'.repeat(52)} [███░░░░░░░] 30% 60K/200K ─╯`,
    );
    expect(lines.map(visibleWidth)).toEqual([100, 100, 100]);
    expect(lines[0]).toContain(theme.fg('success', '⑂ main'));
    expect(lines[2]).toContain(theme.fg('mdLink', '● Opus'));
    expect(lines[2]).toContain(theme.fg('thinkingHigh', '◐ high'));
  });
});
