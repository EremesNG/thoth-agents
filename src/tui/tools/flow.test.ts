import { describe, expect, it, vi } from 'vitest';
import type { ToolState } from '../../opencode/tool-rpc';
import { makeToolState } from './fixtures';
import { runToolsFlow, type ToolsFlowPorts } from './flow';

type Opt = {
  title: string;
  value: unknown;
  disabled?: boolean;
  description?: string;
};
type Step = (
  options: readonly Opt[],
  title: string,
  current?: unknown,
) => unknown;

const choose =
  (text: string): Step =>
  (options) => {
    const match = options.find((o) => o.title.includes(text));
    if (!match)
      throw new Error(
        `no option "${text}" in ${options.map((o) => o.title).join(' | ')}`,
      );
    return match.value;
  };
const esc: Step = () => undefined;

function harness(
  steps: Step[],
  opts: {
    prompts?: (string | undefined)[];
    confirms?: boolean[];
    rpc?: Partial<ToolsFlowPorts['rpc']>;
  } = {},
) {
  let state = makeToolState();
  const prompts = [...(opts.prompts ?? [])];
  const confirms = [...(opts.confirms ?? [])];
  const toasts: string[] = [];
  const titles: string[] = [];
  const queue = [...steps];
  const current = async () => ({ ok: true as const, value: state });
  const rpc = {
    state: vi.fn(current),
    save: vi.fn(current),
    reset: vi.fn(current),
    ...opts.rpc,
  } as ToolsFlowPorts['rpc'];
  const ports: ToolsFlowPorts = {
    rpc,
    ui: {
      select: (async (o: {
        options: readonly Opt[];
        title: string;
        current?: unknown;
      }) => {
        const step = queue.shift();
        if (!step) throw new Error(`unexpected select: ${o.title}`);
        titles.push(o.title);
        return step(o.options, o.title, o.current);
      }) as never,
      prompt: async () => prompts.shift(),
      confirm: async () => confirms.shift(),
      alert: async () => undefined,
      toast: { show: (o) => toasts.push(o.message) },
    },
  };
  return {
    run: async () => {
      await runToolsFlow(ports);
      expect(queue).toHaveLength(0);
    },
    rpc,
    toasts,
    titles,
    setState: (next: ToolState) => {
      state = next;
    },
  };
}

