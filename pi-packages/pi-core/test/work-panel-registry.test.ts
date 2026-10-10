import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureWorkPanel,
  getWorkPanelSourceRows,
  invokeWorkPanelAction,
  isWorkPanelRootEditorInputActive,
  listWorkPanelSources,
  registerWorkPanelProvider,
  subscribeWorkPanelRegistry,
  WORK_PANEL_VERSION,
} from '../src/index.js';
import { provider, uiSession } from './work-panel-fixture.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

describe('work panel actions', () => {
  it.each([
    'missing',
    'no host',
    'uninstalled',
    'disposed',
    'other manager',
    'other session',
    'non-UI',
    'non-TUI',
    'manager getter',
    'session getter',
    'UI getter',
    'hasUI getter',
    'mode getter',
  ] as const)('rejects %s contexts without calling the provider', async (guard) => {
    const session = uiSession();
    const open = vi.fn();
    const source = { ...provider('guarded'), open };
    const unregister = registerWorkPanelProvider(session.ctx, source);
    cleanups.push(unregister);
    if (guard !== 'no host') {
      if (guard === 'uninstalled')
        delete (session.ui as Partial<typeof session.ui>).onTerminalInput;
      const release = await ensureWorkPanel(session.ctx);
      cleanups.push(release);
      if (guard === 'disposed') release();
    }
    let live = { ...session.ctx };
    if (guard === 'missing') live = undefined as unknown as typeof live;
    if (guard === 'other manager') live = uiSession().ctx;
    if (guard === 'other session')
      vi.spyOn(session.ctx.sessionManager, 'getSessionId').mockReturnValue(
        'stale',
      );
    if (guard === 'non-UI') live.hasUI = false;
    if (guard === 'non-TUI') live.mode = 'rpc';
    if (guard === 'session getter') {
      const spy = vi
        .spyOn(session.ctx.sessionManager, 'getSessionId')
        .mockImplementation(() => {
          throw new Error('stale');
        });
      cleanups.push(() => spy.mockRestore());
    }
    const property = new Map([
      ['manager getter', 'sessionManager'],
      ['UI getter', 'ui'],
      ['hasUI getter', 'hasUI'],
      ['mode getter', 'mode'],
    ]).get(guard);
    if (property)
      Object.defineProperty(live, property, {
        get: () => {
          throw new Error('stale');
        },
      });
    expect(
      await invokeWorkPanelAction(live, 'guarded', 'guarded-1', 'open'),
    ).toBe('unavailable');
    expect(open).not.toHaveBeenCalled();
  });

  it('opens history through the suspended host path and performs explicit close while rejecting missing items and no-op actions', async () => {
    const session = uiSession();
    let done!: () => void;
    const openHistory = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        }),
    );
    const source = { ...provider('commands'), openHistory };
    cleanups.push(
      registerWorkPanelProvider(session.ctx, source),
      await ensureWorkPanel(session.ctx),
    );
    const pending = invokeWorkPanelAction(
      session.ctx,
      'commands',
      undefined,
      'history',
    );
    expect(openHistory).toHaveBeenCalledExactlyOnceWith(session.ctx);
    expect(session.key('\x1b[D')).toBeUndefined();
    done();
    expect(await pending).toBe('ok');
    expect(
      await invokeWorkPanelAction(
        session.ctx,
        'commands',
        'commands-1',
        'close',
      ),
    ).toBe('ok');
    expect(source.close).toHaveBeenCalledExactlyOnceWith('commands-1');
    expect(
      await invokeWorkPanelAction(session.ctx, 'missing', 'commands-1', 'open'),
    ).toBe('missing');
    expect(
      await invokeWorkPanelAction(session.ctx, 'commands', 'missing', 'open'),
    ).toBe('missing');
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('noop'),
        armCloseLabel: () => '',
      }),
    );
    expect(
      await invokeWorkPanelAction(session.ctx, 'noop', undefined, 'history'),
    ).toBe('unavailable');
    expect(
      await invokeWorkPanelAction(session.ctx, 'noop', 'noop-1', 'close'),
    ).toBe('unavailable');
    expect(
      await invokeWorkPanelAction(
        { ...session.ctx, hasUI: false },
        'commands',
        'commands-1',
        'close',
      ),
    ).toBe('ok');
  });

  it('clears suspension if the host context becomes stale during action startup', async () => {
    const session = uiSession();
    const open = vi.fn();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('stale-startup'),
        open,
      }),
      await ensureWorkPanel(session.ctx),
    );
    const spy = vi
      .spyOn(session.ctx.sessionManager, 'getSessionId')
      .mockImplementation(() => {
        throw new Error('stale');
      });
    spy.mockImplementationOnce(() => 'test-session');
    cleanups.push(() => spy.mockRestore());
    expect(
      await invokeWorkPanelAction(
        session.ctx,
        'stale-startup',
        'stale-startup-1',
        'open',
      ),
    ).toBe('unavailable');
    expect(open).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
  });

  it('does not close parent rows through discovery actions', async () => {
    const session = uiSession();
    const source = {
      ...provider('parent-actions'),
      parentRow: () => ({ id: 'parent', primary: 'Parent work' }),
    };
    cleanups.push(
      registerWorkPanelProvider(session.ctx, source),
      await ensureWorkPanel(session.ctx),
    );
    expect(
      await invokeWorkPanelAction(
        session.ctx,
        'parent-actions',
        'parent',
        'close',
      ),
    ).toBe('unavailable');
    expect(source.close).not.toHaveBeenCalled();
  });

  it('opens a retained hidden row in the generic detail card and owns completion', async () => {
    const session = uiSession();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('hidden-detail'),
        retention: 'prompt',
        summary: () => ({ completed: 1 }),
        listRows: () => [
          { id: 'old', primary: 'Old task', state: 'done', endedAt: 0 },
        ],
        detail: () => ({
          id: 'old',
          title: 'Old task detail',
          metadata: [],
          evidence: { label: 'output', text: 'done' },
        }),
      }),
      await ensureWorkPanel(session.ctx),
    );
    const pending = invokeWorkPanelAction(
      session.ctx,
      'hidden-detail',
      'old',
      'open',
    );
    expect(session.customRender().join('\n')).toContain('Old task detail');
    expect(session.key('\x1b[D')).toBeUndefined();
    session.customKey('\x1b');
    expect(await pending).toBe('ok');
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
  });
  it.each([
    'resolve',
    'reject',
    'throw',
  ] as const)('uses the caller live context and suspends host input until open %s', async (ending) => {
    const session = uiSession();
    let resolve!: () => void;
    let reject!: (reason: Error) => void;
    const open = vi.fn(() => {
      if (ending === 'throw') throw new Error('open failed');
      return new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
      });
    });
    cleanups.push(
      registerWorkPanelProvider(session.ctx, { ...provider('actions'), open }),
      await ensureWorkPanel(session.ctx),
    );
    const live = { ...session.ctx, ui: { ...session.ctx.ui } };
    const pending = invokeWorkPanelAction(live, 'actions', 'actions-1', 'open');
    expect(open).toHaveBeenCalledExactlyOnceWith('actions-1', live);
    if (ending !== 'throw') {
      expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(false);
      expect(session.key('\x1b[D')).toBeUndefined();
      expect(
        await invokeWorkPanelAction(live, 'actions', 'actions-1', 'open'),
      ).toBe('unavailable');
      if (ending === 'resolve') resolve();
      else reject(new Error('open failed'));
    }
    expect(await pending).toBe(ending === 'resolve' ? 'ok' : 'unavailable');
    expect(isWorkPanelRootEditorInputActive(session.ctx)).toBe(true);
    expect(session.key('\x1b[A')).toBeUndefined();
    expect(session.key('\x1b[D')).toEqual({ consume: true });
  });
});

