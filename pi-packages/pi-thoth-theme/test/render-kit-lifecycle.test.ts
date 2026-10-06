import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
} from '@earendil-works/pi-coding-agent';
import { getRenderKit } from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import thothTheme from '../src/index.ts';

type Handler = (event: ExtensionEvent, ctx: ExtensionContext) => unknown;
let agentDir: string;
interface Session {
  emit(event: ExtensionEvent): Promise<void>;
}
const sessions: Session[] = [];

function loadTheme(toolsEnabled = true, hasUI = true): Session {
  writeFileSync(
    join(agentDir, 'pi-thoth-theme.json'),
    JSON.stringify({
      tools: { enabled: toolsEnabled },
      statusLine: { enabled: false },
      welcome: { enabled: false },
    }),
  );
  const handlers = new Map<string, Set<Handler>>();
  thothTheme({
    registerToolRenderer() {},
    on(event: string, handler: Handler) {
      const listeners = handlers.get(event) ?? new Set();
      listeners.add(handler);
      handlers.set(event, listeners);
      return () => listeners.delete(handler);
    },
  } as unknown as ExtensionAPI);
  const session = {
    async emit(event: ExtensionEvent) {
      for (const handler of handlers.get(event.type) ?? []) {
        await handler(event, { hasUI, ui: {} } as ExtensionContext);
      }
    },
  };
  sessions.push(session);
  return session;
}

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), 'pi-thoth-theme-kit-'));
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
});

afterEach(async () => {
  for (const session of sessions) {
    await session.emit({ type: 'session_shutdown', reason: 'quit' });
  }
  sessions.length = 0;
  vi.unstubAllEnvs();
  rmSync(agentDir, { recursive: true, force: true });
});

