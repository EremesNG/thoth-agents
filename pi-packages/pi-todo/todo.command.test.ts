import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { bindWorkPanelLifecycle } from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getState, replaceState } from './state/store.js';
import { createMockCtx, createMockPi, createMockUI } from './test/helpers.js';
import {
  __resetState,
  registerTodosCommand,
  registerTodoTool,
  TOOL_NAME,
} from './todo.js';

function setup() {
  __resetState();
  const { pi, captured } = createMockPi();
  registerTodoTool(pi);
  registerTodosCommand(pi);
  const tool = captured.tools.get(TOOL_NAME);
  if (!tool) throw new Error('tool not registered');
  const cmd = captured.commands.get('todos');
  if (!cmd) throw new Error('command not registered');
  return { tool, cmd, pi, captured };
}

async function seed(
  tool: ReturnType<typeof setup>['tool'],
  actions: Array<Record<string, unknown>>,
) {
  const ctx = createMockCtx();
  for (const p of actions) {
    await tool.execute?.(
      'tc',
      p as never,
      undefined as never,
      undefined as never,
      ctx as never,
    );
  }
}

beforeEach(() => {
  __resetState();
});
afterEach(() => {
  __resetState();
  vi.restoreAllMocks();
});

describe('/todos command — registration', () => {
  it("registers a command named 'todos' with a description", () => {
    const { cmd } = setup();
    expect(cmd.description).toContain('todos');
  });
});

describe('/todos command — guard branches', () => {
  it('notifies an error when the session has no UI', async () => {
    const { cmd } = setup();
    const ctx = createMockCtx({ hasUI: false });
    await cmd.handler('', ctx as never);
    const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('interactive'),
      'error',
    );
  });

  it('notifies an info message when there are no visible tasks', async () => {
    const { cmd } = setup();
    const ctx = createMockCtx({ hasUI: true });
    await cmd.handler('', ctx as never);
    const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('No todos'),
      'info',
    );
  });

  it('keeps completed-only archived history across epochs and alongside new work', async () => {
    const { cmd, pi, captured } = setup();
    const ctx = createMockCtx();
    const dispose = bindWorkPanelLifecycle(pi, ctx);
    const archived = {
      id: 1,
      subject: 'Design',
      status: 'completed' as const,
      archivedAt: 100,
      group: 'release',
    };
    replaceState('test-session', { tasks: [archived], nextId: 2 });
    try {
      await cmd.handler('', ctx as never);
      expect(ctx.ui.notify).toHaveBeenLastCalledWith(
        expect.stringContaining('✓ #1 release · Design'),
        'info',
      );
      for (const handler of captured.events.get('input') ?? [])
        await handler(
          { source: 'interactive', text: 'next job' } as never,
          ctx as never,
        );
      for (const handler of captured.events.get('before_agent_start') ?? [])
        await handler({ prompt: 'next job' } as never, ctx as never);
      await cmd.handler('', ctx as never);
      expect(ctx.ui.notify).toHaveBeenLastCalledWith(
        expect.stringContaining('✓ #1 release · Design'),
        'info',
      );
      expect(getState('test-session').tasks).toEqual([archived]);

      replaceState('test-session', {
        tasks: [archived, { id: 2, subject: 'Build', status: 'pending' }],
        nextId: 3,
      });
      await cmd.handler('', ctx as never);
      expect(ctx.ui.notify).toHaveBeenLastCalledWith(
        expect.stringContaining('✓ #1 release · Design'),
        'info',
      );
    } finally {
      dispose();
    }
  });

  it('treats all-deleted tasks as empty (info notify, not group render)', async () => {
    const { tool, cmd } = setup();
    await seed(tool, [
      { action: 'create', subject: 'a' },
      { action: 'update', id: 1, status: 'deleted' },
    ]);
    const ctx = createMockCtx({ hasUI: true });
    await cmd.handler('', ctx as never);
    const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('No todos'),
      'info',
    );
  });
});

