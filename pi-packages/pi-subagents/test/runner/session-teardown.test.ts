import { afterEach, expect, it, vi } from 'vitest';
import {
  registerChildBackgroundShutdown,
  teardownSubagentSession,
} from '../../src/runner/session-teardown.js';
import {
  registerSubagentExternalToolDefinition,
  resetPiComponentCacheForTests,
  resolveSubagentExternalToolDefinitionFromInfo,
} from '../../src/thread-view.js';

afterEach(() => {
  vi.useRealTimers();
  resetPiComponentCacheForTests();
});

it('withdraws only the child registered definition objects before disposal, even if shutdown fails', async () => {
  const root = { name: 'shared' };
  const child = { name: 'shared' };
  const childOnly = { name: 'child-only' };
  const childOwner = Symbol('child');
  registerSubagentExternalToolDefinition(root.name, root, Symbol('root'));
  registerSubagentExternalToolDefinition(child.name, child, childOwner);
  registerSubagentExternalToolDefinition(childOnly.name, childOnly, childOwner);
  const resolve = (name = 'shared') =>
    resolveSubagentExternalToolDefinitionFromInfo(name, { name });
  const dispose = vi.fn(() => {
    expect(resolve()).toBe(root);
    expect(resolve(childOnly.name)).toBeUndefined();
  });
  expect(resolve()).toBe(child);

  await teardownSubagentSession({
    extensionRunner: {
      getAllRegisteredTools: () => [
        { definition: child },
        { definition: childOnly },
      ],
      hasHandlers: () => true,
      emit: async () => {
        throw new Error('shutdown failed');
      },
    },
    dispose,
  });

  expect(dispose).toHaveBeenCalledOnce();
  expect(resolve()).toBe(root);
});

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
