import {
  CURSOR_MARKER,
  Editor,
  foregroundAnsi,
  getTerminalColorMode,
  rgbColor,
  stripTerminalSequences,
  type TUI,
  type TuiMouseEvent,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatusSnapshotProvider } from '../status-line/snapshot.ts';
import {
  decorateEditor,
  type EditorDecoration,
  type InputBoxDeps,
} from './decorate.ts';
import { createWorkingState } from './state.ts';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});

function setup() {
  const plain = (text: string) => text;
  const tui = {
    terminal: { rows: 20 },
    requestRender: vi.fn(),
  };
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
  const deps = {
    theme: { fg: vi.fn((_token: string, text: string) => text) },
    working,
    getStatusSnapshot: undefined as InputBoxDeps['getStatusSnapshot'],
  };
  function decorate(candidate: unknown = editor): EditorDecoration {
    const decoration = decorateEditor(candidate, deps);
    if (!decoration) throw new Error('Editor was not decorated');
    cleanups.push(() => decoration.dispose());
    return decoration;
  }
  return { editor, tui, deps, decorate };
}

function plainLines(lines: string[]): string[] {
  return lines.map(stripTerminalSequences);
}

function mouse(overrides: Partial<TuiMouseEvent> = {}): TuiMouseEvent {
  return {
    type: 'click',
    button: 'left',
    x: 1,
    y: 1,
    screenX: 21,
    screenY: 8,
    width: 40,
    height: 3,
    shift: false,
    alt: false,
    ctrl: false,
    clickCount: 1,
    ...overrides,
  };
}