describe('/todos command — grouped output', () => {
  function grabOutput(ctx: ExtensionContext): string {
    const notify = ctx.ui.notify as ReturnType<typeof vi.fn>;
    expect(notify).toHaveBeenCalledTimes(1);
    const [text, level] = notify.mock.calls[0];
    expect(level).toBe('info');
    return text as string;
  }

  it('lists archived tasks under Completed with explicit and inferred groups in status order', async () => {
    const { cmd } = setup();
    const state = {
      tasks: [
        {
          id: 1,
          subject: 'Design',
          status: 'completed' as const,
          archivedAt: 100,
          group: 'release',
        },
        {
          id: 2,
          subject: 'pi-1.4 AC-1: Build',
          status: 'in_progress' as const,
          activeForm: 'Building',
        },
        { id: 3, subject: 'pi-1.4: Ship', status: 'pending' as const },
        { id: 4, subject: 'solo: Announce', status: 'pending' as const },
        { id: 5, subject: 'Deleted', status: 'deleted' as const },
      ],
      nextId: 6,
    };
    replaceState('test-session', state);
    const ctx = createMockCtx();
    await cmd.handler('', ctx as never);
    const out = grabOutput(ctx);
    expect(out).toContain('✓ #1 release · Design');
    expect(out).toContain('◇ #2 pi-1.4 · AC-1: Build (Building)');
    expect(out).toContain('○ #3 pi-1.4 · Ship');
    expect(out).toContain('○ #4 solo: Announce');
    expect(out).not.toContain('Deleted');
    expect(out).toContain('1/4 completed · 1 in progress · 2 pending');
    expect(out.indexOf('── In Progress')).toBeLessThan(
      out.indexOf('── Pending'),
    );
    expect(out.indexOf('── Pending')).toBeLessThan(out.indexOf('── Completed'));
    expect(getState('test-session')).toEqual(state);
  });

  it('sanitizes group labels in text output', async () => {
    const { cmd } = setup();
    replaceState('test-session', {
      tasks: [
        {
          id: 1,
          subject: 'Design',
          status: 'pending',
          group: 'release\u001b]52;c;group-secret\u0007',
        },
      ],
      nextId: 2,
    });
    const ctx = createMockCtx();
    await cmd.handler('', ctx as never);
    const out = grabOutput(ctx);
    expect(out).toContain('○ #1 release · Design');
    expect(out).not.toContain('group-secret');
    expect(out).not.toContain('\u001b');
  });

  it("renders 'Pending' group with ○ glyph and task id", async () => {
    const { tool, cmd } = setup();
    await seed(tool, [{ action: 'create', subject: 'research' }]);
    const ctx = createMockCtx({ hasUI: true });
    await cmd.handler('', ctx as never);
    const out = grabOutput(ctx);
    expect(out).toContain('── Pending ──');
    expect(out).toContain('○ #1 research');
    expect(out).toContain('1 pending');
  });

  it("renders 'In Progress' group with ◇ glyph and activeForm suffix", async () => {
    const { tool, cmd } = setup();
    await seed(tool, [
      { action: 'create', subject: 'build', activeForm: 'Building' },
      { action: 'update', id: 1, status: 'in_progress' },
    ]);
    const ctx = createMockCtx({ hasUI: true });
    await cmd.handler('', ctx as never);
    const out = grabOutput(ctx);
    expect(out).toContain('── In Progress ──');
    expect(out).toContain('◇ #1 build (Building)');
    expect(out).toContain('1 in progress');
  });

  it("renders 'Completed' group with ✓ glyph and 'N/M completed' header", async () => {
    const { tool, cmd } = setup();
    await seed(tool, [
      { action: 'create', subject: 'ship' },
      { action: 'update', id: 1, status: 'completed' },
    ]);
    const ctx = createMockCtx({ hasUI: true });
    await cmd.handler('', ctx as never);
    const out = grabOutput(ctx);
    expect(out).toContain('── Completed ──');
    expect(out).toContain('✓ #1 ship');
    expect(out).toContain('1/1 completed');
  });

  it("emits the header parts in 'completed · in progress · pending' order", async () => {
    const { tool, cmd } = setup();
    await seed(tool, [
      { action: 'create', subject: 'p' },
      { action: 'create', subject: 'ip' },
      { action: 'update', id: 2, status: 'in_progress' },
      { action: 'create', subject: 'done' },
      { action: 'update', id: 3, status: 'completed' },
    ]);
    const ctx = createMockCtx({ hasUI: true });
    await cmd.handler('', ctx as never);
    const out = grabOutput(ctx);
    const header = out.split('\n')[0];
    const iC = header.indexOf('completed');
    const iIP = header.indexOf('in progress');
    const iP = header.indexOf('pending');
    expect(iC).toBeGreaterThanOrEqual(0);
    expect(iIP).toBeGreaterThan(iC);
    expect(iP).toBeGreaterThan(iIP);
  });

  it("appends '⛓ #deps' suffix for tasks with blockedBy", async () => {
    const { tool, cmd } = setup();
    await seed(tool, [
      { action: 'create', subject: 'base' },
      { action: 'create', subject: 'follow-up', blockedBy: [1] },
    ]);
    const ctx = createMockCtx({ hasUI: true });
    await cmd.handler('', ctx as never);
    const out = grabOutput(ctx);
    expect(out).toContain('⛓ #1');
  });

  it('omits deleted tombstones from the grouped output', async () => {
    const { tool, cmd } = setup();
    await seed(tool, [
      { action: 'create', subject: 'keep' },
      { action: 'create', subject: 'drop' },
      { action: 'update', id: 2, status: 'deleted' },
    ]);
    const ctx = createMockCtx({ hasUI: true });
    await cmd.handler('', ctx as never);
    const out = grabOutput(ctx);
    expect(out).toContain('keep');
    expect(out).not.toContain('drop');
  });
});

