import type {
  ExtensionAPI,
  ToolRendererResolver,
} from '@earendil-works/pi-coding-agent';
import {
  initTheme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, type TUI } from '@earendil-works/pi-tui';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { registerTools } from './index.ts';

const config: ThemeConfig = {
  icons: 'nerd',
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
  tools: { enabled: true },
  welcome: { enabled: true },
};
const cwd = process.cwd();
const partialResult = {
  content: [{ type: 'text', text: 'Waiting for output...' }],
  details: {},
  isError: false,
};

const cleanups: Array<() => void> = [];

function createSession(hasUI = true) {
  let resolver: ToolRendererResolver | undefined;
  const handlers = new Map<
    string,
    Set<(event: unknown, ctx: { hasUI: boolean }) => void>
  >();
  const pi = {
    registerToolRenderer(registeredResolver: ToolRendererResolver) {
      resolver = registeredResolver;
    },
    on(
      event: string,
      handler: (event: unknown, ctx: { hasUI: boolean }) => void,
    ) {
      const listeners = handlers.get(event) ?? new Set();
      listeners.add(handler);
      handlers.set(event, listeners);
      return () => listeners.delete(handler);
    },
  } as unknown as ExtensionAPI;
  const dispose = registerTools(pi, config, cwd);
  const emit = (event: string) => {
    for (const handler of handlers.get(event) ?? [])
      handler({ type: event }, { hasUI });
  };
  emit('session_start');
  const session = {
    dispose,
    emit,
    createBashComponent(toolCallId = 'bash-ticker') {
      const requestRender = vi.fn();
      const component = new ToolExecutionComponent(
        'bash',
        toolCallId,
        { command: 'sleep 10' },
        {},
        resolver?.('bash', () => undefined),
        { requestRender } as unknown as TUI,
        cwd,
      );
      return { component, requestRender };
    },
    createPowerShellComponent(toolCallId = 'ps-ticker') {
      const requestRender = vi.fn();
      const component = new ToolExecutionComponent(
        'powershell',
        toolCallId,
        { command: 'Start-Sleep -Seconds 10' },
        {},
        resolver?.('powershell', () => undefined),
        { requestRender } as unknown as TUI,
        cwd,
      );
      return { component, requestRender };
    },
  };
  cleanups.push(dispose);
  return session;
}

function renderText(component: ToolExecutionComponent, width = 80) {
  return component.render(width).map(stripTerminalSequences).join('\n');
}