describe('input-box mouse geometry', () => {
  it('leaves wheel events unhandled so Pi can route them natively', () => {
    const { editor, decorate } = setup();
    const event = mouse({ type: 'wheel', wheelDelta: -1 });
    expect(editor.handleMouse(event)).toBeUndefined();
    decorate();
    editor.render(40);
    expect(editor.handleMouse(event)).toBeUndefined();
  });

  it('translates only local column/width, preserves results, and forwards working fallback events unchanged', () => {
    vi.useFakeTimers();
    const { editor, deps, decorate } = setup();
    const result = {
      handled: true,
      capture: true,
      focus: false,
      render: false,
    };
    const handler = vi.fn((_event: TuiMouseEvent) => result);
    editor.handleMouse = handler;
    const decoration = decorate();
    deps.working.start();
    const event = {
      ...mouse({
        type: 'wheel',
        x: 10,
        y: 4,
        height: 9,
        shift: true,
        wheelDelta: -3,
      }),
      extra: 'preserved',
    };
    expect(editor.handleMouse(event)).toBe(result);
    expect(handler.mock.calls.at(-1)?.[0]).toBe(event);
    editor.render(40);
    expect(editor.handleMouse(event)).toBe(result);
    expect(handler.mock.calls.at(-1)?.[0]).toEqual({
      ...event,
      x: 9,
      width: 38,
    });
    expect(event.x).toBe(10);
    expect(event.width).toBe(40);
    editor.render(10);
    const narrowEvent = { ...event, width: 10 };
    expect(editor.handleMouse(narrowEvent)).toBe(result);
    expect(handler.mock.calls.at(-1)?.[0]).toBe(narrowEvent);
    editor.setPaddingX(7);
    editor.setText('界');
    expect(editor.render(17).map(visibleWidth)).toEqual([17, 17, 17]);
    const paddedEvent = { ...event, width: 17 };
    expect(editor.handleMouse(paddedEvent)).toBe(result);
    expect(handler.mock.calls.at(-1)?.[0]).toBe(paddedEvent);
    decoration.dispose();
    expect(editor.handleMouse).toBe(handler);
  });

  it('keeps autocomplete unchanged below the animated box and selects the clicked item', async () => {
    const { editor, tui, deps, decorate } = setup();
    editor.setPaddingX(2);
    decorate();
    const shown = new Promise<void>((resolve) =>
      tui.requestRender.mockImplementation(resolve),
    );
    editor.setAutocompleteProvider({
      triggerCharacters: ['/'],
      async getSuggestions() {
        return {
          prefix: '/',
          items: [
            { value: '/alpha', label: 'alpha' },
            { value: '/beta', label: 'beta' },
          ],
        };
      },
      applyCompletion(_lines, _line, _col, item) {
        return {
          lines: [item.value],
          cursorLine: 0,
          cursorCol: item.value.length,
        };
      },
    });
    editor.handleInput('/');
    await shown;
    expect(editor.isShowingAutocomplete()).toBe(true);
    const lines = editor.render(40);
    expect(lines).toHaveLength(5);
    expect(lines[2]).toMatch(/^╰/);
    expect(lines[3]).toContain('   → alpha');
    expect(lines[4]).toContain('     beta');
    expect(
      lines
        .slice(3)
        .every((line) => !line.startsWith('│') && !line.endsWith('│')),
    ).toBe(true);
    expect(lines.map(visibleWidth)).toEqual([40, 40, 40, 40, 40]);
    deps.working.start();
    const animated = editor.render(40);
    expect(animated.slice(3)).toEqual(lines.slice(3));
    expect(animated.map(stripTerminalSequences)).toEqual(
      lines.map(stripTerminalSequences),
    );
    expect(animated.map(visibleWidth)).toEqual([40, 40, 40, 40, 40]);
    expect(editor.handleMouse(mouse({ x: 5, y: 4, height: 5 }))).toEqual({
      handled: true,
      focus: true,
    });
    expect(editor.getText()).toBe('/beta');
    expect(editor.getCursor()).toEqual({ line: 0, col: 5 });
    expect(editor.isShowingAutocomplete()).toBe(false);
    editor.setAutocompleteProvider({
      async getSuggestions() {
        return null;
      },
      applyCompletion() {
        return { lines: [''], cursorLine: 0, cursorCol: 0 };
      },
    });
  });

  it.each([
    { padding: 0, width: 40, firstColumn: 1 },
    { padding: 2, width: 40, firstColumn: 3 },
    { padding: 8, width: 16, firstColumn: 7 },
  ])('clicks the first and second characters at padding $padding / width $width', ({
    padding,
    width,
    firstColumn,
  }) => {
    const { editor, decorate } = setup();
    editor.setPaddingX(padding);
    editor.setText('abc');
    decorate();
    editor.render(width);
    expect(editor.handleMouse(mouse({ x: firstColumn, width }))).toEqual({
      handled: true,
      focus: true,
    });
    expect(editor.getCursor()).toEqual({ line: 0, col: 0 });
    editor.handleMouse(mouse({ x: firstColumn + 1, width }));
    expect(editor.getCursor()).toEqual({ line: 0, col: 1 });
  });
});

