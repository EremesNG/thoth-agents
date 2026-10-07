import { sep } from 'node:path';
import {
  CustomEditor,
  createEventBus,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  type Component,
  CURSOR_MARKER,
  stripTerminalSequences,
  type TUI,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';
import { decorateEditor } from '../input-box/decorate.ts';
import { createWorkingState } from '../input-box/state.ts';
import type { ThemeConfig } from '../shared/config.ts';
import { registerStatusLine } from './index.ts';

describe('registerStatusLine', () => {
  const defaultConfig: ThemeConfig = {
    icons: 'nerd',
    statusLine: { enabled: true },
    tools: { enabled: true },
    welcome: { enabled: true },
  };

  function createMocks(provider = 'anthropic') {
    const eventHandlers = new Map<string, Array<(event?: unknown) => void>>();
    const unsubs: Array<ReturnType<typeof vi.fn>> = [];
    const events = createEventBus();
    const emit = vi.spyOn(events, 'emit');

    const pi = {
      events,
      on: vi.fn((event: string, handler: (event?: unknown) => void) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event)?.push(handler);
        const unsub = vi.fn(() => {
          const handlers = eventHandlers.get(event);
          const index = handlers?.indexOf(handler) ?? -1;
          if (index >= 0) handlers?.splice(index, 1);
        });
        unsubs.push(unsub);
        return unsub;
      }),
    } as unknown as ExtensionAPI;

    let footerFactory: ((...args: unknown[]) => any) | undefined;
    const ui = {
      setFooter: vi.fn((factory: any) => {
        footerFactory = factory;
      }),
      setEditorComponent: vi.fn(),
    };

    const sessionManager = {
      getSessionId: vi.fn(() => 'parent-session'),
      getLeafId: vi.fn<() => string | null>(() => '1'),
      getEntries: vi.fn(() => [
        {
          type: 'message',
          id: '1',
          parentId: null,
          timestamp: '2026-10-02T10:00:00Z',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'hi' }],
            usage: {
              input: 10,
              output: 10,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 20,
              cost: {
                input: 0.1,
                output: 0.2,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0.3,
              },
            },
          },
        },
      ]),
    };

    const ctx = {
      ui,
      cwd: '/workspace/project',
      model: { id: 'test-model', name: 'Test Model', provider },
      thinkingLevel: 'low',
      getContextUsage: vi.fn(() => ({
        percent: 25,
        tokens: 50000,
        contextWindow: 200000,
      })),
      sessionManager,
    } as unknown as ExtensionContext;

    const branchUnsub = vi.fn();
    const branchCallbacks: Array<() => void> = [];
    const footerData = {
      getGitBranch: vi.fn<() => string | null>(() => 'main'),
      getExtensionStatuses: vi.fn(() => new Map([['pkg', 'active']])),
      getAvailableProviderCount: vi.fn(() => 1),
      onBranchChange: vi.fn((cb: () => void) => {
        branchCallbacks.push(cb);
        return branchUnsub;
      }),
    };

    const tui = {
      requestRender: vi.fn(),
      getFocusedComponent: vi.fn<() => Component | undefined>(),
      terminal: { rows: 24 },
    };

    const theme = {
      fg: vi.fn((_token: string, text: string) => text),
    };

    return {
      pi,
      ctx,
      ui,
      eventHandlers,
      unsubs,
      events,
      emit,
      sessionManager,
      branchCallbacks,
      branchUnsub,
      footerData,
      tui,
      theme,
      getFooterFactory: () => footerFactory,
    };
  }

  function createFooter(
    mocks: ReturnType<typeof createMocks>,
    config = defaultConfig,
  ) {
    registerStatusLine(mocks.pi, mocks.ctx, config);
    const factory = mocks.getFooterFactory();
    if (!factory) throw new Error('Footer factory was not registered');
    return factory(mocks.tui, mocks.theme, mocks.footerData);
  }

  /** Plain top/bottom borders of a decorated editor at `width`. */
  function borders(editor: { render(width: number): string[] }, width: number) {
    const lines = editor.render(width).map(stripTerminalSequences);
    return {
      top: lines[0],
      bottom: lines.find((line) => line.startsWith('╰')) ?? '',
    };
  }

  it('sets the footer without registering an editor factory', () => {
    const mocks = createMocks();
    registerStatusLine(mocks.pi, mocks.ctx, defaultConfig);

    expect(mocks.ui.setFooter).toHaveBeenCalledTimes(1);
    expect(mocks.ui.setEditorComponent).not.toHaveBeenCalled();
  });

  it('provides the shared snapshot before the first footer or editor render', () => {
    const mocks = createMocks('claude-bridge');
    const component = createFooter(mocks);
    try {
      const snapshot = component.getStatusSnapshot();
      expect(snapshot).toMatchObject({
        modelName: 'Test Model',
        modelId: 'test-model',
        thinkingLevel: 'low',
        gitBranch: 'main',
        cwd: '/workspace/project',
        contextTokens: 50000,
        contextPercent: 25,
        contextWindow: 200000,
        cost: 0.3,
        subagentCost: 0,
        isSubscription: true,
        tokenTotals: { input: 10, output: 10, cacheRead: 0 },
        tokensPerSecond: null,
      });
      component.render(120);
      expect(component.getStatusSnapshot()).toBe(snapshot);
      expect(mocks.sessionManager.getEntries).toHaveBeenCalledTimes(1);
      expect(mocks.ui.setEditorComponent).not.toHaveBeenCalled();
    } finally {
      component.dispose();
    }
  });

  function createEditor(mocks: ReturnType<typeof createMocks>) {
    const plain = (text: string) => text;
    const editor = new CustomEditor(
      mocks.tui as unknown as TUI,
      {
        borderColor: plain,
        selectList: {
          selectedPrefix: plain,
          selectedText: plain,
          description: plain,
          scrollInfo: plain,
          noMatch: plain,
        },
      },
      { matches: () => false } as unknown as ConstructorParameters<
        typeof CustomEditor
      >[2],
      { embedWorkingStatus: true },
    );
    editor.focused = true;
    return editor;
  }

  it('refreshes the decorator snapshot and invalidates the footer cache on thinking changes before footer rendering', () => {
    const mocks = createMocks();
    const editor = createEditor(mocks);
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const component = createFooter(mocks);
    const unusedWorking = createWorkingState(() => {});
    try {
      const initial = component.render(120);
      const decoration = decorateEditor(editor, {
        theme: mocks.theme,
        working: unusedWorking,
      });
      mocks.ctx.thinkingLevel = 'high';
      mocks.tui.requestRender.mockClear();
      for (const handler of mocks.eventHandlers.get('thinking_level_select') ??
        [])
        handler();
      expect(decoration?.getStatusSnapshot()?.thinkingLevel).toBe('high');
      expect(mocks.tui.requestRender).toHaveBeenCalledTimes(1);
      editor.render(120);
      const changed = component.render(120);
      expect(changed).toBe(initial);
      expect(borders(editor, 120).bottom).toContain(
        '\u{f06a9} Test Model · \u{f09d1} high',
      );
      expect(changed[0]).not.toContain('◐');

      // A refresh must invalidate presentation even when data is unchanged.
      mocks.theme.fg.mockImplementation((token, text) =>
        token === 'accent' ? `<accent:${text}>` : text,
      );
      for (const handler of mocks.eventHandlers.get('thinking_level_select') ??
        [])
        handler();
      expect(component.render(120)[0]).toContain('<accent:\uf155 0.300>');
    } finally {
      component.dispose();
      unusedWorking.dispose();
    }
  });

  it.each([
    'model_select',
    'thinking_level_select',
    'branch_change',
    'message_end',
    'turn_end',
    'session_compact',
    'agent_start',
    'agent_end',
  ])('requests border/footer refresh and invalidates cached presentation on %s', (event) => {
    vi.useFakeTimers();
    const mocks = createMocks();
    const component = createFooter(mocks);
    try {
      component.render(120);
      mocks.tui.requestRender.mockClear();
      mocks.theme.fg.mockImplementation((token, text) =>
        token === 'accent' ? `<new:${text}>` : text,
      );
      const callbacks =
        event === 'branch_change'
          ? mocks.branchCallbacks
          : (mocks.eventHandlers.get(event) ?? []);
      expect(callbacks.length).toBeGreaterThan(0);
      for (const handler of callbacks) handler();
      expect(mocks.tui.requestRender).toHaveBeenCalled();
      expect(component.render(120)[0]).toContain('<new:\uf155 0.300>');
    } finally {
      component.dispose();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });

  it('animates working status at twenty fps, preserves native retry, and cleans up lifecycle ownership', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const mocks = createMocks();
    const editor = createEditor(mocks);
    const originalRender = editor.render;
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const component = createFooter(mocks);
    const attach = (kind: string, text: string) => {
      editor.setWorkingStatusIndicator({
        kind,
        renderInBorder: () => text,
      } as unknown as Parameters<CustomEditor['setWorkingStatusIndicator']>[0]);
    };
    try {
      const footer = component.render(80);
      attach('working', '◭ working…');
      const queuedStart = [...(mocks.eventHandlers.get('agent_start') ?? [])];
      for (const handler of queuedStart) handler();
      expect(stripTerminalSequences(editor.render(80)[0])).toContain(
        '◭ working… · 0s',
      );
      mocks.tui.requestRender.mockClear();
      vi.advanceTimersByTime(2500);
      expect(stripTerminalSequences(editor.render(80)[0])).toContain(
        '◭ working… · 2s',
      );
      expect(mocks.tui.requestRender).toHaveBeenCalledTimes(50);
      expect(component.render(80)).toBe(footer);
      expect(mocks.sessionManager.getEntries).toHaveBeenCalledTimes(1);
      attach('retry', 'retrying…');
      expect(editor.render(80)[0]).toContain('retrying…');
      expect(editor.render(80)[0]).not.toContain('2s');
      editor.setWorkingStatusIndicator(undefined);
      for (const handler of mocks.eventHandlers.get('agent_end') ?? [])
        handler();
      expect(editor.render(80)[0]).toContain('▲ ready');
      expect(vi.getTimerCount()).toBe(0);

      for (const handler of queuedStart) handler();
      component.dispose();
      mocks.tui.requestRender.mockClear();
      for (const handler of queuedStart) handler();
      vi.advanceTimersByTime(3000);
      expect(vi.getTimerCount()).toBe(0);
      expect(mocks.tui.requestRender).not.toHaveBeenCalled();
      expect(editor.render).toBe(originalRender);
      expect(mocks.eventHandlers.get('agent_start')).toEqual([]);
      expect(mocks.eventHandlers.get('agent_end')).toEqual([]);
      for (const unsub of mocks.unsubs) expect(unsub).toHaveBeenCalledTimes(1);
    } finally {
      component.dispose();
      vi.useRealTimers();
    }
  });

  it('discovers focus before cache hits and decorates each replacement once while preserving the footer', () => {
    const mocks = createMocks();
    const overlay = { render: () => ['other focus'], invalidate() {} };
    mocks.tui.getFocusedComponent.mockReturnValue(overlay);
    const component = createFooter(mocks);
    const footer = component.render(80);
    expect(footer).toHaveLength(1);
    const first = createEditor(mocks);
    const originalFirstRender = first.render;
    mocks.tui.getFocusedComponent.mockReturnValue(first);
    expect(component.render(80)).toBe(footer);
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(1);
    expect(mocks.tui.getFocusedComponent()).toBe(first);
    const decoratedFirstRender = first.render;
    expect(decoratedFirstRender).not.toBe(originalFirstRender);
    expect(first.render(80)[0]).toContain('╭─ ▲ ready');
    expect(component.render(80)).toBe(footer);
    expect(first.render).toBe(decoratedFirstRender);

    mocks.tui.getFocusedComponent.mockReturnValue(overlay);
    expect(component.render(80)).toBe(footer);
    expect(component.render(80)).toBe(footer);
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(1);

    const replacement = createEditor(mocks);
    const originalReplacementRender = replacement.render;
    mocks.tui.getFocusedComponent.mockReturnValue(replacement);
    expect(component.render(80)).toBe(footer);
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(2);
    expect(replacement.render(80)[0]).toContain('╭─ ▲ ready');
    expect(component.render(80)).toBe(footer);

    mocks.tui.getFocusedComponent.mockReturnValue(first);
    expect(first.render(80)).toHaveLength(3);
    expect(component.render(80)).toBe(footer);
    expect(first.render).toBe(decoratedFirstRender);
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(2);
    first.render(10);
    expect(component.render(10)).toHaveLength(1);
    expect(mocks.ui.setEditorComponent).not.toHaveBeenCalled();
    component.dispose();
    expect(first.render).toBe(originalFirstRender);
    expect(replacement.render).toBe(originalReplacementRender);
  });

  it('falls back to native editor geometry when current padding leaves one content column without changing the footer', () => {
    const mocks = createMocks();
    const editor = createEditor(mocks);
    editor.setText('界');
    editor.setPaddingX(7);
    const native = editor.render(17);
    expect(native.map(visibleWidth)).toEqual([17, 17, 17]);
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const component = createFooter(mocks);
    try {
      const footer = component.render(17);
      expect(footer).toHaveLength(1);
      editor.setPaddingX(0);
      expect(editor.render(17)[0]).toContain('╭');
      expect(component.render(17)).toBe(footer);

      editor.setPaddingX(7);
      expect(editor.render(17)).toEqual(native);
      expect(component.render(17)).toBe(footer);
      const safeBox = editor.render(18);
      expect(safeBox[0]).toContain('╭');
      expect(safeBox.map(visibleWidth)).toEqual([18, 18, 18]);
      expect(component.render(18)).toHaveLength(1);
    } finally {
      component.dispose();
    }
  });

  it('retains footer-only behavior and no elapsed ticker when the input box is disabled', () => {
    vi.useFakeTimers();
    const mocks = createMocks();
    const editor = createEditor(mocks);
    const originalRender = editor.render;
    const native = editor.render(120);
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const component = createFooter(mocks, {
      ...defaultConfig,
      inputBox: { enabled: false },
    });
    try {
      const footer = component.render(120);
      for (const handler of mocks.eventHandlers.get('agent_start') ?? [])
        handler();
      expect(editor.render).toBe(originalRender);
      expect(editor.render(120)).toEqual(native);
      mocks.tui.requestRender.mockClear();
      vi.advanceTimersByTime(2500);
      expect(editor.render(120)).toEqual(native);
      expect(mocks.tui.requestRender).not.toHaveBeenCalled();
      expect(component.render(120)).toBe(footer);
      expect(mocks.tui.getFocusedComponent).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(mocks.ui.setEditorComponent).not.toHaveBeenCalled();
    } finally {
      component.dispose();
      vi.useRealTimers();
    }
  });

  it('keeps the status as a one-row footer below the decorated editor on every render', () => {
    const mocks = createMocks();
    const editor = createEditor(mocks);
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const component = createFooter(mocks);
    try {
      const initialFooter = component.render(120);
      expect(initialFooter).toEqual([
        '\uf155 0.300 · \uf06210 \uf06310 · \u{f01bc} 0 · \u{f04c5} —',
      ]);
      expect(mocks.tui.requestRender).toHaveBeenCalledTimes(1);

      const box = editor.render(120);
      expect(box[0]).toMatch(/^╭─ ▲ ready /);
      expect(box[1]).toContain(
        `${CURSOR_MARKER}\x1b[7m \x1b[0mtype or / for commands`,
      );
      expect(box[2]).toMatch(
        /^╰─ \u{f06a9} Test Model · \u{f09d1} low ─+ \uf2db \[███░░░░░░░\] 25% 50K\/200K ─╯$/u,
      );
      expect(box[0]).toMatch(/ (?:\u{f07c}|dir) \/workspace\/project ─╮$/u);
      expect(box.map(visibleWidth)).toEqual([120, 120, 120]);
      expect(component.render(120)).toBe(initialFooter);
      expect(component.render(120)).toBe(initialFooter);

      mocks.events.emit('thoth:subagent-usage', {
        parentSessionId: 'parent-session',
        totalCost: 0.7,
      });
      expect(editor.render(120)[2]).toBe(box[2]);
      expect(component.render(120)).toEqual([
        '\uf155 1.000 · \uf06210 \uf06310 · \u{f01bc} 0 · \u{f04c5} —',
      ]);
      expect(mocks.ui.setEditorComponent).not.toHaveBeenCalled();
    } finally {
      component.dispose();
    }
  });

  it('honors the live icon mode in border segments while preserving exact widths', () => {
    const mocks = createMocks();
    const editor = createEditor(mocks);
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const config: ThemeConfig = { ...defaultConfig, icons: 'ascii' };
    const component = createFooter(mocks, config);
    try {
      expect(component.render(80)).toEqual([
        '$0.300 | ^10 v10 | cache 0 | — tok/s',
      ]);
      const { top, bottom } = borders(editor, 80);
      expect(top).toBe(
        `╭─ ^ ready | git main ${'─'.repeat(32)} dir /workspace/project ─╮`,
      );
      expect(bottom).toBe(
        `╰─ * Test Model | o low ${'─'.repeat(23)} ctx [###-------] 25% 50K/200K ─╯`,
      );
      for (let width = 16; width <= 200; width++) {
        const rendered = borders(editor, width);
        expect(visibleWidth(rendered.top)).toBe(width);
        expect(visibleWidth(rendered.bottom)).toBe(width);
      }

      config.icons = 'nerd';
      const unicode = borders(editor, 80);
      expect(unicode.top).toContain('· \ue0a0 main');
      expect(unicode.bottom).toContain('\u{f06a9} Test Model · \u{f09d1} low');
      expect(unicode.bottom).toContain('[███░░░░░░░]');
      expect(visibleWidth(unicode.top)).toBe(80);
      expect(visibleWidth(unicode.bottom)).toBe(80);
    } finally {
      component.dispose();
    }
  });

  it('renders one footer row with only cost, tokens, cache and tok/s', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    const lines = component.render(120);

    expect(lines).toHaveLength(1);
    const row = lines[0];
    expect(row).toBe(
      '\uf155 0.300 · \uf06210 \uf06310 · \u{f01bc} 0 · \u{f04c5} —',
    );
    for (const hidden of ['Test Model', '◐', '⑂', '/workspace', '50K', '25%'])
      expect(row).not.toContain(hidden);
  });

  it.each([
    {
      home: '/home/test',
      userProfile: '/other/home',
      expected: `~${sep}project${sep}src`,
    },
    {
      home: undefined,
      userProfile: '/home/test',
      expected: `~${sep}project${sep}src`,
    },
    {
      home: '',
      userProfile: '/home/test',
      expected: `~${sep}project${sep}src`,
    },
    {
      home: undefined,
      userProfile: undefined,
      expected: '/home/test/project/src',
    },
    {
      home: '/other/home',
      userProfile: '/home/test',
      expected: '/home/test/project/src',
    },
  ])('formats ctx.cwd using HOME=$home before USERPROFILE=$userProfile', ({
    home,
    userProfile,
    expected,
  }) => {
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', userProfile);
    const mocks = createMocks();
    mocks.ctx.cwd = '/home/test/project/src';
    const editor = createEditor(mocks);
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const component = createFooter(mocks);
    try {
      component.render(200);
      const { top } = borders(editor, 200);
      expect(top).toContain('· \ue0a0 main');
      expect(top).toContain(` ${expected} ─╮`);
    } finally {
      component.dispose();
      vi.unstubAllEnvs();
    }
  });

  it('refreshes border cwd and branch live while omitting an absent branch', () => {
    const mocks = createMocks();
    const editor = createEditor(mocks);
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const component = createFooter(mocks);
    try {
      component.render(200);
      expect(borders(editor, 200).top).toMatch(
        /^╭─ ▲ ready · \ue0a0 main ─+ \u{f07c} \/workspace\/project ─╮$/u,
      );

      mocks.ctx.cwd = '/workspace/other';
      expect(borders(editor, 200).top).toContain(' /workspace/other ─╮');

      mocks.footerData.getGitBranch.mockReturnValue('feature/new');
      for (const cb of mocks.branchCallbacks) cb();
      expect(borders(editor, 200).top).toContain('· \ue0a0 feature/new');

      mocks.footerData.getGitBranch.mockReturnValue(null);
      const { top } = borders(editor, 200);
      expect(top).not.toContain('⑂');
      expect(top).not.toContain('null');
      expect(top).toMatch(/^╭─ ▲ ready ─+ \u{f07c} \/workspace\/other ─╮$/u);
      expect(component.render(200)[0]).not.toContain('/workspace');
    } finally {
      component.dispose();
    }
  });

  it('adds the latest cumulative subagent snapshot to session cost, replacing earlier snapshots', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    expect(component.render(120)[0]).toContain('\uf155 0.300');

    mocks.tui.requestRender.mockClear();
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    expect(component.render(120)[0]).toContain('\uf155 1.000');
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(1);

    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 1.2,
      runCount: 2,
    });
    expect(component.render(120)[0]).toContain('\uf155 1.500');
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(2);

    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0,
      runCount: 0,
    });
    expect(component.render(120)[0]).toContain('\uf155 0.300');
  });

  it('ignores subagent snapshots from other parent sessions', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    const current = component.render(120);
    mocks.tui.requestRender.mockClear();

    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'other-session',
      totalCost: 99,
      runCount: 5,
    });
    expect(component.render(120)).toBe(current);
    expect(mocks.tui.requestRender).not.toHaveBeenCalled();
  });

  it('ignores malformed, non-finite, and negative cost snapshots', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    const current = component.render(120);
    mocks.tui.requestRender.mockClear();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      for (const snapshot of [
        null,
        undefined,
        'not a snapshot',
        {},
        { parentSessionId: 'parent-session', totalCost: '2' },
        { parentSessionId: 'parent-session', totalCost: Number.NaN },
        {
          parentSessionId: 'parent-session',
          totalCost: Number.POSITIVE_INFINITY,
        },
        { parentSessionId: 'parent-session', totalCost: -1 },
      ]) {
        mocks.events.emit('thoth:subagent-usage', snapshot);
        expect(component.render(120)).toBe(current);
      }
      expect(mocks.tui.requestRender).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it('requests a snapshot after subscribing when the footer is created, recovering prior usage', () => {
    const mocks = createMocks();
    const snapshot = {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    };
    mocks.events.emit('thoth:subagent-usage', snapshot);
    mocks.events.on('thoth:subagent-usage:request', () => {
      mocks.events.emit('thoth:subagent-usage', snapshot);
    });
    const component = createFooter(mocks);

    expect(mocks.emit).toHaveBeenCalledWith('thoth:subagent-usage:request', {
      parentSessionId: 'parent-session',
    });
    expect(component.render(120)[0]).toContain('\uf155 1.000');
  });

  it('resets cost and requests the current session snapshot on session start', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    expect(component.render(120)[0]).toContain('\uf155 1.000');

    mocks.sessionManager.getSessionId.mockReturnValue('next-session');
    mocks.sessionManager.getEntries.mockReturnValue([]);
    mocks.emit.mockClear();
    for (const handler of mocks.eventHandlers.get('session_start') ?? [])
      handler();

    expect(mocks.emit).toHaveBeenCalledWith('thoth:subagent-usage:request', {
      parentSessionId: 'next-session',
    });
    expect(component.render(120)[0]).toContain('\uf155 0.000');
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 10,
      runCount: 2,
    });
    expect(component.render(120)[0]).toContain('\uf155 0.000');
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'next-session',
      totalCost: 0.2,
      runCount: 1,
    });
    expect(component.render(120)[0]).toContain('\uf155 0.200');
  });

  it.each([
    {
      provider: 'claude-bridge',
      providers: undefined,
      expected: '\uf155 1.000 (sub)',
    },
    { provider: 'anthropic', providers: undefined, expected: '\uf155 1.000' },
    {
      provider: 'custom-subscription',
      providers: ['custom-subscription'],
      expected: '\uf155 1.000 (sub)',
    },
    { provider: 'claude-bridge', providers: [], expected: '\uf155 1.000' },
  ])('marks cost for provider $provider with configured providers $providers', ({
    provider,
    providers,
    expected,
  }) => {
    const mocks = createMocks(provider);
    const component = createFooter(mocks, {
      ...defaultConfig,
      statusLine: { enabled: true, subscriptionProviders: providers },
    });
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });

    expect(component.render(120)[0].split(' · ')[0]).toBe(expected);
  });

  it('updates the cached subscription flag when only the model provider changes', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    const unmarked = component.render(120);
    expect(unmarked[0]).not.toContain('(sub)');

    Object.assign(mocks.ctx.model ?? {}, { provider: 'claude-bridge' });
    for (const handler of mocks.eventHandlers.get('model_select') ?? [])
      handler();
    const marked = component.render(120);
    expect(marked[0]).toContain('\uf155 0.300 (sub)');
    expect(marked).not.toBe(unmarked);
    expect(component.render(120)).toBe(marked);

    Object.assign(mocks.ctx.model ?? {}, { provider: 'anthropic' });
    for (const handler of mocks.eventHandlers.get('model_select') ?? [])
      handler();
    expect(component.render(120)[0]).not.toContain('(sub)');
  });

  it('re-renders on branch change and pi events (message_end, turn_end, model_select)', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);

    // Initial render setup does not require requestRender
    mocks.tui.requestRender.mockClear();

    // Trigger branch change
    for (const cb of mocks.branchCallbacks) cb();
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(1);

    // Trigger message_end
    const msgEndHandlers = mocks.eventHandlers.get('message_end') ?? [];
    for (const h of msgEndHandlers) h();
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(2);

    // Trigger turn_end
    const turnEndHandlers = mocks.eventHandlers.get('turn_end') ?? [];
    for (const h of turnEndHandlers) h();
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(3);

    // Trigger model_select
    const modelSelectHandlers = mocks.eventHandlers.get('model_select') ?? [];
    for (const h of modelSelectHandlers) h();
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(4);

    // Invalidate triggers render
    component.invalidate();
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(5);
  });

  it('reads session data once and caches repeat frames with subagent cost and subscription marking', () => {
    const mocks = createMocks('claude-bridge');
    const component = createFooter(mocks);

    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    const first = component.render(120);
    expect(first[0]).toContain('\uf155 1.000 (sub)');
    const fgCalls = mocks.theme.fg.mock.calls.length;
    const identityReads = mocks.sessionManager.getSessionId.mock.calls.length;
    const emissions = mocks.emit.mock.calls.length;
    for (let i = 0; i < 20; i++) expect(component.render(120)).toBe(first);

    expect(mocks.sessionManager.getEntries).toHaveBeenCalledTimes(1);
    expect(mocks.ctx.getContextUsage).toHaveBeenCalledTimes(1);
    expect(mocks.sessionManager.getSessionId).toHaveBeenCalledTimes(
      identityReads,
    );
    expect(mocks.emit).toHaveBeenCalledTimes(emissions);
    expect(fgCalls).toBeGreaterThan(0);
    expect(mocks.theme.fg.mock.calls.length).toBe(fgCalls);

    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 2,
    });
    expect(component.render(120)).toBe(first);
    expect(mocks.theme.fg.mock.calls.length).toBe(fgCalls);
  });

  it('exposes main-session totals and runtime tok/s before footer rendering while excluding subagent tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const mocks = createMocks();
    const component = createFooter(mocks);
    const dispatch = (
      type: 'message_start' | 'message_end',
      message: unknown,
    ) => {
      for (const handler of mocks.eventHandlers.get(type) ?? [])
        handler({ type, message });
    };
    try {
      expect(component.getStatusSnapshot().tokensPerSecond).toBeNull();
      dispatch('message_start', { role: 'assistant' });
      vi.setSystemTime(250);
      dispatch('message_end', { role: 'assistant', usage: { output: 10 } });
      const [entry] = mocks.sessionManager.getEntries();
      mocks.sessionManager.getEntries.mockReturnValue([entry, entry]);
      expect(component.getStatusSnapshot()).toMatchObject({
        tokenTotals: { input: 20, output: 20, cacheRead: 0 },
        tokensPerSecond: 40,
      });
      mocks.events.emit('thoth:subagent-usage', {
        parentSessionId: 'parent-session',
        totalCost: 0.7,
        input: 999,
        output: 999,
        cacheRead: 999,
      });
      expect(component.getStatusSnapshot()).toMatchObject({
        cost: 0.6,
        subagentCost: 0.7,
        tokenTotals: { input: 20, output: 20, cacheRead: 0 },
        tokensPerSecond: 40,
      });
      expect(component.render(120)[0]).toBe(
        '\uf155 1.300 · \uf06220 \uf06320 · \u{f01bc} 0 · \u{f04c5} 40',
      );
    } finally {
      component.dispose();
      vi.useRealTimers();
    }
  });

  it.each([
    'parent-session',
    'next-session',
  ])('clears runtime throughput and pending messages on session_start for %s', (sessionId) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const mocks = createMocks();
    const component = createFooter(mocks);
    const dispatch = (
      type: 'message_start' | 'message_end',
      message: unknown,
    ) => {
      for (const handler of mocks.eventHandlers.get(type) ?? [])
        handler({ type, message });
    };
    const began = { role: 'assistant', id: 'reused' };
    const ended = { role: 'assistant', id: 'reused', usage: { output: 20 } };
    try {
      dispatch('message_start', began);
      vi.setSystemTime(1000);
      dispatch('message_end', ended);
      expect(component.getStatusSnapshot().tokensPerSecond).toBe(20);
      dispatch('message_start', { role: 'assistant', id: 'pending' });
      mocks.sessionManager.getSessionId.mockReturnValue(sessionId);
      mocks.sessionManager.getEntries.mockReturnValue([]);
      for (const handler of mocks.eventHandlers.get('session_start') ?? [])
        handler();
      expect(component.getStatusSnapshot()).toMatchObject({
        tokenTotals: { input: 0, output: 0, cacheRead: 0 },
        tokensPerSecond: null,
      });
      vi.setSystemTime(2000);
      dispatch('message_end', {
        role: 'assistant',
        id: 'pending',
        usage: { output: 999 },
      });
      expect(component.getStatusSnapshot().tokensPerSecond).toBeNull();
      dispatch('message_start', began);
      vi.setSystemTime(4000);
      dispatch('message_end', ended);
      expect(component.getStatusSnapshot().tokensPerSecond).toBe(10);
    } finally {
      component.dispose();
      vi.useRealTimers();
    }
  });

  it('ignores queued generation events after footer disposal', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const mocks = createMocks();
    const component = createFooter(mocks);
    const starts = [...(mocks.eventHandlers.get('message_start') ?? [])];
    const ends = [...(mocks.eventHandlers.get('message_end') ?? [])];
    try {
      component.dispose();
      mocks.tui.requestRender.mockClear();
      for (const handler of starts)
        handler({ type: 'message_start', message: { role: 'assistant' } });
      vi.setSystemTime(1000);
      for (const handler of ends)
        handler({
          type: 'message_end',
          message: { role: 'assistant', usage: { output: 100 } },
        });
      expect(component.getStatusSnapshot().tokensPerSecond).toBeNull();
      expect(mocks.tui.requestRender).not.toHaveBeenCalled();
    } finally {
      component.dispose();
      vi.useRealTimers();
    }
  });

  it('refreshes a snapshot read before message-end persistence on the next read without another event', () => {
    const mocks = createMocks();
    const [entry] = mocks.sessionManager.getEntries();
    mocks.sessionManager.getEntries.mockReturnValue([]);
    mocks.sessionManager.getLeafId.mockReturnValue(null);
    (mocks.ctx.getContextUsage as ReturnType<typeof vi.fn>).mockReturnValue({
      percent: 0,
      tokens: 0,
      contextWindow: 200000,
    });
    const component = createFooter(mocks);
    try {
      for (const handler of mocks.eventHandlers.get('message_end') ?? [])
        handler({ type: 'message_end', message: entry.message });

      // Another extension can still be awaiting work: Pi has not appended yet.
      const beforePersistence = component.getStatusSnapshot();
      expect(beforePersistence).toMatchObject({
        cost: 0,
        tokenTotals: { input: 0, output: 0, cacheRead: 0 },
        contextTokens: 0,
        contextPercent: 0,
      });
      expect(component.getStatusSnapshot()).toBe(beforePersistence);

      mocks.sessionManager.getEntries.mockReturnValue([entry]);
      mocks.sessionManager.getLeafId.mockReturnValue(entry.id);
      (mocks.ctx.getContextUsage as ReturnType<typeof vi.fn>).mockReturnValue({
        percent: 25,
        tokens: 50000,
        contextWindow: 200000,
      });
      // No turn_end, agent_end, or other invalidation follows persistence.
      const persisted = component.getStatusSnapshot();
      expect(persisted).toMatchObject({
        cost: 0.3,
        tokenTotals: { input: 10, output: 10, cacheRead: 0 },
        contextTokens: 50000,
        contextPercent: 25,
        contextWindow: 200000,
      });
      expect(component.getStatusSnapshot()).toBe(persisted);
      expect(component.render(120)[0]).toBe(
        '\uf155 0.300 · \uf06210 \uf06310 · \u{f01bc} 0 · \u{f04c5} —',
      );
    } finally {
      component.dispose();
    }
  });

  it('samples message-end session changes after persistence but before the next footer render', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    try {
      for (const handler of mocks.eventHandlers.get('message_end') ?? [])
        handler();
      // Pi emits extension message_end before appending to SessionManager.
      const [entry] = mocks.sessionManager.getEntries();
      mocks.sessionManager.getEntries.mockReturnValue([entry, entry]);
      (mocks.ctx.getContextUsage as ReturnType<typeof vi.fn>).mockReturnValue({
        percent: 80,
        tokens: 160000,
        contextWindow: 200000,
      });
      expect(component.getStatusSnapshot()).toMatchObject({
        cost: 0.6,
        contextTokens: 160000,
        contextPercent: 80,
      });
    } finally {
      component.dispose();
    }
  });

  it('refreshes cost and context after session events', () => {
    const mocks = createMocks();
    const editor = createEditor(mocks);
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const component = createFooter(mocks);
    expect(component.render(120)[0]).toContain('\uf155 0.300');
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    expect(component.render(120)[0]).toContain('\uf155 1.000');
    expect(borders(editor, 120).bottom).toContain('25% 50K/200K');

    const { sessionManager } = mocks;
    const [entry] = sessionManager.getEntries();
    sessionManager.getEntries.mockReturnValue([entry, entry]);
    (mocks.ctx.getContextUsage as ReturnType<typeof vi.fn>).mockReturnValue({
      percent: 80,
      tokens: 160000,
      contextWindow: 200000,
    });

    for (const event of ['turn_end', 'agent_end', 'session_compact']) {
      expect(mocks.eventHandlers.get(event)?.length ?? 0).toBeGreaterThan(0);
    }
    for (const h of mocks.eventHandlers.get('agent_end') ?? []) h();
    const row = component.render(120)[0];
    expect(row).toContain('\uf155 1.300');
    expect(row).not.toContain('80%');
    expect(borders(editor, 120).bottom).toContain('[████████░░] 80% 160K/200K');
  });

  it('shows a dash when context usage is not reported', () => {
    const mocks = createMocks();
    (mocks.ctx.getContextUsage as ReturnType<typeof vi.fn>).mockReturnValue({
      percent: null,
      tokens: null,
      contextWindow: 200000,
    });
    const editor = createEditor(mocks);
    mocks.tui.getFocusedComponent.mockReturnValue(editor);
    const component = createFooter(mocks);
    component.render(120);
    const { bottom } = borders(editor, 120);
    expect(bottom).toMatch(/ —\/200K ─╯$/);
    expect(bottom).not.toContain('%');
  });

  it('ignores lifecycle callbacks already queued when the footer is disposed', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    const queued = [
      ...(mocks.eventHandlers.get('session_start') ?? []),
      ...(mocks.eventHandlers.get('message_end') ?? []),
      ...mocks.branchCallbacks,
    ];
    component.dispose();
    mocks.emit.mockClear();
    mocks.tui.requestRender.mockClear();
    mocks.sessionManager.getEntries.mockClear();
    (mocks.ctx.getContextUsage as ReturnType<typeof vi.fn>).mockClear();

    for (const handler of queued) handler();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.tui.requestRender).not.toHaveBeenCalled();
    expect(mocks.sessionManager.getEntries).not.toHaveBeenCalled();
    expect(mocks.ctx.getContextUsage).not.toHaveBeenCalled();
  });

  it('disposes all event and branch subscriptions on component dispose', () => {
    const mocks = createMocks();
    const busUnsubs: Array<ReturnType<typeof vi.fn>> = [];
    const on = mocks.events.on;
    vi.spyOn(mocks.events, 'on').mockImplementation((channel, handler) => {
      const off = vi.fn(on(channel, handler));
      busUnsubs.push(off);
      return off;
    });
    const component = createFooter(mocks);

    expect(mocks.branchUnsub).not.toHaveBeenCalled();
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    const current = component.render(120);

    component.dispose();
    component.dispose();
    mocks.tui.requestRender.mockClear();
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 2,
      runCount: 2,
    });
    expect(component.render(120)).toBe(current);
    expect(mocks.tui.requestRender).not.toHaveBeenCalled();

    expect(mocks.branchUnsub).toHaveBeenCalledTimes(1);
    for (const unsub of mocks.unsubs.values()) {
      expect(unsub).toHaveBeenCalledTimes(1);
    }
    expect(busUnsubs).toHaveLength(1);
    expect(busUnsubs[0]).toHaveBeenCalledTimes(1);
  });
});
