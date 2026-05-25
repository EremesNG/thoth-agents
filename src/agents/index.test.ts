import type { AgentConfig } from '@opencode-ai/sdk/v2';
import { describe, expect, test } from 'vitest';
import type { PluginConfig } from '../config';
import { SUBAGENT_NAMES } from '../config';
import { createAgents, getAgentConfigs, isSubagent } from './index';
import { createOrchestratorAgent } from './orchestrator';
import { composeAgentPrompt } from './prompt-utils';

type PermissionRecord = Exclude<
  NonNullable<AgentConfig['permission']>,
  'allow' | 'ask' | 'deny'
>;

const EXPECTED_DEFAULT_PERMISSIONS: Record<
  string,
  NonNullable<AgentConfig['permission']>
> = {
  orchestrator: {
    read: 'allow',
    edit: 'allow',
    write: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    bash: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    skill: 'allow',
    question: 'allow',
    webfetch: 'allow',
    exa: 'allow',
    todowrite: 'allow',
    task: 'allow',
    external_directory: 'allow',
  },
  explorer: {
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    external_directory: 'allow',
    bash: 'allow',
    question: 'allow',
    skill: 'allow',
    edit: 'deny',
    todowrite: 'deny',
    task: 'deny',
  },
  librarian: {
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    external_directory: 'allow',
    bash: 'allow',
    webfetch: 'allow',
    exa: 'allow',
    codesearch: 'allow',
    question: 'allow',
    skill: 'allow',
    edit: 'deny',
    todowrite: 'deny',
    task: 'deny',
  },
  oracle: {
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    lsp: 'allow',
    codesearch: 'allow',
    webfetch: 'allow',
    exa: 'allow',
    external_directory: 'allow',
    bash: 'allow',
    question: 'allow',
    skill: 'allow',
    edit: 'deny',
    todowrite: 'deny',
    task: 'deny',
  },
  designer: {
    read: 'allow',
    edit: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    bash: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    skill: 'allow',
    question: 'allow',
    todowrite: 'deny',
    task: 'deny',
    external_directory: {
      '~/.config/opencode/skills/**': 'allow',
    },
  },
  quick: {
    read: 'allow',
    edit: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    bash: 'allow',
    question: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    skill: 'allow',
    todowrite: 'deny',
    task: 'deny',
    external_directory: {
      '~/.config/opencode/skills/**': 'allow',
    },
  },
  deep: {
    read: 'allow',
    edit: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    bash: 'allow',
    codesearch: 'allow',
    lsp: 'allow',
    skill: 'allow',
    question: 'allow',
    webfetch: 'allow',
    exa: 'allow',
    todowrite: 'deny',
    task: 'deny',
    external_directory: {
      '~/.config/opencode/skills/**': 'allow',
    },
  },
};

function getAgentByName(
  name: string,
  config?: PluginConfig,
): ReturnType<typeof createAgents>[number] | undefined {
  return createAgents(config).find((agent) => agent.name === name);
}

function getPermission(
  name: string,
  config?: PluginConfig,
): NonNullable<AgentConfig['permission']> {
  const permission = getAgentConfigs(config)[name]?.permission;
  expect(permission).toBeDefined();
  return permission as NonNullable<AgentConfig['permission']>;
}

function getPermissionRecord(
  name: string,
  config?: PluginConfig,
): PermissionRecord {
  const permission = getPermission(name, config);
  expect(typeof permission).toBe('object');
  return permission as PermissionRecord;
}

