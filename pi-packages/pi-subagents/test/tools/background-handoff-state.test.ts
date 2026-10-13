import { describe, expect, it, vi } from 'vitest';
import {
  installBackgroundHandoffShortcut,
  triggerTaskBackgroundHandoff,
  withBackgroundHandoffBarrier,
} from '../../src/tools/background-handoff-state.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('session question handoff barrier', () => {
  it('shares all tool-return barriers across concurrent questions without double-handoff', async () => {
    env.writeAgent('analyst');
    const finish = gate();
    const manager = env.createManager(async () => {
      await finish.promise;
      return { result: 'finished', model: 'mock/model', fallback_used: false };
    });
    const ctx = { cwd: env.tmp, sessionId: 'parent' };
    const first = manager.run(
      { agent: 'analyst', task: 'first', mode: 'task' },
      ctx,
    );
    const second = manager.run(
      { agent: 'analyst', task: 'second', mode: 'task' },
      ctx,
    );
    const tasks = manager.listTasks(env.tmp);
    const returned = [gate(), gate()];
    const callbacks = [vi.fn(), vi.fn()];
    const uninstall = tasks.map((task, index) =>
      installBackgroundHandoffShortcut(
        ctx,
        manager,
        () => [task.id],
        callbacks[index]!,
        returned[index]!.promise,
      ),
    );
    const delivered = vi.fn();
    const questions = tasks.map((task) =>
      triggerTaskBackgroundHandoff(manager, task.id).then(delivered),
    );
    try {
      expect(callbacks[0]).toHaveBeenCalledOnce();
      expect(callbacks[1]).toHaveBeenCalledOnce();
      expect(tasks.every((task) => task.mode === 'background')).toBe(true);
      returned[0]!.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(delivered).not.toHaveBeenCalled();
      returned[1]!.resolve();
      await Promise.all(questions);
      expect(delivered).toHaveBeenCalledTimes(2);
      expect(callbacks[0]).toHaveBeenCalledOnce();
      expect(callbacks[1]).toHaveBeenCalledOnce();
    } finally {
      for (const entry of returned) entry.resolve();
      for (const cleanup of uninstall) cleanup();
      finish.resolve();
      await Promise.all([first, second, ...questions]);
      await manager.close();
    }
  });

  it('includes late registrations in an in-flight session handoff', async () => {
    env.writeAgent('analyst');
    const finish = gate();
    const manager = env.createManager(async () => {
      await finish.promise;
      return { result: 'finished', model: 'mock/model', fallback_used: false };
    });
    const ctx = {
      cwd: env.tmp,
      sessionManager: { getSessionId: () => 'parent' },
    };
    const first = manager.run(
      { agent: 'analyst', task: 'first', mode: 'task' },
      ctx,
    );
    const firstId = manager.listTasks(env.tmp)[0]!.id;
    const firstReturned = gate();
    const lateReturned = gate();
    const cleanupFirst = installBackgroundHandoffShortcut(
      ctx,
      manager,
      () => [firstId],
      vi.fn(),
      firstReturned.promise,
    );
    const delivered = vi.fn();
    const question = triggerTaskBackgroundHandoff(manager, firstId).then(
      delivered,
    );
    let lateIds: string[] = [];
    const lateBackground = vi.fn();
    const cleanupLate = installBackgroundHandoffShortcut(
      ctx,
      manager,
      () => lateIds,
      lateBackground,
      lateReturned.promise,
    );
    const late = manager.run(
      { agent: 'analyst', task: 'late', mode: 'task' },
      ctx,
      undefined,
      (tasks) => {
        lateIds = tasks.map((task) => task.id);
      },
    );
    try {
      firstReturned.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(delivered).not.toHaveBeenCalled();
      expect(lateBackground).toHaveBeenCalledOnce();
      expect(manager.getTask(lateIds[0]!)).toMatchObject({
        mode: 'background',
        effective_mode: 'background',
      });
      lateReturned.resolve();
      await question;
      expect(delivered).toHaveBeenCalledOnce();
    } finally {
      firstReturned.resolve();
      lateReturned.resolve();
      cleanupFirst();
      cleanupLate();
      finish.resolve();
      await Promise.all([first, late, question]);
      await manager.close();
    }
  });

  it.each([
    'rejected',
    'aborted',
  ])('releases a %s foreground tool barrier without task IDs', async (reason) => {
    env.writeAgent('analyst');
    const finish = gate();
    const manager = env.createManager(async () => {
      await finish.promise;
      return { result: 'finished', model: 'mock/model', fallback_used: false };
    });
    const ctx = { cwd: env.tmp, sessionId: 'parent' };
    const initial = await manager.run(
      { agent: 'analyst', task: 'asking', mode: 'background' },
      ctx,
    );
    const controller = new AbortController();
    let rejectTool!: (error: Error) => void;
    const failure = new Promise<never>((_resolve, reject) => {
      rejectTool = reject;
    });
    controller.signal.addEventListener(
      'abort',
      () => rejectTool(new Error('aborted')),
      { once: true },
    );
    const execute = withBackgroundHandoffBarrier(async (toolReturned) => {
      const cleanup = installBackgroundHandoffShortcut(
        ctx,
        manager,
        () => [],
        vi.fn(),
        toolReturned,
      );
      try {
        return await failure;
      } finally {
        cleanup();
      }
    });
    const result = execute();
    const rejected = expect(result).rejects.toThrow(reason);
    const delivered = vi.fn();
    const question = triggerTaskBackgroundHandoff(
      manager,
      initial.task_ids[0]!,
    ).then(delivered);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(delivered).not.toHaveBeenCalled();
      if (reason === 'aborted') controller.abort();
      else rejectTool(new Error('rejected'));
      await rejected;
      await question;
      expect(delivered).toHaveBeenCalledOnce();
    } finally {
      rejectTool(new Error(reason));
      finish.resolve();
      await rejected;
      await question;
      await manager.close();
    }
  });

  it('does not hand off tasks that already completed', async () => {
    env.writeAgent('analyst');
    const manager = env.createManager(env.mockRunner(0));
    const ctx = { cwd: env.tmp, sessionId: 'parent' };
    const result = await manager.run(
      { agent: 'analyst', task: 'done', mode: 'task' },
      ctx,
    );
    const onBackground = vi.fn();
    const uninstall = installBackgroundHandoffShortcut(
      ctx,
      manager,
      () => result.task_ids,
      onBackground,
      Promise.resolve(),
    );
    try {
      expect(
        await triggerTaskBackgroundHandoff(manager, result.task_ids[0]!),
      ).toBe(false);
      expect(onBackground).not.toHaveBeenCalled();
      expect(manager.getTask(result.task_ids[0]!)).toMatchObject({
        mode: 'task',
        effective_mode: 'task',
        status: 'completed',
      });
    } finally {
      uninstall();
      await manager.close();
    }
  });
});
