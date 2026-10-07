import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindWorkPanelLifecycle, getWorkPanelLifecycle } from '../src/index.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

function lifecycleSession() {
  let idle = true;
  let sessionId = 'session-a';
  const ctx = {
    sessionManager: { getSessionId: () => sessionId },
    isIdle: () => idle,
  } as ExtensionContext;
  const handlers = new Map<
    string,
    Set<(event: any, ctx: ExtensionContext) => unknown>
  >();
  const pi = {
    on: vi.fn(
      (
        name: string,
        handler: (event: any, ctx: ExtensionContext) => unknown,
      ) => {
        const listeners = handlers.get(name) ?? new Set();
        handlers.set(name, listeners);
        listeners.add(handler);
        return () => listeners.delete(handler);
      },
    ),
  };
  return {
    ctx,
    pi: pi as unknown as ExtensionAPI,
    on: pi.on,
    emit(name: string, event: Record<string, unknown> = {}, context = ctx) {
      for (const handler of [...(handlers.get(name) ?? [])])
        handler({ type: name, ...event }, context);
    },
    input(text: string, source = 'interactive', streamingBehavior?: string) {
      this.emit('input', { text, source, streamingBehavior });
    },
    start(prompt: string) {
      this.emit('before_agent_start', { prompt });
    },
    setIdle(value: boolean) {
      idle = value;
    },
    switchSession(value: string) {
      sessionId = value;
    },
    listenerCount: () =>
      [...handlers.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

describe('work panel observed-text prompt epochs', () => {
  it.each([
    'interactive',
    'rpc',
  ])('advances only when an idle %s input matches a run prompt', (source) => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    session.input('inspect this', source);
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
    vi.setSystemTime(2000);
    session.start('inspect this');
    expect(getWorkPanelLifecycle(session.ctx)).toMatchObject({
      epoch: 1,
      epochStartedAt: 2000,
      busy: false,
    });
    session.start('inspect this');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
  });

  it('uses the text observed after earlier handlers, but not later transforms or prompt expansion', () => {
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    session.input('already transformed by an earlier handler');
    session.start('already transformed by an earlier handler');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
    session.input('plain input');
    session.start('transformed by a later handler');
    session.start('plain input with expanded template');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
  });

  it('retains handled candidates without advancing until any later run matches the same text', () => {
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    session.input('handled human text'); // A later input handler returns handled: no run follows.
    session.start('distinct extension sendUserMessage');
    session.start('custom sendMessage wake-up');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
    session.input('handled human text', 'extension');
    session.start('handled human text'); // Origin is unknowable: equality intentionally wins.
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
    session.start('handled human text');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
  });

  it('does not record steer/followUp while streaming, including extension steer before human follow-up', () => {
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    session.setIdle(false);
    session.emit('agent_start');
    session.input('extension steer', 'extension', 'steer');
    session.input('human follow-up', 'interactive', 'followUp');
    session.input('human steer', 'rpc', 'steer');
    session.setIdle(true);
    session.emit('agent_settled');
    for (const text of ['extension steer', 'human follow-up', 'human steer'])
      session.start(text);
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
  });

  it.each([
    {
      name: 'extension input → handled human input → extension before_agent_start',
      inputs: [
        ['extension A', 'extension'],
        ['handled human C', 'interactive'],
      ],
      starts: ['extension A'],
      epochs: [0],
    },
    {
      name: 'human input → extension input → before_agent_start',
      inputs: [
        ['human A', 'interactive'],
        ['extension B', 'extension'],
      ],
      starts: ['extension B', 'human A'],
      epochs: [0, 1],
    },
    {
      name: 'one prompt before_agent_start overtakes another waiting call',
      inputs: [
        ['waiting human A', 'rpc'],
        ['overtaking human B', 'interactive'],
      ],
      starts: ['overtaking human B', 'waiting human A'],
      epochs: [1, 2],
    },
  ])('handles reproduced interleaving: $name', ({ inputs, starts, epochs }) => {
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    for (const [text, source] of inputs) session.input(text, source);
    starts.forEach((prompt, index) => {
      session.start(prompt);
      expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(epochs[index]);
    });
  });

  it('handles extension A delayed in a handler while B starts, then human C handled, then A starts', () => {
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    // A has not reached this bridge yet. B overtakes its awaited input handler.
    session.input('extension B', 'extension');
    session.start('extension B');
    session.setIdle(false);
    session.emit('agent_start');
    session.setIdle(true);
    session.emit('agent_settled');
    session.input('handled human C');
    session.input('delayed extension A', 'extension');
    session.start('delayed extension A');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
    session.start('handled human C');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
  });

  it('advances on coincidental text from a different submission transformed after observation', () => {
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    session.input('retained handled candidate');
    session.input('different human submission');
    session.start('retained handled candidate'); // Later transform collided with retained text.
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
    session.start('different human submission');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(2);
  });

  it('ignores blank input and compares the complete observed text without trimming', () => {
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    session.input(' \t\n');
    session.start(' \t\n');
    session.input('  exact text  ');
    session.start('exact text');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
    session.start('  exact text  ');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
  });

  it('bounds candidates to the latest four and removes only one occurrence per matching run', () => {
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    for (let i = 0; i < 6; i++) session.input(`candidate ${i}`);
    session.start('candidate 0');
    session.start('candidate 1');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
    for (let i = 2; i < 6; i++) session.start(`candidate ${i}`);
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(4);
    session.input('duplicate');
    session.input('duplicate', 'rpc');
    for (let i = 0; i < 3; i++) session.start('duplicate');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(6);
  });
});

describe('work panel lifecycle ownership and busy state', () => {
  it('initializes and refreshes busy from isIdle on start/settled, not agent_end', () => {
    const session = lifecycleSession();
    session.setIdle(false);
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    expect(getWorkPanelLifecycle(session.ctx).busy).toBe(true);
    session.setIdle(true);
    session.emit('agent_end');
    expect(getWorkPanelLifecycle(session.ctx).busy).toBe(true);
    session.emit('agent_settled');
    expect(getWorkPanelLifecycle(session.ctx).busy).toBe(false);
    session.setIdle(false);
    session.emit('agent_start');
    expect(getWorkPanelLifecycle(session.ctx).busy).toBe(true);
    session.emit('agent_settled');
    expect(getWorkPanelLifecycle(session.ctx).busy).toBe(true);
  });

  it('deduplicates bindings across bundled copies and makes later bindings inert', async () => {
    const copy = await import(
      `${new URL('../src/work-panel-lifecycle.ts', import.meta.url).href}?copy`
    );
    const session = lifecycleSession();
    const release = bindWorkPanelLifecycle(session.pi, session.ctx);
    const inert = copy.bindWorkPanelLifecycle(session.pi, session.ctx);
    cleanups.push(release, inert);
    expect(session.on).toHaveBeenCalledTimes(6);
    inert();
    session.input('one prompt');
    session.start('one prompt');
    expect(copy.getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
    release();
    release();
    expect(session.listenerCount()).toBe(0);
    cleanups.push(copy.bindWorkPanelLifecycle(session.pi, session.ctx));
    expect(session.listenerCount()).toBe(6);
    session.input('fresh prompt');
    session.start('fresh prompt');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
    release();
    expect(session.listenerCount()).toBe(6);
  });

  it.each([
    'session switch',
    'shutdown',
  ])('clears candidates/state and permits fresh ownership after %s', (reason) => {
    const session = lifecycleSession();
    const release = bindWorkPanelLifecycle(session.pi, session.ctx);
    cleanups.push(release);
    session.input('stale candidate');
    session.input('old prompt');
    session.start('old prompt');
    if (reason === 'session switch') {
      session.switchSession('session-b');
      session.emit('session_start', { reason: 'new' });
    } else session.emit('session_shutdown', { reason: 'quit' });
    expect(session.listenerCount()).toBe(0);
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    release();
    session.start('stale candidate');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
    session.input('new prompt');
    session.start('new prompt');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(1);
  });

  it('ignores events from other session managers and disposes when the session identity changes before an event', () => {
    const session = lifecycleSession();
    cleanups.push(bindWorkPanelLifecycle(session.pi, session.ctx));
    session.emit(
      'input',
      { text: 'foreign', source: 'rpc' },
      lifecycleSession().ctx,
    );
    session.start('foreign');
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
    session.input('old candidate');
    session.switchSession('new-session');
    session.start('old candidate');
    expect(session.listenerCount()).toBe(0);
    expect(getWorkPanelLifecycle(session.ctx).epoch).toBe(0);
  });
});