describe('work panel discovery', () => {
  it('reads provider-ordered data rows within the requested maximum and source cap without UI', () => {
    const session = uiSession();
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      primary: `Task ${index}`,
      segments: [{ text: 'Done', role: 'dim' as const }],
    }));
    const listRows = vi.fn(() => rows);
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('bounded'),
        rowCap: 2,
        listRows,
      }),
    );
    expect(getWorkPanelSourceRows('bounded', { maxRows: 4 })).toEqual(
      rows.slice(0, 2),
    );
    expect(getWorkPanelSourceRows('bounded', { maxRows: 1.9 })).toEqual(
      rows.slice(0, 1),
    );
    for (const maxRows of [0, -1, NaN, Infinity])
      expect(getWorkPanelSourceRows('bounded', { maxRows })).toEqual([]);
    expect(getWorkPanelSourceRows('missing', { maxRows: 3 })).toEqual([]);
    expect(listRows).toHaveBeenCalledWith(expect.any(Number));
    expect(session.ui.setWidget).not.toHaveBeenCalled();
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider('broken'),
        listRows: () => {
          throw new Error('list failed');
        },
      }),
    );
    expect(getWorkPanelSourceRows('broken', { maxRows: 3 })).toEqual([]);
  });

  it('releases a subscription replaced by a listener during synchronous provider subscription', () => {
    const session = uiSession();
    const id = 'subscribe-reentry';
    const unsubscribe = vi.fn();
    let replaced = false;
    cleanups.push(
      subscribeWorkPanelRegistry((changedId) => {
        if (
          changedId !== id ||
          replaced ||
          listWorkPanelSources()[0]?.revision !== 2
        )
          return;
        replaced = true;
        cleanups.push(
          registerWorkPanelProvider(session.ctx, {
            ...provider(id),
            label: 'Replacement',
          }),
        );
      }),
    );
    cleanups.push(
      registerWorkPanelProvider(session.ctx, {
        ...provider(id),
        onVisibleChanged: (notify) => {
          notify();
          return unsubscribe;
        },
      }),
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(listWorkPanelSources()).toMatchObject([
      { id, label: 'Replacement', revision: 3 },
    ]);
  });

  it('allows a listener to replace a source without stale ownership or revision rollback', () => {
    const session = uiSession();
    const id = 'reentrant';
    let replaced = false;
    cleanups.push(
      subscribeWorkPanelRegistry((changedId) => {
        if (changedId !== id || replaced) return;
        replaced = true;
        cleanups.push(
          registerWorkPanelProvider(session.ctx, {
            ...provider(id),
            label: 'Replacement',
          }),
        );
      }),
    );
    const stale = registerWorkPanelProvider(session.ctx, provider(id));
    cleanups.push(stale);
    stale();
    expect(listWorkPanelSources()).toMatchObject([
      { id, label: 'Replacement', revision: 2 },
    ]);
  });
  it('publishes synchronous isolated changes and continues per-source revisions across replacement and removal', () => {
    const session = uiSession();
    const id = 'registry-agents';
    let notify = () => {};
    const source = {
      ...provider(id),
      selectableHeading: true,
      rowCap: 2,
      onVisibleChanged: (listener: () => void) => {
        notify = listener;
        return () => {};
      },
    };
    expect(listWorkPanelSources()).toEqual([]);
    const events: Array<[string, number | undefined]> = [];
    cleanups.push(
      subscribeWorkPanelRegistry(() => {
        throw new Error('listener failed');
      }),
    );
    const unsubscribe = subscribeWorkPanelRegistry((changedId) => {
      events.push([
        changedId,
        listWorkPanelSources().find((item) => item.id === changedId)?.revision,
      ]);
    });
    cleanups.push(unsubscribe);
    const unregister = registerWorkPanelProvider(session.ctx, source);
    cleanups.push(unregister);
    expect(listWorkPanelSources()).toEqual([
      {
        id,
        label: 'Agents',
        priority: 10,
        version: WORK_PANEL_VERSION,
        revision: 1,
        selectableHeading: true,
        selectableSummary: false,
        rowCap: 2,
      },
    ]);
    notify();
    notify();
    const staleNotify = notify;
    const replacement = registerWorkPanelProvider(session.ctx, source);
    cleanups.push(replacement);
    unregister();
    staleNotify();
    expect(events).toEqual([
      [id, 1],
      [id, 2],
      [id, 3],
      [id, 4],
    ]);
    replacement();
    cleanups.push(registerWorkPanelProvider(session.ctx, source));
    expect(events.slice(-2)).toEqual([
      [id, undefined],
      [id, 5],
    ]);
    unsubscribe();
    notify();
    expect(events).toHaveLength(6);
  });
});