describe('agent alias backward compatibility', () => {
  test("applies 'explore' config to 'explorer' agent", () => {
    const config: PluginConfig = {
      agents: {
        explore: { model: 'test/old-explore-model' },
      },
    };

    expect(getAgentByName('explorer', config)?.config.model).toBe(
      'test/old-explore-model',
    );
  });

  test("applies 'frontend-ui-ux-engineer' config to 'designer' agent", () => {
    const config: PluginConfig = {
      agents: {
        'frontend-ui-ux-engineer': { model: 'test/old-frontend-model' },
      },
    };

    expect(getAgentByName('designer', config)?.config.model).toBe(
      'test/old-frontend-model',
    );
  });

  test('new name takes priority over old alias', () => {
    const config: PluginConfig = {
      agents: {
        explore: { model: 'old-model' },
        explorer: { model: 'new-model' },
      },
    };

    expect(getAgentByName('explorer', config)?.config.model).toBe('new-model');
  });

  test('temperature override via old alias', () => {
    const config: PluginConfig = {
      agents: {
        explore: { temperature: 0.5 },
      },
    };

    expect(getAgentByName('explorer', config)?.config.temperature).toBe(0.5);
  });

  test('variant override via old alias', () => {
    const config: PluginConfig = {
      agents: {
        explore: { variant: 'low' },
      },
    };

    expect(getAgentByName('explorer', config)?.config.variant).toBe('low');
  });
});

describe('orchestrator agent', () => {
  test('orchestrator is first in agents array', () => {
    expect(createAgents()[0]?.name).toBe('orchestrator');
  });

  test('orchestrator has explicit full-access permission map', () => {
    expect(getPermission('orchestrator')).toEqual(
      EXPECTED_DEFAULT_PERMISSIONS.orchestrator,
    );
  });

  test('orchestrator accepts overrides', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { model: 'custom-orchestrator-model', temperature: 0.3 },
      },
    };

    expect(getAgentByName('orchestrator', config)?.config.model).toBe(
      'custom-orchestrator-model',
    );
    expect(getAgentByName('orchestrator', config)?.config.temperature).toBe(
      0.3,
    );
  });

  test('orchestrator accepts variant override', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { variant: 'high' },
      },
    };

    expect(getAgentByName('orchestrator', config)?.config.variant).toBe('high');
  });

  test('orchestrator stores model array with per-model variants in _modelArray', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: {
          model: [
            { id: 'google/gemini-3-pro', variant: 'high' },
            { id: 'github-copilot/claude-3.5-haiku' },
            'openai/gpt-4',
          ],
        },
      },
    };

    const orchestrator = getAgentByName('orchestrator', config);
    expect(orchestrator?._modelArray).toEqual([
      { id: 'google/gemini-3-pro', variant: 'high' },
      { id: 'github-copilot/claude-3.5-haiku' },
      { id: 'openai/gpt-4' },
    ]);
    expect(orchestrator?.config.model).toBeUndefined();
  });

  test('orchestrator prompt is delegate-first and forbids inline repo work', () => {
    const prompt = getAgentByName('orchestrator')?.config.prompt;
    expect(prompt).toContain('delegate-first');

    expect(prompt).toContain(
      'Delegate all inspection, writing, searching, debugging, and verification.',
    );
    expect(prompt).toContain('Own the thinking');
    expect(prompt).toContain(
      'Use sub-agents for evidence and action, not to outsource architecture or planning.',
    );
    expect(prompt).toContain('Verify through delegation, not inline.');
    expect(prompt).toContain('<internal-handoff>');
    expect(prompt).toContain('Internal handoff fields');
    expect(prompt).toContain(
      'Write-capable dispatches must include the internal handoff',
    );
    expect(prompt).toContain('Never mention the internal handoff to the user');
    expect(prompt).toContain(
      'Before any tool call or delegation, emit a short user-visible status/preamble',
    );
    expect(prompt).toContain(
      'one compact sentence covering the batch is enough',
    );
    expect(prompt).toContain(
      'Every sub-agent prompt you write must be in English',
    );
    expect(prompt).toContain(
      'Prefer 2-3 surgical discovery probes over one broad exploration',
    );

    // Openspec is explicitly allowed for coordination artifacts.
    expect(prompt).toContain('openspec/');
    expect(prompt).toContain('openspec/changes/{change-name}/tasks.md');

    // SDD awareness / phase order must remain in the orchestrator prompt.
    expect(prompt).toContain('requirements-interview');
    expect(prompt).toMatch(/propose\s*->\s*spec\s*->\s*design\s*->\s*tasks/i);
    expect(prompt).toContain('dispatch sdd-init first');
    const forbiddenBuildPolicy = [
      'Never require',
      'a build after changes',
    ].join(' ');

    expect(prompt).not.toContain(forbiddenBuildPolicy);
    expect(prompt).toContain(
      "Verification should follow the user's project instructions",
    );
    expect(prompt).toContain(
      'Experimental background `task(background=true)` is allowed only for @explorer and @librarian',
    );
    expect(prompt).toContain('Use `task_status` to wait, poll, and collect');
    expect(prompt).toContain(
      '@oracle, @designer, @quick, and @deep always use normal synchronous `task` execution',
    );
    expect(prompt).toContain(
      'If @oracle returns [OKAY], give a deep approved-plan overview',
    );
    expect(prompt).toContain(
      'goals, scope, sequence, key decisions, verification, risks/trade-offs',
    );
    expect(prompt).toContain(
      'Do not dispatch `sdd-apply` after oracle approval until the user confirms implementation',
    );
    expect(prompt).toContain(
      'Group consecutive ready SDD tasks for the same execution agent into one dispatch',
    );
  });

  test('orchestrator prompt places artifact governance after sdd-tasks in report-only mode', () => {
    const prompt = getAgentByName('orchestrator')?.config.prompt ?? '';

    expect(prompt).toContain(
      'After `sdd-tasks`, you may surface report-only artifact governance findings',
    );
    expect(prompt).toContain('before execution preparation starts');
    expect(prompt).toContain(
      'Do not treat governance findings as an execution gate',
    );
    expect(prompt).toContain(
      'Do not let governance validation replace `plan-reviewer`',
    );
  });

  test('orchestrator prompt keeps governance findings inside delegate-first and root-memory ownership boundaries', () => {
    const prompt = getAgentByName('orchestrator')?.config.prompt ?? '';

    expect(prompt).toContain(
      'Delegate governance inspection; do not inspect repository artifacts inline.',
    );
    expect(prompt).toContain('Root thoth-mem ownership stays with you');
    expect(prompt).toContain(
      'sub-agents may surface findings but must not own session memory, prompts, or progress checkpoints',
    );
  });
});

