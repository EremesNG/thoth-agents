import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createEventBus,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import subagentsExtension from '../src/extension/subagents-extension.js';
import { SubagentManager } from '../src/manager.js';
import type { SubagentRunner } from '../src/types.js';
import {
  SubagentUsageEvents,
  type SubagentUsageSnapshot,
} from '../src/usage-events.js';

type UsageSessionEntry = {
  type: 'custom';
  customType: string;
  data: unknown;
};

function usageSession(entries: UsageSessionEntry[] = []) {
  return {
    entries,
    appendEntry: (customType: string, data: unknown) => {
      entries.push({
        type: 'custom',
        customType,
        data: JSON.parse(JSON.stringify(data)),
      });
    },
  };
}

function collectUsageEvents(events = createEventBus()) {
  const snapshots: SubagentUsageSnapshot[] = [];
  events.on('thoth:subagent-usage', (data) => {
    snapshots.push(data as SubagentUsageSnapshot);
  });
  return { events, snapshots };
}

describe('subagent usage events', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores the latest session snapshot after restart and answers requests with it', () => {
    const session = usageSession();
    const first = new SubagentUsageEvents(
      createEventBus(),
      session.appendEntry,
    );
    first.startSession('parent-a', session.entries);
    first.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 100,
      usage: { cost: { total: 0.125 } },
    });
    first.recordAssistantMessage('parent-a', 'child-b', {
      role: 'assistant',
      timestamp: 200,
      usage: { cost: { total: 0.25 } },
    });
    first.dispose();

    const { events, snapshots } = collectUsageEvents();
    const resumed = new SubagentUsageEvents(events, session.appendEntry);
    resumed.startSession('parent-a', session.entries);
    snapshots.length = 0;
    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-a',
    });
    resumed.dispose();

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.375, runCount: 2 },
    ]);
  });

  it('adds new child messages after restore without charging replayed messages or runs again', () => {
    const session = usageSession();
    const firstMessage = {
      role: 'assistant' as const,
      timestamp: 100,
      usage: { cost: { total: 0.125 } },
    };
    const secondMessage = {
      role: 'assistant' as const,
      timestamp: 200,
      usage: { cost: { total: 0.25 } },
    };
    const original = new SubagentUsageEvents(
      createEventBus(),
      session.appendEntry,
    );
    original.startSession('parent-a', session.entries);
    original.recordAssistantMessage('parent-a', 'child-a', firstMessage);
    original.recordAssistantMessage('parent-a', 'child-a', secondMessage);
    original.dispose();

    const { events, snapshots } = collectUsageEvents();
    const resumed = new SubagentUsageEvents(events, session.appendEntry);
    resumed.startSession('parent-a', session.entries);
    snapshots.length = 0;
    resumed.recordAssistantMessage('parent-a', 'child-a', secondMessage);
    resumed.recordAssistantMessage('parent-a', 'child-a', firstMessage);
    resumed.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 200,
      usage: { cost: { total: 0.125 } },
    });
    resumed.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 300,
      usage: { cost: { total: 0.25 } },
    });
    resumed.recordAssistantMessage('parent-a', 'child-a', firstMessage);
    resumed.recordAssistantMessage('parent-a', 'child-b', firstMessage);
    resumed.dispose();

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.5, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.75, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.875, runCount: 2 },
    ]);
  });

  it.each([
    'ids only',
    'ISO timestamps',
  ])('continues %s without requiring a history replay before new usage', (identityKind) => {
    const session = usageSession();
    const firstMessage = {
      role: 'assistant' as const,
      ...(identityKind === 'ids only'
        ? { id: 'message-a' }
        : { timestamp: '2026-10-03T10:00:00Z' }),
      usage: { cost: { total: 0.125 } },
    };
    const secondMessage = {
      role: 'assistant' as const,
      ...(identityKind === 'ids only'
        ? { id: 'message-b' }
        : { timestamp: '2026-10-03T10:00:01Z' }),
      usage: { cost: { total: 0.25 } },
    };
    const original = new SubagentUsageEvents(
      createEventBus(),
      session.appendEntry,
    );
    original.startSession('parent-a', session.entries);
    original.recordAssistantMessage('parent-a', 'child-a', firstMessage);
    original.recordAssistantMessage('parent-a', 'child-a', secondMessage);
    original.dispose();

    const { events, snapshots } = collectUsageEvents();
    const resumed = new SubagentUsageEvents(events, session.appendEntry);
    resumed.startSession('parent-a', session.entries);
    snapshots.length = 0;
    resumed.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      ...(identityKind === 'ids only'
        ? { id: 'message-c' }
        : { timestamp: '2026-10-03T10:00:02Z' }),
      usage: { cost: { total: 0.5 } },
    });
    resumed.recordAssistantMessage('parent-a', 'child-a', firstMessage);
    resumed.recordAssistantMessage('parent-a', 'child-a', secondMessage);
    resumed.dispose();

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.875, runCount: 1 },
    ]);
  });

  it('coalesces a burst into compact checkpoints and flushes pending changes only once', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const session = usageSession();
    const { events } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events, session.appendEntry);
    usage.startSession('parent-a', session.entries);
    for (let timestamp = 1; timestamp <= 100; timestamp++) {
      usage.recordAssistantMessage('parent-a', 'child-a', {
        role: 'assistant',
        timestamp,
        usage: { cost: { total: 0.125 } },
      });
      events.emit('thoth:subagent-usage:request', {
        parentSessionId: 'parent-a',
      });
    }
    expect(session.entries).toHaveLength(1);

    vi.advanceTimersByTime(5_000);
    expect(session.entries).toHaveLength(2);
    expect(session.entries.at(-1)?.data).toMatchObject({
      totalCost: 12.5,
      runCount: 1,
    });
    expect(JSON.stringify(session.entries.at(-1)?.data).length).toBeLessThan(
      600,
    );

    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 101,
      usage: { cost: { total: 0.25 } },
    });
    usage.flush();
    usage.flush();
    usage.dispose();
    vi.advanceTimersByTime(10_000);
    expect(session.entries).toHaveLength(3);
    expect(session.entries.at(-1)?.data).toMatchObject({
      totalCost: 12.75,
      runCount: 1,
    });
  });

  it('ignores foreign or malformed checkpoints instead of replacing the last valid snapshot', () => {
    const session = usageSession();
    const original = new SubagentUsageEvents(
      createEventBus(),
      session.appendEntry,
    );
    original.startSession('parent-a', session.entries);
    original.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 100,
      usage: { cost: { total: 0.25 } },
    });
    original.dispose();
    const saved = session.entries[0];
    const valid = saved.data as Record<string, unknown>;
    session.entries.push({ ...saved, customType: 'another-extension' });
    for (const data of [
      null,
      'not a snapshot',
      { ...valid, version: 2 },
      { ...valid, parentSessionId: 'parent-b', totalCost: 10 },
      { ...valid, totalCost: Number.NaN },
      { ...valid, totalCost: -1 },
      { ...valid, runCount: 2 },
      { ...valid, runs: undefined },
      { ...valid, runs: [null] },
      { ...valid, runs: [{ runId: 'child-a', totalCost: 10 }] },
    ]) {
      session.entries.push({ ...saved, data });
    }

    const { events, snapshots } = collectUsageEvents();
    const resumed = new SubagentUsageEvents(events, session.appendEntry);
    resumed.startSession('parent-a', session.entries);
    snapshots.length = 0;
    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-a',
    });
    resumed.dispose();

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.25, runCount: 1 },
    ]);
  });

  it('keeps restored totals and delayed writes isolated to the active parent session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const parentA = usageSession();
    const parentB = usageSession();
    let active = parentA;
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events, (customType, data) =>
      active.appendEntry(customType, data),
    );
    usage.startSession('parent-a', parentA.entries);
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 100,
      usage: { cost: { total: 0.125 } },
    });
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 200,
      usage: { cost: { total: 0.25 } },
    });
    // Pi flushes shutdown before switching its append target to a new session.
    usage.flush();
    active = parentB;
    usage.startSession('parent-b', parentA.entries);
    snapshots.length = 0;
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 300,
      usage: { cost: { total: 0.5 } },
    });
    usage.recordAssistantMessage('parent-b', 'child-a', {
      role: 'assistant',
      timestamp: 100,
      usage: { cost: { total: 1 } },
    });
    vi.advanceTimersByTime(5_000);
    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-b',
    });
    usage.dispose();

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.875, runCount: 1 },
      { parentSessionId: 'parent-b', totalCost: 1, runCount: 1 },
      { parentSessionId: 'parent-b', totalCost: 1, runCount: 1 },
    ]);
    expect(parentB.entries).toHaveLength(1);
    expect(parentB.entries[0].data).toMatchObject({
      parentSessionId: 'parent-b',
      totalCost: 1,
      runCount: 1,
    });
    expect(parentA.entries.at(-1)?.data).toMatchObject({
      parentSessionId: 'parent-a',
      totalCost: 0.375,
      runCount: 1,
    });
  });

  it('removes the responder and pending timer even when a shutdown append fails', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const session = usageSession();
    let failAppend = false;
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events, (customType, data) => {
      if (failAppend) throw new Error('disk full');
      session.appendEntry(customType, data);
    });
    usage.startSession('parent-a', session.entries);
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 100,
      usage: { cost: { total: 0.125 } },
    });
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 200,
      usage: { cost: { total: 0.25 } },
    });
    failAppend = true;
    expect(() => usage.dispose()).toThrow('disk full');
    snapshots.length = 0;
    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-a',
    });
    failAppend = false;
    vi.advanceTimersByTime(5_000);

    expect(snapshots).toEqual([]);
    expect(session.entries).toHaveLength(1);
  });

  it('publishes a usage snapshot after a child assistant message', () => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);

    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      id: 'message-a',
      usage: { cost: { total: 0.125 } },
    });

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
    ]);
  });

  it('publishes cumulative snapshots and counts runs, not assistant messages', () => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);

    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      id: 'message-a',
      usage: { cost: { total: 0.125 } },
    });
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      id: 'message-b',
      usage: { cost: { total: 0.25 } },
    });
    usage.recordAssistantMessage('parent-a', 'child-b', {
      role: 'assistant',
      id: 'message-c',
      usage: { cost: { total: 0.5 } },
    });

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.375, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.875, runCount: 2 },
    ]);
  });

  it('deduplicates continued or replayed messages within a run', () => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);
    const first = {
      role: 'assistant' as const,
      id: 'message-a',
      timestamp: 100,
      usage: { cost: { total: 0.125 } },
    };

    usage.recordAssistantMessage('parent-a', 'child-a', first);
    usage.recordAssistantMessage('parent-a', 'child-a', { ...first });
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      id: 'message-b',
      timestamp: 200,
      usage: { cost: { total: 0.25 } },
    });
    usage.recordAssistantMessage('parent-a', 'child-a', { ...first });
    usage.recordAssistantMessage('parent-a', 'child-b', first);

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.375, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.5, runCount: 2 },
    ]);
  });

  it('deduplicates timestamped messages without ids regardless of usage property order', () => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);

    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 100,
      usage: { input: 10, output: 20, cost: { total: 0.125 } },
    });
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 100,
      usage: { cost: { total: 0.125 }, output: 20, input: 10 },
    });
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 200,
      usage: { input: 10, output: 20, cost: { total: 0.125 } },
    });
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 200,
      usage: { input: 30, output: 40, cost: { total: 0.25 } },
    });

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.25, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.5, runCount: 1 },
    ]);
  });

  it('isolates parent totals and message identities', () => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);

    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      id: 'message-a',
      usage: { cost: { total: 0.125 } },
    });
    usage.recordAssistantMessage('parent-b', 'child-a', {
      role: 'assistant',
      id: 'message-a',
      usage: { cost: { total: 0.5 } },
    });
    usage.recordAssistantMessage('parent-a', 'child-b', {
      role: 'assistant',
      id: 'message-b',
      usage: { cost: { total: 0.25 } },
    });

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
      { parentSessionId: 'parent-b', totalCost: 0.5, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.375, runCount: 2 },
    ]);
  });

  it('replies to a usage request with the requested parent snapshot', () => {
    const events = createEventBus();
    const usage = new SubagentUsageEvents(events);
    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      id: 'message-a',
      usage: { cost: { total: 0.125 } },
    });
    usage.recordAssistantMessage('parent-b', 'child-b', {
      role: 'assistant',
      id: 'message-b',
      usage: { cost: { total: 1 } },
    });
    const { snapshots } = collectUsageEvents(events);

    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-a',
    });
    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-a',
    });
    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-b',
    });

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
      { parentSessionId: 'parent-b', totalCost: 1, runCount: 1 },
    ]);
  });

  it('returns zero usage for an unseen parent and ignores malformed requests', () => {
    const { events, snapshots } = collectUsageEvents();
    new SubagentUsageEvents(events);

    for (const request of [
      undefined,
      null,
      'parent-a',
      {},
      { parentSessionId: 123 },
      { parentSessionId: '' },
    ]) {
      events.emit('thoth:subagent-usage:request', request);
    }
    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-a',
    });

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0, runCount: 0 },
    ]);
  });

  it('ignores missing parent identity without conflating distinct unidentifiable messages', () => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);
    const message = {
      role: 'assistant' as const,
      usage: { cost: { total: 0.125 } },
    };

    usage.recordAssistantMessage(undefined, 'child-a', message);
    usage.recordAssistantMessage('', 'child-a', message);
    usage.recordAssistantMessage('parent-a', 'child-a', message);
    usage.recordAssistantMessage('parent-a', 'child-a', { ...message });

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.25, runCount: 1 },
    ]);
  });

  it('unsubscribes from usage requests on disposal', () => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);

    usage.dispose();
    usage.dispose();
    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-a',
    });

    expect(snapshots).toEqual([]);
  });

  it.each([
    undefined,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('keeps missing, zero, or invalid cost %s JSON-safe without losing the run count', (cost) => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);

    usage.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      id: 'message-a',
      usage: { cost: { total: cost } },
    });
    usage.recordAssistantMessage('parent-a', 'child-b', {
      role: 'assistant',
      id: 'message-b',
      usage: { cost: { total: 0.25 } },
    });

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.25, runCount: 2 },
    ]);
  });
});

