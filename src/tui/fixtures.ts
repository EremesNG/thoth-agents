import type { ProfileState } from '../opencode/profile-rpc';

export function makeState(overrides: Partial<ProfileState> = {}): ProfileState {
  return {
    profiles: [
      {
        scope: 'global',
        name: 'fast',
        source: 'global',
        shadowed: true,
        profile: { agents: { explorer: { model: 'openai/gpt-5-mini' } } },
        revision: 'g1',
      },
      {
        scope: 'project',
        name: 'fast',
        source: 'project',
        shadowed: false,
        profile: {
          agents: { oracle: { model: 'openai/gpt-5', variant: 'high' } },
        },
        revision: 'p1',
      },
      {
        scope: 'global',
        name: 'deep',
        source: 'global',
        shadowed: false,
        profile: { agents: {} },
        revision: 'd1',
      },
    ],
    defaultProfile: {
      agents: { designer: { model: 'openai/gpt-5-mini', variant: 'low' } },
    },
    roles: [
      'orchestrator',
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'worker',
    ],
    selections: { global: 'deep', project: 'fast' },
    effective: {
      name: 'fast',
      source: 'project',
      selectedBy: 'project',
      profile: { agents: {} },
    },
    orchestrator: { model: 'openai/gpt-5', variant: 'medium' },
    providers: [
      {
        id: 'openai',
        name: 'OpenAI',
        models: [
          { id: 'gpt-5', name: 'GPT-5', variants: ['low', 'high'] },
          { id: 'gpt-5-mini', name: 'GPT-5 mini', variants: [] },
        ],
      },
    ],
    warnings: [],
    ...overrides,
  };
}
