import {
  request,
  subscribe,
  type ThothEnvelope,
  TODO_STATE_CHANNEL,
  TODO_STATE_REQUEST,
  type TodoSnapshot,
} from '@thoth-agents/pi-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import registerTodo from '../index.js';
import {
  buildSessionEntries,
  createMockCtx,
  createMockPi,
  makeTodoToolResult,
} from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function fixture() {
  const { pi, captured } = createMockPi();
  registerTodo(pi);
  const snapshots: ThothEnvelope<TodoSnapshot>[] = [];
  subscribe(pi.events, TODO_STATE_CHANNEL, {
    onSnapshot: (snapshot) => {
      snapshots.push(snapshot);
    },
  });
  const ctx = createMockCtx({ sessionId: 'current', hasUI: false });
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('todo not registered');
  return {
    pi,
    snapshots,
    ctx,
    request(sessionId: string) {
      request(pi.events, TODO_STATE_REQUEST, {
        sessionId,
        source: '@thoth-agents/test-consumer',
        data: {},
      });
    },
    async emit(name: string, context = ctx) {
      for (const handler of captured.events.get(name) ?? []) {
        await handler({} as never, context as never);
      }
    },
    async call(params: Record<string, unknown>, context = ctx) {
      return tool.execute(
        'call',
        params as never,
        undefined,
        undefined,
        context,
      );
    },
  };
}

it('publishes complete, validated session snapshots after every mutation', async () => {
  const f = fixture();
  await f.emit('session_start');
  f.snapshots.length = 0;
  await f.call({
    action: 'create',
    subject: 'Research',
    description: 'Read the API',
    metadata: { area: 'sdk' },
  });
  await f.call({
    action: 'create',
    subject: 'Implement',
    blockedBy: [1],
    owner: 'main',
  });
  await f.call({
    action: 'update',
    id: 2,
    status: 'in_progress',
    activeForm: 'Implementing',
  });
  await f.call({ action: 'delete', id: 1 });
  await f.call({ action: 'clear' });

  expect(f.snapshots).toHaveLength(5);
  expect(
    f.snapshots.every(
      (snapshot) =>
        snapshot.source === '@thoth-agents/pi-todo' &&
        snapshot.sessionId === 'current' &&
        snapshot.v === 1,
    ),
  ).toBe(true);
  expect(f.snapshots[2].data).toEqual({
    tasks: [
      {
        id: 1,
        subject: 'Research',
        description: 'Read the API',
        metadata: { area: 'sdk' },
        status: 'pending',
        blockedBy: [],
      },
      {
        id: 2,
        subject: 'Implement',
        owner: 'main',
        status: 'in_progress',
        activeForm: 'Implementing',
        blockedBy: [1],
      },
    ],
    nextId: 3,
    counts: { pending: 1, in_progress: 1, completed: 0, deleted: 0 },
  });
  expect(f.snapshots[3].data.counts).toEqual({
    pending: 0,
    in_progress: 1,
    completed: 0,
    deleted: 1,
  });
  expect(f.snapshots[4].data).toEqual({
    tasks: [],
    nextId: 1,
    counts: { pending: 0, in_progress: 0, completed: 0, deleted: 0 },
  });
});

it('answers requests only for ready sessions and defers an early request until replay', async () => {
  const f = fixture();
  f.request('current');
  f.request('foreign');
  expect(f.snapshots).toEqual([]);
  await f.emit('session_start');
  expect(f.snapshots).toHaveLength(1);
  expect(f.snapshots[0]).toMatchObject({
    sessionId: 'current',
    data: { tasks: [], nextId: 1 },
  });

  await f.call({ action: 'create', subject: 'Retained' });
  f.snapshots.length = 0;
  f.request('current');
  expect(f.snapshots).toHaveLength(1);
  expect(f.snapshots[0].data.tasks[0].subject).toBe('Retained');
  f.request('foreign');
  f.pi.events.emit(TODO_STATE_REQUEST.name, { sessionId: 42 });
  f.pi.events.emit(TODO_STATE_REQUEST.name, null);
  expect(f.snapshots).toHaveLength(1);

  await f.emit('session_shutdown');
  f.snapshots.length = 0;
  f.request('current');
  expect(f.snapshots).toEqual([]);
});

it('ignores unsupported and malformed request envelopes without disrupting valid requests', async () => {
  const f = fixture();
  await f.emit('session_start');
  await f.call({ action: 'create', subject: 'Retained' });
  f.snapshots.length = 0;
  const validRequest = {
    v: 1,
    source: '@thoth-agents/test-consumer',
    sessionId: 'current',
    at: 0,
    data: {},
  };
  for (const value of [
    { ...validRequest, v: 999 },
    { sessionId: 'current' },
    { ...validRequest, source: '' },
    { ...validRequest, sessionId: 42 },
    { ...validRequest, sessionId: 'foreign' },
    { ...validRequest, at: 'invalid' },
    { ...validRequest, data: null },
    { ...validRequest, data: { sessionId: 'current' } },
    {
      ...validRequest,
      get v() {
        throw new Error('unreadable request');
      },
    },
  ]) {
    expect(() =>
      f.pi.events.emit(TODO_STATE_REQUEST.name, value),
    ).not.toThrow();
  }
  expect(f.snapshots).toEqual([]);

  f.request('current');
  expect(f.snapshots).toHaveLength(1);
  expect(f.snapshots[0]).toMatchObject({
    v: 1,
    source: '@thoth-agents/pi-todo',
    sessionId: 'current',
    data: { tasks: [{ subject: 'Retained' }] },
  });
});

