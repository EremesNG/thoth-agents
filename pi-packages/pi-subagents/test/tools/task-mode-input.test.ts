import {
  ensureWorkPanel,
  registerWorkPanelProvider,
} from '@thoth-agents/pi-core';
import { describe, expect, it, vi } from 'vitest';
import { installBackgroundHandoffShortcut } from '../../src/tools/background-handoff-state.js';
import { installDoubleEscapeCancel } from '../../src/tools/subagent-run.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';
import { workPanelSession } from '../helpers/work-panel-fixture.js';

const env = installSubagentTestEnv();
const escapeKey = '\x1b';
const handoffKey = '\x08';

async function activeSession(host = true) {
  env.writeAgent('analyst');
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const manager = env.createManager(async () => {
    started();
    await gate;
    return { result: 'finished', model: 'mock/model', fallback_used: false };
  });
  const session = workPanelSession(env.tmp);
  const abort = vi.fn();
  const ctx = { ...session.ctx, abort };
  let closeDetail!: () => void;
  const unregister = host
    ? registerWorkPanelProvider(
        ctx as any,
        createSubagentsWorkPanelProvider({
          listTasks: () => manager.listTasks(env.tmp),
          onTaskUpdate: (notify) => manager.onTaskUpdate(notify),
          cancel: (id, reason) => manager.cancel(id, reason),
          open: () =>
            new Promise<void>((resolve) => {
              closeDetail = resolve;
            }),
        }),
      )
    : () => {};
  const release = host ? await ensureWorkPanel(ctx as any) : () => {};
  const run = manager.run(
    { agent: 'analyst', task: 'Keep working', mode: 'task' },
    ctx,
  );
  await running;
  const task = manager.listTasks(env.tmp)[0]!;
  const onCancel = vi.fn();
  const onBackground = vi.fn();
  const removeCancel = installDoubleEscapeCancel(ctx, manager, onCancel, () => [
    task.id,
  ]);
  const removeHandoff = installBackgroundHandoffShortcut(
    ctx,
    manager,
    () => [task.id],
    onBackground,
    Promise.resolve(),
  );
  return {
    ...session,
    abort,
    task,
    onCancel,
    onBackground,
    closeDetail: () => closeDetail?.(),
    async close() {
      removeHandoff();
      removeCancel();
      closeDetail?.();
      finish();
      await run;
      release();
      unregister();
    },
  };
}

describe('foreground task-mode terminal controls', () => {
  it.each([
    'overlay',
    'native dialog',
    'foreign custom UI',
    'non-editor focus',
    'replaced editor',
    'recreated editor',
    'work detail suspension',
  ])('lets Escape and the handoff key reach %s without side effects', async (guard) => {
    const session = await activeSession();
    try {
      if (guard === 'overlay') session.setOverlay(true);
      if (
        ['native dialog', 'foreign custom UI', 'non-editor focus'].includes(
          guard,
        )
      )
        session.focusOther();
      if (guard === 'replaced editor')
        session.ui.setEditorComponent(() => ({}));
      if (guard === 'recreated editor')
        session.ui.setEditorComponent(session.ui.getEditorComponent());
      if (guard === 'work detail suspension') {
        session.key('\x1b[D');
        session.key('\r');
      }
      for (const key of [escapeKey, escapeKey, handoffKey])
        expect(session.key(key)).toBeUndefined();
      expect(session.onCancel).not.toHaveBeenCalled();
      expect(session.onBackground).not.toHaveBeenCalled();
      expect(session.abort).not.toHaveBeenCalled();
      expect(session.task).toMatchObject({ status: 'running', mode: 'task' });
    } finally {
      await session.close();
    }
  });

  it.each([
    true,
    false,
  ])('keeps double-Escape cancellation working (host installed: %s)', async (host) => {
    const session = await activeSession(host);
    try {
      session.setText('a nonempty root prompt');
      expect(session.key('z')).toBeUndefined();
      expect(session.key(escapeKey)).toEqual({ consume: true });
      expect(session.onCancel).not.toHaveBeenCalled();
      expect(session.key(escapeKey)).toEqual({ consume: true });
      expect(session.onCancel).toHaveBeenCalledOnce();
      expect(session.abort).toHaveBeenCalledOnce();
      expect(session.task.status).toBe('stopping');
      expect(session.onBackground).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it.each([
    true,
    false,
  ])('keeps manual handoff working (host installed: %s)', async (host) => {
    const session = await activeSession(host);
    try {
      session.setText('a nonempty root prompt');
      expect(session.key(handoffKey)).toEqual({ consume: true });
      expect(session.onBackground).toHaveBeenCalledExactlyOnceWith([
        session.task,
      ]);
      expect(session.task).toMatchObject({
        status: 'running',
        mode: 'background',
      });
      expect(session.onCancel).not.toHaveBeenCalled();
      expect(session.abort).not.toHaveBeenCalled();
      expect(session.key(handoffKey)).toBeUndefined();
    } finally {
      await session.close();
    }
  });

  it('does not retain an armed Escape across focus loss and resumes handoff after suspension', async () => {
    const session = await activeSession();
    try {
      expect(session.key(escapeKey)).toEqual({ consume: true });
      session.setOverlay(true);
      expect(session.key(escapeKey)).toBeUndefined();
      session.setOverlay(false);
      expect(session.key(escapeKey)).toEqual({ consume: true });
      expect(session.onCancel).not.toHaveBeenCalled();
      session.key('\x1b[D');
      session.key('\r');
      expect(session.key(handoffKey)).toBeUndefined();
      session.closeDetail();
      await Promise.resolve();
      expect(session.key(handoffKey)).toEqual({ consume: true });
      expect(session.onBackground).toHaveBeenCalledOnce();
    } finally {
      await session.close();
    }
  });
});