describe('subagent usage accounting integration', () => {
  let directory: string;
  let manager: SubagentManager | undefined;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-usage-'));
    manager = undefined;
    vi.stubEnv('PI_CODING_AGENT_DIR', path.join(directory, 'agent-home'));
    vi.stubEnv(
      'PI_SUBAGENTS_HISTORY_DB_PATH',
      path.join(directory, 'history.sqlite'),
    );
    fs.mkdirSync(path.join(directory, '.pi', 'subagents'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, '.pi', 'subagents', 'analyst.md'),
      '---\nname: analyst\ndescription: analyst agent\ntools:\n  - read\n---\n# Agent\n',
    );
    fs.writeFileSync(
      path.join(directory, '.pi', 'subagents.json'),
      JSON.stringify({ enable_continue: true }),
    );
  });

  afterEach(async () => {
    try {
      await manager?.close();
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('accounts individual child messages without Atelier metadata using the captured parent id', async () => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);
    let currentParent = 'parent-a';
    const runner: SubagentRunner = async ({ onActivity }) => {
      currentParent = 'parent-b';
      onActivity?.({
        message: 'streaming response',
        usage: {
          input: 100,
          output: 100,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 100,
          contextTokens: 200,
          turns: 1,
        },
      });
      const assistantMessage = {
        role: 'assistant' as const,
        id: 'message-a',
        usage: { cost: { total: 0.125 } },
      };
      onActivity?.({
        message: 'assistant message completed',
        assistant_message: assistantMessage,
      });
      onActivity?.({
        message: 'assistant message replayed',
        assistant_message: { ...assistantMessage },
      });
      return { result: 'done' };
    };
    manager = new SubagentManager(
      runner,
      undefined,
      undefined,
      undefined,
      undefined,
      (parentSessionId, runId, message) =>
        usage.recordAssistantMessage(parentSessionId, runId, message),
    );
    const ctx = {
      cwd: directory,
      sessionManager: { getSessionId: () => currentParent },
    };

    await manager.run({ agent: 'analyst', task: 'first', mode: 'task' }, ctx);
    await manager.run({ agent: 'analyst', task: 'second', mode: 'task' }, ctx);

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
      { parentSessionId: 'parent-b', totalCost: 0.125, runCount: 1 },
    ]);
  });

  it('keeps one run across manager continuations and does not recharge replayed child messages', async () => {
    const { events, snapshots } = collectUsageEvents();
    const usage = new SubagentUsageEvents(events);
    const childSessionFile = path.join(directory, 'child-session.jsonl');
    fs.writeFileSync(childSessionFile, '{"type":"session"}\n');
    const firstMessage = {
      role: 'assistant' as const,
      timestamp: 100,
      usage: { cost: { total: 0.125 } },
    };
    const runner: SubagentRunner = async ({ onActivity, continuation }) => {
      onActivity?.({
        message: 'assistant message completed',
        assistant_message: { ...firstMessage },
      });
      if (continuation) {
        onActivity?.({
          message: 'assistant message completed',
          assistant_message: {
            role: 'assistant',
            timestamp: 200,
            usage: { cost: { total: 0.25 } },
          },
        });
      }
      return { result: 'done', nested_session_path: childSessionFile };
    };
    manager = new SubagentManager(
      runner,
      undefined,
      undefined,
      undefined,
      undefined,
      (parentSessionId, runId, message) =>
        usage.recordAssistantMessage(parentSessionId, runId, message),
    );
    const ctx = { cwd: directory, sessionId: 'parent-a' };

    const first = await manager.run(
      { agent: 'analyst', task: 'first', mode: 'task' },
      ctx,
    );
    await manager.continueTask(
      { task_id: first.task_ids[0], prompt: 'continue', mode: 'task' },
      ctx,
    );

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0.125, runCount: 1 },
      { parentSessionId: 'parent-a', totalCost: 0.375, runCount: 1 },
    ]);
  });

  it('restores usage from public SDK custom entries after reopening a session file', () => {
    const sessionDirectory = path.join(directory, 'sessions');
    const parent = SessionManager.create(directory, sessionDirectory);
    parent.appendMessage({ role: 'user', content: 'delegate', timestamp: 1 });
    const parentSessionId = parent.getSessionId();
    const original = new SubagentUsageEvents(
      createEventBus(),
      (customType, data) => parent.appendCustomEntry(customType, data),
    );
    original.startSession(parentSessionId, parent.getEntries());
    const message = {
      role: 'assistant' as const,
      timestamp: 100,
      usage: { cost: { total: 0.125 } },
    };
    original.recordAssistantMessage(parentSessionId, 'child-a', message);
    original.recordAssistantMessage(parentSessionId, 'child-b', {
      role: 'assistant',
      timestamp: 200,
      usage: { cost: { total: 0.25 } },
    });
    original.dispose();

    const reopened = SessionManager.open(parent.getSessionFile()!);
    const { events, snapshots } = collectUsageEvents();
    const resumed = new SubagentUsageEvents(events, (customType, data) =>
      reopened.appendCustomEntry(customType, data),
    );
    resumed.startSession(reopened.getSessionId(), reopened.getEntries());
    snapshots.length = 0;
    resumed.recordAssistantMessage(parentSessionId, 'child-a', message);
    events.emit('thoth:subagent-usage:request', { parentSessionId });
    resumed.dispose();

    expect(snapshots).toEqual([
      { parentSessionId, totalCost: 0.375, runCount: 2 },
    ]);
  });

  it.each([
    'startup',
    'resume',
    'reload',
  ])('restores on session_start (%s) before answering an early usage request', async (reason) => {
    const session = usageSession();
    const original = new SubagentUsageEvents(
      createEventBus(),
      session.appendEntry,
    );
    original.startSession('parent-a', session.entries);
    original.recordAssistantMessage('parent-a', 'child-a', {
      role: 'assistant',
      timestamp: 100,
      usage: { cost: { total: 0.375 } },
    });
    original.dispose();
    const { events, snapshots } = collectUsageEvents();
    const handlers = new Map<
      string,
      (event: unknown, ctx: unknown) => unknown
    >();
    subagentsExtension({
      events,
      appendEntry: session.appendEntry,
      registerTool: () => undefined,
      on: (
        event: string,
        handler: (event: unknown, ctx: unknown) => unknown,
      ) => {
        handlers.set(event, handler);
      },
    });
    const ctx = {
      cwd: directory,
      sessionManager: {
        getSessionId: () => 'parent-a',
        getEntries: () => session.entries,
      },
    };

    try {
      // Another extension's session_start may request usage before ours runs.
      events.emit('thoth:subagent-usage:request', {
        parentSessionId: 'parent-a',
      });
      expect(snapshots).toEqual([]);
      await handlers.get('session_start')?.({ reason }, ctx);
      expect(snapshots).toEqual([
        { parentSessionId: 'parent-a', totalCost: 0.375, runCount: 1 },
      ]);
      snapshots.length = 0;
      events.emit('thoth:subagent-usage:request', {
        parentSessionId: 'parent-a',
      });
      expect(snapshots).toEqual([
        { parentSessionId: 'parent-a', totalCost: 0.375, runCount: 1 },
      ]);
    } finally {
      await handlers.get('session_shutdown')?.({}, ctx);
    }
  });

  it('registers the extension request responder and removes it on shutdown', async () => {
    const { events, snapshots } = collectUsageEvents();
    let shutdown: (() => Promise<void>) | undefined;
    subagentsExtension({
      events,
      registerTool: () => undefined,
      on: (event: string, handler: () => Promise<void>) => {
        if (event === 'session_shutdown') shutdown = handler;
      },
    });

    try {
      events.emit('thoth:subagent-usage:request', {
        parentSessionId: 'parent-a',
      });
    } finally {
      await shutdown?.();
    }
    events.emit('thoth:subagent-usage:request', {
      parentSessionId: 'parent-a',
    });

    expect(snapshots).toEqual([
      { parentSessionId: 'parent-a', totalCost: 0, runCount: 0 },
    ]);
  });
});