it.each([
  'session_start',
  'session_tree',
  'session_compact',
])('publishes the branch snapshot after %s, including tombstones', async (event) => {
  const f = fixture();
  await f.emit('session_start');
  await f.call({ action: 'create', subject: 'Off-branch' });
  f.snapshots.length = 0;
  const ctx = createMockCtx({
    sessionId: 'current',
    hasUI: false,
    branch: buildSessionEntries([
      makeTodoToolResult({
        tasks: [{ id: 1, subject: 'Earlier', status: 'pending' }],
        nextId: 2,
      }),
      makeTodoToolResult({
        tasks: [
          { id: 1, subject: 'Removed', status: 'deleted' },
          {
            id: 2,
            subject: 'Resume',
            status: 'in_progress',
            activeForm: 'Resuming',
          },
        ],
        nextId: 3,
      }),
    ]),
  });
  await f.emit(event, ctx);
  expect(f.snapshots).toHaveLength(1);
  expect(f.snapshots[0].data).toEqual({
    tasks: [
      { id: 1, subject: 'Removed', status: 'deleted', blockedBy: [] },
      {
        id: 2,
        subject: 'Resume',
        status: 'in_progress',
        activeForm: 'Resuming',
        blockedBy: [],
      },
    ],
    nextId: 3,
    counts: { pending: 0, in_progress: 1, completed: 0, deleted: 1 },
  });
});

it('does not publish for reads, failed mutations, or no-effect updates', async () => {
  const f = fixture();
  await f.emit('session_start');
  await f.call({ action: 'create', subject: 'Task' });
  f.snapshots.length = 0;
  await f.call({ action: 'list' });
  await f.call({ action: 'get', id: 1 });
  await f.call({ action: 'update', id: 1, status: 'pending' });
  await f.call({ action: 'create', subject: '' });
  await f.call({ action: 'update', id: 1 });
  await f.call({ action: 'delete', id: 99 });
  expect(f.snapshots).toEqual([]);
});

it('keeps snapshots isolated from live tool state and other sessions', async () => {
  const f = fixture();
  await f.emit('session_start');
  await f.call({ action: 'create', subject: 'Current task' });
  await f.call({
    action: 'create',
    subject: 'Follow-up',
    blockedBy: [1],
    metadata: { nested: { tag: 'original' } },
  });
  const latest = f.snapshots.at(-1);
  if (!latest) throw new Error('mutation snapshot missing');
  const received = latest.data.tasks[1];
  received.blockedBy.push(999);
  (
    received as unknown as { metadata: { nested: { tag: string } } }
  ).metadata.nested.tag = 'changed by subscriber';
  const result = await f.call({ action: 'list' });
  expect(result.details).toMatchObject({
    tasks: [
      { subject: 'Current task' },
      {
        subject: 'Follow-up',
        blockedBy: [1],
        metadata: { nested: { tag: 'original' } },
      },
    ],
  });
  const other = createMockCtx({ sessionId: 'other', hasUI: false });
  await f.emit('session_start', other);
  await f.call({ action: 'create', subject: 'Other task' }, other);
  f.snapshots.length = 0;
  f.request('current');
  f.request('other');
  expect(
    f.snapshots.map((snapshot) => [
      snapshot.sessionId,
      snapshot.data.tasks.map((task) => task.subject),
    ]),
  ).toEqual([
    ['current', ['Current task', 'Follow-up']],
    ['other', ['Other task']],
  ]);
  await f.emit('session_shutdown', other);
  f.snapshots.length = 0;
  f.request('other');
  f.request('current');
  expect(f.snapshots.map((snapshot) => snapshot.sessionId)).toEqual([
    'current',
  ]);
});

it('drops the request listener on a stale shutdown and reconnects after session replacement', async () => {
  const f = fixture();
  await f.emit('session_start');
  await f.call({ action: 'create', subject: 'Old session' });
  const stale = {
    hasUI: false,
    get sessionManager() {
      throw new Error(
        'This extension ctx is stale after session replacement or reload.',
      );
    },
  };
  await f.emit('session_shutdown', stale as never);
  f.snapshots.length = 0;
  f.request('current');
  expect(f.snapshots).toEqual([]);
  const replacement = createMockCtx({ sessionId: 'replacement', hasUI: false });
  await f.emit('session_start', replacement);
  f.snapshots.length = 0;
  f.request('replacement');
  expect(f.snapshots.map((snapshot) => snapshot.sessionId)).toEqual([
    'replacement',
  ]);
});
