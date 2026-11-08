import { describe, expect, it, vi } from 'vitest';
import type { ProfileState } from '../opencode/profile-rpc';
import { makeState } from './fixtures';
import { type FlowPorts, runModelProfilesFlow } from './flow';

type Opt = {
  title: string;
  value: unknown;
  disabled?: boolean;
  description?: string;
  footer?: string;
};
type Step = (options: readonly Opt[], title: string) => unknown;

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
    state?: ProfileState;
    prompts?: (string | undefined)[];
    confirms?: boolean[];
    rpc?: Partial<FlowPorts['rpc']>;
    sessionID?: string;
  } = {},
) {
  let state = opts.state ?? makeState();
  const prompts = [...(opts.prompts ?? [])];
  const confirms = [...(opts.confirms ?? [])];
  const toasts: string[] = [];
  const alerts: string[] = [];
  const queue = [...steps];
  const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });
  const rpc: FlowPorts['rpc'] = {
    state: vi.fn(async () => ({ ok: true as const, value: state })),
    create: vi.fn(async () => ok({ revision: 'new1' })),
    save: vi.fn(async () => ok({ revision: 'r2' })),
    rename: vi.fn(async () => ok({})),
    delete: vi.fn(async () => ok({})),
    activate: vi.fn(async () => ({ ok: true as const, value: state })),
    clear: vi.fn(async () => ({ ok: true as const, value: state })),
    capture: vi.fn(async () => ok({ model: 'openai/gpt-5', variant: 'high' })),
    ...opts.rpc,
  } as FlowPorts['rpc'];
  const ports: FlowPorts = {
    rpc,
    sessionID: () => ('sessionID' in opts ? opts.sessionID : 's1'),
    ui: {
      select: (async (o: { options: readonly Opt[]; title: string }) => {
        const step = queue.shift();
        if (!step) throw new Error(`unexpected select: ${o.title}`);
        return step(o.options, o.title);
      }) as never,
      prompt: async () => prompts.shift(),
      confirm: async () => confirms.shift(),
      alert: async ({ message }) => {
        alerts.push(message);
      },
      toast: { show: (o) => toasts.push(o.message) },
    },
  };
  return {
    run: async () => {
      await runModelProfilesFlow(ports);
      expect(queue).toHaveLength(0);
    },
    rpc,
    toasts,
    alerts,
    setState: (next: ProfileState) => {
      state = next;
    },
  };
}

