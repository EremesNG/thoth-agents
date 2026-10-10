import { readFileSync } from 'node:fs';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import type {
  RenderKitTheme,
  RenderStatus,
  SemanticIconName,
} from '@thoth-agents/pi-core';
import {
  registerRenderKit,
  resolveFrames,
  resolveIcon,
  resolveStatusGlyph,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { describe, expect, it } from 'vitest';
import {
  renderInputBottom,
  renderInputTop,
  scrollLabel,
} from '../src/input-box/frame.ts';
import { createBreathingFrame } from '../src/input-box/gradient.ts';
import { createWorkingState } from '../src/input-box/state.ts';
import { createRenderKit } from '../src/render-kit/index.ts';
import type { IconMode } from '../src/shared/config.ts';
import { renderWelcomeHeader } from '../src/welcome/render.ts';
import type { WelcomeData } from '../src/welcome/resources.ts';

const theme: RenderKitTheme = { fg: (_role, text) => text };
const modes: readonly IconMode[] = ['nerd', 'unicode', 'ascii'];
const plainTheme = { fg: (_token: string, text: string) => text };

describe('theme kit icon lookup per mode', () => {
  it('documents the Unicode agent substitution rather than requiring its native Nerd glyph', () => {
    const readme = readFileSync(
      new URL('../README.md', import.meta.url),
      'utf8',
    );
    expect(readme).toContain('agent `⚙`');
    expect(readme).not.toContain(
      'Unicode mode preserves the native agent symbol',
    );
    expect(readme).not.toContain(
      'which still needs a font providing that glyph',
    );
  });
  const expected: Record<
    IconMode,
    Record<SemanticIconName, string | readonly string[]>
  > = {
    nerd: {
      elapsed: '',
      warning: '\u{f071}',
      branch: '\u{e0a0}',
      folder: '\u{f07c}',
      model: '\u{f06a9}',
      effort: '\u{f09d1}',
      context: '\u{f2db}',
      cost: '\u{f155}',
      tokensIn: '\u{f062}',
      tokensOut: '\u{f063}',
      cache: '\u{f01bc}',
      throughput: '\u{f04c5}',
      agent: '\u{f08c7}',
      tool: '\u{f0ad}',
      bash: '\u{f489}',
      read: '\u{f06e}',
      write: '\u{f0c7}',
      edit: '\u{f044}',
      search: '\u{f002}',
      file: '\u{f0214}',
      separator: '·',
      ellipsis: '…',
      arrowUp: '↑',
      arrowDown: '↓',
      arrowLeft: '←',
      arrowRight: '→',
      selection: '›',
      selectionSelected: '\u{f111}',
      selectionUnselected: '\u{f10c}',
      taskInProgress: '◐',
      separatorHeavy: '┃',
      boxTopLeft: '╭',
      boxTopRight: '╮',
      boxVertical: '│',
      boxBottomLeft: '╰',
      boxBottomRight: '╯',
      boxHorizontal: '─',
      boxTDown: '┬',
      boxTUp: '┴',
      boxTRight: '├',
      boxTLeft: '┤',
      boxCross: '┼',
      close: '\u{f00d}',
      scrollUp: '↑',
      scrollDown: '↓',
      ready: '▲',
      spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
      workingFrames: ['△', '◭', '▲', '◮'],
    },
    unicode: {
      elapsed: '◷',
      warning: '⚠',
      branch: '⑂',
      folder: 'dir',
      model: '●',
      effort: '◐',
      context: 'ctx',
      cost: '$',
      tokensIn: '↑',
      tokensOut: '↓',
      cache: 'cache',
      throughput: 'tok/s',
      agent: '⚙',
      tool: '*',
      bash: '$',
      read: 'read',
      write: 'write',
      edit: 'edit',
      search: 'search',
      file: 'file',
      separator: '·',
      ellipsis: '…',
      arrowUp: '↑',
      arrowDown: '↓',
      arrowLeft: '←',
      arrowRight: '→',
      selection: '›',
      selectionSelected: '●',
      selectionUnselected: '○',
      taskInProgress: '◇',
      separatorHeavy: '┃',
      boxTopLeft: '╭',
      boxTopRight: '╮',
      boxVertical: '│',
      boxBottomLeft: '╰',
      boxBottomRight: '╯',
      boxHorizontal: '─',
      boxTDown: '┬',
      boxTUp: '┴',
      boxTRight: '├',
      boxTLeft: '┤',
      boxCross: '┼',
      close: '✕',
      scrollUp: '↑',
      scrollDown: '↓',
      ready: '▲',
      spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
      workingFrames: ['△', '◭', '▲', '◮'],
    },
    ascii: {
      elapsed: 'elapsed',
      warning: '!',
      branch: 'git',
      folder: 'dir',
      model: '*',
      effort: 'o',
      context: 'ctx',
      cost: '$',
      tokensIn: '^',
      tokensOut: 'v',
      cache: 'cache',
      throughput: 'tok/s',
      agent: '@',
      tool: '*',
      bash: '$',
      read: '[read]',
      write: '[write]',
      edit: '[edit]',
      search: '?',
      file: '[file]',
      separator: '|',
      ellipsis: '...',
      arrowUp: '^',
      arrowDown: 'v',
      arrowLeft: '<',
      arrowRight: '>',
      selection: '>',
      selectionSelected: '*',
      selectionUnselected: 'o',
      taskInProgress: '*',
      separatorHeavy: '|',
      boxTopLeft: '+',
      boxTopRight: '+',
      boxVertical: '|',
      boxBottomLeft: '+',
      boxBottomRight: '+',
      boxHorizontal: '-',
      boxTDown: '+',
      boxTUp: '+',
      boxTRight: '+',
      boxTLeft: '+',
      boxCross: '+',
      close: 'x',
      scrollUp: '^',
      scrollDown: 'v',
      ready: '^',
      spinnerFrames: ['|', '/', '-', '\\'],
      workingFrames: ['.', 'o', 'O', '0'],
    },
  };

  it.each(modes)('answers every semantic icon name in %s mode', (mode) => {
    const kit = createRenderKit({}, undefined, mode);
    for (const [name, value] of Object.entries(expected[mode])) {
      expect(kit.icon?.(name as SemanticIconName), `${mode} ${name}`).toEqual(
        value,
      );
    }
  });

  const statuses: Record<IconMode, Record<RenderStatus, string>> = {
    nerd: {
      pending: '\u{f10c}',
      queued: '\u{f051f}',
      in_progress: '◐',
      running: '◐',
      completed: '\u{f00c}',
      failed: '\u{f00d}',
      cancelled: '\u{f05e}',
      interrupted: '\u{f05e}',
      stopping: '\u{f05e}',
      deleted: '\u{f05e}',
      blocked: '\u{f05e}',
      unknown: '\u{f128}',
    },
    unicode: {
      pending: '○',
      queued: '○',
      in_progress: '◐',
      running: '◐',
      completed: '✓',
      failed: '✗',
      cancelled: '■',
      interrupted: '■',
      stopping: '■',
      deleted: '⊘',
      blocked: '⊘',
      unknown: '?',
    },
    ascii: {
      pending: '-',
      queued: '~',
      in_progress: '*',
      running: '*',
      completed: '+',
      failed: 'x',
      cancelled: '/',
      interrupted: '/',
      stopping: '/',
      deleted: '/',
      blocked: '/',
      unknown: '?',
    },
  };

  it.each(modes)('answers every status glyph in %s mode', (mode) => {
    const kit = createRenderKit({}, undefined, mode);
    for (const [status, glyph] of Object.entries(statuses[mode])) {
      expect(kit.statusGlyph(theme, status as RenderStatus)).toBe(glyph);
    }
  });

  it('matches core native fallbacks except the pure Unicode agent icon through the registered Unicode kit', () => {
    const names = (Object.keys(expected.unicode) as SemanticIconName[]).filter(
      (name) => name !== 'agent',
    );
    expect(resolveIcon('agent')).toBe('\u{f08c7}');
    const resolve = (name: SemanticIconName) =>
      name === 'spinnerFrames' || name === 'workingFrames'
        ? resolveFrames(name)
        : resolveIcon(name);
    const native = names.map(resolve);
    const statusNames = Object.keys(statuses.unicode) as RenderStatus[];
    const nativeStatuses = statusNames.map((status) =>
      resolveStatusGlyph(status),
    );
    const token = registerRenderKit(
      createRenderKit({}, undefined, 'unicode'),
      {},
    );
    try {
      expect(resolveIcon('agent')).toBe('⚙');
      expect(names.map(resolve)).toEqual(native);
      expect(statusNames.map((status) => resolveStatusGlyph(status))).toEqual(
        nativeStatuses,
      );
    } finally {
      withdrawRenderKit(token);
    }
    expect(resolveIcon('agent')).toBe('\u{f08c7}');
  });
});

describe('standard tool footer per mode', () => {
  it.each([
    ['nerd', '▲ · 2s', '\u{f00c} · 2s · 1 line', '\u{f00d} · 2s · boom'],
    ['unicode', '▲ · 2s', '✓ · 2s · 1 line', '✗ · 2s · boom'],
    ['ascii', 'O | 2s', '+ | 2s | 1 line', 'x | 2s | boom'],
  ] as const)('renders running, completed and failed in %s mode', (mode, running, done, failed) => {
    const kit = createRenderKit({}, undefined, mode);
    const footer = (status: RenderStatus, summary?: string) =>
      kit.toolFooter?.(theme, { status, elapsedMs: 2250, summary });
    expect(footer('running')).toBe(running);
    expect(footer('completed', '1 line')).toBe(done);
    expect(footer('failed', 'boom')).toBe(failed);
  });

  it.each([
    ['nerd', '… 3 more lines · ctrl+o to expand'],
    ['unicode', '… 3 more lines · ctrl+o to expand'],
    ['ascii', '... 3 more lines | ctrl+o to expand'],
  ] as const)('collapses with the %s ellipsis and separator', (mode, hint) => {
    const kit = createRenderKit({}, undefined, mode);
    expect(
      kit.collapse(theme, ['a', 'b', 'c', 'd'], { budget: 1 }).at(-1),
    ).toBe(hint);
  });

  it.each(
    modes,
  )('keeps card borders exact and footers within width in %s mode', (mode) => {
    const kit = createRenderKit({}, undefined, mode);
    for (const status of ['running', 'completed', 'failed'] as const) {
      for (let width = 12; width <= 120; width++) {
        const lines = kit.card(
          theme,
          {
            title: 'Read src/index.ts',
            body: ['one', 'two'],
            status,
            footer: 'summary of the work',
          },
          width,
        );
        for (const line of lines) expect(visibleWidth(line)).toBe(width);
      }
      for (let width = 1; width < 12; width++) {
        for (const line of kit.card(theme, { body: ['x'], status }, width)) {
          expect(visibleWidth(line)).toBeLessThanOrEqual(width);
        }
      }
    }
  });
});

describe('editor borders in every icon mode', () => {
  it.each([
    ['nerd', '↑ 7 more', '↓ 7 more'],
    ['unicode', '↑ 7 more', '↓ 7 more'],
    ['ascii', '^ 7 more', 'v 7 more'],
  ] as const)('labels scroll counts in %s mode', (mode, up, down) => {
    expect(scrollLabel('up', 7, mode)).toBe(up);
    expect(scrollLabel('down', 7, mode)).toBe(down);
  });

  it.each(
    modes,
  )('renders exact-width borders for every width in %s mode', (mode) => {
    const regions = {
      left: ['working | 3s', mode === 'ascii' ? '| git 界-branch' : '· branch'],
      right: [
        '~/界/very/long/cwd/path',
        mode === 'ascii' ? '.../path' : '…/path',
      ],
    };
    for (let width = 0; width <= 200; width++) {
      for (const hidden of [0, 7]) {
        const top = renderInputTop(
          width,
          plainTheme,
          regions,
          hidden,
          undefined,
          mode,
        );
        const bottom = renderInputBottom(
          width,
          plainTheme,
          regions,
          hidden,
          undefined,
          mode,
        );
        expect(visibleWidth(top)).toBe(width);
        expect(visibleWidth(bottom)).toBe(width);
        if (hidden && width >= 20) {
          expect(stripTerminalSequences(top)).toContain(
            scrollLabel('up', 7, mode),
          );
          expect(stripTerminalSequences(bottom)).toContain(
            scrollLabel('down', 7, mode),
          );
        }
      }
    }
  });

  it('labels the idle editor and shimmers the ASCII working frame', () => {
    const state = createWorkingState(() => {});
    expect(state.status(undefined, 20, undefined, undefined, 'ascii')).toBe(
      '^ ready',
    );
    expect(state.status(undefined, 20, undefined, undefined, 'nerd')).toBe(
      '▲ ready',
    );
    expect(state.status(undefined, 20, undefined, undefined, 'unicode')).toBe(
      '▲ ready',
    );
    const indicator = {
      kind: 'working',
      renderInBorder: () => '. working...',
    };
    state.start();
    const line = stripTerminalSequences(
      state.status(
        indicator,
        30,
        (text) => text,
        createBreathingFrame(0),
        'ascii',
      ),
    );
    state.dispose();
    expect(line.startsWith('. working...')).toBe(true);
  });
});

describe('welcome truncation per mode', () => {
  const data: WelcomeData = {
    version: '1.0.0',
    model: 'a-model-with-a-very-long-display-name-that-needs-clipping',
    provider: 'anthropic',
    resources: { tools: 14, skills: 5, extensions: 3 },
    providers: [
      {
        name: 'mcp__github',
        detail: 'create_issue  list_pull_requests  search_code  get_file',
      },
    ],
    sessions: [
      {
        name: 'A very long recent session title that cannot fit in any column',
        timeAgo: '2h ago',
      },
    ],
  };

  it.each(modes)('never exceeds the width in %s mode', (mode) => {
    for (let width = 10; width <= 120; width++) {
      for (const line of renderWelcomeHeader(undefined, data, width, mode)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  it('measures the resolved ellipsis when clipping details and sessions', () => {
    const ascii = renderWelcomeHeader(undefined, data, 50, 'ascii').join('\n');
    const nerd = renderWelcomeHeader(undefined, data, 50, 'nerd').join('\n');
    expect(ascii).toContain('...');
    expect(ascii).not.toContain('…');
    expect(nerd).toContain('…');
    expect(nerd).not.toContain('...');
    expect(ascii).toContain(' | ');
    expect(nerd).toContain('  ·  ');
  });
});
