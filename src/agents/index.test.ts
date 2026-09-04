import type { AgentConfig } from '@opencode-ai/sdk/v2';
import { describe, expect, test } from 'vitest';
import type { PluginConfig } from '../config';
import { SUBAGENT_NAMES } from '../config';
import { createAgents, getAgentConfigs, isSubagent } from './index';

type PermissionRecord = Exclude<
  NonNullable<AgentConfig['permission']>,
  'allow' | 'ask' | 'deny'
>;

const ROLE_NAMES = [
  'orchestrator',
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
] as const;

const READ_ONLY_ROLES = ['explorer', 'librarian', 'oracle'] as const;
const WRITER_ROLES = ['designer', 'quick', 'deep'] as const;

function getAgent(name: string, config?: PluginConfig) {
  return createAgents(config).find((agent) => agent.name === name);
}

function permission(name: string, config?: PluginConfig): PermissionRecord {
  const value = getAgentConfigs(config)[name]?.permission;
  expect(value).toBeDefined();
  expect(typeof value).toBe('object');
  return value as PermissionRecord;
}

describe('OpenCode v0.3 agent roster', () => {
  test('creates the seven-role adaptive roster', () => {
    expect(createAgents().map((agent) => agent.name)).toEqual(ROLE_NAMES);
    expect(SUBAGENT_NAMES).toEqual(ROLE_NAMES.slice(1));
  });

  test('classifies root and child agents correctly', () => {
    const configs = getAgentConfigs();

    expect(configs.orchestrator.mode).toBe('primary');
    for (const name of SUBAGENT_NAMES) {
      expect(configs[name]?.mode).toBe('subagent');
      expect(isSubagent(name)).toBe(true);
    }
    expect(isSubagent('orchestrator')).toBe(false);
    expect(isSubagent('fixer')).toBe(false);
    expect(isSubagent('explore')).toBe(false);
  });

  test('gives the adaptive root direct-work and delegation permissions', () => {
    expect(permission('orchestrator')).toMatchObject({
      read: 'allow',
      edit: 'allow',
      write: 'allow',
      bash: 'allow',
      question: 'allow',
      todowrite: 'allow',
      task: 'allow',
    });
  });

  test.each(READ_ONLY_ROLES)('keeps %s read-only and leaf-only', (role) => {
    expect(permission(role)).toMatchObject({
      read: 'allow',
      edit: 'deny',
      question: 'allow',
      todowrite: 'deny',
      task: 'deny',
    });
  });

  test.each(WRITER_ROLES)('keeps %s as a leaf writer', (role) => {
    expect(permission(role)).toMatchObject({
      read: 'allow',
      edit: 'allow',
      question: 'allow',
      todowrite: 'deny',
      task: 'deny',
    });
    expect(getAgent(role)?.config.prompt).toContain('write-capable');
  });
});

describe('OpenCode v0.3 defaults', () => {
  test('preserves the established specialist and root defaults', () => {
    expect(getAgentConfigs()).toMatchObject({
      orchestrator: { model: 'openai/gpt-5.6-sol', variant: 'xhigh' },
      explorer: { model: 'openai/gpt-5.6-luna', variant: 'low' },
      librarian: { model: 'openai/gpt-5.6-luna', variant: 'high' },
      oracle: { model: 'openai/gpt-5.6-sol', variant: 'high' },
      designer: { model: 'openai/gpt-5.6-sol', variant: 'medium' },
      quick: { model: 'openai/gpt-5.6-luna', variant: 'low' },
      deep: { model: 'openai/gpt-5.6-sol', variant: 'medium' },
    });
  });

  test('applies explicit model, effort, temperature, and step overrides', () => {
    const config: PluginConfig = {
      agents: {
        deep: {
          model: 'custom/planner',
          variant: 'low',
          temperature: 0.25,
          steps: 44,
        },
      },
    };

    expect(getAgentConfigs(config).deep).toMatchObject({
      model: 'custom/planner',
      variant: 'low',
      temperature: 0.25,
      steps: 44,
    });
  });

  test('keeps per-model variants in fallback arrays', () => {
    const config: PluginConfig = {
      agents: {
        oracle: {
          model: [{ id: 'custom/primary', variant: 'high' }, 'custom/fallback'],
        },
      },
    };

    expect(getAgent('oracle', config)?._modelArray).toEqual([
      { id: 'custom/primary', variant: 'high' },
      { id: 'custom/fallback' },
    ]);
  });

  test('adds bounded-step guidance when steps are configured', () => {
    const config: PluginConfig = {
      agents: {
        quick: { steps: 35 },
      },
    };
    const prompt = getAgent('quick', config)?.config.prompt ?? '';

    expect(prompt).toContain('<step-budget>');
    expect(prompt).toContain('Execution budget: 35 steps');
  });
});

describe('OpenCode v0.3 prompt boundaries', () => {
  test('keeps the root compact and adaptive', () => {
    const prompt = getAgent('orchestrator')?.config.prompt ?? '';

    expect(prompt.length - 8_499).toBeLessThanOrEqual(2_500);
    expect(prompt).toContain('adaptive root');
    expect(prompt).toContain(
      'Handle bounded implementation directly in any route when continuity outweighs delegation overhead',
    );
    expect(prompt).toContain('net gain');
    expect(prompt).toContain('<implementation-ownership>');
    expect(prompt).toContain(
      'SDD routes govern artifacts and gates, not implementation ownership.',
    );
    expect(prompt).toContain(
      'Explicit safe user direction is an ownership input.',
    );
    expect(prompt).not.toMatch(/Direct micro-action/i);
    expect(prompt).not.toMatch(/Artifact-backed implement follows/i);
    expect(prompt).toContain('Accelerated SDD');
    expect(prompt).toContain('thoth-sdd');
    expect(prompt).toContain('oracle');
    expect(prompt).toContain('Final verification is mandatory.');
    expect(prompt).toContain(
      'Root may run focused verification only for trivial deterministic Direct work',
    );
    expect(prompt).not.toContain('delegate-first');
    expect(prompt).not.toContain('requirements-interview');
    expect(prompt).not.toContain('<phase-protocols>');
  });

  test('keeps provider mechanics external for every role', () => {
    const prompts = createAgents()
      .map((agent) => agent.config.prompt ?? '')
      .join('\n');

    expect(prompts).toContain('installed `thoth-mem` skill');
    expect(prompts).toContain('do not invent provider mechanics');
    expect(prompts).not.toMatch(
      /mem_(?:save|recall|get|context|project|session)\s*\(/,
    );
    expect(prompts).not.toContain('automatic prompt capture');
  });

  test('keeps all built-in prompts compact', () => {
    for (const agent of createAgents()) {
      const length = agent.config.prompt?.length ?? 0;
      if (agent.name === 'orchestrator') {
        expect(length - 8_499, agent.name).toBeLessThanOrEqual(2_500);
      } else {
        expect(length, agent.name).toBeLessThan(5_000);
      }
    }
  });

  test('includes descriptions and no per-agent MCP assignment', () => {
    for (const [name, config] of Object.entries(getAgentConfigs())) {
      expect(config.description, name).toBeTruthy();
      expect('mcps' in config, name).toBe(false);
      if (name !== 'orchestrator') {
        expect(config.description, name).toContain('Use when:');
        expect(config.description, name).toContain('Do not use when:');
        expect(config.description, name).toContain('Escalate when:');
      }
    }
  });
});