describe('input-box editor composition', () => {
  it('reads the optional status provider live on every render and stops after disposal', () => {
    const { editor, deps, decorate } = setup();
    let modelName = 'First model';
    const provider: StatusSnapshotProvider = () => ({
      modelName,
      tokenTotals: { input: 0, output: 0, cacheRead: 0 },
      tokensPerSecond: null,
    });
    deps.getStatusSnapshot = provider;
    const decoration = decorate();
    expect(decoration.getStatusSnapshot()?.modelName).toBe('First model');
    expect(plainLines(editor.render(60))[2]).toContain('\u{f06a9} First model');
    modelName = 'Next model';
    expect(decoration.getStatusSnapshot()?.modelName).toBe('Next model');
    expect(plainLines(editor.render(60))[2]).toContain('\u{f06a9} Next model');
    decoration.dispose();
    expect(decoration.getStatusSnapshot()).toBeUndefined();
  });

  it('puts branch and cwd on the top border and model, effort and context on the bottom', () => {
    const { editor, deps, decorate } = setup();
    deps.getStatusSnapshot = () => ({
      modelName: 'Opus',
      thinkingLevel: 'high',
      gitBranch: 'main',
      cwd: '~/proj',
      contextTokens: 60_000,
      contextPercent: 30,
      contextWindow: 200_000,
      tokenTotals: { input: 0, output: 0, cacheRead: 0 },
      tokensPerSecond: null,
    });
    decorate();
    const [top, , bottom] = plainLines(editor.render(80));
    expect(top).toBe(
      `╭─ ▲ ready · \ue0a0 main ${'─'.repeat(48)} \u{f07c} ~/proj ─╮`,
    );
    expect(bottom).toBe(
      `╰─ \u{f06a9} Opus · \u{f09d1} high ${'─'.repeat(30)} \uf2db [███░░░░░░░] 30% 60K/200K ─╯`,
    );
    expect(top.length).toBe(80);
    expect(visibleWidth(bottom)).toBe(80);
  });

  it('keeps scroll counts and shows a dash when context usage is absent', () => {
    const { editor, deps, decorate } = setup();
    deps.getStatusSnapshot = () => ({
      modelName: 'Opus',
      gitBranch: 'main',
      cwd: '~/proj',
      contextTokens: null,
      contextPercent: null,
      contextWindow: 200_000,
      tokenTotals: { input: 0, output: 0, cacheRead: 0 },
      tokensPerSecond: null,
    });
    decorate();
    editor.setText(
      Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'),
    );
    editor.render(80);
    for (let i = 0; i < 20; i++) editor.handleInput('\x1b[A');
    // Place the cursor mid-document so both scroll counts are present.
    const lines = plainLines(editor.render(80));
    const top = lines[0];
    const bottom = lines.find((line) => line.startsWith('╰')) as string;
    expect(top).toMatch(
      /^╭─ ▲ ready · \ue0a0 main ─ ↑ \d+ more ─+ \u{f07c} ~\/proj ─╮$/u,
    );
    expect(bottom).toMatch(
      /^╰─ \u{f06a9} Opus ─ ↓ \d+ more ─+ \uf2db —\/200K ─╯$/u,
    );
    expect(visibleWidth(top)).toBe(80);
    expect(visibleWidth(bottom)).toBe(80);
  });

  it('keeps exact border widths with ANSI and wide glyphs across degradation widths', () => {
    const { editor, deps, decorate } = setup();
    deps.getStatusSnapshot = () => ({
      modelName: '模型 Opus',
      thinkingLevel: 'xhigh',
      gitBranch: 'feature/界',
      cwd: '~/界/very/long/project/path',
      contextTokens: 60_000,
      contextPercent: 95,
      contextWindow: 200_000,
      tokenTotals: { input: 0, output: 0, cacheRead: 0 },
      tokensPerSecond: null,
    });
    decorate();
    for (let width = 16; width <= 200; width++) {
      const lines = editor.render(width);
      const bottom = lines.findIndex((line) => line.includes('╯'));
      expect(visibleWidth(lines[0])).toBe(width);
      expect(visibleWidth(lines[bottom])).toBe(width);
      expect(stripTerminalSequences(lines[0])).toContain('▲');
    }
  });

  it('keeps a compact native-separator cwd on the top border where the full Windows path drops', () => {
    const { editor, deps, decorate } = setup();
    deps.getStatusSnapshot = () => ({
      modelName: 'Opus',
      gitBranch: 'main',
      cwd: '~\\orca\\workspaces\\thoth-agents\\thoth-theme',
      tokenTotals: { input: 0, output: 0, cacheRead: 0 },
      tokensPerSecond: null,
    });
    decorate();
    let compactWidths = 0;
    for (let width = 24; width <= 120; width++) {
      const top = plainLines(editor.render(width))[0];
      expect(visibleWidth(top)).toBe(width);
      if (
        top.includes('\u{f07c} …\\thoth-theme ') &&
        top.includes('\ue0a0 main')
      ) {
        compactWidths++;
        expect(top).not.toContain('workspaces');
      }
    }
    expect(compactWidths).toBeGreaterThan(0);
    const narrow = plainLines(editor.render(44))[0];
    expect(visibleWidth(narrow)).toBe(44);
    expect(narrow).toContain('\u{f07c} …\\thoth-theme');
  });

  it('degrades right regions before left secondaries and never drops the status or model while the frame fits', () => {
    const { editor, deps, decorate } = setup();
    deps.getStatusSnapshot = () => ({
      modelName: 'Opus',
      thinkingLevel: 'high',
      gitBranch: 'main',
      cwd: '~/work/project',
      contextTokens: 60_000,
      contextPercent: 30,
      contextWindow: 200_000,
      tokenTotals: { input: 0, output: 0, cacheRead: 0 },
      tokensPerSecond: null,
    });
    decorate();
    let sawBranchWithoutCwd = false;
    let sawEffortWithoutContext = false;
    for (let width = 24; width <= 200; width++) {
      const lines = plainLines(editor.render(width));
      const top = lines[0];
      const bottom = lines.find((line) => line.startsWith('╰')) as string;
      expect(visibleWidth(top)).toBe(width);
      expect(visibleWidth(bottom)).toBe(width);
      expect(top).toContain('▲ ready');
      expect(bottom).toContain('\u{f06a9} Opus');
      const branch = top.includes('\ue0a0 main');
      const cwd = top.includes('project');
      const effort = bottom.includes('\u{f09d1} high');
      const context = bottom.includes('200K');
      // Right regions drop before left secondaries do.
      if (!branch) expect(cwd).toBe(false);
      if (!effort) expect(context).toBe(false);
      sawBranchWithoutCwd ||= branch && !cwd;
      sawEffortWithoutContext ||= effort && !context;
    }
    expect(sawBranchWithoutCwd).toBe(true);
    expect(sawEffortWithoutContext).toBe(true);
  });

  it('animates only the working box, preserving native fallback and byte-identical idle output', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { editor, deps, decorate } = setup();
    deps.theme.fg.mockImplementation(
      (token, text) => `\x1b[${token === 'muted' ? '33' : '2'}m${text}\x1b[0m`,
    );
    editor.setPaddingX(2);
    editor.setText('界 ─ │ ╭ ╮ ╰ ╯');
    const nativeNarrow = editor.render(10);
    decorate();
    const idle = editor.render(40);
    expect(idle[0]).toContain('\x1b[33m╭─ ');
    expect(idle[0]).toContain('\x1b[33m▲ ready\x1b[0m');
    deps.working.start();
    const animated = editor.render(40);
    expect(animated).not.toEqual(idle);
    const dim = foregroundAnsi(rgbColor(115, 104, 80), getTerminalColorMode());
    expect(animated[0].startsWith(`${dim}╭─ \x1b[39m`)).toBe(true);
    expect(animated.join('\n')).not.toMatch(/[━┃┏┓┗┛]/u);
    expect(animated.map(stripTerminalSequences)).toEqual(
      idle.map(stripTerminalSequences),
    );
    expect(animated.map(visibleWidth)).toEqual(idle.map(visibleWidth));
    expect(animated[0]).toContain('\x1b[33m▲ ready\x1b[0m');
    expect(animated[1]).toContain(
      `界 ─ │ ╭ ╮ ╰ ╯${CURSOR_MARKER}\x1b[7m \x1b[0m`,
    );
    expect(editor.render(10)).toEqual(nativeNarrow);
    vi.advanceTimersByTime(1000);
    expect(editor.render(40)).not.toEqual(animated);
    deps.working.end();
    expect(editor.render(40)).toEqual(idle);
    vi.advanceTimersByTime(1000);
    expect(editor.render(40)).toEqual(idle);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses one time sample for the shimmer, pyramid, and every border even when native rendering advances the clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(600);
    const { editor, deps, decorate } = setup();
    const muted = (text: string) => `\x1b[33m${text}\x1b[0m`;
    deps.theme.fg.mockImplementation((_token, text) => muted(text));
    const renderInBorder = vi.fn(() => {
      vi.setSystemTime(1200);
      return '\x1b[36m△ working…\x1b[0m';
    });
    Object.assign(editor, {
      workingStatusIndicator: { kind: 'working', renderInBorder },
    });
    decorate();
    deps.working.start();
    const lines = editor.render(40);
    const mode = getTerminalColorMode();
    const gold = foregroundAnsi(rgbColor(212, 175, 55), mode);
    const highlight = foregroundAnsi(rgbColor(230, 193, 83), mode);

    expect(renderInBorder).toHaveBeenCalledTimes(1);
    expect(lines[0].startsWith(`${gold}╭─ \x1b[39m${gold}△\x1b[39m `)).toBe(
      true,
    );
    // At 600 ms w/o share the bold head; resampling at 1200 would peak on i.
    expect(lines[0]).toContain(
      `${highlight}\x1b[1mw\x1b[22m\x1b[39m${highlight}\x1b[1mo\x1b[22m\x1b[39m`,
    );
    expect(
      lines[0].endsWith(`${muted(' · 0s')}${gold} ${'─'.repeat(20)}╮\x1b[39m`),
    ).toBe(true);
    expect(stripTerminalSequences(lines[0])).toBe(
      `╭─ △ working… · 0s ${'─'.repeat(20)}╮`,
    );
    expect(lines[1].startsWith(`${gold}│\x1b[39m`)).toBe(true);
    expect(lines[1].endsWith(`${gold}│\x1b[39m`)).toBe(true);
    expect(lines[2]).toBe(`${gold}╰${'─'.repeat(38)}╯\x1b[39m`);
    expect(lines.map(visibleWidth)).toEqual([40, 40, 40]);
  });

  it('falls back rather than clipping a large scroll count at the minimum width', () => {
    const { editor, decorate } = setup();
    editor.setText(Array.from({ length: 1006 }, () => 'x').join('\n'));
    decorate();
    const lines = editor.render(16);
    expect(lines[0]).toContain('↑ 1000 more');
    expect(lines[0]).not.toContain('╭');
    expect(lines.every((line) => visibleWidth(line) <= 16)).toBe(true);
  });

  it('does not overwrite a later extension method replacement on disposal', () => {
    const { editor, decorate } = setup();
    const decoration = decorate();
    const replacement = (_width: number) => ['another extension'];
    editor.render = replacement;
    decoration.dispose();
    expect(editor.render).toBe(replacement);
  });

  it('keeps native scroll indicators in full-width animated rounded borders', () => {
    vi.useFakeTimers();
    const { editor, deps, decorate } = setup();
    editor.setText(
      Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n'),
    );
    decorate();
    expect(editor.render(40)[0]).toContain('↑ 14 more');
    for (let index = 0; index < 20; index++) editor.handleInput('\x1b[A');
    const idle = editor.render(40);
    deps.working.start();
    const lines = editor.render(40);
    expect(stripTerminalSequences(lines.at(-1) ?? '')).toMatch(
      /^╰─ ↓ 14 more ─+╯$/,
    );
    expect(lines.map(stripTerminalSequences)).toEqual(
      idle.map(stripTerminalSequences),
    );
    expect(lines.every((line) => visibleWidth(line) === 40)).toBe(true);
  });

  it('leaves non-editors, frozen instances, and intercepting method accessors untouched', () => {
    const { editor, deps } = setup();
    const getter = vi.fn(() => {
      throw new Error('Do not read render getters');
    });
    Object.defineProperty(editor, 'render', {
      configurable: true,
      get: getter,
    });
    expect(decorateEditor(editor, deps)).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
    expect(Reflect.getOwnPropertyDescriptor(editor, 'render')?.get).toBe(
      getter,
    );
    expect(decorateEditor({ render: () => [] }, deps)).toBeUndefined();
    const frozen = Object.freeze(setup().editor);
    expect(decorateEditor(frozen, deps)).toBeUndefined();
  });

  it('renders the idle ready label in the muted color', () => {
    const { editor, deps, decorate } = setup();
    deps.theme.fg.mockImplementation((token, text) => `<${token}:${text}>`);
    decorate();
    expect(editor.render(40)[0]).toContain('<muted:▲ ready>');
  });

  it('ignores later thinking-border colors, renders natively at narrow widths, and restores on disposal', () => {
    const { editor, deps, decorate } = setup();
    editor.setText('abcdef');
    const native = editor.render(10);
    const originalRender = editor.render;
    const originalBorderColor = editor.borderColor;
    deps.theme.fg.mockImplementation(
      (_token, text) => `\x1b[33m${text}\x1b[0m`,
    );
    const decoration = decorate();
    editor.borderColor = (text) => `\x1b[31m${text}\x1b[0m`;
    expect(editor.borderColor('border')).toBe('\x1b[33mborder\x1b[0m');
    expect(editor.render(40)[0]).toContain('\x1b[33m╭─ ');
    expect(editor.render(10)).toEqual(native);
    decoration.dispose();
    decoration.dispose();
    expect(editor.render).toBe(originalRender);
    expect(editor.borderColor).toBe(originalBorderColor);
    expect(editor.render(10)).toEqual(native);
    decorate();
    expect(editor.render(40)[0]).toContain('╭─ ');
  });

  it('uses current native padding and preserves the cursor when it overflows into padding', () => {
    const { editor, decorate } = setup();
    editor.setText('abcdefghij');
    decorate();
    expect(editor.render(16)[1]).toContain('│abcdefghij');
    editor.setPaddingX(2);
    const padded = editor.render(16);
    expect(padded[1]).toBe(`│  abcdefghij${CURSOR_MARKER}\x1b[7m \x1b[0m │`);
    expect(padded.map(visibleWidth)).toEqual([16, 16, 16]);
    expect(padded.join('\n')).not.toContain('type or / for commands');
    editor.setText('');
    expect(editor.render(40)[1]).toContain(
      `│  ${CURSOR_MARKER}\x1b[7m \x1b[0mtype or / for commands`,
    );
  });

  it('decorates a dynamic-call Proxy without recursion, preserving identity and input/render interception', () => {
    const { editor, decorate } = setup();
    let renderInterceptions = 0;
    let inputInterceptions = 0;
    let forwardedWrites = 0;
    const proxy: Editor = new Proxy(editor, {
      get(target, prop) {
        if (prop === 'render' && typeof target.render === 'function') {
          return (...args: [number]) => {
            renderInterceptions += 1;
            return target.render(...args);
          };
        }
        if (prop === 'handleInput') {
          return (data: string) => {
            inputInterceptions += 1;
            if (data !== 'navigator-key') target.handleInput(data);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, prop, value) {
        forwardedWrites += 1;
        return Reflect.set(target, prop, value);
      },
    });
    const focused = proxy;
    const decoration = decorate(proxy);
    expect(decorate(proxy)).toBe(decoration);
    expect(focused).toBe(proxy);
    proxy.handleInput('navigator-key');
    expect(editor.getText()).toBe('');
    proxy.handleInput('abc');
    expect(editor.getText()).toBe('abc');
    proxy.focused = true;
    const lines = proxy.render(40);
    expect(lines[0]).toMatch(/^╭─ ▲ ready /);
    expect(lines[1]).toContain(`│abc${CURSOR_MARKER}\x1b[7m \x1b[0m`);
    expect(lines[2]).toMatch(/^╰─+╯$/);
    expect(lines.map(visibleWidth)).toEqual([40, 40, 40]);
    expect(renderInterceptions).toBe(1);
    expect(inputInterceptions).toBe(2);
    expect(forwardedWrites).toBe(1);
    proxy.handleMouse(mouse());
    expect(editor.getCursor()).toEqual({ line: 0, col: 0 });
  });
});
