import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
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

  function createMocks() {
    const eventHandlers = new Map<string, Array<() => void>>();
    const unsubs = new Map<string, ReturnType<typeof vi.fn>>();

    const pi = {
      on: vi.fn((event: string, handler: () => void) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event)?.push(handler);
        const unsub = vi.fn();
        unsubs.set(event, unsub);
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
      model: { id: 'test-model', name: 'Test Model' },
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
      branchCallbacks,
      branchUnsub,
      footerData,
      tui,
      theme,
      getFooterFactory: () => footerFactory,
    };
  }

  it('sets footer component and never calls setEditorComponent', () => {
    const mocks = createMocks();
    registerStatusLine(mocks.pi, mocks.ctx, defaultConfig);

    expect(mocks.ui.setFooter).toHaveBeenCalledTimes(1);
    expect(mocks.ui.setEditorComponent).not.toHaveBeenCalled();
  });

  it('renders one status line row with model, git, context, and cumulative cost', () => {
    const mocks = createMocks();
    registerStatusLine(mocks.pi, mocks.ctx, defaultConfig);

    const factory = mocks.getFooterFactory();
    expect(factory).toBeDefined();
    if (!factory) throw new Error('Footer factory was not registered');

    const component = factory(mocks.tui, mocks.theme, mocks.footerData);
    const lines = component.render(120);

    expect(lines).toHaveLength(1);
    const row = lines[0];
    expect(row).toBe(
      '● Test Model · ◐ low │ ⑂ main │ [███░░░░░░░] 25% used │ 50K/200K │ $0.300',
    );
    expect(row).not.toContain('active');
  });

  it('re-renders on branch change and pi events (message_end, turn_end, model_select)', () => {
    const mocks = createMocks();
    registerStatusLine(mocks.pi, mocks.ctx, defaultConfig);

    const factory = mocks.getFooterFactory();
    if (!factory) throw new Error('Footer factory was not registered');
    const component = factory(mocks.tui, mocks.theme, mocks.footerData);

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

  it('reads session data once and serves repeat frames from cache', () => {
    const mocks = createMocks();
    registerStatusLine(mocks.pi, mocks.ctx, defaultConfig);
    const factory = mocks.getFooterFactory();
    if (!factory) throw new Error('Footer factory was not registered');
    const component = factory(mocks.tui, mocks.theme, mocks.footerData);

    const first = component.render(120);
    for (let i = 0; i < 20; i++) expect(component.render(120)).toEqual(first);

    const sessionManager = (
      mocks.ctx as unknown as {
        sessionManager: {
          getEntries: ReturnType<typeof vi.fn<() => unknown[]>>;
        };
      }
    ).sessionManager;
    expect(sessionManager.getEntries).toHaveBeenCalledTimes(1);
    expect(mocks.ctx.getContextUsage).toHaveBeenCalledTimes(1);
    expect(mocks.theme.fg.mock.calls.length).toBeGreaterThan(0);
    const fgCalls = mocks.theme.fg.mock.calls.length;
    component.render(120);
    expect(mocks.theme.fg.mock.calls.length).toBe(fgCalls);
  });

  it('refreshes cost and context after session events', () => {
    const mocks = createMocks();
    registerStatusLine(mocks.pi, mocks.ctx, defaultConfig);
    const factory = mocks.getFooterFactory();
    if (!factory) throw new Error('Footer factory was not registered');
    const component = factory(mocks.tui, mocks.theme, mocks.footerData);
    expect(component.render(120)[0]).toContain('$0.300');

    const sessionManager = (
      mocks.ctx as unknown as {
        sessionManager: {
          getEntries: ReturnType<typeof vi.fn<() => unknown[]>>;
        };
      }
    ).sessionManager;
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
    expect(row).toContain('$0.600');
    expect(row).toContain('80% used');
  });

  it('shows a dash when context usage is not reported', () => {
    const mocks = createMocks();
    (mocks.ctx.getContextUsage as ReturnType<typeof vi.fn>).mockReturnValue({
      percent: null,
      tokens: null,
      contextWindow: 200000,
    });
    registerStatusLine(mocks.pi, mocks.ctx, defaultConfig);
    const factory = mocks.getFooterFactory();
    if (!factory) throw new Error('Footer factory was not registered');
    const component = factory(mocks.tui, mocks.theme, mocks.footerData);
    const row = component.render(120)[0];
    expect(row).toContain('—');
    expect(row).not.toContain('0% used');
  });

  it('disposes all event and branch subscriptions on component dispose', () => {
    const mocks = createMocks();
    registerStatusLine(mocks.pi, mocks.ctx, defaultConfig);

    const factory = mocks.getFooterFactory();
    if (!factory) throw new Error('Footer factory was not registered');
    const component = factory(mocks.tui, mocks.theme, mocks.footerData);

    expect(mocks.branchUnsub).not.toHaveBeenCalled();

    component.dispose();

    expect(mocks.branchUnsub).toHaveBeenCalledTimes(1);
    for (const unsub of mocks.unsubs.values()) {
      expect(unsub).toHaveBeenCalledTimes(1);
    }
  });
});
