/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { generateLiteConfig, MODEL_MAPPINGS } from './providers';

describe('providers', () => {
  test('MODEL_MAPPINGS has exactly 4 providers', () => {
    const keys = Object.keys(MODEL_MAPPINGS);
    expect(keys.sort()).toEqual(['copilot', 'kimi', 'openai', 'zai-plan']);
  });

  test('generateLiteConfig always generates openai preset', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    expect(config.preset).toBe('openai');
    const agents = (config.presets as any).openai;
    expect(agents).toBeDefined();
    expect(agents.orchestrator.model).toBe('openai/gpt-5.4');
    expect(agents.orchestrator.variant).toBeUndefined();
    expect(agents.quick.model).toBe('openai/gpt-5.4-mini');
    expect(agents.quick.variant).toBe('low');
    expect(agents.deep.model).toBe('openai/gpt-5.4');
    expect(agents.deep.variant).toBe('high');
  });

  test('generateLiteConfig uses correct OpenAI models', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).openai;
    expect(agents.orchestrator.model).toBe(
      MODEL_MAPPINGS.openai.orchestrator.model,
    );
    expect(agents.oracle.model).toBe('openai/gpt-5.4');
    expect(agents.oracle.variant).toBe('high');
    expect(agents.librarian.model).toBe('openai/gpt-5.4-mini');
    expect(agents.librarian.variant).toBe('low');
    expect(agents.explorer.model).toBe('openai/gpt-5.4-mini');
    expect(agents.explorer.variant).toBe('low');
    expect(agents.designer.model).toBe('openai/gpt-5.4-mini');
    expect(agents.designer.variant).toBe('medium');
    expect(agents.quick.model).toBe('openai/gpt-5.4-mini');
    expect(agents.quick.variant).toBe('low');
    expect(agents.deep.model).toBe('openai/gpt-5.4');
    expect(agents.deep.variant).toBe('high');
  });

  test('generateLiteConfig enables tmux when requested', () => {
    const config = generateLiteConfig({
      hasTmux: true,
      installSkills: false,
      installCustomSkills: false,
      reset: false,
    });

    expect(config.tmux).toBeDefined();
    expect((config.tmux as any).enabled).toBe(true);
    expect((config.tmux as any).layout).toBe('main-vertical');
  });

  test('generateLiteConfig omits per-agent skills and mcps fields', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: true,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).openai;
    expect(agents.orchestrator.skills).toBeUndefined();
    expect(agents.designer.skills).toBeUndefined();
    expect(agents.orchestrator.mcps).toBeUndefined();
    expect(agents.librarian.mcps).toBeUndefined();
  });

  test('generateLiteConfig includes the seven-agent roster', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: false,
      installCustomSkills: false,
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

  test('quick and deep presets remain lean model-only configs', () => {
    const config = generateLiteConfig({
      hasTmux: false,
      installSkills: true,
      installCustomSkills: false,
      reset: false,
    });

    const agents = (config.presets as any).openai;
    expect(Object.keys(agents.quick).sort()).toEqual(['model', 'variant']);
    expect(Object.keys(agents.deep).sort()).toEqual(['model', 'variant']);
  });
});
