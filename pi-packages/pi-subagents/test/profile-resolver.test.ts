import { expect, it } from 'vitest';
import { readSubagentsConfig } from '../src/config.js';
import {
  resolveDefaultSubagentProfile,
  resolveEffectiveSubagentProfile,
} from '../src/profile-resolver.js';

it('named overrides outrank definitions regardless of definition scope, while default ignores the profile', () => {
  const input = {
    agentName: 'Worker',
    definition: {
      name: 'worker',
      description: '',
      filePath: '',
      instructions: '',
      tools: [],
      scope: 'project' as const,
      model: { provider: 'definition', id: 'model' },
      effort: 'low' as const,
    },
    config: readSubagentsConfig('missing'),
    ctx: {
      modelProfile: {
        name: 'fast',
        profile: {
          agents: {
            worker: {
              model: { provider: 'profile', id: 'model' },
              effort: 'max',
            },
          },
        },
        warnings: ['Missing session model profile'],
      },
    },
  };
  expect(resolveEffectiveSubagentProfile(input)).toMatchObject({
    profileName: 'fast',
    warnings: ['Missing session model profile'],
    model: {
      source: 'profile',
      value: { provider: 'profile', id: 'model' },
      label: 'profile (fast): profile/model',
    },
    effort: { value: 'max' },
  });
  expect(resolveDefaultSubagentProfile(input).model.source).toBe('definition');
});
it('falls back independently for absent profile agents and fields through definition, scalar and parent values', () => {
  const input = {
    agentName: 'worker',
    definition: {
      name: 'worker',
      description: '',
      filePath: '',
      instructions: '',
      tools: [],
      effort: 'low' as const,
    },
    config: {
      ...readSubagentsConfig('missing'),
      default_model: { provider: 'scalar', id: 'model' },
    },
    ctx: {
      modelProfile: {
        name: 'fast',
        profile: { agents: { other: { effort: 'max' } } },
        warnings: [],
      },
      model: { provider: 'parent', id: 'model' },
      thinkingLevel: 'high',
    },
  };
  expect(resolveEffectiveSubagentProfile(input)).toMatchObject({
    model: { source: 'default', value: { provider: 'scalar', id: 'model' } },
    effort: { source: 'definition', value: 'low' },
  });
  expect(
    resolveEffectiveSubagentProfile({
      ...input,
      definition: { ...input.definition, effort: undefined },
      config: { ...input.config, default_model: undefined },
    }),
  ).toMatchObject({
    model: { source: 'orchestrator' },
    effort: { source: 'orchestrator', value: 'high' },
  });
  expect(
    resolveDefaultSubagentProfile({
      ...input,
      definition: { ...input.definition, effort: undefined },
      config: { ...input.config, default_model: undefined },
      ctx: {},
    }),
  ).toMatchObject({
    model: { source: 'unresolved' },
    effort: { source: 'unresolved' },
  });
});
