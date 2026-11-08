import { describe, expect, it } from 'vitest';
import { makeState } from './fixtures';
import {
  activationMessage,
  clearMessage,
  isDirty,
  markersFor,
  newDraft,
  openDraft,
  profileRows,
  profileTitle,
  roleLabel,
  roleViews,
  searchOptions,
  validateProfileName,
  variantsOf,
  withRole,
} from './model';

const state = makeState();
it('searches model labels, variants and exact qualified IDs', () => {
  const option = {
    title: 'gpt-6.1-sol-codex',
    value: 'openai-codex-2/gpt-6.1-sol-codex',
    description: 'GPT-6.1 Sol · variants: low, high',
  };
  for (const query of ['GPT-6.1 Sol', 'codex high', option.value.toUpperCase()])
    expect(searchOptions(query, [option])).toEqual([option]);
  expect(searchOptions('missing', [option])).toEqual([]);
});
const rows = profileRows(state);
const byKey = (key: string) => {
  const row = rows.find((item) => item.key === key);
  if (!row) throw new Error(key);
  return row;
};

describe('markers', () => {
  it('marks effective, pointers and shadowing on the winning profile only', () => {
    const project = byKey('project:fast');
    const global = byKey('global:fast');
    expect(profileTitle(project, markersFor(state, project))).toBe(
      '● P   fast',
    );
    expect(profileTitle(global, markersFor(state, global))).toBe(
      '      fast ~',
    );
    const deep = byKey('global:deep');
    expect(profileTitle(deep, markersFor(state, deep))).toBe('  G   deep');
  });

  it('marks the default profile as effective when nothing is selected', () => {
    const none = makeState({
      selections: {},
      effective: {
        name: 'default',
        selectedBy: 'default',
        profile: { agents: {} },
      },
    });
    const row = profileRows(none)[0];
    expect(markersFor(none, row).effective).toBe(true);
  });

  it('shows all three pointers in S P G order', () => {
    const all = makeState({
      selections: { session: 'deep', project: 'deep', global: 'deep' },
    });
    const deep = profileRows(all).find((r) => r.key === 'global:deep');
    expect(deep && profileTitle(deep, markersFor(all, deep))).toContain('SPG');
  });
});

describe('role rows', () => {
  it('distinguishes own, default-inherited and session-inherited values', () => {
    const fast = byKey('project:fast');
    const views = roleViews(state, fast.profile, false);
    expect(views.map((v) => v.role)).toContain('orchestrator');
    const label = (role: string) =>
      roleLabel(views.find((v) => v.role === role) as never);
    expect(label('oracle')).toBe('oracle       openai/gpt-5 · high');
    expect(label('designer')).toBe(
      'designer     openai/gpt-5-mini · low (inherited)',
    );
    expect(label('orchestrator')).toBe(
      'orchestrator openai/gpt-5 · medium (inherited)',
    );
    expect(label('worker')).toBe('worker       unset · - (inherited)');
  });

  it('applies a variant-only entry to the inherited model', () => {
    const fast = byKey('project:fast');
    const profile = {
      agents: { ...fast.profile.agents, designer: { variant: 'high' } },
    };
    const view = roleViews(state, profile, false).find(
      (v) => v.role === 'designer',
    ) as never;
    expect(roleLabel(view)).toBe(
      'designer     openai/gpt-5-mini (inherited) · high',
    );
    expect(
      withRole(profile, 'designer', { variant: 'low' }).agents.designer,
    ).toEqual({ variant: 'low' });
  });

  it('shows default own values as not inherited', () => {
    const views = roleViews(state, state.defaultProfile, true);
    expect(views.find((v) => v.role === 'designer')?.inherited).toBe(false);
  });

  it('lists variants of a catalog model', () => {
    expect(variantsOf(state, 'openai/gpt-5')).toEqual(['low', 'high']);
    expect(variantsOf(state, 'x/y')).toEqual([]);
  });
});

describe('draft', () => {
  it('is dirty only when the profile differs from the persisted base', () => {
    const draft = openDraft(byKey('project:fast'));
    if (!draft) throw new Error('draft');
    expect(isDirty(draft)).toBe(false);
    draft.profile = withRole(draft.profile, 'worker', { model: 'a/b' });
    expect(isDirty(draft)).toBe(true);
    draft.profile = withRole(draft.profile, 'worker', undefined);
    expect(isDirty(draft)).toBe(false);
  });

  it('keeps default read-only and new drafts dirty', () => {
    expect(openDraft(byKey('default'))).toBeUndefined();
    expect(isDirty(newDraft('global', 'x', { agents: {} }))).toBe(true);
  });

  it('clones without sharing references', () => {
    const draft = newDraft('global', 'copy', state.defaultProfile);
    draft.profile = withRole(draft.profile, 'designer', { model: 'a/b' });
    expect(state.defaultProfile.agents.designer?.model).toBe(
      'openai/gpt-5-mini',
    );
  });
});

describe('name validation', () => {
  it.each([
    ['  ', 'empty'],
    ['Default', 'reserved'],
    ['deep', 'already exists'],
  ])('rejects %j', (value, text) => {
    expect(validateProfileName(value, 'global', state)).toContain(text);
  });
  it('allows a name unused in that scope', () => {
    expect(validateProfileName('deep', 'project', state)).toBeUndefined();
  });
});

describe('messages', () => {
  it('reports shadowing of a lower-precedence scope by the session', () => {
    const s = makeState({
      selections: { session: 'deep', global: 'fast' },
      effective: {
        name: 'deep',
        source: 'global',
        selectedBy: 'session',
        profile: { agents: {} },
      },
    });
    expect(activationMessage('global', 'fast', s)).toContain(
      'this session keeps its session selection',
    );
  });
  it('reports a successful activation and clearing', () => {
    expect(activationMessage('project', 'fast', state)).toContain(
      'now effective',
    );
    expect(clearMessage('global', state)).toContain(
      'fast is effective (project selection)',
    );
  });
});