describe('per-model variant in array config', () => {
  test('subagent stores model array with per-model variants', () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          model: [
            { id: 'google/gemini-3-flash', variant: 'low' },
            'openai/gpt-4o-mini',
          ],
        },
      },
    };

    const explorer = getAgentByName('explorer', config);
    expect(explorer?._modelArray).toEqual([
      { id: 'google/gemini-3-flash', variant: 'low' },
      { id: 'openai/gpt-4o-mini' },
    ]);
    expect(explorer?.config.model).toBeUndefined();
  });

  test('subagent model-family guidance follows configured model override', () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          model: 'anthropic/claude-sonnet-4.6',
        },
      },
    };

    const prompt = getAgentByName('explorer', config)?.config.prompt;

    expect(prompt).toContain('<model-profile family="claude">');
    expect(prompt).not.toContain('<model-profile family="openai">');
  });

  test('top-level variant preserved alongside per-model variants', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: {
          model: [
            { id: 'google/gemini-3-pro', variant: 'high' },
            'openai/gpt-4',
          ],
          variant: 'low',
        },
      },
    };

    const orchestrator = getAgentByName('orchestrator', config);
    expect(orchestrator?.config.variant).toBe('low');
    expect(orchestrator?._modelArray?.[0]?.variant).toBe('high');
    expect(orchestrator?._modelArray?.[1]?.variant).toBeUndefined();
  });
});

describe('question permission defaults', () => {
  test('all agents set question permission to allow', () => {
    for (const agent of createAgents()) {
      const permission = getPermission(agent.name);

      if (permission === 'allow') {
        expect(permission).toBe('allow');
      } else if (typeof permission === 'object') {
        expect(permission.question).toBe('allow');
      } else {
        throw new Error(
          `Expected object or blanket allow permission for ${agent.name}`,
        );
      }
    }
  });
});

