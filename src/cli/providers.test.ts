import { describe, expect, test } from 'vitest';
import { ALL_AGENT_NAMES } from '../config';
import {
  generateLiteConfig,
  MODEL_MAPPINGS,
  THOTH_AGENTS_CONFIG_SCHEMA_URL,
} from './providers';

describe('providers', () => {
  test('MODEL_MAPPINGS exposes only the OpenAI preset', () => {
    const keys = Object.keys(MODEL_MAPPINGS);
    expect(keys).toEqual(['openai']);
  });

  test('generateLiteConfig always generates openai preset', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      reset: false,
    });

    expect(config.$schema).toBe(THOTH_AGENTS_CONFIG_SCHEMA_URL);
    expect(config.preset).toBe('openai');
    const agents = (config.presets as any).openai;
    expect(agents).toBeDefined();
    expect(agents.orchestrator.model).toBe('openai/gpt-5.6-sol');
    expect(agents.orchestrator.variant).toBe('xhigh');
    expect(agents.quick).toEqual({
      model: 'openai/gpt-5.6-luna',
      variant: 'low',
    });
    expect(agents.deep).toEqual({
      model: 'openai/gpt-5.6-sol',
      variant: 'medium',
    });
  });

  test('generateLiteConfig uses the confirmed OpenAI subagent preset', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      reset: false,
    });

    const agents = (config.presets as any).openai;
    expect(agents.orchestrator.model).toBe(
      MODEL_MAPPINGS.openai.orchestrator.model,
    );
    expect(agents.oracle).toEqual({
      model: 'openai/gpt-5.6-sol',
      variant: 'high',
    });
    expect(agents.librarian).toEqual({
      model: 'openai/gpt-5.6-luna',
      variant: 'high',
    });
    expect(agents.explorer).toEqual({
      model: 'openai/gpt-5.6-luna',
      variant: 'low',
    });
    expect(agents.designer).toEqual({
      model: 'openai/gpt-5.6-sol',
      variant: 'medium',
    });
    expect(agents.quick).toEqual({
      model: 'openai/gpt-5.6-luna',
      variant: 'low',
    });
    expect(agents.deep).toEqual({
      model: 'openai/gpt-5.6-sol',
      variant: 'medium',
    });
  });

  test('generateLiteConfig enables tmux when requested', () => {
    const config = generateLiteConfig({
      hasTmux: true,
      reset: false,
    });

    expect(config.tmux).toBeDefined();
    expect((config.tmux as any).enabled).toBe(true);
    expect((config.tmux as any).layout).toBe('main-vertical');
  });

  test('generateLiteConfig omits per-agent skills and mcps fields', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      reset: false,
    });

    const agents = (config.presets as any).openai;
    expect(agents.orchestrator.skills).toBeUndefined();
    expect(agents.designer.skills).toBeUndefined();
    expect(agents.orchestrator.mcps).toBeUndefined();
    expect(agents.librarian.mcps).toBeUndefined();
  });

  test('generateLiteConfig includes the canonical seven-role roster', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      reset: false,
    });

    const agents = Object.keys((config.presets as any).openai).sort();
    expect(agents).toEqual([
      'deep',
      'designer',
      'explorer',
      'librarian',
      'oracle',
      'orchestrator',
      'quick',
    ]);
  });

  test('every maintained provider mapping covers the canonical roster', () => {
    for (const mapping of Object.values(MODEL_MAPPINGS)) {
      expect(Object.keys(mapping).sort()).toEqual([...ALL_AGENT_NAMES].sort());
    }
  });

  test('quick and deep presets remain lean model-only configs', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      reset: false,
    });

    const agents = (config.presets as any).openai;
    expect(Object.keys(agents.quick).sort()).toEqual(['model', 'variant']);
    expect(Object.keys(agents.deep).sort()).toEqual(['model', 'variant']);
  });
});
