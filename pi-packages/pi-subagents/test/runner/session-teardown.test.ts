import { afterEach, expect, it, vi } from 'vitest';
import {
  registerChildBackgroundShutdown,
  teardownSubagentSession,
} from '../../src/runner/session-teardown.js';

afterEach(() => vi.useRealTimers());

it('runs reserved background cleanup once with the public child context before generic shutdown and disposal', async () => {
  const events: string[] = [];
  const context = {
    cwd: '/child',
    sessionManager: { getSessionId: () => 'child' },
  };
  const session = {
    extensionRunner: {
      createContext: () => context,
      hasHandlers: () => true,
      emit: async () => {
        events.push('generic');
      },
    },
    dispose: () => {
      events.push('dispose');
    },
  };
  registerChildBackgroundShutdown(session, [
    async (event, ctx) => {
      expect(event).toEqual({ type: 'session_shutdown', reason: 'quit' });
      expect(ctx).toBe(context);
      events.push('background');
    },
  ]);
  await Promise.all([
    teardownSubagentSession(session),
    teardownSubagentSession(session),
  ]);
  await teardownSubagentSession(session);
  expect(events).toEqual(['background', 'generic', 'dispose']);
});

it('gives stalled background handlers their own bound before the unchanged generic shutdown bound', async () => {
  vi.useFakeTimers();
  const events: string[] = [];
  const session = {
    extensionRunner: {
      createContext: () => ({}),
      hasHandlers: () => true,
      emit: () => {
        events.push('generic');
        return new Promise(() => {});
      },
    },
    dispose: () => {
      events.push('dispose');
    },
  };
  registerChildBackgroundShutdown(session, [
    () => {
      events.push('background-stalled');
      return new Promise(() => {});
    },
    () => {
      events.push('background-next');
    },
  ]);
  const teardown = teardownSubagentSession(session);
  await vi.advanceTimersByTimeAsync(9_999);
  expect(events).toEqual(['background-stalled']);
  await vi.advanceTimersByTimeAsync(1);
  expect(events).toEqual(['background-stalled', 'background-next', 'generic']);
  await vi.advanceTimersByTimeAsync(4_999);
  expect(events).not.toContain('dispose');
  await vi.advanceTimersByTimeAsync(1);
  await teardown;
  expect(events.at(-1)).toBe('dispose');
});

it('continues background and generic cleanup after a reserved handler throws', async () => {
  const events: string[] = [];
  const session = {
    extensionRunner: {
      createContext: () => ({}),
      hasHandlers: () => true,
      emit: async () => {
        events.push('generic');
      },
    },
    dispose: () => {
      events.push('dispose');
    },
  };
  registerChildBackgroundShutdown(session, [
    () => {
      throw new Error('cleanup failure');
    },
    () => {
      events.push('background-next');
    },
  ]);
  await expect(teardownSubagentSession(session)).resolves.toBeUndefined();
  expect(events).toEqual(['background-next', 'generic', 'dispose']);
});