describe('theme render-kit lifecycle', () => {
  it('publishes only on interactive session start and withdraws on shutdown', async () => {
    const session = loadTheme();
    expect(getRenderKit()).toBeUndefined();
    await session.emit({ type: 'session_start', reason: 'startup' });
    expect(getRenderKit()?.version).toBe(1);
    await session.emit({ type: 'session_shutdown', reason: 'quit' });
    expect(getRenderKit()).toBeUndefined();
  });

  it('backs producer indicators with the owning UI ticker and freezes terminal elapsed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const parent = loadTheme();
      await parent.emit({ type: 'session_start', reason: 'startup' });
      const kit = getRenderKit();
      if (!kit) throw new Error('No theme kit');
      const theme = { fg: (_role: string, text: string) => text };
      const invalidate = vi.fn();
      const context = {
        executionStarted: true,
        isPartial: true,
        state: {},
        invalidate,
      };
      expect(kit.indicator(theme, context).text).toBe('△ · 0s');
      kit.indicator(theme, context);
      const child = loadTheme(true, false);
      await child.emit({ type: 'session_start', reason: 'startup' });
      await child.emit({ type: 'agent_end', messages: [] });
      await child.emit({ type: 'session_shutdown', reason: 'quit' });
      vi.advanceTimersByTime(2250);
      expect(invalidate).toHaveBeenCalledTimes(2);
      expect(kit.indicator(theme, context).glyph).toBe('▲');
      expect(kit.indicator(theme, context).text).toBe('▲ · 2s');
      context.isPartial = false;
      expect(kit.indicator(theme, context).text).toBe('Done · 2.3s');
      invalidate.mockClear();
      vi.advanceTimersByTime(5000);
      expect(invalidate).not.toHaveBeenCalled();
      expect(kit.indicator(theme, context).text).toBe('Done · 2.3s');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it.each([
    ['completed', '✓'],
    ['deleted', '✓'],
    ['failed', '✗'],
    ['cancelled', '✗'],
    ['interrupted', '✗'],
    ['blocked', '✗'],
  ] as const)('keeps partial errors running, then freezes the %s footer and stops invalidations', async (status, glyph) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const parent = loadTheme();
      await parent.emit({ type: 'session_start', reason: 'startup' });
      const kit = getRenderKit();
      if (!kit?.toolFooter) throw new Error('No theme footer');
      const theme = { fg: (_role: string, text: string) => text };
      const context = {
        executionStarted: true,
        isPartial: true,
        isError: true,
        state: {},
        invalidate: vi.fn(),
      };
      expect(kit.toolFooter(theme, { status: 'running', context })).toBe(
        '△ · 0s',
      );
      expect(kit.indicator(theme, context, { status: 'running' }).text).toBe(
        '△ · 0s',
      );
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(2250);
      expect(context.invalidate).toHaveBeenCalledTimes(2);
      expect(kit.toolFooter(theme, { status: 'running', context })).toBe(
        '▲ · 2s',
      );
      expect(
        kit.toolFooter(theme, { status, context, summary: 'result' }),
      ).toBe(`${glyph} · 2s · result`);
      expect(vi.getTimerCount()).toBe(0);
      context.invalidate.mockClear();
      vi.advanceTimersByTime(5000);
      expect(context.invalidate).not.toHaveBeenCalled();
      expect(kit.toolFooter(theme, { status, context })).toBe(`${glyph} · 2s`);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('stops a card ticker when the terminal footer is explicitly supplied', async () => {
    vi.useFakeTimers();
    try {
      const parent = loadTheme();
      await parent.emit({ type: 'session_start', reason: 'startup' });
      const kit = getRenderKit();
      if (!kit) throw new Error('No theme kit');
      const theme = { fg: (_role: string, text: string) => text };
      const context = {
        executionStarted: true,
        isPartial: true,
        state: {},
        invalidate: vi.fn(),
      };
      expect(
        kit.card(theme, { status: 'running', context }, 40).at(-1),
      ).toContain('△ · 0s');
      vi.advanceTimersByTime(1250);
      expect(
        kit
          .card(
            theme,
            {
              status: 'completed',
              context,
              footer: '✓ · 1s · result',
            },
            40,
          )
          .at(-1),
      ).toContain('╰── ✓ · 1s · result ');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('honors producer elapsed overrides while keeping shared timing live and freezing the final override', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const parent = loadTheme();
      await parent.emit({ type: 'session_start', reason: 'startup' });
      const kit = getRenderKit();
      if (!kit?.toolFooter) throw new Error('No theme footer');
      const theme = { fg: (_role: string, text: string) => text };
      const context = {
        executionStarted: true,
        isPartial: false,
        state: {},
        invalidate: vi.fn(),
      };
      expect(
        kit.toolFooter(theme, {
          status: 'in_progress',
          context,
          elapsedMs: 5250,
        }),
      ).toBe('◭ · 5s');
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(2250);
      expect(kit.toolFooter(theme, { status: 'running', context })).toBe(
        '▲ · 2s',
      );
      expect(
        kit.toolFooter(theme, {
          status: 'completed',
          context,
          elapsedMs: 10250,
          summary: 'Exit 0',
        }),
      ).toBe('✓ · 10s · Exit 0');
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(5000);
      expect(kit.toolFooter(theme, { status: 'completed', context })).toBe(
        '✓ · 10s',
      );
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('does not allow a withdrawn kit to start fresh producer timers', async () => {
    vi.useFakeTimers();
    try {
      const parent = loadTheme();
      await parent.emit({ type: 'session_start', reason: 'startup' });
      const kit = getRenderKit();
      await parent.emit({ type: 'session_shutdown', reason: 'quit' });
      kit?.indicator(
        { fg: (_role, text) => text },
        {
          executionStarted: true,
          isPartial: true,
          state: {},
          invalidate: vi.fn(),
        },
      );
      kit?.toolFooter?.(
        { fg: (_role, text) => text },
        {
          status: 'running',
          context: {
            executionStarted: true,
            isPartial: true,
            state: {},
            invalidate: vi.fn(),
          },
        },
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('does not publish when tools styling is disabled', async () => {
    const session = loadTheme(false);
    await session.emit({ type: 'session_start', reason: 'startup' });
    expect(getRenderKit()).toBeUndefined();
  });

  it('leaves the parent kit intact across every headless child lifecycle event', async () => {
    const parent = loadTheme();
    await parent.emit({ type: 'session_start', reason: 'startup' });
    const kit = getRenderKit();
    const child = loadTheme(true, false);
    for (const event of [
      { type: 'session_start', reason: 'startup' },
      { type: 'agent_end', messages: [] },
      { type: 'session_shutdown', reason: 'quit' },
    ] as ExtensionEvent[]) {
      await child.emit(event);
      expect(getRenderKit()).toBe(kit);
    }
  });

  it('does not let an older UI owner withdraw a replacement registration', async () => {
    const older = loadTheme();
    const newer = loadTheme();
    await older.emit({ type: 'session_start', reason: 'startup' });
    const oldKit = getRenderKit();
    await newer.emit({ type: 'session_start', reason: 'startup' });
    const newKit = getRenderKit();
    expect(newKit).toBeDefined();
    expect(newKit).not.toBe(oldKit);
    await older.emit({ type: 'session_shutdown', reason: 'quit' });
    expect(getRenderKit()).toBe(newKit);
    await newer.emit({ type: 'session_shutdown', reason: 'quit' });
    expect(getRenderKit()).toBeUndefined();
  });
});