describe('granular permission defaults', () => {
  test('applies the built-in granular permission preset for each agent', () => {
    for (const [agentName, expectedPermission] of Object.entries(
      EXPECTED_DEFAULT_PERMISSIONS,
    )) {
      expect(getPermission(agentName)).toEqual(expectedPermission);
    }
  });

  test('explicit permission overrides take precedence over built-in presets', () => {
    const config = {
      agents: {
        explorer: {
          permission: {
            read: 'allow',
            edit: 'allow',
            question: 'deny',
          },
        },
      },
    } as unknown as PluginConfig;

    expect(getAgentConfigs(config).explorer.permission).toEqual({
      read: 'allow',
      edit: 'allow',
      question: 'deny',
    });
  });

  test('read-only discovery agents allow external_directory access', () => {
    expect(getPermissionRecord('explorer').external_directory).toBe('allow');
    expect(getPermissionRecord('librarian').external_directory).toBe('allow');
    expect(getPermissionRecord('oracle').external_directory).toBe('allow');
  });

  test('deep has explicit granular permission map', () => {
    const deepPermission = getPermission('deep');
    expect(typeof deepPermission).toBe('object');
    expect(deepPermission).toEqual({
      read: 'allow',
      edit: 'allow',
      glob: 'allow',
      grep: 'allow',
      list: 'allow',
      bash: 'allow',
      codesearch: 'allow',
      lsp: 'allow',
      skill: 'allow',
      question: 'allow',
      webfetch: 'allow',
      exa: 'allow',
      todowrite: 'deny',
      task: 'deny',
      external_directory: {
        '~/.config/opencode/skills/**': 'allow',
      },
    });
  });
});