it('/todos uses kit status glyphs and separators without changing execution results', async () => {
  const { registerRenderKit, withdrawRenderKit } = await import(
    '@thoth-agents/pi-core'
  );
  const { createTestRenderKit } = await import('@thoth-agents/pi-core/testing');
  const { tool, cmd } = setup();
  await seed(tool, [
    { action: 'create', subject: 'wait' },
    { action: 'create', subject: 'ship' },
    { action: 'update', id: 2, status: 'in_progress' },
  ]);
  const ctx = createMockCtx();
  const before = await tool.execute(
    'tc',
    { action: 'list' },
    undefined,
    undefined,
    ctx,
  );
  const kit = createTestRenderKit({
    icon: (name) =>
      name === 'separator' ? '|' : name === 'taskInProgress' ? '*' : name,
  });
  kit.statusGlyph = (_theme, status) => (status === 'pending' ? '-' : '*');
  const token = registerRenderKit(kit, {});
  try {
    await cmd.handler('', ctx as never);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('  - #1 wait'),
      'info',
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('  * #2 ship'),
      'info',
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('1 in progress | 1 pending'),
      'info',
    );
    const after = await tool.execute(
      'tc',
      { action: 'list' },
      undefined,
      undefined,
      ctx,
    );
    expect(after).toEqual(before);
  } finally {
    withdrawRenderKit(token);
  }
});

describe('/todos command — panel', () => {
  async function seeded() {
    const { tool, cmd } = setup();
    await seed(tool, [
      { action: 'create', subject: 'research' },
      { action: 'create', subject: 'build' },
      { action: 'update', id: 2, status: 'completed' },
    ]);
    return cmd;
  }

  it('opens the task list panel when the interactive TUI offers custom UI', async () => {
    const cmd = await seeded();
    const custom = vi.fn(async () => undefined);
    const ctx = createMockCtx({
      mode: 'tui',
      ui: createMockUI({ custom } as never),
    });
    await cmd.handler('', ctx as never);
    expect(custom).toHaveBeenCalledTimes(1);
    expect(custom.mock.calls[0]).toMatchObject([
      expect.any(Function),
      { overlay: true },
    ]);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it('keeps the text output without custom UI', async () => {
    const cmd = await seeded();
    for (const ctx of [
      createMockCtx({ mode: 'tui' }),
      createMockCtx({
        mode: 'rpc',
        ui: createMockUI({ custom: vi.fn() } as never),
      }),
    ]) {
      await cmd.handler('', ctx as never);
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('1/2 completed'),
        'info',
      );
    }
  });
});