describe('tool permissions flow', () => {
  it('lists the five specialists with summaries and scope markers', async () => {
    const h = harness([
      (options) => {
        expect(options.map((o) => o.value)).toEqual([
          'explorer',
          'librarian',
          'oracle',
          'designer',
          'worker',
        ]);
        expect(options[0]).toMatchObject({
          description: '2 denied, 1 ask',
        });
        expect(options[0].title).toMatch(/^G /);
        expect(options[3].title).toMatch(/^P /);
        return undefined;
      },
    ]);
    await h.run();
    expect(h.rpc.state).toHaveBeenCalledWith({});
  });

  it('defaults scope to the effective scope and edits inherit/allow/ask/deny', async () => {
    const h = harness([
      choose('explorer'),
      (options) => {
        expect(options.find((o) => o.title === 'global')).toBeTruthy();
        return 'global';
      },
      (options, title) => {
        expect(title).toContain('explorer (global)');
        const bash = options.find((o) => o.title.includes('bash'));
        expect(bash?.description).toContain('default (inherited)');
        const gh = options.find((o) => o.title.includes('github'));
        expect(gh?.description).toBe(
          'via github* · github_search, github_issue',
        );
        return choose('bash')(options, title);
      },
      choose('deny'), // set bash deny
      choose('webfetch'),
      choose('Inherit'), // drop webfetch
      (options) => {
        expect(options.find((o) => o.title.includes('Save'))).toBeTruthy();
        expect(
          options.find((o) => o.title.includes('deny  bash'))?.title,
        ).toContain('*');
        return choose('Save changes')(options, '');
      },
      choose('Back'),
      esc,
    ]);
    await h.run();
    expect(h.rpc.save).toHaveBeenCalledWith({
      scope: 'global',
      role: 'explorer',
      baseRevision: 'g1',
      overrides: [
        { action: 'github*', effect: 'ask' },
        { action: 'mcp_gone_*', effect: 'deny' },
        { action: 'bash', effect: 'deny' },
      ],
    });
  });

  it('preselects project scope for a role whose project replaces global', async () => {
    const seen: unknown[] = [];
    const h = harness([
      choose('designer'),
      (options, title, current) => {
        seen.push(current, title);
        return options[1].value;
      },
      esc,
      esc,
    ]);
    await h.run();
    expect(seen[0]).toBe('project');
    expect(seen[1]).toContain('project replaces global');
  });

  it('shows a toast for the locked subagent row', async () => {
    const h = harness([
      choose('worker'),
      choose('global'),
      (options, title) => {
        const row = options.find((o) => o.title.includes('subagent'));
        expect(row?.description).toContain('locked');
        return choose('subagent')(options, title);
      },
      esc,
      esc,
    ]);
    await h.run();
    expect(h.toasts.join()).toContain('subagent is locked');
    expect(h.rpc.save).not.toHaveBeenCalled();
  });

  it('adds a pattern with live match count and manual-entry list', async () => {
    const h = harness(
      [
        choose('worker'),
        choose('global'),
        (options, title) => {
          expect(
            options.filter((o) => (o as { category?: string }).category),
          ).not.toHaveLength(0);
          return choose('Add pattern')(options, title);
        },
        (_o, title) => {
          expect(title).toContain('github_x* matches 0 actions');
          return 'edit';
        },
        (_o, title) => {
          expect(title).toContain('github* matches 1 action');
          return 'deny';
        },
        (options, title) => {
          expect(
            options.find((o) => o.title.includes('github*'))?.description,
          ).toBe('matches 1 action');
          return choose('Save changes')(options, title);
        },
        choose('Back'),
        esc,
      ],
      { prompts: ['  ', 'subagent', 'github_x*', 'github*'] },
    );
    await h.run();
    expect(h.toasts[0]).toMatch(/Enter/);
    expect(h.toasts[1]).toMatch(/locked/);
    expect(h.rpc.save).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: [{ action: 'github*', effect: 'deny' }],
      }),
    );
  });

  it('removes manual entries and keeps no-match entries visible', async () => {
    const h = harness([
      choose('explorer'),
      choose('global'),
      (options, title) => {
        expect(
          options.find((o) => o.title.includes('mcp_gone_*'))?.description,
        ).toContain('no registered tool');
        return choose('mcp_gone_*')(options, title);
      },
      choose('Remove entry'),
      choose('Back'),
      choose('Discard'),
      esc,
    ]);
    await h.run();
    expect(h.rpc.save).not.toHaveBeenCalled();
  });

  it('settles dirty drafts on leave: keep editing, then save', async () => {
    const h = harness([
      choose('worker'),
      choose('global'),
      choose('bash'),
      choose('deny'),
      choose('Back'),
      choose('Keep editing'),
      choose('Back'),
      choose('Save'),
      esc,
    ]);
    await h.run();
    expect(h.rpc.save).toHaveBeenCalledOnce();
  });

  it('discarding on leave does not save', async () => {
    const h = harness([
      choose('worker'),
      choose('global'),
      choose('bash'),
      choose('deny'),
      choose('Back'),
      choose('Discard'),
      esc,
    ]);
    await h.run();
    expect(h.rpc.save).not.toHaveBeenCalled();
  });

  it('resets to defaults after confirmation', async () => {
    const h = harness(
      [
        choose('explorer'),
        choose('global'),
        choose('Reset to defaults'),
        choose('Back'),
        esc,
      ],
      { confirms: [true] },
    );
    await h.run();
    expect(h.rpc.reset).toHaveBeenCalledWith({
      scope: 'global',
      role: 'explorer',
      baseRevision: 'g1',
    });
  });

  it('does not reset when cancelled', async () => {
    const h = harness(
      [
        choose('explorer'),
        choose('global'),
        choose('Reset to defaults'),
        choose('Back'),
        esc,
      ],
      { confirms: [false] },
    );
    await h.run();
    expect(h.rpc.reset).not.toHaveBeenCalled();
  });

  it('offers reload on TOOLS_CONFLICT and keeps the draft otherwise', async () => {
    const conflict = async () => ({
      ok: false as const,
      error: { code: 'TOOLS_CONFLICT' as const, message: 'changed' },
    });
    const keep = harness(
      [
        choose('worker'),
        choose('global'),
        choose('bash'),
        choose('deny'),
        choose('Save changes'),
        (options) => {
          expect(
            options.find((o) => o.title.includes('deny  bash'))?.title,
          ).toContain('*');
          return choose('Back')(options, '');
        },
        choose('Discard'),
        esc,
      ],
      { rpc: { save: conflict }, confirms: [false] },
    );
    await keep.run();

    const reload = harness(
      [
        choose('worker'),
        choose('global'),
        choose('bash'),
        choose('deny'),
        choose('Save changes'),
        (options) => {
          expect(options.find((o) => o.title.includes('Save'))).toBeUndefined();
          return choose('Back')(options, '');
        },
        esc,
      ],
      { rpc: { save: conflict }, confirms: [true] },
    );
    await reload.run();
    expect(reload.rpc.state).toHaveBeenCalledTimes(2);
  });

  it('reports errors as CODE: message toasts', async () => {
    const h = harness(
      [
        choose('worker'),
        choose('global'),
        choose('bash'),
        choose('deny'),
        choose('Save changes'),
        choose('Back'),
        choose('Discard'),
        esc,
      ],
      {
        rpc: {
          save: async () => ({
            ok: false as const,
            error: { code: 'INVALID_REQUEST' as const, message: 'nope' },
          }),
        },
      },
    );
    await h.run();
    expect(h.toasts).toContain('INVALID_REQUEST: nope');
  });

  it('toasts when state cannot be loaded', async () => {
    const h = harness([], {
      rpc: {
        state: async () => ({
          ok: false as const,
          error: { code: 'OPERATION_FAILED' as const, message: 'boom' },
        }),
      },
    });
    await h.run();
    expect(h.toasts).toEqual(['OPERATION_FAILED: boom']);
  });

  it('saves an empty project list to mask global overrides', async () => {
    const h = harness([
      choose('explorer'),
      choose('project'),
      (options, title) => {
        expect(title).toContain('project entry absent');
        expect(
          options.find((o) => o.title.includes('webfetch'))?.description,
        ).toContain('global override');
        expect(options.find((o) => o.title.includes('Save'))).toBeUndefined();
        return choose('Mask global overrides')(options, title);
      },
      (options, title) => {
        expect(title).toContain('masks global');
        return choose('Save changes')(options, title);
      },
      choose('Back'),
      esc,
    ]);
    await h.run();
    expect(h.rpc.save).toHaveBeenCalledWith({
      scope: 'project',
      role: 'explorer',
      baseRevision: 'r0',
      overrides: [],
    });
  });

  it('labels global as an inactive preview when project controls', async () => {
    const h = harness([
      choose('designer'),
      choose('global'),
      (options, title) => {
        expect(title).toContain('INACTIVE PREVIEW');
        const bash = options.find((o) => o.title.includes('bash'));
        expect(bash?.description).toContain('global alone would deny');
        return undefined;
      },
      esc,
    ]);
    await h.run();
  });
});