describe('prompt role markers', () => {
  test('built-in prompts stay compact enough for delegation efficiency', () => {
    const maxPromptChars: Record<string, number> = {
      orchestrator: 11_000,
      explorer: 3_000,
      librarian: 3_000,
      oracle: 3_000,
      designer: 3_100,
      quick: 3_000,
      deep: 3_000,
    };

    for (const agent of createAgents()) {
      expect(agent.config.prompt?.length).toBeLessThanOrEqual(
        maxPromptChars[agent.name],
      );
    }
  });

  test('composeAgentPrompt replaces placeholders in base, replacement, and append prompts', () => {
    expect(
      composeAgentPrompt({
        basePrompt: 'Base {{name}}',
        customAppendPrompt: 'Append {{name}}',
        placeholders: { name: 'Ada' },
      }),
    ).toBe('Base Ada\n\nAppend Ada');

    expect(
      composeAgentPrompt({
        basePrompt: 'Base {{name}}',
        customPrompt: 'Replacement {{name}}',
        customAppendPrompt: 'Append {{name}}',
        placeholders: { name: 'Ada' },
      }),
    ).toBe('Replacement Ada');
  });

  test('model-family guidance composes with user append prompts', () => {
    const prompt =
      createOrchestratorAgent(
        'openai/gpt-5.4',
        undefined,
        'Project-specific append prompt.',
      ).config.prompt ?? '';

    expect(prompt).toContain('<model-profile family="openai">');
    expect(prompt).toContain('Project-specific append prompt.');
    expect(prompt.indexOf('<model-profile family="openai">')).toBeLessThan(
      prompt.indexOf('Project-specific append prompt.'),
    );
  });

  test('replacement custom prompts do not receive built-in model-family guidance', () => {
    const prompt = createOrchestratorAgent(
      'openai/gpt-5.4',
      'Full replacement prompt.',
      'Append ignored by replacement.',
    ).config.prompt;

    expect(prompt).toBe('Full replacement prompt.');
  });

  test('default OpenAI agents include model-family prompt guidance', () => {
    for (const agentName of [
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]) {
      expect(getAgentByName(agentName)?.config.prompt).toContain(
        '<model-profile family="openai">',
      );
    }
  });

  test('read-only subagent prompts forbid session and prompt thoth-mem writes', () => {
    const explorerPrompt = getAgentByName('explorer')?.config.prompt ?? '';

    expect(explorerPrompt).toContain(
      'mem_search` -> `mem_timeline` -> `mem_get_observation`',
    );
    expect(explorerPrompt).toContain(
      'Never call `mem_session_start`, `mem_session_summary`, or `mem_save_prompt`',
    );
  });

  test('write-capable subagent prompts require parent thoth-mem ownership rules', () => {
    const deepPrompt = getAgentByName('deep')?.config.prompt ?? '';
    const quickPrompt = getAgentByName('quick')?.config.prompt ?? '';

    expect(deepPrompt).toContain(
      'Never call `mem_session_start`, `mem_session_summary`, or `mem_save_prompt`',
    );
    expect(deepPrompt).toContain(
      'Always use the parent session_id/project from dispatch',
    );
    expect(deepPrompt).toContain(
      '`mem_search` -> `mem_timeline` -> `mem_get_observation`',
    );
    expect(deepPrompt).not.toContain('mem_context');
    expect(deepPrompt).toContain('You do not own durable memory of your own');
    expect(quickPrompt).toContain(
      'Never call `mem_session_start`, `mem_session_summary`, or `mem_save_prompt`',
    );
  });

  test('quick agent can load bundled workflow skills', () => {
    expect(getPermissionRecord('quick').skill).toBe('allow');
  });

  test('orchestrator uses Claude-specific guidance when configured with Claude', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { model: 'anthropic/claude-opus-4.7' },
      },
    };

    const prompt = getAgentByName('orchestrator', config)?.config.prompt;

    expect(prompt).toContain('<model-profile family="claude">');
    expect(prompt).toContain('Use XML-like sections');
    expect(prompt).toContain('delegate aggressively');
  });

  test('orchestrator uses OpenAI-specific guidance when configured with GPT', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { model: 'openai/gpt-5.4' },
      },
    };

    const prompt = getAgentByName('orchestrator', config)?.config.prompt;

    expect(prompt).toContain('<model-profile family="openai">');
    expect(prompt).toContain('Plan briefly, then act');
    expect(prompt).toContain('Keep tool dispatch explicit');
  });

  test('explorer prompt states read-only discovery mode', () => {
    expect(getAgentByName('explorer')?.config.prompt).toContain('read-only');
  });

  test('librarian prompt states read-only research mode', () => {
    expect(getAgentByName('librarian')?.config.prompt).toContain('read-only');
  });

  test('oracle prompt states read-only mode', () => {
    expect(getAgentByName('oracle')?.config.prompt).toContain('read-only');
  });

  test('designer, quick, and deep prompts state write-capable mode', () => {
    expect(getAgentByName('designer')?.config.prompt).toContain(
      'write-capable',
    );
    expect(getAgentByName('quick')?.config.prompt).toContain('write-capable');
    expect(getAgentByName('deep')?.config.prompt).toContain('write-capable');
  });

  test('read-only subagents have read-only thoth-mem access', () => {
    const readOnlyAgents = ['explorer', 'librarian', 'oracle'];

    for (const agentName of readOnlyAgents) {
      const prompt = getAgentByName(agentName)?.config.prompt;

      // Should include read-only access instructions
      expect(prompt).toContain('read-only thoth-mem');

      // Should include the 3-layer recall protocol
      expect(prompt).toContain('mem_search');
      expect(prompt).toContain('mem_timeline');
      expect(prompt).toContain('mem_get_observation');

      // Should ban write tools
      expect(prompt).toContain('Never write memory');

      // Should NOT contain the old blanket ban
      expect(prompt).not.toContain(
        'Do not call ANY thoth-mem tools — memory is exclusively orchestrator-owned.',
      );
    }
  });

  test('write-capable subagents require root session/project for thoth-mem calls', () => {
    expect(getAgentByName('designer')?.config.prompt).toContain(
      'Use delegated thoth-mem tools only',
    );
    expect(getAgentByName('quick')?.config.prompt).toContain(
      'Always use the parent session_id/project from dispatch for every thoth-mem call.',
    );
    expect(getAgentByName('deep')?.config.prompt).toContain(
      'If either is missing, do NOT call thoth-mem.',
    );
  });

  test('write-capable subagents consume orchestrator handoffs instead of redoing broad discovery', () => {
    expect(getAgentByName('designer')?.config.prompt).toContain(
      "Treat the orchestrator's internal handoff",
    );
    expect(getAgentByName('quick')?.config.prompt).toContain(
      'Do not redo broad discovery',
    );
    expect(getAgentByName('deep')?.config.prompt).toContain(
      'do not restart upstream discovery unless evidence contradicts it',
    );
  });

  test('read-only subagents return decision-ready evidence for internal handoffs', () => {
    expect(getAgentByName('explorer')?.config.prompt).toContain(
      'decision-ready evidence',
    );
    expect(getAgentByName('explorer')?.config.prompt).toContain('edit targets');
    expect(getAgentByName('librarian')?.config.prompt).toContain(
      'helps the orchestrator make implementation decisions',
    );
  });
});