describe('model profiles flow', () => {
  it.each([
    'openai',
    'openai-codex-2',
  ])('disambiguates same-name models for %s without a footer crowding out their IDs', async (providerID) => {
    const variants = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
    const state = makeState({
      providers: [
        {
          id: providerID,
          name: 'OpenAI Codex',
          models: [
            { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', variants },
            { id: 'gpt-6.1-sol-codex', name: 'GPT-6.1 Sol', variants },
            { id: 'gpt-6.1-sol-2026-11-01', name: 'GPT-6.1 Sol', variants },
          ],
        },
      ],
    });
    const h = harness(
      [
        choose('  G   deep'),
        choose('explorer'),
        choose('Change model and variant'),
        choose('OpenAI Codex'),
        (options) => {
          expect(options.map((o) => o.title)).toEqual([
            'gpt-6.1-sol',
            'gpt-6.1-sol-codex',
            'gpt-6.1-sol-2026-11-01',
          ]);
          for (const option of options) {
            expect(option.description).toBe(
              'GPT-6.1 Sol · variants: none, low, medium, high, xhigh, max',
            );
            expect(option.footer).toBeUndefined();
          }
          return options[1]?.value;
        },
        choose('high'),
        choose('Save changes'),
        esc,
        esc,
      ],
      { state },
    );
    await h.run();
    expect(h.rpc.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: {
          agents: {
            explorer: {
              model: `${providerID}/gpt-6.1-sol-codex`,
              variant: 'high',
            },
          },
        },
      }),
    );
  });

  it('manages profiles from home while explaining disabled session-only actions', async () => {
    const state = makeState();
    delete state.orchestrator;
    delete state.selections.session;
    const h = harness(
      [
        (options, title) => {
          expect(
            options.find((o) => o.title === 'Clear session selection'),
          ).toMatchObject({
            disabled: true,
            description: expect.stringContaining('Open a session'),
          });
          return choose('  G   deep')(options, title);
        },
        (options, title) => {
          for (const action of [
            'Use for this session',
            'Capture session model into orchestrator',
          ])
            expect(options.find((o) => o.title === action)).toMatchObject({
              disabled: true,
              description: expect.stringContaining('Open a session'),
            });
          return choose('worker')(options, title);
        },
        choose('Change model and variant'),
        choose('OpenAI'),
        choose('gpt-5-mini'),
        choose('Save changes'),
        choose('Set as global active'),
        choose('Pin to this project'),
        esc,
        choose('Clear project selection'),
        choose('Clear global selection'),
        esc,
      ],
      { sessionID: undefined, state },
    );
    await h.run();
    expect(h.alerts).toEqual([]);
    expect(h.rpc.state).toHaveBeenCalledWith({});
    expect(h.rpc.save).toHaveBeenCalledOnce();
    expect(h.rpc.activate).toHaveBeenCalledWith({
      scope: 'global',
      name: 'deep',
    });
    expect(h.rpc.activate).toHaveBeenCalledWith({
      scope: 'project',
      name: 'deep',
    });
    expect(h.rpc.clear).toHaveBeenCalledWith({ scope: 'project' });
    expect(h.rpc.clear).toHaveBeenCalledWith({ scope: 'global' });
    expect(h.rpc.capture).not.toHaveBeenCalled();
  });

  it('opens an overview with markers and a read-only default detail', async () => {
    let titles: string[] = [];
    const h = harness([
      (options) => {
        titles = options.map((o) => o.title);
        return choose('default')(options, '');
      },
      (_o, title) => {
        expect(title).toContain('default');
        return choose('designer')(_o, title);
      },
      esc,
      esc,
    ]);
    await h.run();
    expect(titles).toContain('● P   fast');
    expect(titles).toContain('      fast ~');
    expect(h.toasts[0]).toContain('read-only');
  });

  it('edits a model+variant, saves with the base revision, and asks on leave', async () => {
    const h = harness([
      choose('  G   deep'),
      choose('worker'),
      choose('Change model and variant'),
      choose('OpenAI'),
      choose('gpt-5-mini'),
      // gpt-5-mini has no variants → no variant picker
      choose('Save changes'),
      esc,
      esc,
    ]);
    await h.run();
    expect(h.rpc.save).toHaveBeenCalledWith({
      scope: 'global',
      name: 'deep',
      profile: { agents: { worker: { model: 'openai/gpt-5-mini' } } },
      baseRevision: 'd1',
    });
  });

  it('picks a variant of the chosen model, including none', async () => {
    const h = harness([
      choose('  G   deep'),
      choose('oracle'),
      choose('Change model and variant'),
      choose('OpenAI'),
      choose('gpt-5'),
      choose('high'),
      choose('Save changes'),
      esc,
      esc,
    ]);
    await h.run();
    expect(h.rpc.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: {
          agents: { oracle: { model: 'openai/gpt-5', variant: 'high' } },
        },
      }),
    );
  });

  it('asks save/discard/keep when leaving with unsaved edits', async () => {
    const h = harness([
      choose('  G   deep'),
      choose('worker'),
      choose('Change model and variant'),
      choose('OpenAI'),
      choose('gpt-5-mini'),
      esc, // leave detail → prompt
      choose('Keep editing'),
      esc,
      choose('Discard'),
      esc,
    ]);
    await h.run();
    expect(h.rpc.save).not.toHaveBeenCalled();
  });

  it('keeps the original unsaved draft when its clone is discarded', async () => {
    const h = harness(
      [
        choose('  G   deep'),
        choose('worker'),
        choose('Change model and variant'),
        choose('OpenAI'),
        choose('gpt-5-mini'),
        choose('Clone this profile'),
        choose('global'),
        choose('Discard draft'), // clone detail
        choose('  G   deep'), // reopen original: edits still pending
        choose('Save changes'),
        esc,
        esc,
      ],
      { prompts: ['deep-copy'], confirms: [true] },
    );
    await h.run();
    expect(h.rpc.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'deep',
        profile: { agents: { worker: { model: 'openai/gpt-5-mini' } } },
      }),
    );
  });

  it('asks about pending drafts of cloned profiles when leaving the panel', async () => {
    const h = harness(
      [
        choose('  G   deep'),
        choose('worker'),
        choose('Change model and variant'),
        choose('OpenAI'),
        choose('gpt-5-mini'),
        choose('Clone this profile'),
        choose('global'),
        choose('Discard draft'),
        esc, // leave overview → pending deep draft
        choose('Keep editing'),
        esc,
        choose('Discard'),
      ],
      { prompts: ['deep-copy'], confirms: [true] },
    );
    await h.run();
    expect(h.rpc.save).not.toHaveBeenCalled();
  });

  it('offers reload on PROFILE_CONFLICT and reloads the on-disk profile', async () => {
    const h = harness(
      [
        choose('  G   deep'),
        choose('worker'),
        choose('Change model and variant'),
        choose('OpenAI'),
        choose('gpt-5-mini'),
        choose('Save changes'),
        (options) => {
          // After reload the draft is clean: no save row remains.
          expect(options.some((o) => o.title === 'Save changes')).toBe(false);
          return undefined;
        },
        esc,
      ],
      {
        confirms: [true],
        rpc: {
          save: vi.fn(async () => ({
            ok: false as const,
            error: { code: 'PROFILE_CONFLICT' as const, message: 'changed' },
          })),
        },
      },
    );
    await h.run();
    expect(h.rpc.state).toHaveBeenCalledTimes(2);
  });

  it('creates from default with validated name, then saves via create', async () => {
    const created = makeState();
    const h = harness(
      [
        choose('New profile'),
        choose('Start from default'),
        choose('project'),
        choose('Save changes'),
        esc,
        esc,
      ],
      {
        prompts: ['Default', 'new-one'],
        rpc: {
          create: vi.fn(async (input) => {
            created.profiles.push({
              ...input,
              source: input.scope,
              shadowed: false,
              revision: 'new1',
            });
            h.setState(created);
            return { ok: true as const, value: { revision: 'new1' } };
          }),
        },
      },
    );
    await h.run();
    expect(h.toasts[0]).toContain('reserved');
    expect(h.rpc.create).toHaveBeenCalledWith({
      scope: 'project',
      name: 'new-one',
      profile: state0().defaultProfile,
    });
  });

  it('captures the session model into the orchestrator row', async () => {
    const h = harness([
      choose('  G   deep'),
      choose('Capture session model'),
      choose('Save changes'),
      esc,
      esc,
    ]);
    await h.run();
    expect(h.rpc.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: {
          agents: { orchestrator: { model: 'openai/gpt-5', variant: 'high' } },
        },
      }),
    );
  });

  it('renames and deletes with confirmation', async () => {
    const h = harness(
      [
        choose('  G   deep'),
        choose('Rename'),
        choose('  G   deep'),
        choose('Delete'),
        esc,
      ],
      { prompts: ['deeper'], confirms: [true] },
    );
    await h.run();
    expect(h.rpc.rename).toHaveBeenCalledWith({
      scope: 'global',
      name: 'deep',
      newName: 'deeper',
    });
  });

  it('does not delete without confirmation', async () => {
    const h = harness([choose('  G   deep'), choose('Delete'), esc, esc], {
      confirms: [false],
    });
    await h.run();
    expect(h.rpc.delete).not.toHaveBeenCalled();
  });

  it('activates for the session and explains the effective scope', async () => {
    const after = makeState({
      selections: { global: 'deep', project: 'fast', session: 'deep' },
      effective: {
        name: 'deep',
        source: 'global',
        selectedBy: 'session',
        profile: { agents: {} },
      },
    });
    const h = harness(
      [choose('  G   deep'), choose('Use for this session'), esc, esc],
      {
        rpc: {
          activate: vi.fn(async () => ({ ok: true as const, value: after })),
        },
      },
    );
    await h.run();
    expect(h.rpc.activate).toHaveBeenCalledWith({
      sessionID: 's1',
      scope: 'session',
      name: 'deep',
    });
    expect(h.toasts[0]).toContain('now effective');
  });

  it('warns when a pin is hidden by the session selection', async () => {
    const after = makeState({
      selections: { global: 'deep', session: 'fast' },
      effective: {
        name: 'fast',
        source: 'project',
        selectedBy: 'session',
        profile: { agents: {} },
      },
    });
    const h = harness(
      [choose('  G   deep'), choose('Set as global active'), esc, esc],
      {
        rpc: {
          activate: vi.fn(async () => ({ ok: true as const, value: after })),
        },
      },
    );
    await h.run();
    expect(h.toasts[0]).toContain('this session keeps its session selection');
  });

  it('clears a selection scope from the overview', async () => {
    const h = harness([choose('Clear project'), esc]);
    await h.run();
    expect(h.rpc.clear).toHaveBeenCalledWith({
      sessionID: 's1',
      scope: 'project',
    });
  });

  it('reports RPC failures, including thrown transport errors', async () => {
    const h = harness([], {
      rpc: {
        state: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    });
    await h.run();
    expect(h.toasts[0]).toBe('OPERATION_FAILED: boom');
  });
});

function state0() {
  return makeState();
}
