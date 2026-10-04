import {
  CustomEditor,
  createEventBus,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  type Component,
  CURSOR_MARKER,
  type TUI,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { registerStatusLine } from './index.ts';

describe('registerStatusLine', () => {
  const defaultConfig: ThemeConfig = {
    icons: 'nerd',
    statusLine: { enabled: true },
    tools: { enabled: true },
    images: { enabled: true },
    welcome: { enabled: true },
  };

  function createMocks(provider = 'anthropic') {
    const eventHandlers = new Map<string, Array<() => void>>();
    const unsubs: Array<ReturnType<typeof vi.fn>> = [];
    const events = createEventBus();
    const emit = vi.spyOn(events, 'emit');

    const pi = {
      events,
      on: vi.fn((event: string, handler: () => void) => {
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
      getGitBranch: vi.fn(() => 'main'),
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

  it('sets the footer without registering an editor factory', () => {
    const mocks = createMocks();
    registerStatusLine(mocks.pi, mocks.ctx, defaultConfig);

    expect(mocks.ui.setFooter).toHaveBeenCalledTimes(1);
    expect(mocks.ui.setEditorComponent).not.toHaveBeenCalled();
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

  it('renders native working/retry status, ticks elapsed seconds, and cleans up lifecycle ownership', () => {
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
      component.render(80);
      attach('working', '◭ working…');
      const queuedStart = [...(mocks.eventHandlers.get('agent_start') ?? [])];
      for (const handler of queuedStart) handler();
      expect(editor.render(80)[0]).toContain('◭ working… · 0s');
      mocks.tui.requestRender.mockClear();
      vi.advanceTimersByTime(2500);
      expect(editor.render(80)[0]).toContain('◭ working… · 2s');
      expect(mocks.tui.requestRender).toHaveBeenCalledTimes(2);
      expect(component.render(80)).toHaveLength(1);
      attach('retry', 'retrying…');
      expect(editor.render(80)[0]).toContain('retrying…');
      expect(editor.render(80)[0]).not.toContain('2s');
      editor.setWorkingStatusIndicator(undefined);
      for (const handler of mocks.eventHandlers.get('agent_end') ?? [])
        handler();
      expect(editor.render(80)[0]).toContain('☥ thoth · ready');
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
    expect(first.render(80)[0]).toContain('╭─ ☥ thoth · ready');
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
    expect(replacement.render(80)[0]).toContain('╭─ ☥ thoth · ready');
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
      expect(editor.render(120)[0]).not.toContain('╭');
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
        '● Test Model · ◐ low │ ⑂ main │ [███░░░░░░░] 25% used │ 50K/200K │ $0.300',
      ]);
      expect(mocks.tui.requestRender).toHaveBeenCalledTimes(1);

      const box = editor.render(120);
      expect(box[0]).toMatch(/^╭─ ☥ thoth · ready /);
      expect(box[1]).toContain(
        `${CURSOR_MARKER}\x1b[7m \x1b[0mtype or / for commands`,
      );
      expect(box[2]).toMatch(/^╰─+╯$/);
      expect(box.map(visibleWidth)).toEqual([120, 120, 120]);
      expect(component.render(120)).toBe(initialFooter);
      expect(component.render(120)).toBe(initialFooter);

      mocks.events.emit('thoth:subagent-usage', {
        parentSessionId: 'parent-session',
        totalCost: 0.7,
      });
      expect(editor.render(120)[2]).toBe(box[2]);
      expect(component.render(120)).toEqual([
        '● Test Model · ◐ low │ ⑂ main │ [███░░░░░░░] 25% used │ 50K/200K │ $1.000',
      ]);
      expect(mocks.ui.setEditorComponent).not.toHaveBeenCalled();
    } finally {
      component.dispose();
    }
  });

  it('renders one status line row with model, git, context, and cumulative cost', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    const lines = component.render(120);

    expect(lines).toHaveLength(1);
    const row = lines[0];
    expect(row).toBe(
      '● Test Model · ◐ low │ ⑂ main │ [███░░░░░░░] 25% used │ 50K/200K │ $0.300',
    );
    expect(row).not.toContain('active');
  });

  it('adds the latest cumulative subagent snapshot to session cost, replacing earlier snapshots', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    expect(component.render(120)[0]).toContain('$0.300');

    mocks.tui.requestRender.mockClear();
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    expect(component.render(120)[0]).toContain('$1.000');
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(1);

    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 1.2,
      runCount: 2,
    });
    expect(component.render(120)[0]).toContain('$1.500');
    expect(mocks.tui.requestRender).toHaveBeenCalledTimes(2);

    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0,
      runCount: 0,
    });
    expect(component.render(120)[0]).toContain('$0.300');
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
    expect(component.render(120)[0]).toContain('$1.000');
  });

  it('resets cost and requests the current session snapshot on session start', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    expect(component.render(120)[0]).toContain('$1.000');

    mocks.sessionManager.getSessionId.mockReturnValue('next-session');
    mocks.sessionManager.getEntries.mockReturnValue([]);
    mocks.emit.mockClear();
    for (const handler of mocks.eventHandlers.get('session_start') ?? [])
      handler();

    expect(mocks.emit).toHaveBeenCalledWith('thoth:subagent-usage:request', {
      parentSessionId: 'next-session',
    });
    expect(component.render(120)[0]).toContain('$0.000');
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 10,
      runCount: 2,
    });
    expect(component.render(120)[0]).toContain('$0.000');
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'next-session',
      totalCost: 0.2,
      runCount: 1,
    });
    expect(component.render(120)[0]).toContain('$0.200');
  });

  it.each([
    {
      provider: 'claude-bridge',
      providers: undefined,
      expected: '$1.000 (sub)',
    },
    { provider: 'anthropic', providers: undefined, expected: '$1.000' },
    {
      provider: 'custom-subscription',
      providers: ['custom-subscription'],
      expected: '$1.000 (sub)',
    },
    { provider: 'claude-bridge', providers: [], expected: '$1.000' },
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

    expect(component.render(120)[0].split(' │ ').at(-1)).toBe(expected);
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
    expect(marked[0]).toContain('$0.300 (sub)');
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
    expect(first[0]).toContain('$1.000 (sub)');
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

  it('refreshes cost and context after session events', () => {
    const mocks = createMocks();
    const component = createFooter(mocks);
    expect(component.render(120)[0]).toContain('$0.300');
    mocks.events.emit('thoth:subagent-usage', {
      parentSessionId: 'parent-session',
      totalCost: 0.7,
      runCount: 1,
    });
    expect(component.render(120)[0]).toContain('$1.000');

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
    expect(row).toContain('$1.300');
    expect(row).toContain('80% used');
  });

  it('shows a dash when context usage is not reported', () => {
    const mocks = createMocks();
    (mocks.ctx.getContextUsage as ReturnType<typeof vi.fn>).mockReturnValue({
      percent: null,
      tokens: null,
      contextWindow: 200000,
    });
    const component = createFooter(mocks);
    const row = component.render(120)[0];
    expect(row).toContain('—');
    expect(row).not.toContain('0% used');
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