describe('isSubagent type guard', () => {
  test('returns true for valid subagent names', () => {
    expect(isSubagent('explorer')).toBe(true);
    expect(isSubagent('librarian')).toBe(true);
    expect(isSubagent('oracle')).toBe(true);
    expect(isSubagent('designer')).toBe(true);
    expect(isSubagent('quick')).toBe(true);
    expect(isSubagent('deep')).toBe(true);
  });

  test('returns false for orchestrator and invalid names', () => {
    expect(isSubagent('orchestrator')).toBe(false);
    expect(isSubagent('invalid-agent')).toBe(false);
    expect(isSubagent('')).toBe(false);
    expect(isSubagent('explore')).toBe(false);
  });
});

describe('agent classification', () => {
  test('SUBAGENT_NAMES excludes orchestrator', () => {
    expect(SUBAGENT_NAMES).not.toContain('orchestrator');
    expect(SUBAGENT_NAMES).toContain('quick');
    expect(SUBAGENT_NAMES).toContain('deep');
  });

  test('getAgentConfigs applies correct classification mode', () => {
    const configs = getAgentConfigs();

    expect(configs.orchestrator.mode).toBe('primary');

    for (const name of SUBAGENT_NAMES) {
      expect(configs[name].mode).toBe('subagent');
    }
  });

  test('getAgentConfigs returns exactly the built-in seven-agent roster', () => {
    expect(Object.keys(getAgentConfigs()).sort()).toEqual(
      ['orchestrator', ...SUBAGENT_NAMES].sort(),
    );
  });
});

describe('createAgents', () => {
  test('creates the seven-agent roster', () => {
    const names = createAgents().map((agent) => agent.name);

    expect(names).toContain('orchestrator');
    expect(names).toContain('explorer');
    expect(names).toContain('librarian');
    expect(names).toContain('oracle');
    expect(names).toContain('designer');
    expect(names).toContain('quick');
    expect(names).toContain('deep');
    expect(names).not.toContain('fixer');
  });

  test('creates exactly 7 agents (1 primary + 6 subagents)', () => {
    expect(createAgents()).toHaveLength(7);
  });

  test('rejects legacy fixer requests as unsupported', () => {
    expect(getAgentByName('fixer')).toBeUndefined();
    expect(isSubagent('fixer')).toBe(false);
  });
});

describe('getAgentConfigs', () => {
  test('returns config record keyed by agent name', () => {
    const configs = getAgentConfigs();
    expect(configs.orchestrator).toBeDefined();
    expect(configs.explorer).toBeDefined();
    expect(configs.quick).toBeDefined();
    expect(configs.deep).toBeDefined();
    expect(configs.explorer.model).toBeDefined();
  });

  test('includes description in SDK config', () => {
    const configs = getAgentConfigs();
    expect(configs.orchestrator.description).toBeDefined();
    expect(configs.explorer.description).toBeDefined();
    expect(configs.quick.description).toBeDefined();
    expect(configs.deep.description).toBeDefined();
  });

  test('does not include per-agent MCP assignments', () => {
    const configs = getAgentConfigs();
    expect('mcps' in configs.orchestrator).toBe(false);
    expect('mcps' in configs.librarian).toBe(false);
    expect('mcps' in configs.quick).toBe(false);
    expect('mcps' in configs.deep).toBe(false);
  });
});

