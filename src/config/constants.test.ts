import { describe, expect, test } from 'vitest';
import {
  CONFIRMED_OPENAI_SUBAGENT_PRESET,
  DEFAULT_MODELS,
  LEGACY_OPENAI_PRESET,
  OPENCODE_OPENAI_ORCHESTRATOR_PRESET,
} from './constants';

describe('OpenAI default model projection', () => {
  test('defines the exact canonical model and effort for all five specialists', () => {
    expect(CONFIRMED_OPENAI_SUBAGENT_PRESET).toEqual({
      explorer: { model: 'gpt-6-luna', effort: 'max' },
      librarian: { model: 'gpt-6-luna', effort: 'max' },
      oracle: { model: 'gpt-6.1-sol', effort: 'xhigh' },
      designer: { model: 'gpt-6-luna', effort: 'max' },
      worker: { model: 'gpt-6-luna', effort: 'max' },
    });
  });

  test('defines a separate providerless OpenCode orchestrator preset', () => {
    expect(OPENCODE_OPENAI_ORCHESTRATOR_PRESET).toEqual({
      model: 'gpt-6.1-sol',
      effort: 'high',
    });
  });

  test('retains the previous shipped pairs solely for upgrade comparison', () => {
    expect(LEGACY_OPENAI_PRESET).toEqual({
      explorer: { model: 'gpt-6-luna', effort: 'low' },
      librarian: { model: 'gpt-6-luna', effort: 'high' },
      oracle: { model: 'gpt-6-astra', effort: 'medium' },
      designer: { model: 'gpt-6-sol', effort: 'medium' },
      worker: { model: 'gpt-6-luna', effort: 'max' },
      orchestrator: { model: 'gpt-6-sol', effort: 'xhigh' },
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