beforeAll(() => {
  initTheme('dark', false);
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups.length = 0;
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Live tool elapsed through the real SDK', () => {
  it('keeps parent tickers live across headless child start/end/shutdown and disposal', () => {
    const parent = createSession();
    const { component, requestRender } = parent.createBashComponent();
    component.markExecutionStarted();
    renderText(component);
    const child = createSession(false);
    for (const event of ['session_start', 'agent_end', 'session_shutdown']) {
      requestRender.mockClear();
      child.emit(event);
      vi.advanceTimersByTime(1000);
      expect(requestRender).toHaveBeenCalledTimes(1);
    }
    child.dispose();
    requestRender.mockClear();
    vi.advanceTimersByTime(1000);
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(renderText(component)).toContain('△ · 4s');
    parent.emit('agent_end');
    requestRender.mockClear();
    vi.advanceTimersByTime(1000);
    expect(requestRender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let an older UI cleanup freeze a newer UI ticker', () => {
    const older = createSession();
    const oldTool = older.createBashComponent('old-ui');
    oldTool.component.markExecutionStarted();
    const newer = createSession();
    const newTool = newer.createBashComponent('new-ui');
    newTool.component.markExecutionStarted();
    older.emit('session_shutdown');
    newTool.requestRender.mockClear();
    vi.advanceTimersByTime(1000);
    expect(newTool.requestRender).toHaveBeenCalledTimes(1);
    expect(renderText(newTool.component)).toContain('◭ · 1s');
    newer.emit('session_shutdown');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows live elapsed for a started tool before its first output', () => {
    const { component, requestRender } = createSession().createBashComponent();
    component.markExecutionStarted();
    expect(renderText(component)).toContain('△ · 0s');
    requestRender.mockClear();

    vi.advanceTimersByTime(1000);
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(renderText(component)).toContain('◭ · 1s');
    expect(renderText(component)).not.toContain('Output');
  });

  it.each([
    'bash',
    'powershell',
  ] as const)('shows standard whole-second elapsed in running and terminal footers for %s', (name) => {
    const session = createSession();
    const { component } =
      name === 'bash'
        ? session.createBashComponent()
        : session.createPowerShellComponent();
    component.markExecutionStarted();
    renderText(component);
    vi.advanceTimersByTime(12345);
    component.invalidate();
    expect(renderText(component)).toContain('△ · 12s');

    component.updateResult(partialResult, true);
    expect(renderText(component)).toContain('△ · 12s');

    component.updateResult(partialResult, false);
    expect(renderText(component)).toContain('✓ · 12s · Exit 0');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('repaints partial elapsed once per second at the same cached width', () => {
    const { component, requestRender } = createSession().createBashComponent();
    component.markExecutionStarted();
    component.updateResult(partialResult, true);
    const initialText = renderText(component);
    expect(initialText).toContain('△ · 0s');

    // Repeated SDK renderer passes must keep just one interval per tool state.
    component.setExpanded(true);
    component.invalidate();
    component.updateArgs({ command: 'sleep 10' });
    requestRender.mockClear();

    vi.advanceTimersByTime(999);
    expect(requestRender).not.toHaveBeenCalled();
    expect(renderText(component)).toBe(initialText);

    vi.advanceTimersByTime(1);
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(renderText(component)).toContain('◭ · 1s');

    vi.advanceTimersByTime(2000);
    expect(requestRender).toHaveBeenCalledTimes(3);
    expect(renderText(component)).toContain('◮ · 3s');
  });

  it('keeps a partial shell error ticking until the terminal result arrives', () => {
    const { component, requestRender } = createSession().createBashComponent();
    component.markExecutionStarted();
    component.updateResult({ ...partialResult, isError: true }, true);
    expect(renderText(component)).toContain('△ · 0s');
    expect(vi.getTimerCount()).toBe(1);
    requestRender.mockClear();
    vi.advanceTimersByTime(2250);
    expect(requestRender).toHaveBeenCalledTimes(2);
    expect(renderText(component)).toContain('▲ · 2s');
    component.updateResult(partialResult, false);
    expect(renderText(component)).toContain('✓ · 2s · Exit 0');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { isError: false, text: 'Done', status: 'Exit 0' },
    {
      isError: true,
      text: 'Failed\n\nCommand exited with code 7',
      status: 'Exit 7',
    },
  ])('stops at terminal $status and freezes completed elapsed', ({
    isError,
    text,
    status,
  }) => {
    const { component, requestRender } = createSession().createBashComponent();
    component.markExecutionStarted();
    component.updateResult(partialResult, true);
    vi.advanceTimersByTime(2250);

    component.updateResult(
      { content: [{ type: 'text', text }], isError },
      false,
    );
    expect(renderText(component)).toContain(
      `${isError ? '✗' : '✓'} · 2s · ${status}`,
    );
    expect(vi.getTimerCount()).toBe(0);
    requestRender.mockClear();

    vi.advanceTimersByTime(5000);
    expect(requestRender).not.toHaveBeenCalled();
    component.setExpanded(true);
    component.invalidate();
    expect(renderText(component, 96)).toContain(
      `${isError ? '✗' : '✓'} · 2s · ${status}`,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'agent_end',
    'session_shutdown',
    'session_start',
  ])('clears all interrupted tool intervals on %s without restarting old partial rows', (event) => {
    const session = createSession();
    const tools = ['first', 'second'].map((id) =>
      session.createBashComponent(id),
    );
    for (const [index, { component }] of tools.entries()) {
      component.markExecutionStarted();
      if (index === 0) component.updateResult(partialResult, true);
      renderText(component);
    }
    expect(vi.getTimerCount()).toBe(2);
    vi.advanceTimersByTime(1500);
    for (const { requestRender } of tools) requestRender.mockClear();

    session.emit(event);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    for (const { component, requestRender } of tools) {
      expect(requestRender).not.toHaveBeenCalled();
      component.setExpanded(true);
      component.invalidate();
      expect(renderText(component)).toContain('◭ · 1s');
    }
    expect(vi.getTimerCount()).toBe(0);

    // A later run/session owns fresh states, which must still tick normally.
    if (event === 'session_shutdown') session.emit('session_start');
    const next = session.createBashComponent('next-run');
    next.component.markExecutionStarted();
    next.component.updateResult(partialResult, true);
    next.requestRender.mockClear();
    vi.advanceTimersByTime(1000);
    expect(next.requestRender).toHaveBeenCalledTimes(1);
    expect(renderText(next.component)).toContain('◭ · 1s');
  });

  it('disposes live intervals and detaches lifecycle cleanup idempotently', () => {
    const session = createSession();
    const { component, requestRender } = session.createBashComponent();
    component.markExecutionStarted();
    component.updateResult(partialResult, true);
    vi.advanceTimersByTime(1250);
    requestRender.mockClear();

    session.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(requestRender).not.toHaveBeenCalled();
    component.invalidate();
    expect(renderText(component)).toContain('◭ · 1s');
    expect(vi.getTimerCount()).toBe(0);

    const next = createSession().createBashComponent('next-registration');
    next.component.markExecutionStarted();
    next.component.updateResult(partialResult, true);
    next.requestRender.mockClear();
    session.dispose();
    for (const event of ['agent_end', 'session_shutdown', 'session_start']) {
      session.emit(event);
    }
    vi.advanceTimersByTime(1000);
    expect(next.requestRender).toHaveBeenCalledTimes(1);
    expect(renderText(next.component)).toContain('◭ · 1s');
  });

  it.each([
    'pending',
    'partial',
    'completed',
  ])('does not tick a non-started %s tool call', (phase) => {
    const { component, requestRender } = createSession().createBashComponent();
    if (phase !== 'pending') {
      component.updateResult(partialResult, phase === 'partial');
    }
    renderText(component);
    requestRender.mockClear();

    vi.advanceTimersByTime(5000);
    expect(requestRender).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    component.setExpanded(true);
    component.invalidate();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps another tool ticking when one tool completes', () => {
    const session = createSession();
    const first = session.createBashComponent('first');
    const second = session.createBashComponent('second');
    for (const { component } of [first, second]) {
      component.markExecutionStarted();
      component.updateResult(partialResult, true);
    }
    vi.advanceTimersByTime(1500);
    first.component.updateResult(partialResult, false);
    expect(renderText(first.component)).toContain('✓ · 1s · Exit 0');
    expect(vi.getTimerCount()).toBe(1);
    first.requestRender.mockClear();
    second.requestRender.mockClear();

    vi.advanceTimersByTime(500);
    expect(first.requestRender).not.toHaveBeenCalled();
    expect(second.requestRender).toHaveBeenCalledTimes(1);
    expect(renderText(second.component)).toContain('▲ · 2s');
    expect(renderText(first.component)).toContain('✓ · 1s · Exit 0');
  });

  it('ticks a running powershell component every second while execution is partial', () => {
    const session = createSession();
    const { component, requestRender } =
      session.createPowerShellComponent('ps-1');

    component.markExecutionStarted();
    component.updateResult(partialResult, true);
    expect(renderText(component)).toContain('△ · 0s');
    expect(vi.getTimerCount()).toBe(1);
    requestRender.mockClear();

    vi.advanceTimersByTime(1000);
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(renderText(component)).toContain('◭ · 1s');

    vi.advanceTimersByTime(1000);
    expect(requestRender).toHaveBeenCalledTimes(2);
    expect(renderText(component)).toContain('▲ · 2s');

    component.updateResult(
      {
        content: [{ type: 'text', text: 'done' }],
        details: {},
        isError: false,
      },
      false,
    );
    expect(renderText(component)).toContain('✓ · 2s · Exit 0');
    expect(vi.getTimerCount()).toBe(0);
  });
});
