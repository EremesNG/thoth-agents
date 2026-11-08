import { describe, expect, test } from 'vitest';
import { ALL_AGENT_NAMES } from '../config';
import {
  generateLiteConfig,
  MODEL_MAPPINGS,
  THOTH_AGENTS_CONFIG_SCHEMA_URL,
} from './providers';

describe('providers', () => {
  test('MODEL_MAPPINGS exposes only the OpenAI profile', () => {
    const keys = Object.keys(MODEL_MAPPINGS);
    expect(keys).toEqual(['openai']);
  });

  test('generateLiteConfig always generates openai profile', () => {
    const config = generateLiteConfig({
      reset: false,
    });

    expect(config.$schema).toBe(THOTH_AGENTS_CONFIG_SCHEMA_URL);
    expect(config).not.toHaveProperty('preset');
    expect(config).not.toHaveProperty('presets');
    const agents = MODEL_MAPPINGS.openai;
    expect(agents).toBeDefined();
    expect(agents.orchestrator.model).toBe('openai/gpt-6.1-sol');
    expect(agents.orchestrator.variant).toBe('high');
    expect(agents.worker).toEqual({
      model: 'openai/gpt-6-luna',
      variant: 'max',
    });
  });

  test('OpenAI profile uses the shipped role models and variants', () => {
    const agents = MODEL_MAPPINGS.openai;
    expect(agents.orchestrator.model).toBe('openai/gpt-6.1-sol');
    expect(agents.oracle).toEqual({
      model: 'openai/gpt-6.1-sol',
      variant: 'xhigh',
    });
    expect(agents.librarian).toEqual({
      model: 'openai/gpt-6-luna',
      variant: 'max',
    });
    expect(agents.explorer).toEqual({
      model: 'openai/gpt-6-luna',
      variant: 'max',
    });
    expect(agents.designer).toEqual({
      model: 'openai/gpt-6-luna',
      variant: 'max',
    });
    expect(agents.worker).toEqual({
      model: 'openai/gpt-6-luna',
      variant: 'max',
    });
  });

  test('generateLiteConfig omits removed runtime settings', () => {
    const config = generateLiteConfig({
      reset: false,
    });

    expect(config).not.toHaveProperty('tmux');
    expect(config).not.toHaveProperty('auto_update');
    expect(config).not.toHaveProperty('autoUpdate');
    expect(config).not.toHaveProperty('update_check');
    expect(config).not.toHaveProperty('auto-update-checker');
  });

  test('OpenAI profile omits per-agent skills and mcps fields', () => {
    const agents = MODEL_MAPPINGS.openai;
    expect(
      (agents.orchestrator as Record<string, unknown>).skills,
    ).toBeUndefined();
    expect((agents.designer as Record<string, unknown>).skills).toBeUndefined();
    expect(
      (agents.orchestrator as Record<string, unknown>).mcps,
    ).toBeUndefined();
    expect((agents.librarian as Record<string, unknown>).mcps).toBeUndefined();
  });

  test('OpenAI profile includes the canonical six-role roster', () => {
    const agents = Object.keys(MODEL_MAPPINGS.openai).sort();
    expect(agents).toEqual([
      'designer',
      'explorer',
      'librarian',
      'oracle',
      'orchestrator',
      'worker',
    ]);
  });

  test('every maintained provider mapping covers the canonical roster', () => {
    for (const mapping of Object.values(MODEL_MAPPINGS)) {
      expect(Object.keys(mapping).sort()).toEqual([...ALL_AGENT_NAMES].sort());
    }
  });

  test('worker profile remains a lean model-only config', () => {
    const agents = MODEL_MAPPINGS.openai;
    expect(Object.keys(agents.worker).sort()).toEqual(['model', 'variant']);
  });
});