it('discovers isolated data-only provider summaries without changing revisions', () => {
  const { ctx } = uiSession();
  const summary = {
    running: 2,
    completed: 3,
    failed: 1,
    total: 6,
    text: '2 active',
    segments: [],
    extra: () => {},
  };
  cleanups.push(
    registerWorkPanelProvider(ctx, {
      ...provider('summary'),
      summary: () => summary,
    }),
  );
  cleanups.push(
    registerWorkPanelProvider(ctx, {
      ...provider('broken-summary'),
      summary: () => {
        throw new Error('broken');
      },
    }),
  );
  const sources = listWorkPanelSources();
  expect(sources.find(({ id }) => id === 'summary')?.summary).toEqual({
    running: 2,
    completed: 3,
    failed: 1,
    total: 6,
    text: '2 active',
  });
  expect(
    sources.find(({ id }) => id === 'broken-summary')?.summary,
  ).toBeUndefined();
  expect(listWorkPanelSources().map(({ revision }) => revision)).toEqual(
    sources.map(({ revision }) => revision),
  );
  summary.running = 9;
  expect(sources.find(({ id }) => id === 'summary')?.summary?.running).toBe(2);
});

it('normalizes string summaries and filters non-data fields', () => {
  const { ctx } = uiSession();
  cleanups.push(
    registerWorkPanelProvider(ctx, {
      ...provider('text-summary'),
      summary: () => '1/2',
    }),
  );
  cleanups.push(
    registerWorkPanelProvider(ctx, {
      ...provider('invalid-summary'),
      summary: () => ({
        running: NaN,
        total: Infinity,
        text: 'valid',
        completed: 1,
      }),
    }),
  );
  expect(
    listWorkPanelSources().find(({ id }) => id === 'text-summary')?.summary,
  ).toEqual({ text: '1/2' });
  expect(
    listWorkPanelSources().find(({ id }) => id === 'invalid-summary')?.summary,
  ).toEqual({ text: 'valid', completed: 1 });
});
