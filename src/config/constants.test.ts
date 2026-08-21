import { describe, expect, test } from 'vitest';
import {
  CONFIRMED_OPENAI_SUBAGENT_PRESET,
  DEFAULT_MODELS,
  OPENCODE_OPENAI_ORCHESTRATOR_PRESET,
} from './constants';

describe('OpenAI default model projection', () => {
  test('defines the exact canonical model and effort for all six specialists', () => {
    expect(CONFIRMED_OPENAI_SUBAGENT_PRESET).toEqual({
      explorer: { model: 'gpt-5.6-luna', effort: 'low' },
      librarian: { model: 'gpt-5.6-luna', effort: 'high' },
      oracle: { model: 'gpt-5.6-sol', effort: 'high' },
      designer: { model: 'gpt-5.6-sol', effort: 'medium' },
      quick: { model: 'gpt-5.6-luna', effort: 'low' },
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
