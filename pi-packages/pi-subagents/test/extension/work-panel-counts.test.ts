import { describe, expect, it } from 'vitest';
import subagentsExtension from '../../src/extension/subagents-extension.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';
import { workPanelSession } from '../helpers/work-panel-fixture.js';

const env = installSubagentTestEnv();
type Session = ReturnType<typeof workPanelSession>;
type Handler = (event: unknown, ctx: Session['ctx']) => unknown;

function extensionHost() {
  const handlers = new Map<string, Handler[]>();
  subagentsExtension({
    registerTool: () => {},
    on: (name: string, handler: Handler) => {
      const registered = handlers.get(name) ?? [];
      registered.push(handler);
      handlers.set(name, registered);
      return () => {
        const index = registered.indexOf(handler);
        if (index >= 0) registered.splice(index, 1);
      };
    },
  });
  return {
    async emit(name: string, session: Session, event: unknown = {}) {
      for (const handler of [...(handlers.get(name) ?? [])])
        await handler(event, session.ctx);
    },
  };
}

describe('Agents work-panel session lifecycle', () => {
  it('restores exact uncapped persisted totals after a simulated restart and resume', async () => {
    env.writeAgent('worker');
    const history = env.createHistoryStore();
    const original = env.createManager(env.mockRunner(), history);
    await original.run(
      { agent: 'worker', task: 'original session task', mode: 'task' },
      { cwd: env.tmp, sessionId: 'parent-a' },
    );
    for (let index = 0; index < 141; index++)
      history.upsertTask(env.tmp, {
        id: `persisted-${index}`,
        agent: 'worker',
        mode: 'task',
        status: index < 124 ? 'completed' : 'failed',
        task: 'original session task',
        created_at: '2026-01-01T00:00:00Z',
        session_id: 'parent-a',
      });
    await original.close();

    const resumed = extensionHost();
    const session = workPanelSession(env.tmp, 'parent-a');
    try {
      await resumed.emit('session_start', session, { reason: 'resume' });
      expect(session.render().join('\n')).toContain('125 done · 17 failed');
    } finally {
      await resumed.emit('session_shutdown', session);
    }
  });

  it('replaces persisted totals on session switches, including an empty session', async () => {
    const history = env.createHistoryStore();
    for (const [id, sessionId, status] of [
      ['a-done-1', 'parent-a', 'completed'],
      ['a-done-2', 'parent-a', 'completed'],
      ['a-failed', 'parent-a', 'failed'],
      ['b-done', 'parent-b', 'completed'],
      ['b-failed-1', 'parent-b', 'failed'],
      ['b-failed-2', 'parent-b', 'failed'],
    ] as const)
      history.upsertTask(env.tmp, {
        id,
        session_id: sessionId,
        status,
        agent: 'worker',
        mode: 'task',
        task: 'session task',
        created_at: '2026-01-01T00:00:00Z',
      });
    const host = extensionHost();
    const session = workPanelSession(env.tmp);
    let sessionId = 'parent-a';
    session.ctx.sessionManager.getSessionId = () => sessionId;
    try {
      await host.emit('session_start', session);
      expect(session.render().join('\n')).toContain('2 done · 1 failed');
      sessionId = 'parent-b';
      await host.emit('session_start', session, { reason: 'switch' });
      expect(session.render().join('\n')).toContain('1 done · 2 failed');
      sessionId = 'empty-session';
      await host.emit('session_start', session, { reason: 'switch' });
      expect(session.render().join('\n')).not.toContain('Agents');
      sessionId = 'parent-a';
      await host.emit('session_start', session, { reason: 'resume' });
      expect(session.render().join('\n')).toContain('2 done · 1 failed');
    } finally {
      await host.emit('session_shutdown', session);
    }
  });
});