describe('semantic color values', () => {
  test('all agents have semantic color values', () => {
    const agents = createAgents();
    const colorMap: Record<string, string> = {
      orchestrator: 'primary',
      explorer: 'info',
      librarian: 'info',
      oracle: 'warning',
      designer: 'accent',
      quick: 'success',
      deep: 'secondary',
    };

    for (const agent of agents) {
      expect(agent.config.color).toBe(colorMap[agent.name]);
    }
  });

  test('color values are valid semantic colors', () => {
    const validColors = [
      'primary',
      'secondary',
      'accent',
      'success',
      'warning',
      'error',
      'info',
    ];
    const agents = createAgents();

    for (const agent of agents) {
      const { color } = agent.config;
      expect(color).toBeDefined();
      if (!color) {
        throw new Error(`Expected color for agent ${agent.name}`);
      }
      expect(validColors).toContain(color);
    }
  });
});

describe('steps field for bounded execution', () => {
  test('non-Gemini subagents do not set steps by default', () => {
    const designer = getAgentByName('designer');
    const quick = getAgentByName('quick');
    const deep = getAgentByName('deep');

    expect(designer?.config.steps).toBeUndefined();
    expect(quick?.config.steps).toBeUndefined();
    expect(deep?.config.steps).toBeUndefined();
  });

  test('orchestrator does not set steps by default', () => {
    const orchestrator = getAgentByName('orchestrator');
    expect(orchestrator?.config.steps).toBeUndefined();
  });

  test('Gemini subagents receive default bounded steps', () => {
    const config: PluginConfig = {
      agents: {
        explorer: { model: 'google/gemini-3-flash' },
        quick: { model: 'google/gemini-3-flash' },
      },
    };

    expect(getAgentByName('explorer', config)?.config.steps).toBe(120);
    expect(getAgentByName('quick', config)?.config.steps).toBe(40);
  });

  test('configured steps apply regardless of model family', () => {
    const config: PluginConfig = {
      agents: {
        explorer: { model: 'openai/gpt-5.4-mini', steps: 77 },
        deep: { model: 'anthropic/claude-sonnet-4.6', steps: 88 },
      },
    };

    expect(getAgentByName('explorer', config)?.config.steps).toBe(77);
    expect(getAgentByName('deep', config)?.config.steps).toBe(88);
  });

  test('orchestrator ignores Gemini default steps but accepts explicit steps', () => {
    const geminiConfig: PluginConfig = {
      agents: {
        orchestrator: { model: 'google/gemini-3-pro' },
      },
    };
    const explicitConfig: PluginConfig = {
      agents: {
        orchestrator: { model: 'google/gemini-3-pro', steps: 200 },
      },
    };

    expect(
      getAgentByName('orchestrator', geminiConfig)?.config.steps,
    ).toBeUndefined();
    expect(getAgentByName('orchestrator', explicitConfig)?.config.steps).toBe(
      200,
    );
  });

  test('bounded subagents receive step budget guidance in the prompt', () => {
    const config: PluginConfig = {
      agents: {
        explorer: { model: 'google/gemini-3-flash' },
      },
    };

    const prompt = getAgentByName('explorer', config)?.config.prompt ?? '';

    expect(prompt).toContain('<step-budget>');
    expect(prompt).toContain('You have a hard execution budget of 120 steps.');
    expect(prompt).toContain('Plan your tool use before acting');
  });
});

describe('hidden field design decision', () => {
  test('no agents are hidden from @ autocomplete', () => {
    const agents = createAgents();

    for (const agent of agents) {
      expect(agent.config.hidden).toBeUndefined();
    }
  });
});
