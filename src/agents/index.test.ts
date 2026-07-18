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
  'sdd-specify',
  'sdd-plan',
  'sdd-tasks',
  'designer',
  'quick',
  'deep',
] as const;

const READ_ONLY_ROLES = ['explorer', 'librarian', 'oracle'] as const;
const COORDINATION_ROLES = ['sdd-specify', 'sdd-plan', 'sdd-tasks'] as const;
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
  test('creates the minimal hybrid ten-role roster', () => {
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

  test.each(
    COORDINATION_ROLES,
  )('allows %s to write coordination artifacts without delegation', (role) => {
    expect(permission(role)).toMatchObject({
      read: 'allow',
      edit: 'allow',
      question: 'allow',
      todowrite: 'deny',
      task: 'deny',
    });
    expect(getAgent(role)?.config.prompt).toContain('coordination-write');
    expect(getAgent(role)?.config.prompt).toContain('openspec/');
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
  test('uses speed-conscious defaults for SDD phase agents', () => {
    expect(getAgentConfigs()).toMatchObject({
      'sdd-specify': {
        model: 'openai/gpt-5.6-sol',
        variant: 'high',
      },
      'sdd-plan': {
        model: 'openai/gpt-5.6-sol',
        variant: 'high',
      },
      'sdd-tasks': {
        model: 'openai/gpt-5.6-luna',
        variant: 'medium',
      },
    });
  });

  test('preserves the established specialist and root defaults', () => {
    expect(getAgentConfigs()).toMatchObject({
      orchestrator: { model: 'openai/gpt-5.6-sol', variant: 'xhigh' },
      explorer: { model: 'openai/gpt-5.6-luna', variant: 'low' },
      librarian: { model: 'openai/gpt-5.6-luna', variant: 'xhigh' },
      oracle: { model: 'openai/gpt-5.6-sol', variant: 'xhigh' },
      designer: { model: 'openai/gpt-5.6-sol', variant: 'medium' },
      quick: { model: 'openai/gpt-5.6-luna', variant: 'xhigh' },
      deep: { model: 'openai/gpt-5.6-sol', variant: 'medium' },
    });
  });

  test('applies explicit model, effort, temperature, and step overrides', () => {
    const config: PluginConfig = {
      agents: {
        'sdd-plan': {
          model: 'custom/planner',
          variant: 'low',
          temperature: 0.25,
          steps: 44,
        },
      },
    };

    expect(getAgentConfigs(config)['sdd-plan']).toMatchObject({
      model: 'custom/planner',
      variant: 'low',
      temperature: 0.25,
      steps: 44,
    });
  });

  test('keeps per-model variants in fallback arrays', () => {
    const config: PluginConfig = {
      agents: {
        'sdd-specify': {
          model: [{ id: 'custom/primary', variant: 'high' }, 'custom/fallback'],
        },
      },
    };

    expect(getAgent('sdd-specify', config)?._modelArray).toEqual([
      { id: 'custom/primary', variant: 'high' },
      { id: 'custom/fallback' },
    ]);
  });

  test('adds bounded-step guidance when steps are configured', () => {
    const config: PluginConfig = {
      agents: {
        'sdd-tasks': { steps: 35 },
      },
    };
    const prompt = getAgent('sdd-tasks', config)?.config.prompt ?? '';

    expect(prompt).toContain('<step-budget>');
    expect(prompt).toContain('Execution budget: 35 steps');
  });
});

describe('OpenCode v0.3 prompt boundaries', () => {
  test('keeps the root compact and adaptive', () => {
    const prompt = getAgent('orchestrator')?.config.prompt ?? '';

    expect(prompt.length).toBeLessThan(8_500);
    expect(prompt).toContain('adaptive root');
    expect(prompt).toContain('bounded direct work');
    expect(prompt).toContain('net gain');
    expect(prompt).toContain('Accelerated SDD');
    expect(prompt).not.toContain('delegate-first');
    expect(prompt).not.toContain('requirements-interview');
  });

  test('keeps provider mechanics external for every role', () => {
    const prompts = createAgents()
      .map((agent) => agent.config.prompt ?? '')
      .join('\n');

    expect(prompts).toContain('installed provider guidance');
    expect(prompts).not.toMatch(
      /mem_(?:save|recall|get|context|project|session)\s*\(/,
    );
    expect(prompts).not.toContain('automatic prompt capture');
  });

  test('keeps all built-in prompts compact', () => {
    for (const agent of createAgents()) {
      const limit = agent.name === 'orchestrator' ? 8_500 : 3_000;
      expect(agent.config.prompt?.length).toBeLessThan(limit);
    }
  });

  test('includes descriptions and no per-agent MCP assignment', () => {
    for (const [name, config] of Object.entries(getAgentConfigs())) {
      expect(config.description, name).toBeTruthy();
      expect('mcps' in config, name).toBe(false);
    }
  });
});
