import { describe, expect, test } from 'vitest';
import {
  CONFIRMED_OPENAI_SUBAGENT_PRESET,
  DEFAULT_MODELS,
  OPENCODE_OPENAI_ORCHESTRATOR_PRESET,
} from './constants';

describe('OpenAI default model projection', () => {
  test('defines the exact canonical model and effort for all nine subagents', () => {
    expect(CONFIRMED_OPENAI_SUBAGENT_PRESET).toEqual({
      explorer: { model: 'gpt-5.6-luna', effort: 'low' },
      librarian: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      oracle: { model: 'gpt-5.6-sol', effort: 'xhigh' },
      'sdd-specify': { model: 'gpt-5.6-sol', effort: 'high' },
      'sdd-plan': { model: 'gpt-5.6-sol', effort: 'high' },
      'sdd-tasks': { model: 'gpt-5.6-luna', effort: 'medium' },
      designer: { model: 'gpt-5.6-sol', effort: 'medium' },
      quick: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      deep: { model: 'gpt-5.6-sol', effort: 'medium' },
    });
  });

  test('defines a separate providerless OpenCode orchestrator preset', () => {
    expect(OPENCODE_OPENAI_ORCHESTRATOR_PRESET).toEqual({
      model: 'gpt-5.6-sol',
      effort: 'xhigh',
    });
  });

  test('projects confirmed providerless subagent models with the OpenCode prefix', () => {
    expect(DEFAULT_MODELS.orchestrator).toBeUndefined();

    for (const [name, preset] of Object.entries(
      CONFIRMED_OPENAI_SUBAGENT_PRESET,
    )) {
      expect(DEFAULT_MODELS[name]).toBe(`openai/${preset.model}`);
    }
  });
});
