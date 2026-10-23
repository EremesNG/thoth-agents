/**
 * Replay regression (#290) using Pi 1.0.2's real in-memory SessionManager.
 * Tool registration/context are test adapters; appendEntry writes to the real
 * branch. Nested calls use parent/child ids and only the outer codemode result
 * enters the transcript, matching Pi's executeTool contract without a model.
 */
import type { JsonValue } from '@earendil-works/pi-ai';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import registerTodo from './index.js';
import { replayFromBranch } from './state/replay.js';
import { getState } from './state/store.js';
import { createMockCtx, createMockPi } from './test/helpers.js';
import { __resetState } from './todo.js';
import { STATE_ENTRY_TYPE } from './tool/types.js';

function setup() {
  const sessionManager = SessionManager.inMemory();
  const { pi, captured } = createMockPi();
  const captureEntry = pi.appendEntry.bind(pi);
  pi.appendEntry = (customType, data) => {
    captureEntry(customType, data);
    sessionManager.appendCustomEntry(customType, data);
  };
  registerTodo(pi);
  const ctx = { ...createMockCtx({ hasUI: false }), sessionManager };
  const tool = captured.tools.get('todo');
  if (!tool) throw new Error('todo tool not registered');
  const call = (params: Record<string, unknown>, id = 'codemode-1/1') =>
    tool.execute(id, params as never, undefined, undefined, ctx);
  const replay = async (event = 'session_start') => {
    __resetState(); // simulate losing all live state before lifecycle replay
    const handler = captured.events.get(event)?.[0];
    if (!handler) throw new Error(`${event} handler not registered`);
    await handler({ type: event } as never, ctx as never);
    return getState(sessionManager.getSessionId());
  };
  const appendResult = (
    toolName: string,
    details?: unknown,
    toolCallId = toolName === 'todo' ? 'direct-1' : 'codemode-1',
  ) =>
    sessionManager.appendMessage({
      role: 'toolResult',
      toolCallId,
      toolName,
      content: [{ type: 'text', text: 'ok' }],
      // Registered tools erase details to unknown; these fixtures are JSON snapshots.
      details: details as JsonValue | undefined,
      isError: false,
      timestamp: Date.now(),
    });
  return { sessionManager, captured, ctx, call, replay, appendResult };
}

describe('nested todo calls survive replay on real Pi session branches', () => {
  it('restores the final list when only nested mutations exist and no todo result was recorded', async () => {
    const { call, sessionManager, appendResult, replay } = setup();
    await call({ action: 'create', subject: 'Task A' }, 'codemode-1/1');
    await call({ action: 'create', subject: 'Task B' }, 'codemode-1/2');
    await call({ action: 'create', subject: 'Task C' }, 'codemode-1/3');
    await call(
      { action: 'update', id: 1, status: 'in_progress' },
      'codemode-1/4',
    );
    appendResult('codemode');
    expect(
      sessionManager
        .getBranch()
        .some(
          (entry) =>
            entry.type === 'message' &&
            entry.message.role === 'toolResult' &&
            entry.message.toolName === 'todo',
        ),
    ).toBe(false);
    expect(await replay()).toEqual({
      tasks: [
        { id: 1, subject: 'Task A', status: 'in_progress' },
        { id: 2, subject: 'Task B', status: 'pending' },
        { id: 3, subject: 'Task C', status: 'pending' },
      ],
      nextId: 4,
    });
  });

  it.each([
    'session_tree',
    'session_compact',
  ])('keeps a nested completion after direct calls on %s', async (event) => {
    const { call, sessionManager, appendResult, replay } = setup();
    const created = await call(
      { action: 'create', subject: 'Completion persistence test' },
      'direct-1',
    );
    appendResult('todo', created.details);
    const started = await call(
      { action: 'update', id: 1, status: 'in_progress' },
      'direct-2',
    );
    appendResult('todo', started.details, 'direct-2');
    await call({ action: 'update', id: 1, status: 'completed' });
    appendResult('codemode');
    if (event === 'session_compact')
      sessionManager.appendCompaction('summary', null, 100);
    expect(await replay(event)).toEqual({
      tasks: [
        { id: 1, subject: 'Completion persistence test', status: 'completed' },
      ],
      nextId: 2,
    });
  });

  it('replays a batch with call-scoped refs as resolved ids, dependencies and nextId', async () => {
    const { call, captured, replay, appendResult } = setup();
    const params = {
      action: 'batch',
      ops: [
        {
          action: 'create',
          subject: 'Root',
          ref: 'root',
          status: 'in_progress',
        },
        {
          action: 'create',
          subject: 'Child',
          ref: 'child',
          blockedBy: ['root'],
        },
        { action: 'update', id: 'child', subject: 'Resolved child' },
        { action: 'create', subject: 'Discard', ref: 'discard' },
        { action: 'delete', id: 'discard' },
      ],
    };
    const result = await call(params);
    expect(captured.entries).toEqual([
      { customType: STATE_ENTRY_TYPE, data: result.details },
    ]);
    expect(result.details).toMatchObject({
      params,
      results: [
        { index: 0, action: 'create', id: 1, ref: 'root' },
        { index: 1, action: 'create', id: 2, ref: 'child' },
        { index: 2, action: 'update', id: 2 },
        { index: 3, action: 'create', id: 3, ref: 'discard' },
        { index: 4, action: 'delete', id: 3 },
      ],
    });
    appendResult('codemode');
    expect(await replay()).toEqual({
      tasks: [
        { id: 1, subject: 'Root', status: 'in_progress' },
        { id: 2, subject: 'Resolved child', status: 'pending', blockedBy: [1] },
        { id: 3, subject: 'Discard', status: 'deleted' },
      ],
      nextId: 4,
    });
  });

  it('replays a standalone dual write once without duplicating tasks or advancing nextId', async () => {
    const { call, sessionManager, appendResult, replay } = setup();
    const result = await call(
      { action: 'create', subject: 'Direct task' },
      'direct-1',
    );
    appendResult('todo', result.details);
    expect(sessionManager.getBranch().map((entry) => entry.type)).toEqual([
      'custom',
      'message',
    ]);
    const expected = {
      tasks: [{ id: 1, subject: 'Direct task', status: 'pending' }],
      nextId: 2,
    };
    expect(await replay()).toEqual(expected);
    expect(await replay()).toEqual(expected);
  });

  it('uses only the selected branch, ignoring newer snapshots on an abandoned sibling', async () => {
    const { call, sessionManager, ctx, replay } = setup();
    await call({ action: 'create', subject: 'Ancestor' });
    const fork = sessionManager.getLeafId();
    if (!fork) throw new Error('missing branch point');
    await call({ action: 'update', id: 1, subject: 'Abandoned sibling' });
    sessionManager.branch(fork);
    const expected = {
      tasks: [{ id: 1, subject: 'Ancestor', status: 'pending' }],
      nextId: 2,
    };
    expect(replayFromBranch(ctx)).toEqual(expected);
    expect(await replay('session_tree')).toEqual(expected);
    await call({ action: 'create', subject: 'Selected sibling' });
    expect(await replay()).toEqual({
      tasks: [
        { id: 1, subject: 'Ancestor', status: 'pending' },
        { id: 2, subject: 'Selected sibling', status: 'pending' },
      ],
      nextId: 3,
    });
  });
});
